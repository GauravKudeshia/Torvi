import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop keeps the full product workspace available when a session is restored', async () => {
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../apps/desktop/src/control-center.tsx', import.meta.url), 'utf8');
  assert.match(main, /type Surface = 'workspace' \| 'live'/);
  assert.match(main, /setSurface\('workspace'\)/);
  assert.match(main, /activeContext=\{context\}/);
  for (const surface of ['Home', 'Opportunities', 'Your context', 'Practice', 'Sessions', 'Career Tools', 'Settings']) {
    assert.match(workspace, new RegExp(`label: '${surface}'`));
  }
});

test('native setup requires context, mode-aware evidence, system check, and consent', async () => {
  const workspace = await readFile(new URL('../apps/desktop/src/control-center.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /type PrepareStep = 'opportunity' \| 'interview' \| 'evidence' \| 'check' \| 'consent'/);
  assert.match(workspace, /modeRequiresVerifiedResume\(mode\)/);
  assert.match(workspace, /Select a verified resume before opening an interview mode/);
  assert.match(workspace, /Run the system check first/);
  assert.match(workspace, /Confirm permission to capture this conversation and use AI assistance/);
  assert.match(workspace, /desktop_start_session/);
});

test('live workspace exposes progressive answers, transcript controls, one-click screen context, privacy, and explicit retention', async () => {
  const main = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  for (const label of ['5 sec', '20 sec', '60 sec', 'Go deeper']) assert.match(main, new RegExp(label));
  assert.match(main, /capture_primary_screen/);
  assert.match(main, /Use screen on Ask/);
  assert.match(main, /Private Overlay on/);
  assert.match(main, /Live transcript/);
  assert.match(main, /End and save notes/);
  assert.match(main, /desktop_finish/);
  assert.match(main, /desktop_screen_context/);
});
