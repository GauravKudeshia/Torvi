import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop unlocks Keychain once and reuses the session credential in memory', async () => {
  const native = await readFile(new URL('../apps/desktop/src-tauri/src/desktop_api.rs', import.meta.url), 'utf8');
  assert.match(native, /static CONNECTION_CACHE: Mutex<Option<DesktopConnection>>/);
  assert.match(native, /if let Some\(connection\) = CONNECTION_CACHE\s*\.lock\(\)/);
  assert.match(native, /async fn session_request\(\s*connection: &DesktopConnection/);
  assert.doesNotMatch(native, /async fn session_request\([^)]*\)[^{]*\{\s*let connection = load_connection\(\)\?/);
});
