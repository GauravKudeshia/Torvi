import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ownedRoutes = [
  'app/api/v1/memory/route.ts',
  'app/api/v1/memory/claims/[id]/route.ts',
  'app/api/v1/memory/coverage/route.ts',
  'app/api/v1/interview-processes/route.ts',
  'app/api/v1/interview-processes/concerns/[id]/route.ts',
  'app/api/v1/interview-processes/[id]/brief/route.ts',
  'app/api/v1/sessions/[id]/captures/route.ts',
];

test('new memory, process, and meeting routes require an authenticated actor', async () => {
  for (const path of ownedRoutes) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /requireActor\(request\)/, `${path} must authenticate every request`);
    assert.match(source, /actor\.userId/, `${path} must scope work to the authenticated owner`);
  }
});

test('professional-memory migration stores provenance and never creates an audio blob table', async () => {
  const migration = await readFile(new URL('../db/migrations/0005_verified_professional_memory.sql', import.meta.url), 'utf8');
  assert.match(migration, /source_type/);
  assert.match(migration, /source_excerpt/);
  assert.match(migration, /verification_status/);
  assert.doesNotMatch(migration, /CREATE TABLE [`"]?(raw_)?audio/i);
});
