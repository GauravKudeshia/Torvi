import type { AiProviderDescriptor, SavedInteraction, SessionStartRequest, SuggestionRequest, TranscriptSegment } from '@interview-copilot/contracts';
import type { MeetingDetail, MeetingRecord } from './meetings';
export * from './meetings';
export * from './transcript';

export type TokenProvider = () => Promise<string | null>;

async function boundedRequest<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await operation(controller.signal); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('The request timed out. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timer); }
}

export class InterviewCopilotClient {
  constructor(private baseUrl: string, private tokenProvider: TokenProvider) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider();
    const headers = new Headers(init.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return boundedRequest(async signal => {
      const response = await fetch(new URL(path, this.baseUrl), { ...init, headers, signal });
      const payload = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed with ${response.status}`);
      if (!payload) throw new Error('The service returned an incomplete response. Please retry.');
      return payload;
    });
  }

  startSession(input: SessionStartRequest) {
    return this.request<{ id: string; status: string }>('/api/v1/sessions', { method: 'POST', body: JSON.stringify(input) });
  }

  jobTargets() {
    return this.request<{ jobTargets: Array<{ id: string; role: string; company: string | null }> }>('/api/v1/job-targets');
  }

  documents() {
    return this.request<{ documents: Array<{ id: string; kind: string; parseStatus: string; fileName: string }> }>('/api/v1/documents');
  }

  sessions() { return this.request<{ sessions: MeetingRecord[] }>('/api/v1/sessions'); }
  meeting(id: string) { return this.request<MeetingDetail>(`/api/v1/sessions/${encodeURIComponent(id)}/history`); }
  renameMeeting(id: string, title: string) { return this.request(`/api/v1/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }); }
  createMeetingContext(title: string) {
    return this.request<{ id: string }>('/api/v1/job-targets', { method: 'POST', body: JSON.stringify({ role: title, company: 'Personal workspace', competencies: [`Interview round: ${title}`] }) });
  }
  end(sessionId: string, liveSeconds: number) {
    return this.request(`/api/v1/sessions/${sessionId}/end`, { method: 'POST', body: JSON.stringify({ liveSeconds: Number.isFinite(liveSeconds) ? Math.min(28800, Math.max(0, Math.floor(liveSeconds))) : 0 }) });
  }

  reports() {
    return this.request<{ reports: Array<{ id: string; score: number | null; summary: string; createdAt: number; strengths: string[]; improvements: string[] }> }>('/api/v1/reports');
  }

  entitlement() {
    return this.request<{ plan: 'free' | 'pro'; remainingLiveSeconds: number; remainingMockSessions: number }>('/api/v1/entitlements');
  }

  providers() {
    return this.request<{ providers: AiProviderDescriptor[]; defaultProvider: 'openai' }>('/api/v1/providers');
  }

  realtime(sessionId: string, channel: 'interviewer' | 'candidate', clientTurnDetection = false) {
    return this.request<{ provider: 'openai'; model: string; clientSecret: string; endpoint: string; lease: { expiresInSeconds: number } }>(`/api/v1/sessions/${sessionId}/realtime`, {
      method: 'POST', body: JSON.stringify({ channel, clientTurnDetection }),
    });
  }

  async save(sessionId: string, segments: TranscriptSegment[], interactions: SavedInteraction[] = []) {
    const result = await this.request<{ status: string; savedInteractionsCount?: number }>(`/api/v1/sessions/${sessionId}/save`, { method: 'POST', body: JSON.stringify({ segments, interactions }) });
    if (interactions.length && result.savedInteractionsCount !== interactions.length) throw new Error('AI history was not confirmed saved. Keep this session open and retry after the service is updated.');
    return result;
  }

  discard(sessionId: string) {
    return this.request(`/api/v1/sessions/${sessionId}/discard`, { method: 'POST' });
  }

  async suggest(sessionId: string, input: SuggestionRequest): Promise<string> {
    const token = await this.tokenProvider();
    return boundedRequest(async signal => {
    const response = await fetch(new URL(`/api/v1/sessions/${sessionId}/suggestions`, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok) throw new Error('Suggestion failed.');
    return response.text();
    }, 90000);
  }
}
