import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Mac system audio declares permission and waits for ScreenCaptureKit readiness', async () => {
  const plist = await readFile(new URL('../apps/desktop/src-tauri/Info.plist', import.meta.url), 'utf8');
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/macos.rs', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../apps/desktop/native/macos/ic-screencapturekit.swift', import.meta.url), 'utf8');
  assert.match(plist, /NSScreenCaptureUsageDescription/);
  assert.match(native, /CGPreflightScreenCaptureAccess/);
  assert.match(native, /CGRequestScreenCaptureAccess/);
  assert.match(native, /pub fn request_permission/);
  assert.match(native, /ready_receiver\.recv_timeout/);
  assert.match(helper, /ControlMessage\(event: "ready"/);
  assert.match(helper, /didStopWithError/);
});

test('Start never triggers the macOS permission prompt implicitly', async () => {
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/macos.rs', import.meta.url), 'utf8');
  const start = native.slice(native.indexOf('pub fn start('), native.indexOf('pub fn stop()'));
  assert.doesNotMatch(start, /CGRequestScreenCaptureAccess/);
  assert.match(start, /preflight_granted/);
  assert.match(start, /SystemAudioState::PermissionRequired/);
});

test('A granted permission can relaunch, while denial does not force a restart loop', async () => {
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/macos.rs', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../apps/desktop/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const desktop = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const request = native.slice(native.indexOf('pub fn request_permission'), native.indexOf('fn failure('));
  assert.match(request, /RESTART_REQUIRED\.store\(true/);
  assert.match(request, /permission-not-granted-open-settings/);
  assert.match(request, /RESTART_REQUIRED\.store\(false/);
  assert.match(shell, /fn relaunch_desktop/);
  assert.match(shell, /app\.restart\(\)/);
  assert.match(desktop, /invoke\('relaunch_desktop'\)/);
  assert.match(desktop, /Restart Torvi/);
});

test('Mac builds expose an explicit bundle-scoped permission reset', async () => {
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/macos.rs', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../apps/desktop/src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const desktop = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  const repair = native.slice(native.indexOf('pub fn repair_permission'), native.indexOf('fn failure('));
  assert.match(repair, /app\.config\(\)\.identifier/);
  assert.match(repair, /\.args\(\["reset", "ScreenCapture", bundle_identifier\.as_str\(\)\]\)/);
  assert.match(repair, /"scope": "bundle-identifier"/);
  assert.doesNotMatch(repair, /\.arg\("reset"\)/);
  assert.match(shell, /fn repair_system_audio_permission/);
  assert.match(desktop, /Reset permission record \(advanced\)/);
  assert.match(desktop, /invoke<SystemAudioStatus>\('repair_system_audio_permission'\)/);
});

test('Native readiness never auto-resets permission for an ad-hoc build and exposes the required relaunch', async () => {
  const controlCenter = await readFile(new URL('../apps/desktop/src/control-center.tsx', import.meta.url), 'utf8');
  assert.match(controlCenter, /'repair_system_audio_permission'/);
  assert.match(controlCenter, /'request_system_audio_permission'/);
  const grant = controlCenter.slice(controlCenter.indexOf('async function grantSystemAudio'), controlCenter.indexOf('async function resetSystemAudioPermission'));
  assert.doesNotMatch(grant, /repair_system_audio_permission/);
  assert.match(controlCenter, /systemAudioCheck\?\.state === 'restartRequired'/);
  assert.match(controlCenter, /invoke\('relaunch_desktop'\)/);
  assert.match(controlCenter, /Restart app/);
});

test('System audio diagnostics distinguish permission, signing, helper, stream, and audio stages', async () => {
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/macos.rs', import.meta.url), 'utf8');
  const helper = await readFile(new URL('../apps/desktop/native/macos/ic-screencapturekit.swift', import.meta.url), 'utf8');
  const desktop = await readFile(new URL('../apps/desktop/src/main.tsx', import.meta.url), 'utf8');
  assert.match(native, /designated_requirement/);
  assert.match(native, /first-audio-chunk/);
  assert.match(native, /Some\(-3801\)/);
  assert.match(native, /Some\(-3818\)/);
  assert.match(helper, /shareable-content-retrieved/);
  assert.match(helper, /stream-output-configured/);
  assert.match(desktop, /restartRequired/);
  assert.match(desktop, /Grant system audio/);
  assert.match(desktop, /System audio diagnostics/);
});

test('Mac permission-lifecycle signing refuses ad-hoc identity checks', async () => {
  const signer = await readFile(new URL('../apps/desktop/scripts/sign-macos-app.sh', import.meta.url), 'utf8');
  const verifier = await readFile(new URL('../apps/desktop/scripts/verify-macos-permission-identity.sh', import.meta.url), 'utf8');
  assert.match(signer, /Ad-hoc signing is intentionally refused/);
  assert.match(signer, /Contents\/Resources\/ic-screencapturekit/);
  assert.match(verifier, /designated requirement/);
  assert.match(verifier, /cdhash/);
});
