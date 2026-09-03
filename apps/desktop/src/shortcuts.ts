import { register, unregister, type ShortcutEvent } from '@tauri-apps/plugin-global-shortcut';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { ShortcutAction, ShortcutPreferences } from './window-state';

export type ShortcutHandlers = Record<ShortcutAction, () => void>;
export type ShortcutConflict = { action: ShortcutAction; shortcut: string; message: string };

const keyByCode: Record<string, string> = {
  Enter: 'Enter',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Backslash: 'Backslash',
  Minus: 'Minus',
  Equal: 'Equal',
};

export function shortcutFromKeyboardEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  const code = event.code;
  const key = code.startsWith('Key') ? code.slice(3)
    : code.startsWith('Digit') ? code.slice(5)
      : /^F([1-9]|1[0-2])$/.test(code) ? code
        : keyByCode[code];
  if (!key || !modifiers.length) return null;
  return [...modifiers, key].join('+');
}

export function formatShortcut(shortcut: string) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const symbols: Record<string, string> = mac
    ? { CommandOrControl: '⌘', CmdOrControl: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
    : { CommandOrControl: 'Ctrl', CmdOrControl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Enter: 'Enter', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return shortcut.split('+').map((part) => symbols[part] ?? part).join(mac ? ' ' : ' + ');
}

export function duplicateShortcutActions(shortcuts: ShortcutPreferences) {
  const seen = new Map<string, ShortcutAction>();
  const duplicates = new Set<ShortcutAction>();
  for (const [action, shortcut] of Object.entries(shortcuts) as Array<[ShortcutAction, string]>) {
    const existing = seen.get(shortcut);
    if (existing) { duplicates.add(existing); duplicates.add(action); }
    else seen.set(shortcut, action);
  }
  return duplicates;
}

export class ShortcutManager {
  private registered: string[] = [];

  async update(shortcuts: ShortcutPreferences, handlers: ShortcutHandlers) {
    await this.dispose();
    const conflicts: ShortcutConflict[] = [];
    for (const [action, shortcut] of Object.entries(shortcuts) as Array<[ShortcutAction, string]>) {
      try {
        await register(shortcut, (event: ShortcutEvent) => {
          if (event.state === 'Pressed') handlers[action]();
        });
        this.registered.push(shortcut);
      } catch {
        conflicts.push({
          action,
          shortcut,
          message: `${formatShortcut(shortcut)} is already being used or could not be registered.`,
        });
      }
    }
    return conflicts;
  }

  async dispose() {
    const current = [...new Set(this.registered)];
    this.registered = [];
    if (current.length) await unregister(current).catch(() => undefined);
  }
}
