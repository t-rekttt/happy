import React, { useEffect, useRef } from 'react';
import { registerVoiceSession } from './RealtimeSession';
import { createLocalVoiceSession } from './localRealtimeVoiceSessionCore';

/**
 * Web mount point for the self-hosted (LiveKit) voice provider. The browser
 * manages mic capture/playback, so the audio hooks are no-ops. Renders nothing.
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
                    start: async () => {},
                    stop: async () => {},
                }),
            );
            hasRegistered.current = true;
        } catch (error) {
            console.error('Failed to register local voice session:', error);
        }
    }, []);

    return null;
};
