# Phase 02 — Server: Local LiveKit Token Route

## Overview
- Priority: P0
- Status: TODO
- Add a happy-server route that mints a LiveKit join token for the authenticated user,
  parallel to the existing ElevenLabs broker. No metering/paywall.

## Context
- Existing broker: `packages/happy-server/sources/app/api/routes/voiceRoutes.ts`
  (ElevenLabs token + RevenueCat gating). Do NOT modify; add a sibling route.
- Auth: reuse `app.authenticate` preHandler + `request.userId` as today.

## Requirements
- `POST /v1/voice/local/token` -> `{ url, token, roomName }`.
- Only enabled when `LIVEKIT_URL/KEY/SECRET` present; else 501/clear error.
- Room name deterministic per user+session so the agent worker can find context, e.g.
  `voice_${userId}_${happySessionId}`.
- Token grants: roomJoin, room=roomName, canPublish, canSubscribe; identity = userId.

## Steps (done)
1. Wire schema `VoiceLocalTokenResponseSchema` added to `happy-wire/src/voice.ts`
   (`{ url, token, roomName }`); rebuilt dist.
2. `sources/app/voice/voiceLocalToken.ts` — `getVoiceLocalConfig()` (env -> config|null) +
   `voiceLocalToken(config, { userId, sessionId })`. Mints the LiveKit JWT.
3. `sources/app/api/routes/voiceLocalRoutes.ts` — `POST /v1/voice/local/token`, authenticated,
   Zod body `{ sessionId }`, 200 token / 501 when unconfigured.
4. Registered in `sources/app/api/api.ts` next to `voiceRoutes`.

## Implementation note (dependency choice)
A LiveKit join token is a standard HS256 JWT with a `video` grant, so it is minted with the
**already-present `jsonwebtoken`** rather than adding `livekit-server-sdk` (YAGNI, no install
step). If a later phase needs `RoomServiceClient`/webhook verification, add the SDK then.
Token TTL 10 min; room name `voice_${userId}_${sanitizedSessionId}`.

## Related files
- Created: `sources/app/voice/voiceLocalToken.ts`,
  `sources/app/voice/voiceLocalToken.spec.ts`,
  `sources/app/api/routes/voiceLocalRoutes.ts`
- Modified: `sources/app/api/api.ts`, `packages/happy-wire/src/voice.ts`
- Env (deploy): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

## Verification (done)
- happy-wire build clean; schema present in all dist outputs.
- happy-server `tsc --noEmit` clean.
- Unit tests green (5): JWT verifies with the LiveKit secret, grant shape correct, room-name
  sanitization, env gating.
- Live HTTP smoke (needs running server + auth token) deferred to deploy / Phase 06 E2E.

## Success criteria
- Authenticated `POST /v1/voice/local/token` returns a token that joins the LiveKit room. [met
  at unit level; live check at deploy]

## Security
- Never expose `LIVEKIT_API_SECRET` to client. Short token TTL (e.g. 10 min). Room scoped
  to the requesting user only.

## Next
- Phase 04 consumes this route.
