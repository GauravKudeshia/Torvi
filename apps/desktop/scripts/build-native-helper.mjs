import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve('native/macos/ic-screencapturekit.swift');
const output = resolve('native/macos/ic-screencapturekit');
mkdirSync(dirname(output), { recursive: true });
if (process.platform !== 'darwin') {
  writeFileSync(output, 'This helper is only used in macOS application bundles.\n');
  process.exit(0);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return '';
  return result.stdout.trim();
}

function sdkPath() {
  if (process.env.MACOSX_SDK_PATH) return process.env.MACOSX_SDK_PATH;
  // Some macOS runners pair an older Command Line Tools Swift compiler with a
  // newer platform SDK. Prefer the known-compatible CLT SDK when it exists.
  const compatibleCltSdk = '/Library/Developer/CommandLineTools/SDKs/MacOSX13.3.sdk';
  if (existsSync(compatibleCltSdk)) return compatibleCltSdk;
  const selected = commandOutput('xcrun', ['--sdk', 'macosx', '--show-sdk-path']);
  if (!selected) throw new Error('A compatible macOS SDK could not be located. Install Xcode Command Line Tools.');
  return selected;
}

function targetArchitectures() {
  const requested = process.env.TAURI_ENV_ARCH ?? process.env.CARGO_BUILD_TARGET ?? process.arch;
  if (requested.includes('universal')) return ['arm64', 'x86_64'];
  if (requested.includes('x86_64') || requested === 'x64') return ['x86_64'];
  return ['arm64'];
}

const sdk = sdkPath();
const deploymentTarget = process.env.MACOSX_DEPLOYMENT_TARGET ?? '13.0';
const moduleCache = resolve(tmpdir(), 'interview-copilot-swift-module-cache');
mkdirSync(moduleCache, { recursive: true });
const architectures = targetArchitectures();
const builtOutputs = [];

for (const architecture of architectures) {
  const architectureOutput = architectures.length === 1
    ? output
    : `${output}.${architecture}`;
  const build = spawnSync('xcrun', [
    'swiftc', source,
    '-O', '-whole-module-optimization',
    '-sdk', sdk,
    '-target', `${architecture}-apple-macos${deploymentTarget}`,
    '-module-cache-path', moduleCache,
    '-o', architectureOutput,
    '-framework', 'Foundation',
    '-framework', 'ScreenCaptureKit',
    '-framework', 'CoreMedia',
    '-framework', 'AudioToolbox',
    '-framework', 'CoreAudio',
    '-framework', 'AVFoundation',
  ], { stdio: 'inherit' });
  if (build.error) throw build.error;
  if (build.status !== 0) process.exit(build.status ?? 1);
  builtOutputs.push(architectureOutput);
}

if (builtOutputs.length === 2) {
  const lipo = spawnSync('xcrun', ['lipo', '-create', ...builtOutputs, '-output', output], { stdio: 'inherit' });
  if (lipo.error) throw lipo.error;
  if (lipo.status !== 0) process.exit(lipo.status ?? 1);
  builtOutputs.forEach((temporaryOutput) => unlinkSync(temporaryOutput));
}

chmodSync(output, 0o755);
