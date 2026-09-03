import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('desktop handoff migration is one-time, expiring, and session scoped', async () => {
  const migration = await readFile(new URL('../db/migrations/0004_desktop_handoffs.sql', import.meta.url), 'utf8');
  const exchange = await readFile(new URL('../app/api/v1/desktop/exchange/route.ts', import.meta.url), 'utf8');
  const token = await readFile(new URL('../lib/desktop-auth.ts', import.meta.url), 'utf8');
  assert.match(migration, /code_hash.*NOT NULL/i);
  assert.match(migration, /expires_at.*NOT NULL/i);
  assert.match(migration, /consumed_at/i);
  assert.match(exchange, /isNull\(desktopHandoffs\.consumedAt\)/);
  assert.match(exchange, /gt\(desktopHandoffs\.expiresAt, now\)/);
  assert.match(token, /desktop_scope_denied/);
  assert.match(token, /pathname\.startsWith/);
});

test('connection codes and bearer credentials are never stored in D1 plaintext', async () => {
  const schema = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /codeHash: text\('code_hash'\)/);
  assert.doesNotMatch(schema, /connection_code|desktop_token|bearer_token/i);
});
