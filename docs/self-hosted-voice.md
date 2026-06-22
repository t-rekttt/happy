# Self-Hosted Voice Assistant

Run Happy's conversational voice assistant entirely on your own infrastructure
instead of ElevenLabs. The app's voice UX is unchanged — an always-listening
"Happy" persona that picks the focused session, supports barge-in, stays silent
when you talk to a human (`skip_turn`), and approves permissions by voice.

## Architecture

```
happy-app (LiveKit RN) <--WebRTC--> LiveKit server <---- agent worker (LiveKit Agents)
       ^  RPC: sendMessageToSession / processPermissionRequest        |  Silero VAD
       |  init/context over data channel                              |  Whisper STT (vLLM/whisper)
happy-server: POST /v1/voice/local/token  (signs a LiveKit JWT)       |  LLM (vLLM, tool-calling)
                                                                      |  Kokoro/Piper TTS
```

- **happy-server** is never in the media path; it only signs a short-lived LiveKit
  join token, so it can run anywhere. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`.
- **LiveKit + agent worker** colocate (own VM/LXC or k8s). Media is WebRTC/UDP.
- **STT/LLM/TTS** are OpenAI-compatible endpoints, so the agent box stays model-agnostic.

All deploy assets live under `deploy/voice/`.

## 1. LiveKit server

`deploy/voice/` ships both paths (same `livekit.yaml`):

- **VM/LXC:** `docker-compose.yml` (host networking + embedded TURN).
  - `cp deploy/voice/.env.example deploy/voice/.env` and fill it.
  - Generate keys: `docker run --rm livekit/livekit-server generate-keys`.
  - Provide a TURN TLS cert at `deploy/voice/certs/turn.{crt,key}`.
  - Open UDP `50000-50200`, `3478`; TCP `7880`, `7881`, `5349`.
- **Kubernetes:** `livekit-helm-values.yaml` with the official chart (hostNetwork or
  UDP LoadBalancer + coturn on 443). Put keys in a secret / Vault ExternalSecret.

TLS-terminate `wss` signaling at your reverse proxy; keep media UDP direct.

## 2. Model servers (on the GPU box)

Reference defaults (swap freely — all OpenAI-compatible):

- **LLM (persona router):** vLLM serving a tool-calling model, e.g.
  `vllm serve Qwen/Qwen2.5-14B-Instruct --enable-auto-tool-choice --tool-call-parser hermes`
- **STT:** faster-whisper-server (`/v1/audio/transcriptions`).
- **TTS:** kokoro-fastapi (`/v1/audio/speech`), or Piper for a lighter CPU option.

A single 48GB GPU (e.g. RTX 5880 Ada) comfortably hosts all three.

## 3. Agent worker

`deploy/voice/agent/` — CPU-only container (Silero VAD on CPU; STT/LLM/TTS are remote).

- `cp deploy/voice/agent/.env.example deploy/voice/agent/.env` and point
  `LLM_BASE_URL` / `STT_BASE_URL` / `TTS_BASE_URL` at the servers above; reuse the
  same `LIVEKIT_*` values.
- `docker compose -f deploy/voice/docker-compose.yml up -d` brings up LiveKit + the
  `voice-agent` worker.

The worker keeps `voice_agent_prompt.py` byte-for-byte in sync with the app's
`voiceSystemPrompt.ts`; update both together.

## 4. happy-server

Set `LIVEKIT_URL` (wss), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. The route
`POST /v1/voice/local/token` returns 501 until these are present. ElevenLabs vars
are no longer required for the local path.

## 5. App

Settings → Voice → **Self-hosted voice** = on. The app then calls
`/v1/voice/local/token` and connects to your LiveKit server. ElevenLabs remains the
default and is untouched when the toggle is off.

## End-to-end checklist (on a real device)

- [ ] Hands-free: "Happy, ask the agent to list files" → message reaches the focused session.
- [ ] Reply is spoken; barge-in interrupts TTS when you start talking.
- [ ] `skip_turn` when you address another human.
- [ ] Permission request prompt is voiced; "approve"/"deny" drives `processPermissionRequest`.
- [ ] Background vs focused session targeting.
- [ ] Agent/network drop → app shows disconnected cleanly (no error overlay), reconnect works.

## Notes / known follow-ups

- The agent worker targets **livekit-agents 1.x**. The newest SDK renames a few call
  sites (`AgentServer`/`inference.*`); pin to what you install (see inline notes in
  `voice_agent.py`).
- STT language is passed through from the app's voice-language setting; some codes
  (e.g. `pt-br`) may need normalization to ISO (`pt`) for your Whisper server.
- Token TTL is 10 minutes (join-time only); the conversation outlives it.
