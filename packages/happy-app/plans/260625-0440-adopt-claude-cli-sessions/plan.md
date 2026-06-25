# Adopt plain-`claude` CLI sessions from the mobile app

Let the app list Claude Code sessions created with the plain `claude` CLI (on a
machine) and adopt/resume one — the daemon spawns `happy --resume <claudeSessionId>`
in that session's directory, turning it into a normal Happy session.

## Key findings (scouted)

- **Adoption already works.** `machineSpawnNewSession({ machineId, directory,
  resumeClaudeSessionId, agent: 'claude' })` already spawns a Happy session that
  resumes a Claude session (daemon does `--resume`). ops.ts:~217, apiMachine.ts:148.
- **Only missing piece: listing** the Claude sessions on the machine.
- Claude sessions live at `${CLAUDE_CONFIG_DIR||~/.claude}/projects/<enc>/<uuid>.jsonl`.
  The session **id is the filename** (UUID) and the **cwd is stored inside the jsonl**
  (`"cwd":"..."` on every record) — no lossy reverse-decode needed.
- RPC handlers register in `apiMachine.ts setRPCHandlers` (mirror
  `claude-list-rewind-points`); app calls via `apiSocket.machineRPC`.

## Changes

| # | Area | File | Change |
|---|------|------|--------|
| 1 | cli | `src/claude/sessions/scanClaudeSessions.ts` (new) | scan projects dir → `{claudeSessionId, cwd, summary, modifiedAt}[]`, sorted recent-first, capped |
| 2 | cli | `src/api/apiMachine.ts` | register `claude-list-sessions` RPC → calls scanner |
| 3 | app | `sources/sync/ops.ts` | `machineListClaudeSessions(machineId)` + types |
| 4 | app | `sources/app/(app)/machine/claude-sessions.tsx` (new) | list screen; tap → `machineSpawnNewSession({..., resumeClaudeSessionId, directory: cwd})` → navigate |
| 5 | app | `sources/app/(app)/machine/[id].tsx` | add "Resume a Claude session" link |
| 6 | app | i18n `_default.ts` + 10 locales | new `machineClaudeSessions.*` strings |

## Decisions

- **List ALL sessions on the machine**, sorted by file mtime (most recent first),
  capped (default 200) to bound payload; log/note the cap. Group/scroll in UI by recency.
- Reuse the existing spawn RPC for adoption — no new "adopt" RPC needed.

## Acceptance

- App → machine screen → "Resume a Claude session" lists Claude CLI sessions with a
  summary + path + time. Tapping one spawns a Happy session resuming it; it appears in
  the session list with full history and is future-resumable through Happy.

## Verification

- cli + app `tsc` clean; cli scanner unit test against fixtures.
- Runtime (daemon scan + device tap) deferred to user hardware.

## Risks

- Large/many jsonl files → read line-by-line, stop early once cwd+summary captured; cap count.
- A resumed Claude session forks to a NEW id (per CLI docs) — expected; Happy tracks the new one.
