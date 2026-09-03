import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]))).flat();
}

test('persistence schema has no raw audio or screenshot columns', async () => {
  const schema = await readFile(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(schema, /audio_(blob|bytes|object_key)|screenshot_(blob|bytes|object_key)/i);
});

test('OpenAI requests opt out of response storage', async () => {
  const sources = (await files(new URL('../lib', import.meta.url).pathname)).filter((file) => file.endsWith('.ts'));
  const aiSources = await Promise.all(sources.map((file) => readFile(file, 'utf8')));
  const relevant = aiSources.filter((source) => source.includes('api.openai.com/v1/responses'));
  assert.ok(relevant.length >= 2);
  relevant.forEach((source) => assert.match(source, /store:\s*false/));
});

test('desktop keeps its session credential in macOS Keychain and never embeds the OpenAI key', async () => {
  const desktopRoot = new URL('../apps/desktop', import.meta.url).pathname;
  const sources = (await files(desktopRoot)).filter((file) => /\.(rs|ts|tsx|json|toml)$/.test(file) && !file.includes('/target/') && !file.includes('/dist/'));
  const contents = await Promise.all(sources.map((file) => readFile(file, 'utf8')));
  assert.ok(contents.some((source) => source.includes('security_framework::passwords::set_generic_password')));
  contents.forEach((source) => assert.doesNotMatch(source, /OPENAI_API_KEY\s*=/));
});

test('native system audio is normalized in memory and only emitted as ephemeral PCM', async () => {
  const helper = await readFile(new URL('../apps/desktop/native/macos/ic-screencapturekit.swift', import.meta.url), 'utf8');
  const desktop = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const bridge = await readFile(new URL('../apps/desktop/src/system-audio-bridge.ts', import.meta.url), 'utf8');
  assert.match(helper, /targetRate = 24_000\.0/);
  assert.match(helper, /format: "s16le"/);
  assert.doesNotMatch(helper, /write\(to:|FileManager\.default\.createFile/);
  assert.match(bridge, /createMediaStreamDestination\(\)/);
  assert.match(desktop, /peer\.addTrack\(track, stream\)/);
  assert.doesNotMatch(desktop, /addTransceiver\('audio'.*recvonly/);
  assert.doesNotMatch(desktop, /input_audio_buffer\.append/);
});
