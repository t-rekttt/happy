import * as z from 'zod';

export const VoiceConversationGrantedSchema = z.object({
    allowed: z.literal(true),
    conversationToken: z.string(),
    conversationId: z.string(),
    agentId: z.string(),
    elevenUserId: z.string(),
    usedSeconds: z.number(),
    limitSeconds: z.number(),
});

export const VoiceConversationDeniedSchema = z.object({
    allowed: z.literal(false),
    reason: z.enum(['voice_hard_limit_reached', 'subscription_required', 'voice_conversation_limit_reached']),
    usedSeconds: z.number(),
    limitSeconds: z.number(),
    agentId: z.string(),
});

export const VoiceConversationResponseSchema = z.discriminatedUnion('allowed', [
    VoiceConversationGrantedSchema,
    VoiceConversationDeniedSchema,
]);

export type VoiceConversationResponse = z.infer<typeof VoiceConversationResponseSchema>;

export const VoiceUsageResponseSchema = z.object({
    usedSeconds: z.number(),
    limitSeconds: z.number(),
    conversationCount: z.number(),
    conversationLimit: z.number(),
    elevenUserId: z.string(),
});

export type VoiceUsageResponse = z.infer<typeof VoiceUsageResponseSchema>;

// --- Self-hosted (local) voice provider ---
// Token the app uses to join a LiveKit room served by the user's own
// infrastructure. happy-server signs this offline; it never calls LiveKit.
export const VoiceLocalTokenResponseSchema = z.object({
    // wss signaling URL of the self-hosted LiveKit server.
    url: z.string(),
    // Short-lived LiveKit access JWT scoped to `roomName`.
    token: z.string(),
    // Deterministic per user+session so the agent worker can correlate context.
    roomName: z.string(),
});

export type VoiceLocalTokenResponse = z.infer<typeof VoiceLocalTokenResponseSchema>;
