import type { TranscriptSegment } from '@interview-copilot/contracts';
import { transcriptFingerprint } from '@interview-copilot/contracts';

export type DetectedConcern = {
  category: 'knowledge_gap' | 'weak_metric' | 'ownership_clarity' | 'repeated_probe' | 'evidence_gap';
  summary: string;
  evidence: string;
};

export function detectRoundConcerns(segments: TranscriptSegment[]): DetectedConcern[] {
  const concerns: DetectedConcern[] = [];
  const candidateTurns = segments.filter((segment) => segment.speaker === 'candidate');
  for (const segment of candidateTurns) {
    if (/\b(i (?:do not|don't|didn't) know|not (?:sure|familiar)|haven't (?:used|worked)|limited experience)\b/i.test(segment.text)) {
      concerns.push({ category: 'knowledge_gap', summary: 'A knowledge or experience gap was stated explicitly.', evidence: segment.text.slice(0, 500) });
    }
    if (/\b(we|the team)\b/i.test(segment.text) && !/\b(i (?:led|owned|designed|built|implemented|decided|proposed|handled))\b/i.test(segment.text)) {
      concerns.push({ category: 'ownership_clarity', summary: 'Personal ownership may need a clearer explanation.', evidence: segment.text.slice(0, 500) });
    }
    if (/\b(significant|substantial|many|a lot|better|improved)\b/i.test(segment.text) && !/\b\d+(?:\.\d+)?%?\b/.test(segment.text)) {
      concerns.push({ category: 'weak_metric', summary: 'An outcome was described without a concrete verified measure.', evidence: segment.text.slice(0, 500) });
    }
  }
  const interviewerCounts = new Map<string, { count: number; text: string }>();
  for (const segment of segments.filter((item) => item.speaker === 'interviewer')) {
    const fingerprint = transcriptFingerprint(segment.text).split(' ').filter((token) => token.length > 4).slice(0, 6).join(' ');
    if (!fingerprint) continue;
    const current = interviewerCounts.get(fingerprint) ?? { count: 0, text: segment.text };
    interviewerCounts.set(fingerprint, { count: current.count + 1, text: current.text });
  }
  for (const value of interviewerCounts.values()) {
    if (value.count > 1) concerns.push({ category: 'repeated_probe', summary: 'The interviewer revisited the same topic.', evidence: value.text.slice(0, 500) });
  }
  const seen = new Set<string>();
  return concerns.filter((concern) => {
    const key = `${concern.category}:${concern.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}
