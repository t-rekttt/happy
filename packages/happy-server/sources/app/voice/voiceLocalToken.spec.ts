import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { voiceLocalToken, getVoiceLocalConfig, type VoiceLocalConfig } from './voiceLocalToken';

const config: VoiceLocalConfig = {
    url: 'wss://voice.example.com',
    apiKey: 'APItestkey',
    apiSecret: 'supersecretsupersecretsupersecret',
};

describe('voiceLocalToken', () => {
    it('mints a verifiable LiveKit JWT scoped to a per-user/session room', () => {
        const { url, token, roomName } = voiceLocalToken(config, {
            userId: 'user_123',
            sessionId: 'sess_abc',
        });

        expect(url).toBe(config.url);
        expect(roomName).toBe('voice_user_123_sess_abc');

        // Verify signature + standard claims with the same secret LiveKit uses.
        const payload = jwt.verify(token, config.apiSecret) as Record<string, any>;
        expect(payload.iss).toBe(config.apiKey);
        expect(payload.sub).toBe('user_123');
        expect(payload.exp).toBeGreaterThan(payload.nbf);
        expect(payload.video).toMatchObject({
            room: roomName,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });
        expect(JSON.parse(payload.metadata)).toEqual({ sessionId: 'sess_abc' });
    });

    it('sanitizes unsafe characters in the session id for the room name', () => {
        const { roomName } = voiceLocalToken(config, {
            userId: 'u1',
            sessionId: 'a/b c.d',
        });
        expect(roomName).toBe('voice_u1_a-b-c-d');
    });

    it('grants a room scoped only to the requesting room', () => {
        const { token, roomName } = voiceLocalToken(config, { userId: 'u1', sessionId: 's1' });
        const payload = jwt.verify(token, config.apiSecret) as Record<string, any>;
        expect(payload.video.room).toBe(roomName);
    });
});

describe('getVoiceLocalConfig', () => {
    const keys = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;
    const snapshot = () => Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const restore = (s: Record<string, string | undefined>) => {
        for (const k of keys) {
            if (s[k] === undefined) delete process.env[k];
            else process.env[k] = s[k];
        }
    };

    it('returns null when any var is missing', () => {
        const s = snapshot();
        for (const k of keys) delete process.env[k];
        expect(getVoiceLocalConfig()).toBeNull();
        restore(s);
    });

    it('returns config when all vars are present', () => {
        const s = snapshot();
        process.env.LIVEKIT_URL = config.url;
        process.env.LIVEKIT_API_KEY = config.apiKey;
        process.env.LIVEKIT_API_SECRET = config.apiSecret;
        expect(getVoiceLocalConfig()).toEqual(config);
        restore(s);
    });
});
