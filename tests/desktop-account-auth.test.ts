import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDesktopAccountPathAllowed } from '../lib/desktop-auth-policy';

test('account-scoped desktop credentials allow the native product surfaces', () => {
  assert.equal(isDesktopAccountPathAllowed('/api/v1/profile'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/documents/upload-url'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/memory/claims/claim-1'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/sessions/session-1/realtime'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/job-applications'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/tools/generate'), true);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/providers'), true);
});

test('account-scoped desktop credentials reject sensitive and prefix-confusion paths', () => {
  assert.equal(isDesktopAccountPathAllowed('/api/v1/billing/checkout'), false);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/account/deletion'), false);
  assert.equal(isDesktopAccountPathAllowed('/api/v1/profile-attack'), false);
  assert.equal(isDesktopAccountPathAllowed('/api/internal/deletions'), false);
});

test('desktop authorization migration stores only one-way code hashes', () => {
  const migration = readFileSync(new URL('../db/migrations/0006_desktop_account_authorization.sql', import.meta.url), 'utf8');
  assert.match(migration, /device_code_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /user_code_hash TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /\bdevice_code\b TEXT/);
  assert.doesNotMatch(migration, /\buser_code\b TEXT/);
  assert.doesNotMatch(migration, /\btoken\b TEXT/);
});
