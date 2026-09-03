import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Hosted AI preflight sends a valid minimum Responses request', async () => {
  const route = await readFile(new URL('../app/api/v1/preflight/route.ts', import.meta.url), 'utf8');
  assert.match(route, /max_output_tokens:\s*16/);
  assert.match(route, /preflight_ai_failed/);
  assert.match(route, /insufficient_quota/);
  assert.doesNotMatch(route, /max_output_tokens:\s*[0-9]\s*[,}]/);
});
