import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';

export const isNativeDesktop = () => isTauri();

export function normalizeBridgeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>;
    const result = new Error(typeof details.message === 'string' ? details.message : 'The desktop service could not complete this action.');
    // Preserve native capture state/category so permission failures remain
    // actionable instead of becoming generic retry errors.
    for (const key of ['state', 'category', 'stage', 'domain', 'code']) {
      if (key in details) Object.assign(result, { [key]: details[key] });
    }
    return result;
  }
  return new Error(typeof error === 'string' ? error : 'The desktop service could not complete this action.');
}

// No browser mocks: a missing bridge is a capability error, never success.
export async function invoke<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isNativeDesktop()) throw new Error('Open the installed Torvi Mac app to use desktop features.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      tauriInvoke<T>(command, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Torvi timed out. Check your connection and retry.')), 65_000);
      }),
    ]);
  } catch (error) {
    throw normalizeBridgeError(error);
  } finally { clearTimeout(timer); }
}
