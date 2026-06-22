# Phase 05 — App: Settings + Provider Wiring

## Overview
- Priority: P1
- Status: TODO
- Let the user choose the self-hosted voice provider and point at their server.

## Context
- Settings schema: `packages/happy-app/sources/sync/settings.ts` already has
  `voiceCustomAgentId`, `voiceBypassToken`, `voiceAssistantLanguage` — extend the same way.
- Settings UI: `sources/app/(app)/settings/voice.tsx`.
- Token endpoint base resolved via `sources/sync/serverConfig.ts` (`getServerUrl`); the
  self-hosted happy-server already returns the LiveKit `url` in its token response, so the
  app needs only the happy-server URL it already uses — no separate LiveKit URL field unless
  the user runs LiveKit on a different host.

## Requirements
- Add settings keys (with defaults, no backward-compat code per app conventions):
  - `voiceProvider: 'elevenlabs' | 'local'` (default `'elevenlabs'`).
  - Optional `voiceSelfHostedLiveKitUrl: string | null` (only if overriding the URL the
    server returns).
- `voice.tsx`: provider selector (Item/ItemList per app UI rules); show local fields when
  `local` selected; all strings via `t(...)` across all locales.
- `RealtimeProvider`/`RealtimeSession` select impl from `voiceProvider`.

## Related files
- Modify: `sources/sync/settings.ts`, `sources/app/(app)/settings/voice.tsx`,
  `sources/realtime/RealtimeProvider.tsx`, `sources/realtime/RealtimeSession.ts`.
- Modify: `sources/text/translations/*` (new strings, all languages).

## Success criteria
- Toggling provider switches stacks without app restart; ElevenLabs remains default and
  unaffected when unset.

## Status — built
- `settings.ts`: `voiceProvider` enum added (default 'elevenlabs') — done in Phase 04.
- `voice.tsx`: "Voice Provider" group with a self-hosted Switch (on -> 'local').
- i18n: `providerTitle/providerDescription/selfHostedTitle/selfHostedSubtitle` added to the
  `TranslationStructure` type (`_default.ts`) and all 10 locale files.
- `RealtimeProvider.tsx`/`.web.tsx` already select impl by `voiceProvider` (Phase 04).
- Decision: no separate LiveKit-URL field — the server's token response carries the `url`, and
  the app uses its existing happy-server URL. Add an override field later only if needed (YAGNI).

## Validation
- `pnpm exec tsc --noEmit`: 0 errors (incl. all locale files against TranslationStructure).
- Manual provider-toggle behavior is a runtime check (Phase 06).

## Next
- Phase 06.
