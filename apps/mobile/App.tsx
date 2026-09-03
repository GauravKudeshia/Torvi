import React from 'react';
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import Purchases from 'react-native-purchases';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import { InterviewCopilotClient } from '@interview-copilot/sdk';
import {
  isLikelyInterviewQuestion,
  isLikelyTranscriptNoise,
  mergeTranscriptFragments,
  transcriptFingerprint,
} from '@interview-copilot/contracts';
import { colors } from '@interview-copilot/design-tokens';

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra ?? {};
const redirectUri = makeRedirectUri({ scheme: 'interviewcopilot', path: 'auth' });
const discovery = extra.auth0Domain ? {
  authorizationEndpoint: `https://${extra.auth0Domain}/authorize`,
  tokenEndpoint: `https://${extra.auth0Domain}/oauth/token`,
} : null;

async function accessToken() {
  const token = await SecureStore.getItemAsync('access_token');
  const expiresAt = Number(await SecureStore.getItemAsync('expires_at') ?? 0);
  if (token && expiresAt > Date.now() + 60_000) return token;
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  if (refreshToken && discovery) {
    const refreshed = await refreshAsync({ clientId: extra.auth0ClientId, refreshToken }, discovery);
    await SecureStore.setItemAsync('access_token', refreshed.accessToken);
    await SecureStore.setItemAsync('expires_at', String(Date.now() + (refreshed.expiresIn ?? 3600) * 1000));
    if (refreshed.refreshToken) await SecureStore.setItemAsync('refresh_token', refreshed.refreshToken);
    return refreshed.accessToken;
  }
  return null;
}

const api = new InterviewCopilotClient(extra.apiUrl, accessToken);

export default function App() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [tab, setTab] = React.useState<'home' | 'practice' | 'reports' | 'profile'>('home');
  const [sessionId, setSessionId] = React.useState('');
  const [listening, setListening] = React.useState(false);
  const [question, setQuestion] = React.useState('Tell me about a challenge you owned end to end.');
  const [suggestion, setSuggestion] = React.useState('Your concise, grounded answer will appear here.');
  const [responseStyle, setResponseStyle] = React.useState<'adaptive' | 'bullets' | 'paragraph'>('adaptive');
  const [busy, setBusy] = React.useState(false);
  const [jobTargetId, setJobTargetId] = React.useState('');
  const [documentIds, setDocumentIds] = React.useState<string[]>([]);
  const [targetLabel, setTargetLabel] = React.useState('No interview target selected');
  const [resumeLabel, setResumeLabel] = React.useState('No verified resume');
  const [reports, setReports] = React.useState<Array<{ id: string; score: number | null; summary: string; createdAt: number }>>([]);
  const peer = React.useRef<RTCPeerConnection | null>(null);
  const roomStream = React.useRef<Awaited<ReturnType<typeof mediaDevices.getUserMedia>> | null>(null);
  const questionFragments = React.useRef<string[]>([]);
  const questionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutomaticQuestion = React.useRef({ key: '', at: 0 });
  const coachRequest = React.useRef(0);
  const [request, response, promptAsync] = useAuthRequest({
    clientId: extra.auth0ClientId || 'not-configured',
    responseType: 'code',
    usePKCE: true,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    extraParams: extra.auth0Audience ? { audience: extra.auth0Audience } : {},
  }, discovery);

  React.useEffect(() => { accessToken().then((token) => setAuthenticated(Boolean(token))); }, []);
  React.useEffect(() => () => {
    if (questionTimer.current) clearTimeout(questionTimer.current);
    peer.current?.close();
    roomStream.current?.getTracks().forEach((track) => track.stop());
  }, []);
  React.useEffect(() => {
    if (!authenticated) return;
    Promise.all([api.jobTargets(), api.documents()]).then(([targets, documents]) => {
      const target = targets.jobTargets.find((item) => item.company) ?? targets.jobTargets[0];
      setJobTargetId(target?.id ?? '');
      setTargetLabel(target ? `${target.role}${target.company ? ` at ${target.company}` : ''}` : 'No interview target selected');
      const resume = documents.documents.find((document) => document.kind === 'resume' && document.parseStatus === 'verified');
      setResumeLabel(resume?.fileName ?? 'No verified resume');
      const references = documents.documents.filter((document) => document.kind !== 'resume' && ['ready', 'verified'].includes(document.parseStatus));
      setDocumentIds(resume ? [resume.id, ...references.slice(0, 10).map((document) => document.id)] : []);
    }).catch(() => undefined);
  }, [authenticated]);
  React.useEffect(() => {
    if (!authenticated || tab !== 'reports') return;
    api.reports().then((payload) => setReports(payload.reports)).catch(() => undefined);
  }, [authenticated, tab]);
  React.useEffect(() => {
    if (response?.type !== 'success' || !discovery || !request?.codeVerifier) return;
    exchangeCodeAsync({
      clientId: extra.auth0ClientId,
      code: response.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier },
    }, discovery).then(async (token) => {
      await SecureStore.setItemAsync('access_token', token.accessToken);
      await SecureStore.setItemAsync('expires_at', String(Date.now() + (token.expiresIn ?? 3600) * 1000));
      if (token.refreshToken) await SecureStore.setItemAsync('refresh_token', token.refreshToken);
      setAuthenticated(true);
      const profile = await fetch(`${extra.apiUrl}/api/v1/profile`, { headers: { authorization: `Bearer ${token.accessToken}` } }).then((item) => item.json());
      const key = Platform.OS === 'ios' ? extra.revenueCatAppleKey : extra.revenueCatGoogleKey;
      if (key && profile.userId) { Purchases.configure({ apiKey: key }); await Purchases.logIn(profile.userId); }
    }).catch(() => Alert.alert('Sign in failed', 'Please try again.'));
  }, [response, request]);

  async function startPractice() {
    if (!jobTargetId || documentIds.length === 0) {
      Alert.alert('Interview context required', 'Add a company, role, and verified resume in your grounding profile before starting.');
      setTab('profile');
      return;
    }
    setBusy(true);
    try {
      const result = await api.startSession({
        mode: 'mock', locale: 'en', retentionChoice: 'ask-at-end', deviceId: Constants.sessionId ?? 'mobile',
        jobTargetId, documentIds,
        consent: { recordingAllowed: true, aiAssistanceAllowed: true, policyVersion: '2026-08-22' },
      });
      setSessionId(result.id);
      setTab('practice');
    } catch (error) { Alert.alert('Could not start', error instanceof Error ? error.message : 'Try again.'); }
    finally { setBusy(false); }
  }

  async function toggleRoomAudio() {
    if (listening) {
      peer.current?.close();
      peer.current = null;
      roomStream.current?.getTracks().forEach((track) => track.stop());
      roomStream.current = null;
      setListening(false);
      return;
    }
    if (!sessionId) return startPractice();
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      const connection = new RTCPeerConnection();
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const events = connection.createDataChannel('oai-events');
      events.onmessage = (event: { data: unknown }) => {
        try {
          const payload = JSON.parse(String(event.data)) as { type?: string; transcript?: string };
          if (payload.type === 'conversation.item.input_audio_transcription.completed' && payload.transcript?.trim()) {
            const transcript = payload.transcript.trim();
            if (isLikelyTranscriptNoise(transcript)) return;
            questionFragments.current.push(transcript);
            if (questionTimer.current) clearTimeout(questionTimer.current);
            questionTimer.current = setTimeout(() => {
              const completeQuestion = mergeTranscriptFragments(questionFragments.current);
              questionFragments.current = [];
              questionTimer.current = null;
              setQuestion(completeQuestion);
              const key = transcriptFingerprint(completeQuestion);
              const previous = lastAutomaticQuestion.current;
              if (isLikelyInterviewQuestion(completeQuestion, 'en') && key && (key !== previous.key || Date.now() - previous.at > 20_000)) {
                lastAutomaticQuestion.current = { key, at: Date.now() };
                askCoach(completeQuestion).catch(() => undefined);
              }
            }, /[?？]\s*$/.test(transcript) ? 650 : 1_000);
          }
        } catch { /* Ignore malformed provider events. */ }
      };
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const lease = await api.realtime(sessionId, 'interviewer');
      const answer = await fetch(lease.endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${lease.clientSecret}`, 'content-type': 'application/sdp' },
        body: offer.sdp,
      });
      const answerSdp = await answer.text();
      if (!answer.ok) throw new Error('The realtime audio connection could not be established.');
      await connection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp }));
      peer.current = connection;
      roomStream.current = stream;
      setListening(true);
    } catch (error) { Alert.alert('Microphone unavailable', error instanceof Error ? error.message : 'Check permissions.'); }
  }

  async function askCoach(nextQuestion = question) {
    if (!sessionId) return;
    const requestId = ++coachRequest.current;
    setBusy(true);
    try {
      const stream = await api.suggest(sessionId, {
        question: nextQuestion,
        mode: 'mock',
        locale: 'en',
        responseMode: 'concise',
        responseStyle,
        action: 'answer',
        transcript: [],
        verifiedFacts: [],
        verifiedMemory: [],
        target: {},
      });
      const match = stream.match(/event: suggestion\.final\ndata: (.+)/);
      if (match && requestId === coachRequest.current) setSuggestion(JSON.parse(match[1]).suggestion.answer);
    } catch (error) { Alert.alert('Coach unavailable', error instanceof Error ? error.message : 'Try again.'); }
    finally { if (requestId === coachRequest.current) setBusy(false); }
  }

  if (!authenticated) return <SafeAreaView style={styles.auth}><StatusBar style="dark" /><View style={styles.logo}><View style={[styles.logoBar, styles.logoBarShort]} /><View style={[styles.logoBar, styles.logoBarTall]} /><View style={styles.logoBar} /></View><Text style={styles.title}>Torvi</Text><Text style={styles.lede}>Prepare anywhere. Use foreground room coaching with clear, visible consent.</Text><Pressable style={styles.primary} disabled={!request || !discovery} onPress={() => promptAsync()}><Text style={styles.primaryText}>Sign in securely</Text></Pressable>{!discovery && <Text style={styles.note}>Add Auth0 values in app.json to enable sign-in.</Text>}</SafeAreaView>;

  return <SafeAreaView style={styles.safe}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.kicker}>TORVI</Text><Text style={styles.heading}>{tab === 'practice' ? 'Room coaching' : 'Your preparation'}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>TV</Text></View></View>
    {tab === 'home' && <><View style={styles.heroCard}><Text style={styles.cardKicker}>NEXT INTERVIEW</Text><Text style={styles.cardTitle}>Ready when the conversation starts.</Text><Text style={styles.cardCopy}>Your verified profile and role context travel with you.</Text><Pressable style={styles.primary} onPress={startPractice}><Text style={styles.primaryText}>{busy ? 'Preparing…' : 'Start mock interview'}</Text></Pressable></View><View style={styles.row}><View style={styles.stat}><Text style={styles.statNumber}>15</Text><Text style={styles.bodyText}>live minutes left</Text></View><View style={styles.stat}><Text style={styles.statNumber}>3</Text><Text style={styles.bodyText}>mock sessions left</Text></View></View><View style={styles.notice}><Text style={styles.noticeTitle}>Mobile works in the foreground</Text><Text style={styles.cardCopy}>It does not capture phone calls or arbitrary third-party app audio.</Text></View></>}
    {tab === 'practice' && <><View style={styles.status}><View style={[styles.dot, listening && styles.dotOn]} /><Text style={styles.bodyText}>{listening ? 'Listening · questions answer automatically' : 'Microphone paused'}</Text></View><Text style={styles.label}>INTERVIEW QUESTION</Text><TextInput placeholderTextColor={colors.muted} multiline style={styles.input} value={question} onChangeText={setQuestion} /><View style={styles.formatRow}>{(['adaptive','bullets','paragraph'] as const).map((item) => <Pressable key={item} style={[styles.formatButton, responseStyle === item && styles.formatButtonActive]} onPress={() => setResponseStyle(item)}><Text style={responseStyle === item ? styles.formatTextActive : styles.formatText}>{item === 'bullets' ? 'Points' : item}</Text></Pressable>)}</View><View style={styles.suggestion}><Text style={styles.suggestionLabel}>✦ SUGGESTED ANSWER</Text><Text style={styles.answer}>{suggestion}</Text></View><View style={styles.actionRow}><Pressable style={styles.secondary} onPress={toggleRoomAudio}><Text style={styles.secondaryText}>{listening ? 'Pause mic' : 'Start mic'}</Text></Pressable><Pressable style={styles.primarySmall} onPress={() => askCoach()}><Text style={styles.primaryText}>{busy ? 'Thinking…' : 'Ask AI'}</Text></Pressable></View></>}
    {tab === 'reports' && <View style={styles.reportStack}>{reports.length ? reports.map((report) => <View key={report.id} style={styles.reportCard}><View style={styles.reportScore}><Text style={styles.reportScoreText}>{report.score ?? '—'}</Text></View><View style={styles.reportCopy}><Text style={styles.reportDate}>{new Date(report.createdAt).toLocaleDateString()}</Text><Text style={styles.reportSummary}>{report.summary}</Text></View></View>) : <View style={styles.empty}><Text style={styles.contextTitle}>No saved reports yet</Text><Text style={styles.reportSummary}>Finish a session and choose Save to generate coaching notes and follow-up actions.</Text></View>}</View>}
    {tab === 'profile' && <View><View style={styles.contextCard}><Text style={styles.cardKicker}>INTERVIEW TARGET</Text><Text style={styles.contextTitle}>{targetLabel}</Text></View><View style={styles.contextCard}><Text style={styles.cardKicker}>VERIFIED RESUME</Text><Text style={styles.contextTitle}>{resumeLabel}</Text></View><View style={styles.notice}><Text style={styles.noticeTitle}>Private knowledge travels with you</Text><Text style={styles.cardCopy}>{Math.max(0, documentIds.length - 1)} supporting documents are available for grounded answers.</Text></View><Pressable style={styles.primary} onPress={() => WebBrowser.openBrowserAsync(`${extra.apiUrl}/session/new`)}><Text style={styles.primaryText}>Manage profile and documents</Text></Pressable></View>}
  </ScrollView><View style={styles.tabs}>{(['home','practice','reports','profile'] as const).map((item) => <Pressable key={item} onPress={() => setTab(item)}><Text style={tab === item ? styles.tabActive : styles.tab}>{item}</Text></Pressable>)}</View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  auth: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: colors.cream },
  content: { padding: 22, paddingBottom: 110 },
  logo: { width: 46, height: 46, borderWidth: 1, borderColor: '#24262c', borderRadius: 12, backgroundColor: '#24262c', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, padding: 12 },
  logoBar: { width: 3, height: 11, borderRadius: 3, backgroundColor: '#ffffff' },
  logoBarShort: { height: 7 },
  logoBarTall: { height: 16 },
  title: { marginTop: 24, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, color: colors.ink },
  lede: { marginTop: 12, marginBottom: 30, fontSize: 16, lineHeight: 24, color: colors.muted },
  primary: { minHeight: 48, borderWidth: 1, borderColor: '#2f76e6', borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  primarySmall: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#2f76e6', alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.lime },
  primaryText: { color: '#ffffff', fontWeight: '700' },
  secondaryText: { color: colors.ink, fontWeight: '700' },
  bodyText: { color: colors.muted },
  note: { marginTop: 14, fontSize: 11, color: colors.muted },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3, color: colors.limeDeep },
  heading: { marginTop: 6, fontSize: 28, fontWeight: '800', letterSpacing: -1, color: colors.ink },
  avatar: { width: 36, height: 36, borderWidth: 1, borderColor: '#24262c', borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#24262c' },
  avatarText: { color: '#ffffff', fontWeight: '700' },
  heroCard: { padding: 22, borderWidth: 1, borderColor: '#cfe0f7', borderRadius: 18, backgroundColor: colors.accentSoft },
  cardKicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: colors.limeDeep },
  cardTitle: { marginTop: 35, fontSize: 25, fontWeight: '800', letterSpacing: -.8, color: colors.ink },
  cardCopy: { marginTop: 9, marginBottom: 20, fontSize: 13, lineHeight: 20, color: colors.muted },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, padding: 17, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surface },
  statNumber: { fontSize: 28, fontWeight: '800', color: colors.ink },
  notice: { marginTop: 10, marginBottom: 12, padding: 17, borderWidth: 1, borderColor: '#cfe0f7', borderRadius: 14, backgroundColor: colors.accentSoft },
  noticeTitle: { fontWeight: '800', color: colors.ink },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.surface },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted },
  dotOn: { backgroundColor: colors.success },
  label: { marginTop: 24, marginBottom: 8, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.muted },
  input: { minHeight: 90, padding: 15, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.surfaceElevated, fontSize: 15, fontWeight: '600', color: colors.ink, textAlignVertical: 'top' },
  formatRow: { flexDirection: 'row', gap: 4, marginTop: 12, padding: 4, borderRadius: 10, backgroundColor: colors.surfaceStrong },
  formatButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  formatButtonActive: { backgroundColor: colors.surface },
  formatText: { color: colors.muted, fontSize: 10, textTransform: 'capitalize' },
  formatTextActive: { color: colors.ink, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  suggestion: { minHeight: 220, marginTop: 12, padding: 20, borderWidth: 1, borderColor: '#303239', borderRadius: 16, backgroundColor: '#1b1c20' },
  suggestionLabel: { marginBottom: 10, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: '#a9caff' },
  answer: { fontSize: 17, lineHeight: 27, color: '#f0f1f4' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.surface },
  empty: { minHeight: 400, justifyContent: 'center', alignItems: 'center', padding: 30, borderWidth: 1, borderColor: colors.line, borderRadius: 20, backgroundColor: colors.surface },
  contextCard: { marginBottom: 10, padding: 20, borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: colors.surface },
  contextTitle: { marginTop: 8, fontSize: 18, fontWeight: '800', color: colors.ink },
  reportStack: { gap: 10 },
  reportCard: { flexDirection: 'row', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 17, backgroundColor: colors.surface },
  reportScore: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accentSoft },
  reportScoreText: { color: colors.limeDeep, fontWeight: '800' },
  reportCopy: { flex: 1 },
  reportDate: { fontSize: 9, fontWeight: '800', color: colors.muted },
  reportSummary: { marginTop: 5, fontSize: 13, lineHeight: 19, color: colors.ink },
  tabs: { position: 'absolute', left: 16, right: 16, bottom: 15, height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderWidth: 1, borderColor: colors.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.96)' },
  tab: { fontSize: 10, textTransform: 'capitalize', color: colors.muted },
  tabActive: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize', color: colors.limeDeep },
});
