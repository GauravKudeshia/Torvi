import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the primary capture control exposes every recoverable state instead of silently disabling Start', async () => {
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  for (const label of ['Start assistant', 'Stop listening', 'Grant audio access', 'Restart Torvi', 'Retry audio check', 'Reset permission record (advanced)']) {
    assert.ok(main.includes(label), `missing capture recovery label: ${label}`);
  }
  assert.match(main, /runCapturePrimaryAction/);
  assert.match(main, /captureBusyRef/);
  assert.match(main, /nativeCaptureStartedRef/);
  assert.doesNotMatch(main, /startBlocked/);
  assert.match(main, /activeRef\.current \|\| nativeCaptureStartedRef\.current \|\| systemAudio\.captureActive/);
});

test('the focused assistant keeps Start and recovery inside the compact overlay', async () => {
  const overlay = await readFile(new URL('../apps/desktop/src/assistant-overlay.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../apps/desktop/src/assistant-overlay.css', import.meta.url), 'utf8');
  assert.match(overlay, /captureActionLabel/);
  assert.match(overlay, /captureActionHint/);
  assert.match(overlay, /hud-primary-action/);
  assert.match(overlay, /aria-live="polite"/);
  assert.match(css, /\.hud-primary-action/);
  assert.match(css, /\.hud-status\.attention/);
});

test('sidebar navigation uses a consistent icon system and accessible desktop-sized targets', async () => {
  const workspace = await readFile(new URL('../apps/desktop/src/control-center.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../apps/desktop/src/experience.css', import.meta.url), 'utf8');
  assert.match(workspace, /from 'lucide-react'/);
  assert.match(workspace, /aria-current=/);
  assert.match(workspace, /aria-label="Primary navigation"/);
  assert.match(workspace, /sidebarCollapsed/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.desktop-shell\.sidebar-collapsed/);
  assert.match(css, /color-scheme: dark/);
});
