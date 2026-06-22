# Phase 04 — App: LocalRealtimeVoiceSession (LiveKit)

## Overview
- Priority: P0
- Status: TODO
- New `VoiceSession` implementation that connects to self-hosted LiveKit instead of
  ElevenLabs, reusing `realtimeClientTools` and existing status/mode storage wiring.

## Context
- Interface to implement: `packages/happy-app/sources/realtime/types.ts` (`VoiceSession`).
- Current ElevenLabs impl (reference for callbacks/UI wiring):
  `RealtimeVoiceSession.tsx` (native), `RealtimeVoiceSession.web.tsx` (web).
- Selection/orchestration: `RealtimeSession.ts` (`startRealtimeSession`) — add a branch for
  the local provider before the ElevenLabs token flow.
- App deps already present: `@livekit/react-native`, `@livekit/react-native-webrtc`,
  `livekit-client`, `@livekit/react-native-expo-plugin`, `expo-audio`.

## Requirements
- `LocalRealtimeVoiceSession` implements `startSession/endSession/sendTextMessage/sendContextualUpdate`:
  - `startSession`: fetch token via `POST /v1/voice/local/token` (new `apiVoice` fn), connect
    `Room`, enable mic, set room metadata/data with `dynamicVariables` + `overrides`
    (systemPrompt, firstMessage, language) the worker expects.
  - Register LiveKit RPC handlers that call into the existing `realtimeClientTools`
    (`sendMessageToSession`, `processPermissionRequest`) and return their string results.
  - Map LiveKit events to storage: connection -> `setRealtimeStatus`; agent state
    speaking/listening -> `setRealtimeMode('agent-speaking'|'idle')`; local mic activity ->
    `setRealtimeMode('user-speaking')` (use LiveKit audio levels / VAD events in place of
    ElevenLabs `onVadScore`).
  - `endSession`: disconnect room, set disconnected, bump voice session generation (parity
    with ElevenLabs `onDisconnect`).
  - `sendContextualUpdate`/`sendTextMessage`: publish data message to the agent.
- Keep micro-UX parity: connecting state set immediately, mic permission via existing
  `requestMicrophonePermission()`.

## Related files
- Create: `sources/realtime/LocalRealtimeVoiceSession.tsx` (+ `.web.tsx` if web needed now).
- Create: `fetchLocalVoiceToken` in `sources/sync/apiVoice.ts`.
- Modify: `sources/realtime/RealtimeSession.ts` (provider branch),
  `sources/realtime/RealtimeProvider.tsx` (mount local vs EL impl by setting).

## Status — built
- `localRealtimeVoiceSessionCore.ts` — provider-agnostic LiveKit session factory:
  connects Room, registers RPC methods `sendMessageToSession`/`processPermissionRequest`
  (reusing `realtimeClientTools`), enables mic, publishes the init payload, maps
  Connected/Disconnected/ActiveSpeakersChanged to realtimeStatus/realtimeMode, and implements
  `sendTextMessage` (-> `happy_user_text`) / `sendContextualUpdate` (-> `happy_contextual_update`).
- `LocalRealtimeVoiceSession.tsx` (native, LiveKit AudioSession) + `.web.tsx` (no-op audio).
- `RealtimeSession.ts` — `startLocalRealtimeSession` + provider branch at top of `startRealtimeSession`.
- `RealtimeProvider.tsx`/`.web.tsx` — mount local vs ElevenLabs by `settings.voiceProvider`.
- `apiVoice.ts` — `fetchLocalVoiceCredentials`; `types.ts` — LiveKit fields on VoiceSessionConfig;
  `settings.ts` — `voiceProvider` ('elevenlabs' default).

## Contract refinement (propagated to Phase 03 worker)
A LiveKit CLIENT cannot set room/participant metadata, so overrides are delivered over a
data-channel **init** packet (`happy_voice_init`), and the `sendTextMessage` prompt path uses a
separate inbound topic (`happy_user_text`) that makes the agent generate a reply. The worker was
updated to wait for the init packet (token-metadata fallback) and to handle both inbound topics.

## Verification
- happy-app `tsc --noEmit`: 0 errors. Worker still `py_compile`-clean.
- Runtime behavior (mic, barge-in, RPC round-trip, speaking indicators) requires devices +
  the deployed stack — deferred to Phase 06 E2E.

## Success criteria
- With provider=local, full hands-free conversation works on a physical device; client tools
  fire; UI animations (speaking/listening) behave as with ElevenLabs. [runtime check in Phase 06]

## Risks
- Echo cancellation/mic routing differences vs ElevenLabs SDK. Mitigation: LiveKit RN handles
  AEC; verify on iOS + Android hardware.

## Next
- Phase 05 surfaces provider/url settings; Phase 06 hardens.
