import React from 'react';
import { ElevenLabsProvider } from '@elevenlabs/react-native';
import { RealtimeVoiceSession } from './RealtimeVoiceSession';
import { LocalRealtimeVoiceSession } from './LocalRealtimeVoiceSession';
import { useVoiceSessionGeneration, useSetting } from '@/sync/storage';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    // Force the provider to remount between sessions. Both backends use LiveKit,
    // whose Room instance can't be reused after disconnect — a second startSession
    // silently fails. Children sit OUTSIDE so the app tree isn't torn down on remount.
    const generation = useVoiceSessionGeneration();
    const voiceProvider = useSetting('voiceProvider');
    return (
        <>
            {voiceProvider === 'local' ? (
                <LocalRealtimeVoiceSession key={generation} />
            ) : (
                <ElevenLabsProvider key={generation}>
                    <RealtimeVoiceSession />
                </ElevenLabsProvider>
            )}
            {children}
        </>
    );
};
