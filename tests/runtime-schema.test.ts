import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../db/runtime-schema.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../db/migrations/0005_verified_professional_memory.sql', import.meta.url), 'utf8');

test('Sites initializes additive D1 tables with prepared statements', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS professional_experiences/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS desktop_authorizations/);
  assert.match(source, /env\.DB\.batch\(statements\.map\(\(statement\) => env\.DB\.prepare\(statement\)\)\)/);
  assert.doesNotMatch(source, /env\.DB\.exec\(/);
});

test('runtime upgrades older report tables before dashboard reads', () => {
  assert.match(source, /ensureColumn\('reports', 'notes_json'/);
  assert.match(source, /ensureColumn\('reports', 'action_items_json'/);
  assert.match(source, /ensureColumn\('reports', 'follow_up_email'/);
});

test('runtime D1 initialization remains free of raw audio and screenshot persistence', () => {
  assert.doesNotMatch(source, /CREATE TABLE[^`]*(raw_audio|screenshots?)/i);
  assert.doesNotMatch(source, /\b(audio_blob|screenshot_blob)\b/i);
});

test('legacy string resume facts use json_each metadata instead of reparsing decoded text', () => {
  assert.match(source, /CASE WHEN j\.type = 'object'/);
  assert.match(migration, /CASE WHEN j\.type = 'object'/);
  assert.doesNotMatch(source, /json_type\(j\.value\)/);
  assert.doesNotMatch(migration, /json_type\(j\.value\)/);
});
