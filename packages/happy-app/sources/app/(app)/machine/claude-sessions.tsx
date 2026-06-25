import React, { memo, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { useMachine } from '@/sync/storage';
import { machineListClaudeSessions, machineSpawnNewSession, type ClaudeSessionInfo } from '@/sync/ops';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { t } from '@/text';

/**
 * Lists Claude Code sessions found on a machine (including plain-`claude` CLI
 * sessions) and adopts the chosen one into Happy by spawning a session that
 * resumes it. Reached from the machine detail screen with ?machineId=.
 */
export default memo(function MachineClaudeSessionsScreen() {
    const { theme } = useUnistyles();
    const { machineId } = useLocalSearchParams<{ machineId: string }>();
    const router = useRouter();
    const machine = useMachine(machineId!);
    const navigateToSession = useNavigateToSession();

    const [sessions, setSessions] = useState<ClaudeSessionInfo[] | null>(null);
    const [adoptingId, setAdoptingId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        // Core principle: never show a loading error — just retry silently.
        const load = async () => {
            try {
                const list = await machineListClaudeSessions(machineId!);
                if (!cancelled) setSessions(list);
            } catch {
                if (!cancelled) setTimeout(load, 1500);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [machineId]);

    const adopt = async (session: ClaudeSessionInfo) => {
        if (adoptingId) return;
        setAdoptingId(session.claudeSessionId);
        try {
            const result = await machineSpawnNewSession({
                machineId: machineId!,
                directory: session.cwd,
                agent: 'claude',
                resumeClaudeSessionId: session.claudeSessionId,
                approvedNewDirectoryCreation: true,
            });
            switch (result.type) {
                case 'success':
                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
                case 'requestToApproveDirectoryCreation':
                    Modal.alert(t('common.error'), t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'));
                    break;
            }
        } catch (error) {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : t('machineClaudeSessions.adoptFailed'));
        } finally {
            setAdoptingId(null);
        }
    };

    return (
        <>
            <Stack.Screen options={{ headerShown: true, headerTitle: t('machineClaudeSessions.title') }} />
            <ItemList>
                {sessions === null ? (
                    <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                        <ActivityIndicator />
                    </View>
                ) : sessions.length === 0 ? (
                    <ItemGroup>
                        <Item title={t('machineClaudeSessions.empty')} showChevron={false} />
                    </ItemGroup>
                ) : (
                    <ItemGroup footer={t('machineClaudeSessions.footer')}>
                        {sessions.map((session) => {
                            const pathDisplay = formatPathRelativeToHome(session.cwd, machine?.metadata?.homeDir);
                            return (
                                <Item
                                    key={session.claudeSessionId}
                                    title={session.summary || pathDisplay}
                                    subtitle={pathDisplay}
                                    onPress={() => adopt(session)}
                                    disabled={adoptingId !== null}
                                    rightElement={
                                        adoptingId === session.claudeSessionId
                                            ? <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                            : <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                                    }
                                />
                            );
                        })}
                    </ItemGroup>
                )}
            </ItemList>
        </>
    );
});
