import { Room, RoomEvent, type RpcInvocationData, type Participant } from 'livekit-client';
import { storage } from '@/sync/storage';
import { getElevenLabsCodeFromPreference } from '@/constants/Languages';
import { realtimeClientTools } from './realtimeClientTools';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Data-channel topics — MUST match the agent worker (deploy/voice/agent/voice_agent.py).
const INIT_TOPIC = 'happy_voice_init';
const CONTEXTUAL_UPDATE_TOPIC = 'happy_contextual_update';
const USER_TEXT_TOPIC = 'happy_user_text';

// Platform audio lifecycle. Native passes LiveKit's AudioSession; web uses no-ops
// (the browser manages capture/playback via getUserMedia + autoplay).
export interface VoiceAudioHooks {
    start: () => Promise<void>;
    stop: () => Promise<void>;
}

function encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function safeParse(payload: string): unknown {
    try {
        return JSON.parse(payload);
    } catch {
        return {};
    }
}

/**
 * Self-hosted voice session backed by LiveKit. Mirrors the ElevenLabs impl's
 * contract (VoiceSession) and storage wiring, but the conversational agent runs
 * on the user's own LiveKit Agents worker. The agent drives the app through two
 * RPC methods we register here, reusing the existing provider-agnostic
 * realtimeClientTools.
 */
export function createLocalVoiceSession(audio: VoiceAudioHooks): VoiceSession {
    let room: Room | null = null;
    let audioStarted = false;

    function mapRoomEvents(activeRoom: Room): void {
        activeRoom.on(RoomEvent.Connected, () => {
            storage.getState().setRealtimeStatus('connected');
            storage.getState().setRealtimeMode('idle');
        });

        activeRoom.on(RoomEvent.Disconnected, () => {
            const prev = storage.getState().realtimeStatus;
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            storage.getState().clearRealtimeModeDebounce();
            // Force a fresh Room next session (LiveKit Rooms can't be reused after
            // disconnect) — matches the ElevenLabs generation-bump behavior.
            if (prev === 'connected' || prev === 'connecting') {
                storage.getState().incrementVoiceSessionGeneration();
            }
        });

        // One signal for both speaking indicators: the agent is any remote speaker,
        // the user is the local participant. Replaces ElevenLabs onModeChange/onVadScore.
        activeRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
            const localSid = activeRoom.localParticipant.sid;
            const agentSpeaking = speakers.some((s) => s.sid !== localSid);
            const userSpeaking = speakers.some((s) => s.sid === localSid);
            if (agentSpeaking) {
                storage.getState().setRealtimeMode('agent-speaking');
            } else if (userSpeaking) {
                storage.getState().setRealtimeMode('user-speaking', true);
            } else {
                storage.getState().setRealtimeMode('idle');
            }
        });
    }

    function registerClientTools(activeRoom: Room): void {
        activeRoom.localParticipant.registerRpcMethod(
            'sendMessageToSession',
            async (data: RpcInvocationData) =>
                (await realtimeClientTools.sendMessageToSession(safeParse(data.payload))) as string,
        );
        activeRoom.localParticipant.registerRpcMethod(
            'processPermissionRequest',
            async (data: RpcInvocationData) =>
                (await realtimeClientTools.processPermissionRequest(safeParse(data.payload))) as string,
        );
    }

    // The client cannot set room/participant metadata, so hand the agent its
    // per-conversation overrides over the init data channel. Re-published when the
    // agent joins so connect order doesn't matter.
    async function publishInit(activeRoom: Room, config: VoiceSessionConfig): Promise<void> {
        const languagePref = storage.getState().settings.voiceAssistantLanguage;
        const language = getElevenLabsCodeFromPreference(languagePref) || undefined;
        const payload = {
            focusedSessionId: config.sessionId,
            initialContext: config.initialContext ?? '',
            systemPrompt: config.systemPrompt,
            firstMessage: config.firstMessage,
            language,
        };
        await activeRoom.localParticipant.publishData(encode(JSON.stringify(payload)), {
            reliable: true,
            topic: INIT_TOPIC,
        });
    }

    function publish(topic: string, text: string): void {
        if (!room) {
            return;
        }
        void room.localParticipant.publishData(encode(text), { reliable: true, topic });
    }

    return {
        async startSession(config: VoiceSessionConfig): Promise<string | null> {
            if (!config.livekitUrl || !config.livekitToken) {
                throw new Error('Missing LiveKit url/token for local voice session');
            }
            storage.getState().setRealtimeStatus('connecting');
            try {
                await audio.start();
                audioStarted = true;

                const activeRoom = new Room({ adaptiveStream: true });
                room = activeRoom;
                mapRoomEvents(activeRoom);
                registerClientTools(activeRoom);

                await activeRoom.connect(config.livekitUrl, config.livekitToken);
                await activeRoom.localParticipant.setMicrophoneEnabled(true);

                await publishInit(activeRoom, config);
                activeRoom.on(RoomEvent.ParticipantConnected, () => {
                    void publishInit(activeRoom, config);
                });

                return config.roomName ?? activeRoom.name ?? null;
            } catch (error) {
                storage.getState().setRealtimeStatus('error');
                await this.endSession();
                throw error;
            }
        },

        async endSession(): Promise<void> {
            try {
                await room?.disconnect();
            } catch {
                // ignore — disconnect is best-effort
            }
            room = null;
            if (audioStarted) {
                try {
                    await audio.stop();
                } catch {
                    // ignore
                }
                audioStarted = false;
            }
            storage.getState().setRealtimeStatus('disconnected');
        },

        // Prompt that should trigger an agent reply (permission requests, ready events).
        sendTextMessage(message: string): void {
            publish(USER_TEXT_TOPIC, message);
        },

        // Silent background context (session focus, new messages, status).
        sendContextualUpdate(update: string): void {
            publish(CONTEXTUAL_UPDATE_TOPIC, update);
        },
    };
}
