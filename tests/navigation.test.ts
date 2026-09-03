import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const navigationSurfaces = [
  'components/app-shell.tsx',
  'app/dashboard/dashboard-client.tsx',
  'app/practice/page.tsx',
];

test('primary navigation uses browser-native links for reliable hosted transitions', async () => {
  for (const file of navigationSurfaces) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"]next\/link['"]/, `${file} must not use intercepted client navigation`);
    assert.match(source, /<a\s[^>]*href=/, `${file} must expose browser-native links`);
  }
});
