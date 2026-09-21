import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { availableMonitors, currentMonitor, getCurrentWindow, primaryMonitor } from '@tauri-apps/api/window';
import { load, type Store } from '@tauri-apps/plugin-store';
import type { ResponseStyle } from '@interview-copilot/contracts';

export type WindowMode = 'normal' | 'focus';
export type Density = 'comfortable' | 'compact' | 'minimal';
export type AppearanceMode = 'dark' | 'light' | 'adaptive' | 'glass';
export type AssistantSize = 'compact' | 'standard' | 'expanded';
export type AssistantPreferences = {
  appearanceMode: AppearanceMode;
  windowOpacity: number;
  responseStyle: ResponseStyle;
  assistantSize: AssistantSize;
};
export type ShortcutAction = 'toggleAssistant' | 'toggleListening' | 'hideAssistant' | 'toggleOverlay' | 'clearThread' | 'captureContext' | 'dismissAssistant';
export type ShortcutPreferences = Record<ShortcutAction, string>;
export type DesktopPreferences = {
  rememberWindowPosition: boolean;
  preferredMonitor: 'current' | 'primary';
  inputLanguage: 'en' | 'es' | 'fr' | 'de' | 'hi';
  outputLanguage: 'same' | 'en' | 'es' | 'fr' | 'de' | 'hi';
};

type Bounds = { x: number; y: number; width: number; height: number };

const STORE_PATH = 'window-state-v1.json';
export const MIN_ASSISTANT_OPACITY = 15;
export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
  appearanceMode: 'dark',
  windowOpacity: 92,
  responseStyle: 'adaptive',
  assistantSize: 'standard',
};
export const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferences = {
  toggleAssistant: 'CommandOrControl+Enter',
  toggleListening: 'CommandOrControl+Shift+I',
  hideAssistant: 'CommandOrControl+Shift+H',
  toggleOverlay: 'CommandOrControl+Shift+S',
  clearThread: 'CommandOrControl+Shift+K',
  captureContext: 'CommandOrControl+Shift+C',
  dismissAssistant: 'CommandOrControl+Shift+Escape',
};
export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  rememberWindowPosition: true,
  preferredMonitor: 'current',
  inputLanguage: 'en',
  outputLanguage: 'same',
};

export function clampAssistantOpacity(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(MIN_ASSISTANT_OPACITY, Math.round(value))) : DEFAULT_ASSISTANT_PREFERENCES.windowOpacity;
}

function validAppearanceMode(value: unknown): value is AppearanceMode {
  return value === 'dark' || value === 'light' || value === 'adaptive' || value === 'glass';
}

function validAssistantSize(value: unknown): value is AssistantSize {
  return value === 'compact' || value === 'standard' || value === 'expanded';
}

function validResponseStyle(value: unknown): value is ResponseStyle {
  return value === 'adaptive' || value === 'bullets' || value === 'paragraph';
}

function validShortcutPreferences(value: unknown): value is Partial<ShortcutPreferences> {
  return Boolean(value && typeof value === 'object');
}

function validDesktopPreferences(value: unknown): value is Partial<DesktopPreferences> {
  return Boolean(value && typeof value === 'object');
}

function finiteBounds(value: unknown): value is Bounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))
    && Number(bounds.width) >= 360 && Number(bounds.height) >= 56;
}

async function clampToVisibleDisplays(bounds: Bounds): Promise<Bounds | null> {
  const monitors = await availableMonitors();
  return clampToWorkAreas(bounds, monitors);
}

export function clampToWorkAreas(bounds: Bounds, monitors: Array<{ workArea: { position: { x: number; y: number }; size: { width: number; height: number } } }>): Bounds | null {
  if (!monitors.length) return null;
  const ranked = monitors.map((monitor) => {
    const { workArea } = monitor;
    const left = Math.max(bounds.x, workArea.position.x);
    const top = Math.max(bounds.y, workArea.position.y);
    const right = Math.min(bounds.x + bounds.width, workArea.position.x + workArea.size.width);
    const bottom = Math.min(bounds.y + bounds.height, workArea.position.y + workArea.size.height);
    const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
    const boundsCenterX = bounds.x + bounds.width / 2;
    const boundsCenterY = bounds.y + bounds.height / 2;
    const monitorCenterX = workArea.position.x + workArea.size.width / 2;
    const monitorCenterY = workArea.position.y + workArea.size.height / 2;
    const distance = Math.hypot(boundsCenterX - monitorCenterX, boundsCenterY - monitorCenterY);
    return { monitor, overlap, distance };
  });
  ranked.sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);
  const { workArea } = ranked[0].monitor;
  const width = Math.min(bounds.width, workArea.size.width);
  const height = Math.min(bounds.height, workArea.size.height);
  const maxX = workArea.position.x + workArea.size.width - width;
  const maxY = workArea.position.y + workArea.size.height - height;
  return {
    x: Math.min(Math.max(bounds.x, workArea.position.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.position.y), maxY),
    width,
    height,
  };
}

export class WindowStateManager {
  private readonly window = getCurrentWindow();
  private store: Store | null = null;
  private mode: WindowMode = 'normal';
  private restoring = false;
  private saveTimer: number | null = null;
  private unlisten: Array<() => void> = [];
  private rememberWindowPosition = true;

  async init() {
    this.store = await load(STORE_PATH, { autoSave: 150 });
    const desktopPreferences = await this.getDesktopPreferences();
    this.rememberWindowPosition = desktopPreferences.rememberWindowPosition;
    this.mode = 'focus';
    const requested = await this.store.get<Bounds>(`bounds-${this.mode}`);
    const fallback = await this.store.get<Bounds>('bounds-normal');
    const bounds = this.rememberWindowPosition && finiteBounds(requested)
      ? await clampToVisibleDisplays(requested)
      : this.rememberWindowPosition && finiteBounds(fallback) ? await clampToVisibleDisplays(fallback) : null;
    if (bounds) await this.restore(bounds);
    else await this.resetPosition(desktopPreferences.preferredMonitor);
    this.unlisten.push(
      await this.window.onMoved(() => this.scheduleSave()),
      await this.window.onResized(() => this.scheduleSave()),
      await this.window.onScaleChanged(() => { void this.ensureVisible(); }),
      await this.window.onFocusChanged(({ payload }) => { if (payload) void this.ensureVisible(); }),
    );
    return {
      mode: this.mode,
      density: await this.getDensity(),
      preferences: await this.getAssistantPreferences(),
      shortcuts: await this.getShortcutPreferences(),
      desktopPreferences,
    };
  }

  async switchMode(next: WindowMode) {
    if (next === this.mode) return;
    await this.saveCurrent();
    this.mode = next;
    await this.store?.set('active-mode', next);
    const target = await this.store?.get<Bounds>(`bounds-${next}`);
    const safeTarget = finiteBounds(target) ? await clampToVisibleDisplays(target) : null;
    if (safeTarget) {
      await this.restore(safeTarget);
      return;
    }
    // First entry into Focus inherits the user's current Normal bounds. It is
    // persisted separately from this point onward.
    await this.saveCurrent();
  }

  async setDensity(density: Density) {
    await this.store?.set('density', density);
  }

  async getDensity(): Promise<Density> {
    const value = await this.store?.get<Density>('density');
    return value === 'compact' || value === 'minimal' ? value : 'comfortable';
  }

  async getAssistantPreferences(): Promise<AssistantPreferences> {
    const value = await this.store?.get<Partial<AssistantPreferences>>('assistant-preferences');
    return {
      appearanceMode: validAppearanceMode(value?.appearanceMode) ? value.appearanceMode : DEFAULT_ASSISTANT_PREFERENCES.appearanceMode,
      windowOpacity: clampAssistantOpacity(Number(value?.windowOpacity ?? DEFAULT_ASSISTANT_PREFERENCES.windowOpacity)),
      responseStyle: validResponseStyle(value?.responseStyle) ? value.responseStyle : DEFAULT_ASSISTANT_PREFERENCES.responseStyle,
      assistantSize: validAssistantSize(value?.assistantSize) ? value.assistantSize : DEFAULT_ASSISTANT_PREFERENCES.assistantSize,
    };
  }

  async setAssistantPreferences(preferences: AssistantPreferences) {
    await this.store?.set('assistant-preferences', {
      ...preferences,
      windowOpacity: clampAssistantOpacity(preferences.windowOpacity),
    } satisfies AssistantPreferences);
  }

  async resetAssistantPreferences() {
    await this.setAssistantPreferences(DEFAULT_ASSISTANT_PREFERENCES);
    return DEFAULT_ASSISTANT_PREFERENCES;
  }

  async getShortcutPreferences(): Promise<ShortcutPreferences> {
    const value = await this.store?.get<Partial<ShortcutPreferences>>('shortcut-preferences');
    if (!validShortcutPreferences(value)) return DEFAULT_SHORTCUT_PREFERENCES;
    return Object.fromEntries(Object.entries(DEFAULT_SHORTCUT_PREFERENCES).map(([action, fallback]) => {
      const shortcut = value[action as ShortcutAction];
      return [action, typeof shortcut === 'string' && shortcut.trim() ? shortcut : fallback];
    })) as ShortcutPreferences;
  }

  async setShortcutPreferences(shortcuts: ShortcutPreferences) {
    await this.store?.set('shortcut-preferences', shortcuts);
  }

  async getDesktopPreferences(): Promise<DesktopPreferences> {
    const value = await this.store?.get<Partial<DesktopPreferences>>('desktop-preferences');
    if (!validDesktopPreferences(value)) return DEFAULT_DESKTOP_PREFERENCES;
    const supportedLanguages = ['en', 'es', 'fr', 'de', 'hi'];
    return {
      rememberWindowPosition: typeof value.rememberWindowPosition === 'boolean' ? value.rememberWindowPosition : true,
      preferredMonitor: value.preferredMonitor === 'primary' ? 'primary' : 'current',
      inputLanguage: supportedLanguages.includes(value.inputLanguage ?? '') ? value.inputLanguage as DesktopPreferences['inputLanguage'] : 'en',
      outputLanguage: value.outputLanguage === 'same' || supportedLanguages.includes(value.outputLanguage ?? '') ? value.outputLanguage as DesktopPreferences['outputLanguage'] : 'same',
    };
  }

  async setDesktopPreferences(preferences: DesktopPreferences) {
    this.rememberWindowPosition = preferences.rememberWindowPosition;
    await this.store?.set('desktop-preferences', preferences);
  }

  async resetPosition(preference: DesktopPreferences['preferredMonitor'] = 'primary') {
    const monitor = preference === 'current' ? await currentMonitor() ?? await primaryMonitor() : await primaryMonitor();
    if (!monitor) return;
    const size = await this.window.outerSize();
    const x = monitor.workArea.position.x + Math.max(0, Math.round((monitor.workArea.size.width - size.width) / 2));
    const y = monitor.workArea.position.y + Math.max(0, Math.round((monitor.workArea.size.height - size.height) / 3));
    await this.window.setPosition(new PhysicalPosition(x, y));
  }

  async ensureVisible() {
    const [position, size] = await Promise.all([this.window.outerPosition(), this.window.outerSize()]);
    const bounds = { x: position.x, y: position.y, width: size.width, height: size.height };
    const safe = await clampToVisibleDisplays(bounds);
    if (safe && Object.keys(bounds).some(key => bounds[key as keyof Bounds] !== safe[key as keyof Bounds])) await this.restore(safe);
  }

  async dispose() {
    if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
    await this.saveCurrent();
    this.unlisten.forEach((dispose) => dispose());
    this.unlisten = [];
  }

  private scheduleSave() {
    if (this.restoring) return;
    if (this.saveTimer != null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.saveCurrent();
    }, 250);
  }

  private async saveCurrent() {
    if (!this.store || this.restoring || !this.rememberWindowPosition) return;
    const [position, size] = await Promise.all([this.window.outerPosition(), this.window.outerSize()]);
    await this.store.set(`bounds-${this.mode}`, {
      x: position.x, y: position.y, width: size.width, height: size.height,
    } satisfies Bounds);
  }

  private async restore(bounds: Bounds) {
    this.restoring = true;
    try {
      await this.window.setSize(new PhysicalSize(bounds.width, bounds.height));
      await this.window.setPosition(new PhysicalPosition(bounds.x, bounds.y));
    } finally {
      window.setTimeout(() => { this.restoring = false; }, 200);
    }
  }
}
