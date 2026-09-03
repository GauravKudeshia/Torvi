import type { AiProviderDescriptor, SessionStartRequest, SuggestionRequest, TranscriptSegment } from '@interview-copilot/contracts';

export type TokenProvider = () => Promise<string | null>;

export class InterviewCopilotClient {
  constructor(private baseUrl: string, private tokenProvider: TokenProvider) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.tokenProvider();
    const headers = new Headers(init.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(new URL(path, this.baseUrl), { ...init, headers });
    const payload = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `Request failed with ${response.status}`);
    return payload;
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

  save(sessionId: string, segments: TranscriptSegment[]) {
    return this.request(`/api/v1/sessions/${sessionId}/save`, { method: 'POST', body: JSON.stringify({ segments }) });
  }

  discard(sessionId: string) {
    return this.request(`/api/v1/sessions/${sessionId}/discard`, { method: 'POST' });
  }

  async suggest(sessionId: string, input: SuggestionRequest): Promise<string> {
    const token = await this.tokenProvider();
    const response = await fetch(new URL(`/api/v1/sessions/${sessionId}/suggestions`, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error('Suggestion failed.');
    return response.text();
  }
}
