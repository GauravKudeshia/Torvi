import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { sessionSaveSchema, suggestionSchema } from '../packages/contracts/src/index';
import { InterviewCopilotClient } from '../packages/sdk/src/index';

const suggestion = suggestionSchema.parse({ answer: 'Confirm the owner.', bullets: [], followUps: [], confidence: 'high', grounded: false, mode: 'meeting', responseMode: 'concise', caution: null });
const interaction = { id: '49b7e3d0-e574-4f9d-8356-55f414d132ce', question: 'What next?', suggestion, createdAt: 1000 };

test('save contract remains compatible with transcript-only clients', () => {
  assert.deepEqual(sessionSaveSchema.parse({ segments: [] }), { segments: [], interactions: [] });
  assert.equal(sessionSaveSchema.parse({ interactions: [interaction] }).interactions[0].suggestion.answer, suggestion.answer);
});

test('save rejects malformed, excessive, and oversized AI history', () => {
  assert.equal(sessionSaveSchema.safeParse({ interactions: [{ ...interaction, id: '../another-session' }] }).success, false);
  assert.equal(sessionSaveSchema.safeParse({ interactions: Array(201).fill(interaction) }).success, false);
  assert.equal(sessionSaveSchema.safeParse({ interactions: [{ ...interaction, suggestion: { ...suggestion, answer: 'x'.repeat(33_000) } }] }).success, false);
  assert.equal(sessionSaveSchema.safeParse({ interactions: Array(100).fill({ ...interaction, suggestion: { ...suggestion, answer: 'x'.repeat(22_000) } }) }).success, false);
});

test('SDK requires history acknowledgement and preserves retry payload', async () => {
  const original = globalThis.fetch;
  let payload: unknown;
  let acknowledged = false;
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ status: 'saved', ...(acknowledged ? { savedInteractionsCount: 1 } : {}) }));
  };
  try {
    const client = new InterviewCopilotClient('https://torvi.example', async () => null);
    await assert.rejects(client.save('one', [], [interaction]), /not confirmed saved/);
    acknowledged = true;
    await client.save('one', [], [interaction]);
    assert.deepEqual(payload, { segments: [], interactions: [interaction] });
    assert.equal(interaction.suggestion.answer, 'Confirm the owner.');
  } finally { globalThis.fetch = original; }
});

test('retention remains explicit, authorized, session-scoped and retry-safe', async () => {
  const route = await readFile(new URL('../app/api/v1/sessions/[id]/save/route.ts', import.meta.url), 'utf8');
  assert.ok(route.indexOf('ownedSession(id, actor.userId)') < route.indexOf('input.interactions.map'));
  assert.match(route, /id: `\$\{id\}:\$\{interaction.id\}`/);
  assert.match(route, /onConflictDoNothing/);
  assert.match(route, /session.status === 'discarded'/);
  const desktop = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  assert.match(desktop, /interactions: choice === 'save' \? savedInteractionsRef.current : \[\]/);
  const mobile = await readFile(new URL('../apps/mobile/src/use-meeting-session.ts', import.meta.url), 'utf8');
  assert.match(mobile, /api.save\(id, transcript.current, savedInteractions.current\)/);
  assert.match(mobile, /retentionChoice: 'ask-at-end'/);
});
