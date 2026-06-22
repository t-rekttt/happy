import { z } from "zod";
import { VoiceLocalTokenResponseSchema } from "@slopus/happy-wire";
import { type Fastify } from "../types";
import { log } from "@/utils/log";
import { getVoiceLocalConfig, voiceLocalToken } from "@/app/voice/voiceLocalToken";

/**
 * Self-hosted voice provider routes. Sibling to voiceRoutes (ElevenLabs); this
 * path mints a LiveKit join token for a user-run voice stack. No usage metering
 * or paywall — the user owns the infrastructure.
 */
export function voiceLocalRoutes(app: Fastify) {
    app.post('/v1/voice/local/token', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                sessionId: z.string().min(1),
            }),
            response: {
                200: VoiceLocalTokenResponseSchema,
                501: z.object({ error: z.string() }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.body;

        const config = getVoiceLocalConfig();
        if (!config) {
            return reply.code(501).send({
                error: 'Self-hosted voice not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)',
            });
        }

        const result = voiceLocalToken(config, { userId, sessionId });
        log({ module: 'voice' }, `Local voice token issued for user ${userId}, room=${result.roomName}`);
        return reply.send(result);
    });
}
