import type { TranscriptSegment } from '@interview-copilot/contracts';

// The API accepts the latest 80 turns; saving still receives the complete buffer.
export function suggestionTranscript(segments: readonly TranscriptSegment[]) {
  return segments.slice(-80);
}

export function hasTranscriptItem(segments: readonly TranscriptSegment[], speaker: TranscriptSegment['speaker'], itemId?: string) {
  return Boolean(itemId && segments.some(segment => segment.speaker === speaker && segment.itemId === itemId));
}

// Older desktop builds stored Unix milliseconds. Preserve relative timestamps
// from newer desktop/mobile clients, while displaying legacy records correctly.
export function transcriptOffsetMs(timestamp: number, sessionStartedAt: number) {
  if (!Number.isFinite(timestamp)) return 0;
  const offset = timestamp >= 1_000_000_000_000 && Number.isFinite(sessionStartedAt)
    ? timestamp - sessionStartedAt : timestamp;
  return Math.max(0, Math.floor(offset));
}
