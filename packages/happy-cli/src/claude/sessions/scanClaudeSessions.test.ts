import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanClaudeSessions } from './scanClaudeSessions';

// Real FS, no mocks (per project convention): point CLAUDE_CONFIG_DIR at a temp
// dir laid out like ~/.claude and assert the scanner recovers sessions.
describe('scanClaudeSessions', () => {
    let configDir: string;
    let prevEnv: string | undefined;

    const writeSession = async (project: string, sessionId: string, lines: object[], mtime?: Date) => {
        const dir = join(configDir, 'projects', project);
        await mkdir(dir, { recursive: true });
        const file = join(dir, `${sessionId}.jsonl`);
        await writeFile(file, lines.map((l) => JSON.stringify(l)).join('\n'));
        if (mtime) await utimes(file, mtime, mtime);
    };

    beforeEach(async () => {
        configDir = await mkdtemp(join(tmpdir(), 'happy-claude-scan-'));
        prevEnv = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = configDir;
    });

    afterEach(async () => {
        if (prevEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
        else process.env.CLAUDE_CONFIG_DIR = prevEnv;
        await rm(configDir, { recursive: true, force: true });
    });

    it('returns empty when no projects dir exists', async () => {
        await rm(configDir, { recursive: true, force: true });
        expect(await scanClaudeSessions()).toEqual([]);
    });

    it('recovers cwd and summary, ignores non-uuid files', async () => {
        await writeSession('-Users-me-proj', '11111111-1111-4111-8111-111111111111', [
            { type: 'summary', summary: 'List the files' },
            { type: 'user', cwd: '/Users/me/proj', message: { role: 'user', content: 'list files' } },
        ]);
        // Non-UUID filename must be skipped.
        await writeSession('-Users-me-proj', 'not-a-uuid', [{ cwd: '/Users/me/proj' }]);

        const sessions = await scanClaudeSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            claudeSessionId: '11111111-1111-4111-8111-111111111111',
            cwd: '/Users/me/proj',
            summary: 'List the files',
        });
    });

    it('falls back to first user message when no summary, and sorts newest first', async () => {
        await writeSession('-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', [
            { type: 'user', cwd: '/a', message: { role: 'user', content: [{ type: 'text', text: 'older session' }] } },
        ], new Date('2020-01-01'));
        await writeSession('-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', [
            { type: 'user', cwd: '/b', message: { role: 'user', content: 'newer session' } },
        ], new Date('2025-01-01'));

        const sessions = await scanClaudeSessions();
        expect(sessions.map((s) => s.cwd)).toEqual(['/b', '/a']);
        expect(sessions[0].summary).toBe('newer session');
    });

    it('honors the limit', async () => {
        for (let i = 0; i < 3; i++) {
            const id = `${i}0000000-0000-4000-8000-000000000000`;
            await writeSession('-p', id, [{ type: 'user', cwd: `/p/${i}`, message: { role: 'user', content: 'x' } }]);
        }
        expect(await scanClaudeSessions({ limit: 2 })).toHaveLength(2);
    });

    it('skips files without a cwd', async () => {
        await writeSession('-p', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', [
            { type: 'summary', summary: 'no cwd here' },
        ]);
        expect(await scanClaudeSessions()).toEqual([]);
    });
});
