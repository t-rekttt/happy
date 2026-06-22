import jwt from 'jsonwebtoken';

export interface VoiceLocalConfig {
    url: string;
    apiKey: string;
    apiSecret: string;
}

export interface VoiceLocalTokenInput {
    userId: string;
    sessionId: string;
}

export interface VoiceLocalTokenResult {
    url: string;
    token: string;
    roomName: string;
}

// 10 minutes: long enough to join the room; the conversation/session itself
// outlives the token, LiveKit only checks it at connect time.
const TOKEN_TTL_SECONDS = 600;

/**
 * Reads self-hosted LiveKit config from env. Returns null when the local voice
 * provider is not configured so the route can answer 501 instead of throwing.
 * happy-server only needs the key/secret to SIGN tokens — it never calls LiveKit,
 * so it can run anywhere relative to the LiveKit server.
 */
export function getVoiceLocalConfig(): VoiceLocalConfig | null {
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
        return null;
    }
    return { url, apiKey, apiSecret };
}

/**
 * Mints a short-lived LiveKit join token for the authenticated user, scoped to a
 * deterministic per-user/per-session room. The token is a standard LiveKit JWT
 * (HS256 with a `video` grant) signed locally with LIVEKIT_API_SECRET. The agent
 * worker joins the same room to drive the conversation; the app executes client
 * tools (sendMessageToSession, processPermissionRequest) back over LiveKit RPC.
 */
export function voiceLocalToken(config: VoiceLocalConfig, input: VoiceLocalTokenInput): VoiceLocalTokenResult {
    const roomName = buildVoiceRoomName(input.userId, input.sessionId);
    const token = jwt.sign(
        {
            // Participant display name; the unique identity is the JWT `sub` below.
            name: input.userId,
            // Redundant hint so the agent can correlate the room without extra calls.
            metadata: JSON.stringify({ sessionId: input.sessionId }),
            // LiveKit VideoGrant — scope this token to the one room only.
            video: {
                room: roomName,
                roomJoin: true,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
            },
        },
        config.apiSecret,
        {
            algorithm: 'HS256',
            issuer: config.apiKey,
            subject: input.userId,
            notBefore: 0,
            expiresIn: TOKEN_TTL_SECONDS,
        },
    );
    return { url: config.url, token, roomName };
}

/**
 * Deterministic room name per user+session. LiveKit room names allow a limited
 * charset; sanitize the session id defensively (ids are normally cuid-safe).
 */
function buildVoiceRoomName(userId: string, sessionId: string): string {
    const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `voice_${userId}_${safeSession}`;
}
