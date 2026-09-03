import assert from 'node:assert/strict';
import test from 'node:test';
import { selectRelevantSources } from '@/lib/retrieval';

test('retrieves the supporting document that best matches the live question', () => {
  const sources = selectRelevantSources('How does the transformer attention mechanism work?', [
    { id: 'resume', fileName: 'resume.txt', kind: 'resume', extractedText: 'Led product launches and improved activation.' },
    { id: 'paper', fileName: 'attention-paper.txt', kind: 'other', extractedText: 'Transformer attention maps queries to keys and values using scaled dot products.' },
  ]);
  assert.equal(sources[0]?.documentId, 'paper');
  assert.match(sources[0]?.content ?? '', /queries to keys and values/i);
});

test('limits retrieved context and duplicate chunks per document', () => {
  const documents = Array.from({ length: 9 }, (_, index) => ({
    id: `doc-${index}`,
    fileName: `source-${index}.txt`,
    kind: 'other' as const,
    extractedText: `distributed systems consistency partition tolerance ${'details '.repeat(400)}`,
  }));
  const sources = selectRelevantSources('distributed consistency', documents);
  assert.ok(sources.length <= 6);
  const counts = new Map<string, number>();
  sources.forEach((source) => counts.set(source.documentId, (counts.get(source.documentId) ?? 0) + 1));
  assert.ok([...counts.values()].every((count) => count <= 2));
});
