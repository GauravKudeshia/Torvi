import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop exposes a visible quit action and stops native capture before exit', async () => {
  const ui = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  assert.match(ui, /Quit Torvi/);
  assert.match(ui, /invoke\('quit_desktop'\)/);
  assert.match(native, /fn quit_desktop/);
  assert.match(native, /native_audio::stop\(\)/);
  assert.match(native, /app\.exit\(0\)/);
  assert.match(native, /std::process::exit\(0\)/);
  assert.match(native, /RunEvent::ExitRequested/);
  assert.doesNotMatch(ui, /async function quitApp\(\)[\s\S]*?await stopCapture/);
});

test('desktop window keeps native controls, custom drag regions, resizing, and working hide permission', async () => {
  const ui = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const config = await readFile(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8');
  const capabilities = await readFile(new URL('../apps/desktop/src-tauri/capabilities/default.json', import.meta.url), 'utf8');
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const windowState = await readFile(new URL('../apps/desktop/src/window-state.ts', import.meta.url), 'utf8');
  assert.match(config, /"decorations": true/);
  assert.match(config, /"titleBarStyle": "Overlay"/);
  assert.match(config, /"resizable": true/);
  assert.match(ui, /className="[^"]*window-drag-region[^"]*" onMouseDown={startWindowDrag}/);
  assert.match(ui, /getCurrentWindow\(\)\.startDragging\(\)/);
  assert.match(ui, /closest\('button, input, textarea, select, a, label, summary, \[data-no-drag\]'/);
  assert.match(ui, /async function hideWindow/);
  assert.match(ui, /await getCurrentWindow\(\)\.hide\(\)/);
  assert.match(capabilities, /core:window:allow-hide/);
  assert.match(capabilities, /core:window:allow-start-dragging/);
  assert.match(capabilities, /core:window:allow-set-position/);
  assert.match(windowState, /bounds-normal/);
  assert.match(windowState, /`bounds-\$\{next\}`/);
  assert.match(native, /RunEvent::Reopen/);
  assert.match(native, /window\.show\(\)/);
  assert.match(native, /window\.set_focus\(\)/);
});
