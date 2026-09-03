import { invoke } from '@tauri-apps/api/core';

export async function desktopApi<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return invoke<T>('desktop_api_request', { method, path, body: body ?? null });
}
