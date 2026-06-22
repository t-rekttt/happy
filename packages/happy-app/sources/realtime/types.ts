export interface VoiceSessionConfig {
    sessionId: string;
    initialContext?: string;
    systemPrompt?: string;
    firstMessage?: string;
    // ElevenLabs provider
    conversationToken?: string;
    agentId?: string;
    userId?: string;
    // Self-hosted LiveKit provider
    livekitUrl?: string;
    livekitToken?: string;
    roomName?: string;
}

export interface VoiceSession {
    startSession(config: VoiceSessionConfig): Promise<string | null>;
    endSession(): Promise<void>;
    sendTextMessage(message: string): void;
    sendContextualUpdate(update: string): void;
}

export type ConversationStatus = 'disconnected' | 'connecting' | 'connected';
export type ConversationMode = 'idle' | 'agent-speaking' | 'user-speaking';
