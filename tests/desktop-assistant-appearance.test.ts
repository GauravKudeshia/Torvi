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
  assert.match(overlay, /content stays readable/);
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

test('opacity shortcuts and Settings Appearance are wired to the same preference model', async () => {
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../apps/desktop/src/control-center.tsx', import.meta.url), 'utf8');
  assert.match(main, /CommandOrControl\+Shift\+BracketLeft/);
  assert.match(main, /CommandOrControl\+Shift\+BracketRight/);
  assert.match(main, /changeAssistantPreferences/);
  assert.match(workspace, />Appearance<\/button>/);
  assert.match(workspace, /Opacity changes the app UI only/);
  assert.match(workspace, /Live assistant appearance preview/);
  assert.match(workspace, /assistant-preview-alpha/);
  assert.match(workspace, /onInput=\{\(event\) => onAssistantPreferencesChange/);
});
