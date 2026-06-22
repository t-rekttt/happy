# Phase 03 — Agent Worker: STT-LLM-TTS Pipeline + RPC Tools

## Overview
- Priority: P0 (the heart of the system)
- Status: TODO
- A self-hosted LiveKit Agents worker that joins each voice room and runs the conversational
  loop with local STT/LLM/TTS, dispatching tool calls to the app over LiveKit RPC.

## Context / reuse
- System prompt + tool contract already defined app-side:
  - `packages/happy-app/sources/realtime/voiceSystemPrompt.ts` (VOICE_SYSTEM_PROMPT_BASE)
  - `packages/happy-app/sources/realtime/realtimeClientTools.ts`
    (`sendMessageToSession`, `processPermissionRequest`)
- Mirror these exactly so behavior matches today's ElevenLabs agent.

## Requirements
- LiveKit Agents (Python) `AgentSession` with:
  - VAD: Silero; turn detection (endpointing) so user finishes before STT commits.
  - STT: faster-whisper large-v3 (language from `dynamicVariables`; smaller model if latency-bound).
  - LLM: OpenAI-compatible client -> **vLLM serving Qwen2.5-14B-Instruct**
    (`--enable-auto-tool-choice --tool-call-parser hermes`). Swap model via env.
  - TTS: Kokoro (GPU has headroom on the 48GB card); Piper as CPU-light fallback.
  - Hardware: agent + vLLM + Whisper + TTS colocated on the RTX 5880 Ada box, next to LiveKit.
  - Barge-in: interrupt TTS on user speech (built into AgentSession).
- Tools registered on the LLM as **frontend RPC** calls:
  - `sendMessageToSession({sessionId, message})`, `processPermissionRequest({requestId, decision})`,
    plus `skip_turn`. Implementation = `participant.performRpc(method, payload)` to the app;
    return the string the app sends back (e.g. "sent", "done").
- Read `dynamicVariables` (sessionId, initialConversationContext) and `overrides` (systemPrompt,
  firstMessage, language) from room metadata / data the app sets on join.
- Accept mid-session contextual updates (text data messages) -> inject into chat ctx
  (mirrors `sendContextualUpdate`).
- Emit state the app maps to UI: speaking/listening -> via standard LiveKit agent state events.

## Steps
1. Create `deploy/voice/agent/` Python project (pyproject + Dockerfile), `livekit-agents` +
   plugin extras (silero, openai, and whisper/piper integrations).
2. Implement `voice_agent.py`: build `AgentSession`, register function tools that proxy to
   frontend RPC, load prompt from a shared constant (keep text in sync with app prompt).
3. Worker config: `LIVEKIT_URL/KEY/SECRET`, `LLM_BASE_URL/MODEL`, `WHISPER_*`, `TTS_*`.
4. Add worker service to `deploy/voice/docker-compose.yml`.
5. Verify tool round-trip latency and barge-in locally.

## Related files (create)
- `deploy/voice/agent/voice_agent.py`
- `deploy/voice/agent/pyproject.toml`, `Dockerfile`
- `deploy/voice/agent/voice_agent_prompt.py` (verbatim copy of VOICE_SYSTEM_PROMPT_BASE)

## App-facing contract (Phase 04 MUST match)
The worker is built against these exact names — the app side has to mirror them:
- LiveKit RPC methods the app registers on its participant (payloads are JSON strings):
  - `sendMessageToSession` <- `{ "sessionId": string, "message": string }` -> returns a short string
  - `processPermissionRequest` <- `{ "requestId": string, "decision": "allow"|"deny" }`
- Room metadata (JSON) the app sets before/at join, read as overrides:
  `{ focusedSessionId, initialContext, systemPrompt?, firstMessage?, language? }`
  (falls back to `sessionId` from the token's participant metadata).
- Contextual (non-spoken) updates: app publishes UTF-8 data on topic
  `happy_contextual_update`.
- Participant identity of the human == Happy `userId` (the token `sub`); the worker
  targets RPC at that identity.

## Status — built (files in deploy/voice/agent/)
- `voice_agent.py` — worker: Silero VAD + OpenAI-compatible STT/LLM/TTS; `HappyVoiceAgent`
  with tools `sendMessageToSession` / `processPermissionRequest` / `skip_turn` proxied via
  `perform_rpc`; data-channel contextual updates; first-message greeting.
- `voice_agent_prompt.py` — VOICE_SYSTEM_PROMPT_BASE, verified verbatim-equal to the app.
- `pyproject.toml` (livekit-agents 1.x + openai + silero), `Dockerfile` (CPU image),
  `.env.example`; `voice-agent` service added to `deploy/voice/docker-compose.yml`.

## Verification
- `python -m py_compile` clean; `docker compose config` valid; prompt parity check passes.
- CANNOT run the worker in the build sandbox (needs LiveKit + STT/LLM/TTS endpoints/GPU).
  Runtime validation deferred to the agent box; flagged for Phase 06 E2E.
- API note: written for livekit-agents 1.x (`cli.run_app(WorkerOptions(...))`). The newest
  SDK renames to `AgentServer`/`inference.*`; deltas noted inline in `voice_agent.py`. Pin per
  the version actually installed.

## Success criteria
- Speaking "Happy, ask the agent to list files" triggers `sendMessageToSession` RPC on the
  app; reply is spoken; `skip_turn` and permission approval work. [runtime check on agent box]

## Risks
- Prompt drift between app + worker copies. Mitigation: single source doc + note in both
  files; consider generating from a shared text file later.
- Tool-call latency (STT+LLM). Mitigation: streaming LLM, small Whisper model, GPU optional.

## Next
- Phase 04 wires the app side of the RPC tools and audio.
