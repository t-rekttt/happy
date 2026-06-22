# Local Self-Hosted Voice Assistant

Replace ElevenLabs Convai with a fully self-hosted realtime voice assistant, reusing
the app's existing LiveKit native stack and the provider-agnostic `VoiceSession` +
`realtimeClientTools` abstractions.

## Goal

Full conversational assistant (today's UX: always-listening "Happy" agent that picks the
focused session, barge-in, `skip_turn`, voice permission approval) running on the user's
self-hosted server. No ElevenLabs dependency on the chosen path.

## Architecture (target)

```
happy-app (RN/Expo)                self-hosted box
  @livekit/react-native  <--WebRTC-->  LiveKit server (Docker)
  LocalRealtimeVoiceSession                 ^
  realtimeClientTools (RPC handlers)        | agent joins room
        ^  tool calls via LiveKit RPC       v
        +-----------------------------  LiveKit Agents worker (Python)
                                          VAD(Silero) -> STT(faster-whisper)
                                          -> LLM(Ollama/OpenAI-compat, tool-calling)
                                          -> TTS(Piper/Kokoro)
  happy-server: POST /v1/voice/local/token  -> mints LiveKit JWT (reuses auth)
```

Key insight: the agent's tools (`sendMessageToSession`, `processPermissionRequest`) execute
**on the app** via LiveKit RPC, exactly mirroring today's ElevenLabs client-tools bridge.
System prompt (`voiceSystemPrompt.ts`) and turn-taking semantics are reused verbatim.

## Phases

| # | Phase | Status | Depends |
|---|-------|--------|---------|
| 01 | [LiveKit infra (Docker, self-host)](phase-01-livekit-infra.md) | DONE (deploy assets) | — |
| 02 | [Server: local LiveKit token route](phase-02-server-token-route.md) | DONE (typecheck+tests green) | 01 |
| 03 | [Agent worker: STT-LLM-TTS pipeline + RPC tools](phase-03-agent-worker-pipeline.md) | DONE (code; runtime check on agent box) | 01 |
| 04 | [App: LocalRealtimeVoiceSession (LiveKit)](phase-04-app-voice-session.md) | DONE (app typecheck clean) | 02,03 |
| 05 | [App: settings + provider wiring](phase-05-settings-and-wiring.md) | DONE (app typecheck clean) | 04 |
| 06 | [Testing + hardening](phase-06-testing-hardening.md) | PARTIAL (automated green; device E2E pending) | 04,05 |

## Key dependencies / decisions to confirm

- Engines (confirmed defaults): faster-whisper large-v3 (STT), Kokoro (TTS), and the
  persona LLM = **Qwen2.5-14B-Instruct served by vLLM** (OpenAI-compatible). All swappable.
- Agent/LiveKit box GPU: **RTX 5880 Ada (48GB)** — fits LLM + Whisper + TTS on one card.
- LiveKit Agents framework version must support frontend RPC (`performRpc`/register) for
  client-tool execution and Silero turn detection — verify in phase 03.
- Self-hosted LiveKit server vs LiveKit Cloud: this plan assumes **self-hosted** (Docker).

## Acceptance criteria

1. With ElevenLabs envs unset, a user on a self-hosted server can hold a hands-free voice
   conversation that sends messages to the focused Claude session and reads back replies.
2. Voice permission approval and `skip_turn` work as today.
3. Provider is selectable in Settings -> Voice; ElevenLabs path remains untouched/default.
4. Barge-in (interrupt TTS by speaking) works; UI mode/VAD animations behave as today.

## Non-goals

- On-device STT/TTS (server-side only, per decision).
- Removing ElevenLabs code (kept as alternate provider).
- Usage metering/paywall for the local path.
