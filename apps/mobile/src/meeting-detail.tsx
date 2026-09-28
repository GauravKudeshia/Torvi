import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { formatSessionTime, meetingExport, meetingTitle, type MeetingDetail } from '@interview-copilot/sdk';
import { api } from './auth';
import { Action, Empty, Failure, palette, ui } from './ui';

export function MobileMeetingDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [detail, setDetail] = React.useState<MeetingDetail | null>(null);
  const [error, setError] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const [tab, setTab] = React.useState<'notes' | 'transcript' | 'chat'>('notes');
  const [titleDraft, setTitleDraft] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { let current = true; api.meeting(id).then(value => { if (current) setDetail(value); }).catch(() => { if (current) setError('Could not load this meeting. Check your connection and retry.'); }); return () => { current = false; }; }, [id, retry]);
  async function rename() {
    if (!detail || !titleDraft || titleDraft.trim().length < 2) return;
    setSaving(true); setError('');
    try { await api.renameMeeting(id, titleDraft.trim()); setDetail({ ...detail, session: { ...detail.session, title: titleDraft.trim() } }); setTitleDraft(null); onChanged(); }
    catch { setError('The title could not be saved. Please retry.'); }
    finally { setSaving(false); }
  }
  async function share() { if (detail) try { await Share.share({ title: meetingTitle(detail.session), message: meetingExport(detail) }); } catch { setError('Sharing could not open. Please try again.'); } }
  return <View style={ui.screen}><View style={ui.header}><Action secondary onPress={onBack}>Back</Action><Action secondary disabled={!detail} onPress={() => void share()}>Share</Action></View><Failure text={error} />{!detail && (error ? <Action onPress={() => { setError(''); setRetry(n => n + 1); }}>Retry</Action> : <ActivityIndicator color={palette.accent} accessibilityLabel="Loading meeting" />)}{detail && <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled"><View><Text style={ui.eyebrow}>CONVERSATION NOTES</Text><Text selectable style={ui.title}>{meetingTitle(detail.session)}</Text><Text style={[ui.metadata, { marginTop: 10 }]}>{new Date(detail.session.startedAt).toLocaleString()} · {formatSessionTime(detail.session.liveSeconds)}</Text>{detail.target?.company && <Text style={ui.metadata}>{detail.target.company}</Text>}</View>
    {titleDraft !== null ? <View style={ui.card}><TextInput style={ui.input} accessibilityLabel="Meeting title" value={titleDraft} onChangeText={setTitleDraft} maxLength={160} /><Action disabled={saving || titleDraft.trim().length < 2} onPress={() => void rename()}>{saving ? 'Saving…' : 'Save title'}</Action><Action secondary disabled={saving} onPress={() => setTitleDraft(null)}>Cancel</Action></View> : detail.session.interviewRoundId && <Action secondary onPress={() => setTitleDraft(meetingTitle(detail.session))}>Edit title</Action>}
    <View style={ui.tabs}>{(['notes', 'transcript', 'chat'] as const).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[ui.tab, tab === item && ui.tabActive]}><Text style={ui.tabText}>{item === 'chat' ? 'AI chat' : item === 'notes' ? 'Notes' : 'Transcript'}</Text></Pressable>)}</View>
    {tab === 'notes' && <>{detail.report ? <><NoteSection title="Action items" items={detail.report.actionItems} empty="No action items were captured." /><View><Text style={ui.sectionTitle}>Overview</Text><Text selectable style={ui.copy}>{detail.report.summary}</Text></View><NoteSection title="Discussion points" items={detail.report.notes} empty="No discussion points were generated." />{detail.report.followUpEmail && <View style={ui.card}><Text style={ui.sectionTitle}>Follow-up draft</Text><Text selectable style={ui.copy}>{detail.report.followUpEmail}</Text></View>}</> : <Empty title="No generated notes" copy="Only sessions explicitly saved have a generated report. Any captured notes remain below." />}<NoteSection title="Your notes & decisions" items={detail.captures.filter(c => c.kind !== 'potential_memory').map(c => `${c.kind.replaceAll('_', ' ')}: ${c.text}`)} empty="No manual notes were captured." /></>}
    {tab === 'transcript' && <><TextInput accessibilityLabel="Search transcript" placeholder="Find in transcript…" placeholderTextColor={palette.tertiary} style={ui.input} value={query} onChangeText={setQuery} />{detail.transcript.filter(s => s.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(segment => <View key={segment.id}><Text style={ui.metadata}>{segment.speaker === 'candidate' ? 'You' : 'Room / other speaker'} · {formatSessionTime(segment.startedAtMs / 1000)}</Text><Text selectable style={[ui.copy, { color: palette.text }]}>{segment.text}</Text></View>)}{!detail.transcript.some(s => s.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <Empty title={query ? 'No matching words' : 'No saved transcript'} copy={query ? 'Try another search.' : 'Transcript text appears after you explicitly save a recorded session.'} />}</>}
    {tab === 'chat' && <>{detail.interactions.map(item => <View key={item.id} style={ui.card}><Text style={ui.metadata}>{item.question}</Text><Text selectable style={ui.copy}>{item.suggestion.expandedAnswer || item.suggestion.answer}</Text></View>)}{!detail.interactions.length && <Empty title="No AI conversation" copy="No AI responses were saved for this meeting. New sessions include completed answers when you choose End & save." />}</>}
  </ScrollView>}</View>;
}
function NoteSection({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <View style={{ gap: 8 }}><Text style={ui.sectionTitle}>{title}</Text>{items.length ? items.map((text, index) => <Text selectable key={index} style={ui.copy}>• {text}</Text>) : <Text style={ui.metadata}>{empty}</Text>}</View>; }
