import React from 'react';
import { Alert, BackHandler, ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { type MeetingRecord } from '@interview-copilot/sdk';
import { api, extra, mobileConfigured, useMobileAuth } from './src/auth';
import { useMeetingSession } from './src/use-meeting-session';
import { NotesHome } from './src/notes-home';
import { MobileLiveSession } from './src/live-session';
import { MobileMeetingDetail } from './src/meeting-detail';
import { Action, Failure, palette, ui } from './src/ui';

export default function App() {
  const auth = useMobileAuth();
  return <SafeAreaProvider><SafeAreaView style={ui.screen}><StatusBar style="light" />{auth.authenticated ? <MeetingApp onSignOut={auth.signOut} /> : <ScrollView contentContainerStyle={[ui.content, { flexGrow: 1, justifyContent: 'center' }]}><Text style={ui.eyebrow}>TORVI</Text><Text style={ui.title}>{"Be here.\nRemember what matters."}</Text><Text style={ui.copy}>Room recording, help in the moment, and thoughtful notes—all in one conversation.</Text><Failure text={auth.error} /><Action disabled={!auth.ready} onPress={() => void auth.signIn()}>Sign in securely</Action>{!mobileConfigured && <View style={ui.card}><Text style={ui.sectionTitle}>Mobile setup is pending</Text><Text style={ui.copy}>This build still needs its production API and sign-in configuration. Your desktop and web accounts are unchanged.</Text></View>}<Text style={ui.metadata}>Recording starts only with your permission. No phone-call or background audio capture.</Text></ScrollView>}</SafeAreaView></SafeAreaProvider>;
}

function MeetingApp({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const session = useMeetingSession();
  const [screen, setScreen] = React.useState<'notes' | 'live' | 'detail' | 'settings'>('notes');
  const [meetings, setMeetings] = React.useState<MeetingRecord[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [quota, setQuota] = React.useState<{ remainingLiveSeconds: number; remainingMockSessions: number } | null>(null);
  const [context, setContext] = React.useState<{ jobTargetId: string; documentIds: string[]; label: string } | null>(null);
  const request = React.useRef(0);
  const alive = React.useRef(true);
  React.useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'notes') return false;
      setScreen('notes'); return true;
    });
    return () => back.remove();
  }, [screen]);
  const reload = React.useCallback(async () => {
    const intent = ++request.current; setLoading(true); setError('');
    try { const data = await api.sessions(); if (alive.current && request.current === intent) setMeetings(data.sessions); }
    catch { if (alive.current && request.current === intent) setError('Your conversations could not load. Pull to refresh or retry.'); }
    finally { if (alive.current && request.current === intent) setLoading(false); }
  }, []);
  React.useEffect(() => {
    alive.current = true; const initialLoad = setTimeout(() => void reload(), 0);
    void api.entitlement().then(value => { if (alive.current) setQuota(value); }).catch(() => undefined);
    void Promise.all([api.jobTargets(), api.documents()]).then(([targets, documents]) => {
      if (!alive.current) return;
      const target = targets.jobTargets.find(t => t.company && t.company !== 'Personal workspace');
      const resume = documents.documents.find(d => d.kind === 'resume' && d.parseStatus === 'verified');
      if (target && resume) setContext({ jobTargetId: target.id, documentIds: [resume.id, ...documents.documents.filter(d => d.kind !== 'resume' && ['verified', 'ready'].includes(d.parseStatus)).slice(0, 10).map(d => d.id)], label: target.role + (target.company ? ' at ' + target.company : '') });
    }).catch(() => undefined);
    return () => { alive.current = false; clearTimeout(initialLoad); };
  }, [reload]);

  function start(practice = false) {
    if (session.sessionId) { setScreen('live'); return; }
    if (practice && !context) { setError('Add a company, role and verified résumé in your web workspace to use interview practice.'); return; }
    Alert.alert('Before recording', 'Confirm that everyone involved allows recording and AI assistance. Audio is processed live, not stored. You choose Save or Discard at the end.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'I have permission', onPress: () => { setScreen('live'); void session.start(practice ? 'mock' : 'meeting', practice && context ? context : undefined); } },
    ]);
  }
  function end() {
    session.pause();
    Alert.alert('Keep this conversation?', 'Recording is paused. Save its transcript and generate notes, or permanently discard this session.', [
      { text: 'Keep paused', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void finish('discard') },
      { text: 'Save notes', onPress: () => void finish('save') },
    ]);
  }
  async function finish(choice: 'save' | 'discard') {
    const id = await session.finish(choice);
    if (id === null) return;
    void reload();
    if (id) { setSelectedId(id); setScreen('detail'); } else setScreen('notes');
  }
  async function signOut() {
    if (session.sessionId) { setError('End and save or discard your current session before signing out.'); return; }
    try { await onSignOut(); } catch { setError('Could not sign out. Please retry.'); }
  }
  if (screen === 'live') return <MobileLiveSession session={session} onBack={() => setScreen('notes')} onEnd={end} />;
  if (screen === 'detail') return <MobileMeetingDetail key={selectedId} id={selectedId} onBack={() => setScreen('notes')} onChanged={() => void reload()} />;
  if (screen === 'settings') return <ScrollView contentContainerStyle={ui.content}><View style={ui.row}><Action secondary onPress={() => setScreen('notes')}>Back to notes</Action></View><Text style={ui.title}>Your workspace</Text><Failure text={error} /><View style={ui.card}><Text style={ui.sectionTitle}>Usage</Text><Text style={ui.copy}>{quota ? Math.floor(quota.remainingLiveSeconds / 60) + ' live minutes remaining · ' + quota.remainingMockSessions + ' practice sessions' : 'Usage unavailable. Your account service enforces the current limit.'}</Text></View><View style={ui.card}><Text style={ui.sectionTitle}>Interview preparation</Text><Text style={ui.copy}>{context?.label || 'No verified interview context loaded.'}</Text><Action secondary onPress={() => start(true)}>Start interview practice</Action><Action secondary onPress={() => void WebBrowser.openBrowserAsync(extra.apiUrl + '/session/new').catch(() => setError('Could not open your web workspace.'))}>Manage context & documents</Action></View><View style={ui.card}><Text style={ui.sectionTitle}>Privacy & recording</Text><Text style={ui.copy}>Room audio is available only while Torvi is in the foreground. Leaving the app pauses capture. No raw audio is stored. Notes and transcripts are saved only when you choose Save.</Text><Text style={ui.metadata}>Room audio cannot reliably identify individual speakers. Share exports may contain sensitive meeting text; choose recipients carefully.</Text></View>{session.sessionId && <Action onPress={() => setScreen('live')}>Return to active session</Action>}<Action secondary onPress={() => void signOut()}>Sign out</Action><Text style={{ color: palette.tertiary, fontSize: 12 }}>Torvi mobile · development build</Text></ScrollView>;
  return <NotesHome meetings={meetings} loading={loading} error={error} active={Boolean(session.sessionId)} onRefresh={() => void reload()} onOpen={id => { setSelectedId(id); setScreen('detail'); }} onStart={() => start()} onSettings={() => { setError(''); setScreen('settings'); }} onResume={() => setScreen('live')} />;
}
