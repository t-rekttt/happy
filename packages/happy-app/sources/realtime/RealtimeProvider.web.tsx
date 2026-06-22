import React from 'react';
import { RealtimeVoiceSession } from './RealtimeVoiceSession';
import { LocalRealtimeVoiceSession } from './LocalRealtimeVoiceSession';
import { useVoiceSessionGeneration, useSetting } from '@/sync/storage';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    // ElevenLabs web SDK uses a plain WebSocket; the local provider uses a LiveKit
    // Room (re-key on generation so a fresh Room is created each session).
    const generation = useVoiceSessionGeneration();
    const voiceProvider = useSetting('voiceProvider');
    return (
        <>
            {voiceProvider === 'local' ? (
                <LocalRealtimeVoiceSession key={generation} />
            ) : (
                <RealtimeVoiceSession key={generation} />
            )}
            {children}
        </>
    );
};
