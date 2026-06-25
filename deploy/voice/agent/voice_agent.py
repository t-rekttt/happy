"""Happy self-hosted voice agent (LiveKit Agents worker).

Joins each `voice_<user>_<session>` room that happy-server mints a token for, and
runs the conversational loop:  Silero VAD -> Whisper STT -> LLM (tool-calling) ->
Kokoro/Piper TTS. The LLM's tools execute back ON THE APP via LiveKit RPC, exactly
mirroring the app's ElevenLabs client-tools bridge:
    sendMessageToSession({sessionId, message})  ->  app calls sync.sendMessage(...)
    processPermissionRequest({requestId, decision}) -> app allows/denies

STT/LLM/TTS are reached as OpenAI-compatible HTTP endpoints, so any of vLLM /
faster-whisper-server / kokoro-fastapi can back them. Configure via env (.env.example).

Targets the livekit-agents 1.x API. NOTE: the newest SDK (AgentServer + inference.*)
renames a few call sites; deltas are flagged inline. This worker cannot be run in the
build sandbox (needs models/GPU endpoints) — validate on the agent box.
"""

import asyncio
import json
import logging
import os

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import openai, silero

from voice_agent_prompt import VOICE_SYSTEM_PROMPT_BASE

load_dotenv()
logger = logging.getLogger("happy-voice-agent")

# Topic the app publishes contextual (non-spoken) updates on — session focus
# changes, agent-finished events, runtime counters. Mirrors ElevenLabs
# sendContextualUpdate. Keep in sync with the app (phase 04).
CONTEXTUAL_UPDATE_TOPIC = "happy_contextual_update"
# Topic the app publishes prompts on — content that should TRIGGER a spoken reply
# (permission requests, agent-ready events). Mirrors ElevenLabs sendTextMessage.
USER_TEXT_TOPIC = "happy_user_text"
# Topic the app publishes the per-conversation init payload on, right after it
# connects. A LiveKit CLIENT cannot set room/participant metadata, so overrides
# (focusedSessionId, initialContext, systemPrompt, firstMessage, language) come
# over this data channel instead. The app re-publishes it when the agent joins,
# so order doesn't matter.
INIT_TOPIC = "happy_voice_init"
INIT_TIMEOUT = 8.0  # fall back to token metadata if no init arrives.
RPC_RESPONSE_TIMEOUT = 30.0  # sendMessageToSession can be slow on the app side.


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def _overrides_from_token(participant: rtc.RemoteParticipant) -> dict:
    """Fallback overrides from the participant token metadata (sessionId only)."""
    if not participant.metadata:
        return {}
    try:
        parsed = json.loads(participant.metadata)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


class HappyVoiceAgent(Agent):
    """Voice persona. Its tools proxy to the app over RPC rather than acting locally."""

    def __init__(self, room: rtc.Room, human_identity: str, focused_session_id: str | None, instructions: str):
        super().__init__(instructions=instructions)
        self._room = room
        self._human = human_identity
        self._focused_session_id = focused_session_id

    async def _call_app(self, method: str, payload: dict) -> str:
        """Invoke a client tool registered by the app on the human's participant."""
        try:
            return await self._room.local_participant.perform_rpc(
                destination_identity=self._human,
                method=method,
                payload=json.dumps(payload),
                response_timeout=RPC_RESPONSE_TIMEOUT,
            )
        except Exception:  # noqa: BLE001 - report tool failure back to the LLM, never crash the turn
            logger.exception("RPC %s failed", method)
            return f"error ({method} failed)"

    # Tool names match the prompt's references ("sendMessageToSession", etc.) and
    # the RPC method strings the app registers (phase 04).
    @function_tool(name="sendMessageToSession")
    async def send_message_to_session(self, context: RunContext, message: str, session_id: str | None = None) -> str:
        """Send a message to a Claude Code session. Do NOT call before the user has fully
        formulated their request. Defaults to the focused session when session_id is omitted."""
        target = session_id or self._focused_session_id
        if not target:
            return "error (no session selected)"
        return await self._call_app("sendMessageToSession", {"sessionId": target, "message": message})

    @function_tool(name="processPermissionRequest")
    async def process_permission_request(self, context: RunContext, request_id: str, decision: str) -> str:
        """Approve or deny a coding-agent permission request. decision must be 'allow' or
        'deny'. Only call after the user explicitly approves/denies."""
        if decision not in ("allow", "deny"):
            return "error (invalid decision)"
        return await self._call_app("processPermissionRequest", {"requestId": request_id, "decision": decision})

    @function_tool(name="skip_turn")
    async def skip_turn(self, context: RunContext) -> str:
        """Stay silent for this turn — call when the user is talking to another human or no
        response is needed. Produce no spoken output after calling this."""
        return "skipped"


def _build_instructions(overrides: dict) -> str:
    base = overrides.get("systemPrompt") or VOICE_SYSTEM_PROMPT_BASE
    sections = [base]
    focused = overrides.get("focusedSessionId") or overrides.get("sessionId")
    if focused:
        sections.append(f"# Current focused session\n- focused_session_id: {focused}")
    initial_context = overrides.get("initialContext")
    if initial_context and str(initial_context).strip():
        sections.append(f"# Conversation history so far\n{str(initial_context).strip()}")
    return "\n\n".join(sections)


async def _inject_context(session: AgentSession, agent: Agent, text: str) -> None:
    """Add a non-spoken contextual update to the chat context for the next turn."""
    chat_ctx = agent.chat_ctx.copy()
    chat_ctx.add_message(role="system", content=f"# Contextual update\n{text}")
    await agent.update_chat_ctx(chat_ctx)


async def _inject_prompt(session: AgentSession, agent: Agent, text: str) -> None:
    """Add a prompt as a user message and trigger a spoken reply (e.g. a permission
    request or agent-ready event the persona should voice to the human)."""
    chat_ctx = agent.chat_ctx.copy()
    chat_ctx.add_message(role="user", content=text)
    await agent.update_chat_ctx(chat_ctx)
    await session.generate_reply()


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Collect the per-conversation init payload (overrides) from the data channel.
    init_overrides: dict = {}
    init_event = asyncio.Event()

    @ctx.room.on("data_received")
    def _on_init(packet: rtc.DataPacket) -> None:
        if packet.topic != INIT_TOPIC:
            return
        try:
            parsed = json.loads(packet.data.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        if isinstance(parsed, dict):
            init_overrides.update(parsed)
            init_event.set()

    # The human participant whose token we minted; its identity is the Happy userId.
    participant = await ctx.wait_for_participant()
    human_identity = participant.identity

    # Prefer the data-channel init; fall back to token metadata if it never arrives.
    try:
        await asyncio.wait_for(init_event.wait(), timeout=INIT_TIMEOUT)
    except asyncio.TimeoutError:
        logger.warning("No init payload within %.0fs; using token metadata", INIT_TIMEOUT)
    overrides = {**_overrides_from_token(participant), **init_overrides}
    focused_session_id = overrides.get("focusedSessionId") or overrides.get("sessionId")
    # Default to English and normalize locale/region codes to a bare ISO-639
    # code (e.g. "en-US" -> "en", "pt-br" -> "pt"). livekit-agents' LanguageCode()
    # rejects None and region-only codes (crashes openai.STT init otherwise).
    language = (overrides.get("language") or "en").split("-")[0].strip().lower() or "en"
    logger.info("Voice session: room=%s human=%s session=%s", ctx.room.name, human_identity, focused_session_id)

    session = AgentSession(
        vad=silero.VAD.load(),
        # OpenAI-compatible endpoints — point at faster-whisper-server / vLLM / kokoro-fastapi.
        stt=openai.STT(
            model=_env("STT_MODEL", "whisper-1"),
            base_url=_env("STT_BASE_URL"),
            api_key=_env("STT_API_KEY", "none"),
            language=language,
        ),
        llm=openai.LLM(
            model=_env("LLM_MODEL", "Qwen2.5-14B-Instruct"),
            base_url=_env("LLM_BASE_URL"),
            api_key=_env("LLM_API_KEY", "none"),
            temperature=float(_env("LLM_TEMPERATURE", "0.4")),
        ),
        tts=openai.TTS(
            model=_env("TTS_MODEL", "kokoro"),
            voice=_env("TTS_VOICE", "af_heart"),
            base_url=_env("TTS_BASE_URL"),
            api_key=_env("TTS_API_KEY", "none"),
        ),
    )

    agent = HappyVoiceAgent(
        room=ctx.room,
        human_identity=human_identity,
        focused_session_id=focused_session_id,
        instructions=_build_instructions(overrides),
    )

    # Inbound app updates: silent context vs prompts that should trigger a reply.
    @ctx.room.on("data_received")
    def _on_data(packet: rtc.DataPacket) -> None:
        if packet.topic not in (CONTEXTUAL_UPDATE_TOPIC, USER_TEXT_TOPIC):
            return
        try:
            text = packet.data.decode("utf-8")
        except UnicodeDecodeError:
            return
        if packet.topic == CONTEXTUAL_UPDATE_TOPIC:
            asyncio.create_task(_inject_context(session, agent, text))
        else:
            asyncio.create_task(_inject_prompt(session, agent, text))

    await session.start(agent=agent, room=ctx.room)

    # Optional opening line ("Hi, Happy here"). generate_reply speaks it via TTS.
    first_message = overrides.get("firstMessage")
    if first_message:
        await session.generate_reply(instructions=f"Say exactly this and nothing else: {first_message}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # 1.x entrypoint. Newest SDK: AgentServer() + @server.rtc_session + cli.run_app(server).
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
