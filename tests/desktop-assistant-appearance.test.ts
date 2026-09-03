import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('native assistant preferences persist independently from window bounds', async () => {
  const state = await readFile(new URL('../apps/desktop/src/window-state.ts', import.meta.url), 'utf8');
  assert.match(state, /type AppearanceMode = 'dark' \| 'light' \| 'adaptive' \| 'glass'/);
  assert.match(state, /type AssistantSize = 'compact' \| 'standard' \| 'expanded'/);
  assert.match(state, /MIN_ASSISTANT_OPACITY = 15/);
  assert.match(state, /assistant-preferences/);
  assert.match(state, /setAssistantPreferences/);
  assert.match(state, /resetAssistantPreferences/);
});

test('minimal HUD keeps response, appearance, and hide controls functional', async () => {
  const overlay = await readFile(new URL('../apps/desktop/src/assistant-overlay.tsx', import.meta.url), 'utf8');
  for (const label of ['Suggested answer', 'Copy', 'Shorter', 'Expand', 'Follow-up', 'Points', 'Paragraph', 'Adaptive', 'Appearance', 'Reset']) {
    assert.match(overlay, new RegExp(label));
  }
  assert.match(overlay, /onHide/);
  assert.match(overlay, /min=\{MIN_ASSISTANT_OPACITY\}/);
  assert.match(overlay, /Opacity changes the app UI only/);
});

test('surface transparency does not reduce content opacity', async () => {
  const css = await readFile(new URL('../apps/desktop/src/assistant-overlay.css', import.meta.url), 'utf8');
  const experience = await readFile(new URL('../apps/desktop/src/experience.css', import.meta.url), 'utf8');
  const baseCss = await readFile(new URL('../apps/desktop/src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /background: rgba\(var\(--hud-surface-rgb\), var\(--assistant-surface-alpha/);
  assert.doesNotMatch(experience, /\.assistant-surface\s*\{[^}]*background:\s*rgba\(24,24,28/);
  assert.doesNotMatch(css, /\.assistant-hud\s*\{[^}]*opacity:/);
  assert.doesNotMatch(baseCss, /\.surface-live\s*\{[^}]*opacity:/);
});

test('appearance settings and configurable shortcuts are wired to persistent preference models', async () => {
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../apps/desktop/src/desktop-settings.tsx', import.meta.url), 'utf8');
  const shortcuts = await readFile(new URL('../apps/desktop/src/shortcuts.ts', import.meta.url), 'utf8');
  assert.match(main, /changeAssistantPreferences/);
  assert.match(settings, /Answer and appearance/);
  assert.match(settings, /Window opacity/);
  assert.match(settings, /assistant-preview-alpha/);
  assert.match(settings, /onInput=\{\(event\) => onAssistantPreferencesChange/);
  assert.match(shortcuts, /class ShortcutManager/);
  assert.match(shortcuts, /duplicateShortcutActions/);
});
