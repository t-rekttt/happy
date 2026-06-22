import {
    VoiceConversationResponseSchema,
    VoiceUsageResponseSchema,
    VoiceLocalTokenResponseSchema,
    type VoiceConversationResponse,
    type VoiceUsageResponse,
    type VoiceLocalTokenResponse,
} from '@slopus/happy-wire';
import { AuthCredentials } from '@/auth/tokenStorage';
import { getServerUrl } from './serverConfig';
import { getHappyClientId } from './apiSocket';
import { config } from '@/config';

export type { VoiceConversationResponse, VoiceUsageResponse, VoiceLocalTokenResponse };

/**
 * Fetch a LiveKit join token for the self-hosted voice provider. Returns the
 * server's wss URL, a short-lived token, and the room name to join.
 */
export async function fetchLocalVoiceCredentials(
    credentials: AuthCredentials,
    sessionId: string,
): Promise<VoiceLocalTokenResponse> {
    const serverUrl = getServerUrl();
    const response = await fetch(`${serverUrl}/v1/voice/local/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
            'X-Happy-Client': getHappyClientId(),
        },
        body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
        throw new Error(`Local voice token request failed: ${response.status}`);
    }

    return VoiceLocalTokenResponseSchema.parse(await response.json());
}

export async function fetchVoiceCredentials(
    credentials: AuthCredentials,
    sessionId: string
): Promise<VoiceConversationResponse> {
    const serverUrl = getServerUrl();

    const agentId = config.elevenLabsAgentId;

    if (!agentId) {
        throw new Error('Agent ID not configured');
    }

    const response = await fetch(`${serverUrl}/v1/voice/conversations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
            'X-Happy-Client': getHappyClientId(),
        },
        body: JSON.stringify({
            agentId
        })
    });

    if (!response.ok) {
        throw new Error(`Voice token request failed: ${response.status}`);
    }

    return VoiceConversationResponseSchema.parse(await response.json());
}

export async function fetchVoiceUsage(
    credentials: AuthCredentials
): Promise<VoiceUsageResponse> {
    const serverUrl = getServerUrl();

    const response = await fetch(`${serverUrl}/v1/voice/usage`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'X-Happy-Client': getHappyClientId(),
        },
    });

    if (!response.ok) {
        throw new Error(`Voice usage request failed: ${response.status}`);
    }

    return VoiceUsageResponseSchema.parse(await response.json());
}
