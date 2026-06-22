# Phase 06 — Testing + Hardening

## Overview
- Priority: P1
- Status: TODO
- Validate end-to-end, on real devices, and harden failure modes.

## Requirements / checklist
- Server: unit test `voiceLocalToken` (grants, TTL, room scoping) with Vitest (`*.spec.ts`).
- App: `pnpm typecheck` clean; smoke that provider switch mounts correct impl.
- Agent worker: scripted conversation test (text-injected) asserting tool RPCs fire and
  return expected strings.
- E2E on hardware (iOS + Android):
  - Hands-free conversation -> message reaches focused Claude session.
  - Barge-in interrupts TTS.
  - `skip_turn` when talking to a human.
  - Voice permission approve/deny via `processPermissionRequest`.
  - Background vs focused session targeting.
  - Network drop / reconnect; agent crash -> graceful disconnect, no app error overlay
    (parity with ElevenLabs `onError` handling).
- Latency budget: measure speech-end -> first TTS audio; tune Whisper size / LLM streaming.

## Failure modes to cover
- LiveKit/agent down -> clear status, retry, no crash.
- LLM endpoint unreachable -> spoken/visible error, session ends cleanly.
- Mic permission denied -> existing denied-alert path.

## Success criteria
- All acceptance criteria in `plan.md` pass on at least one iOS and one Android device.

## Status
Automated gates GREEN (in CI sandbox):
- happy-server `tsc --noEmit`: 0 errors; token unit tests 5/5 pass.
- happy-app `tsc --noEmit`: 0 errors (incl. all 10 locale files).
- agent worker `py_compile` clean; `docker compose config` valid; prompt parity verified.

Deferred to the user's stack/devices (cannot run in sandbox):
- Agent worker live run + scripted conversation test (needs LiveKit + model endpoints).
- iOS/Android E2E checklist (mic, barge-in, RPC round-trip, speaking indicators,
  permission approve/deny, background vs focused, reconnect).

## Docs
- Added `docs/self-hosted-voice.md` (architecture, LiveKit + model servers + agent +
  happy-server env + app toggle + E2E checklist + known follow-ups).
- Deploy assets documented inline in `deploy/voice/**` and `deploy/voice/agent/.env.example`.
