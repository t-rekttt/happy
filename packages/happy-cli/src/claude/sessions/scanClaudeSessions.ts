import { homedir } from 'node:os';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

/**
 * Discovers Claude Code sessions stored on this machine (including ones created
 * with the plain `claude` CLI, outside Happy) so the app can list and adopt them.
 *
 * Sessions live at `${CLAUDE_CONFIG_DIR||~/.claude}/projects/<encoded-cwd>/<uuid>.jsonl`.
 * The session id is the filename (a UUID); the real working directory and a summary
 * are read from inside the jsonl (every record carries a `cwd` field).
 */

export interface ClaudeSessionInfo {
    /** Claude session id (the jsonl filename, a UUID). */
    claudeSessionId: string;
    /** Real working directory the session ran in (from the jsonl `cwd` field). */
    cwd: string;
    /** A short human label: the session summary or first user message (may be empty). */
    summary: string;
    /** Last-modified time of the jsonl, ms since epoch — used for recency sorting. */
    modifiedAt: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Read at most this many lines per file to extract cwd + a summary; large
// transcripts don't need a full read just for the listing.
const MAX_LINES_PER_FILE = 60;
const DEFAULT_LIMIT = 200;
const SUMMARY_MAX_LEN = 200;

function claudeProjectsDir(): string {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    return join(configDir, 'projects');
}

function textFromContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const part = content.find((p: any) => p?.type === 'text' && typeof p.text === 'string');
        if (part) return (part as any).text;
    }
    return '';
}

/**
 * Reads the head of a session jsonl to recover its cwd and a one-line summary.
 * Returns null if the file has no usable records.
 */
async function readSessionHead(filePath: string): Promise<{ cwd: string; summary: string } | null> {
    let cwd = '';
    let summary = '';
    let firstUserText = '';
    let lines = 0;

    const rl = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
    try {
        for await (const line of rl) {
            if (++lines > MAX_LINES_PER_FILE) break;
            if (!line.trim()) continue;
            let record: any;
            try {
                record = JSON.parse(line);
            } catch {
                continue;
            }
            if (!cwd && typeof record.cwd === 'string') cwd = record.cwd;
            // A leading `summary` record is the best label after a resume.
            if (!summary && record.type === 'summary' && typeof record.summary === 'string') {
                summary = record.summary;
            }
            if (!firstUserText && record.type === 'user' && record.message) {
                firstUserText = textFromContent(record.message.content);
            }
            if (cwd && (summary || firstUserText)) break;
        }
    } finally {
        rl.close();
    }

    if (!cwd) return null;
    const label = (summary || firstUserText).replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX_LEN);
    return { cwd, summary: label };
}

/**
 * Scan all Claude sessions on this machine, most-recently-modified first.
 * Capped to `limit` (default 200) to bound the RPC payload.
 */
export async function scanClaudeSessions(opts: { limit?: number } = {}): Promise<ClaudeSessionInfo[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const projectsDir = claudeProjectsDir();

    let projectDirs: string[];
    try {
        projectDirs = await readdir(projectsDir);
    } catch {
        return []; // no ~/.claude/projects on this machine
    }

    // Collect candidate files with their mtimes first, so we can sort by recency
    // and only parse the head of the most recent `limit` files.
    const candidates: { filePath: string; claudeSessionId: string; modifiedAt: number }[] = [];
    for (const project of projectDirs) {
        const dir = join(projectsDir, project);
        let entries: string[];
        try {
            entries = await readdir(dir);
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.endsWith('.jsonl')) continue;
            const claudeSessionId = entry.slice(0, -'.jsonl'.length);
            if (!UUID_RE.test(claudeSessionId)) continue;
            const filePath = join(dir, entry);
            try {
                const s = await stat(filePath);
                candidates.push({ filePath, claudeSessionId, modifiedAt: s.mtimeMs });
            } catch {
                continue;
            }
        }
    }

    candidates.sort((a, b) => b.modifiedAt - a.modifiedAt);

    const results: ClaudeSessionInfo[] = [];
    for (const candidate of candidates) {
        if (results.length >= limit) break;
        const head = await readSessionHead(candidate.filePath);
        if (!head) continue;
        results.push({
            claudeSessionId: candidate.claudeSessionId,
            cwd: head.cwd,
            summary: head.summary,
            modifiedAt: candidate.modifiedAt,
        });
    }
    return results;
}
