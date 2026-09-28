import { suggestionSchema } from '@interview-copilot/contracts';
import type { desktopApi } from './desktop-api';
import type { SessionDetail } from './session-history';

// Explicit development fixture; production always uses desktopApi.
const detail: SessionDetail = {
  session: { id: 'fixture-history', title: 'Architecture and accessibility review for the next cross-platform release', mode: 'meeting', locale: 'en', status: 'saved', startedAt: Date.now(), liveSeconds: 1340, interviewRoundId: 'fixture-round' },
  target: { role: 'Platform review', company: 'Sample workspace' }, documents: [],
  transcript: [{ id: 'one', speaker: 'interviewer', text: 'What do we need to resolve before the release?', startedAtMs: 1000, endedAtMs: 4000 }, { id: 'two', speaker: 'candidate', text: 'Confirm the final scope and assign an owner to accessibility testing.', startedAtMs: 6000, endedAtMs: 12000 }],
  report: { id: 'fixture-report', sessionId: 'fixture-history', summary: 'The team reviewed release scope and the remaining accessibility checks.', createdAt: Date.now(), score: null, strengths: [], improvements: [], notes: ['Release scope needs one final review.', 'Accessibility testing remains open.'], actionItems: ['Assign an owner for accessibility testing.'], followUpEmail: null },
  captures: [{ id: 'note', kind: 'note', text: 'Review the keyboard navigation path before release.', createdAt: Date.now() }],
  interactions: [{ id: 'question', question: 'What should I ask next?', createdAt: Date.now(), suggestion: suggestionSchema.parse({ answer: 'Who will own the accessibility checks?', bullets: [], followUps: [], confidence: 'medium', grounded: false, mode: 'meeting', responseMode: 'concise', caution: null }) }],
};
export const previewHistorySessions = [detail.session];
export const previewHistoryApi: typeof desktopApi = async <T>(method: string, _path: string, body?: unknown): Promise<T> => {
  if (!import.meta.env.DEV) throw new Error('Development only.');
  if (method === 'PATCH') { detail.session.title = (body as { title: string }).title; return { ok: true } as T; }
  return structuredClone(detail) as T;
};
