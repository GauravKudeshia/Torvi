import assert from 'node:assert/strict';
import test from 'node:test';
import { extractStreamingJsonString } from '../lib/openai';

test('extracts a growing direct answer before the structured response completes', () => {
  const partial = '{"questionType":"behavioral","directAnswer":"I led the migration';
  assert.deepEqual(extractStreamingJsonString(partial, 'directAnswer'), {
    value: 'I led the migration', complete: false,
  });
  const complete = `${partial} safely.","supportingPoints":[]}`;
  assert.deepEqual(extractStreamingJsonString(complete, 'directAnswer'), {
    value: 'I led the migration safely.', complete: true,
  });
});

test('does not emit a malformed split unicode escape', () => {
  assert.equal(extractStreamingJsonString('{"directAnswer":"It\\u201', 'directAnswer'), null);
  assert.deepEqual(extractStreamingJsonString('{"directAnswer":"It\\u2019s ready', 'directAnswer'), {
    value: 'It’s ready', complete: false,
  });
});
