import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('floating assistant has compact and expanded states with a keyboard-first composer', async () => {
  const overlay = await readFile(new URL('../apps/desktop/src/assistant-overlay.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  assert.match(overlay, /type AssistantPanelState = 'collapsed' \| 'expanded'/);
  assert.match(overlay, /What should I say next\?/);
  assert.match(overlay, /Summarize/);
  assert.match(overlay, /Key points/);
  assert.match(overlay, /Action items/);
  assert.match(overlay, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(main, /panelState === 'collapsed' \? \[460, 58\]/);
  assert.match(main, /event\.key === 'Escape'/);
});

test('session history is backed by real session history data and exposes three detail tabs', async () => {
  const history = await readFile(new URL('../apps/desktop/src/session-history.tsx', import.meta.url), 'utf8');
  assert.match(history, /\/api\/v1\/sessions\/\$\{sessionId\}\/history/);
  for (const label of ['Summary', 'Transcript', 'AI Chat']) assert.match(history, new RegExp(label));
  assert.match(history, /Loading session detail/);
  assert.match(history, /Session couldn’t be loaded/);
  assert.match(history, /No matching sessions/);
});

test('desktop settings expose the complete desktop-native configuration surface', async () => {
  const settings = await readFile(new URL('../apps/desktop/src/desktop-settings.tsx', import.meta.url), 'utf8');
  for (const label of ['General', 'Assistant', 'Keyboard Shortcuts', 'Audio & Capture', 'Display', 'Privacy', 'Language', 'Account', 'About']) {
    assert.match(settings, new RegExp(label));
  }
  assert.match(settings, /Not available/);
  assert.match(settings, /Remember window position/);
  assert.match(settings, /Preferred monitor/);
});
