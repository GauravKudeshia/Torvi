import React from 'react';
import { ActivityIndicator, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { formatSessionTime, groupMeetings, matchesMeeting, meetingTitle, type MeetingRecord } from '@interview-copilot/sdk';
import { Action, Empty, Failure, palette, ui } from './ui';

export function NotesHome({ meetings, loading, error, active, onRefresh, onOpen, onStart, onSettings, onResume }: {
  meetings: MeetingRecord[]; loading: boolean; error: string; active: boolean;
  onRefresh: () => void; onOpen: (id: string) => void; onStart: () => void; onSettings: () => void; onResume: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const sections = React.useMemo(() => groupMeetings(meetings.filter(m => matchesMeeting(m, query))).map(g => ({ title: g.label, data: g.meetings })), [meetings, query]);
  return <View style={ui.screen}><View style={ui.header}><View><Text style={ui.eyebrow}>TORVI</Text><Text style={ui.title}>Notes</Text></View><Action secondary onPress={onSettings}>Account</Action></View>
    <View style={{ paddingHorizontal: 22, paddingBottom: 16 }}><TextInput accessibilityLabel="Search meetings" placeholder="Search your notes…" placeholderTextColor={palette.tertiary} value={query} onChangeText={setQuery} style={ui.input} /></View>
    <Failure text={error} />{error && <Action secondary onPress={onRefresh}>Retry loading notes</Action>}
    <SectionList sections={sections} keyExtractor={item => item.id} refreshing={loading} onRefresh={onRefresh} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, flexGrow: 1 }}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={[ui.metadata, { paddingVertical: 12, backgroundColor: palette.background }]}>{section.title}</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${meetingTitle(item)}, ${formatSessionTime(item.liveSeconds)}`} onPress={() => onOpen(item.id)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, minHeight: 82, paddingVertical: 18, borderBottomWidth: 1, borderColor: palette.border, opacity: pressed ? .6 : 1 })}><View style={{ flex: 1, gap: 6 }}><Text numberOfLines={2} style={{ color: palette.text, fontSize: 16, fontWeight: '500' }}>{meetingTitle(item)}</Text><Text style={ui.metadata}>{new Date(item.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {item.status}</Text></View><Text style={ui.metadata}>{formatSessionTime(item.liveSeconds)}</Text></Pressable>}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading conversations" color={palette.accent} /> : <Empty title={query ? 'Nothing matches yet.' : 'Keep the conversation, not the noise.'} copy={query ? 'Try another title or company.' : 'Start a recording. Your notes, transcript, and next steps will live here after you choose Save.'} />} />
    <View style={ui.dock}><Text style={[ui.metadata, { textAlign: 'center' }]}>Foreground room audio only · no phone-call capture</Text><Action onPress={active ? onResume : onStart}>{active ? 'Return to current session' : 'Start recording'}</Action></View>
  </View>;
}
