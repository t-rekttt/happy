import React, { useEffect, useRef } from 'react';
import { AudioSession, registerGlobals } from '@livekit/react-native';
import { registerVoiceSession } from './RealtimeSession';
import { createLocalVoiceSession } from './localRealtimeVoiceSessionCore';

// Ensure WebRTC globals exist for our own LiveKit Room (idempotent; the
// ElevenLabs SDK also calls this internally).
registerGlobals();

/**
 * Native mount point for the self-hosted (LiveKit) voice provider. Registers a
 * VoiceSession that uses LiveKit's AudioSession for mic capture/playback with
 * acoustic echo cancellation. Renders nothing — parity with RealtimeVoiceSession.
 */
export const LocalRealtimeVoiceSession: React.FC = () => {
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (hasRegistered.current) {
            return;
        }
        try {
            registerVoiceSession(
                createLocalVoiceSession({
                    start: () => AudioSession.startAudioSession(),
                    stop: () => AudioSession.stopAudioSession(),
                }),
            );
            hasRegistered.current = true;
        } catch (error) {
            console.error('Failed to register local voice session:', error);
        }
    }, []);

    return null;
};
