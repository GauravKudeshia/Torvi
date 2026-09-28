import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assistantActions } from '../packages/sdk/src/meetings';

test('floating assistant has compact and expanded states with a keyboard-first composer', async () => {
  const overlay = await readFile(new URL('../apps/desktop/src/assistant-overlay.tsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  assert.match(overlay, /type AssistantPanelState = 'collapsed' \| 'expanded'/);
  assert.match(overlay, /assistantActions/);
  assert.deepEqual(assistantActions.map(action => action.label), ['Assist', 'What should I say?', 'Follow-up', 'Recap', 'Explain this', 'Action items']);
  assert.match(overlay, /className="hud-assist"/);
  assert.match(overlay, /event\.key === 'Enter'/);
  assert.match(main, /toggleAssistant:.*askOrOpenAssistant/);
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
