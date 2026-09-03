import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { availableMonitors, getCurrentWindow } from '@tauri-apps/api/window';
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

type Bounds = { x: number; y: number; width: number; height: number };

const STORE_PATH = 'window-state-v1.json';
const MIN_VISIBLE_EDGE = 80;
export const MIN_ASSISTANT_OPACITY = 15;
export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
  appearanceMode: 'dark',
  windowOpacity: 92,
  responseStyle: 'adaptive',
  assistantSize: 'standard',
};

export function clampAssistantOpacity(value: number) {
  return Math.min(100, Math.max(MIN_ASSISTANT_OPACITY, Math.round(value)));
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

function finiteBounds(value: unknown): value is Bounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))
    && Number(bounds.width) >= 420 && Number(bounds.height) >= 280;
}

async function isVisible(bounds: Bounds) {
  const monitors = await availableMonitors();
  return monitors.some(({ workArea }) => {
    const left = Math.max(bounds.x, workArea.position.x);
    const top = Math.max(bounds.y, workArea.position.y);
    const right = Math.min(bounds.x + bounds.width, workArea.position.x + workArea.size.width);
    const bottom = Math.min(bounds.y + bounds.height, workArea.position.y + workArea.size.height);
    return right - left >= MIN_VISIBLE_EDGE && bottom - top >= MIN_VISIBLE_EDGE;
  });
}

export class WindowStateManager {
  private readonly window = getCurrentWindow();
  private store: Store | null = null;
  private mode: WindowMode = 'normal';
  private restoring = false;
  private saveTimer: number | null = null;
  private unlisten: Array<() => void> = [];

  async init() {
    this.store = await load(STORE_PATH, { autoSave: 150 });
    const savedMode = await this.store.get<WindowMode>('active-mode');
    this.mode = savedMode === 'focus' ? 'focus' : 'normal';
    const requested = await this.store.get<Bounds>(`bounds-${this.mode}`);
    const fallback = await this.store.get<Bounds>('bounds-normal');
    const bounds = finiteBounds(requested) && await isVisible(requested)
      ? requested
      : finiteBounds(fallback) && await isVisible(fallback) ? fallback : null;
    if (bounds) await this.restore(bounds);
    this.unlisten.push(
      await this.window.onMoved(() => this.scheduleSave()),
      await this.window.onResized(() => this.scheduleSave()),
    );
    return {
      mode: this.mode,
      density: await this.getDensity(),
      preferences: await this.getAssistantPreferences(),
    };
  }

  async switchMode(next: WindowMode) {
    if (next === this.mode) return;
    await this.saveCurrent();
    this.mode = next;
    await this.store?.set('active-mode', next);
    const target = await this.store?.get<Bounds>(`bounds-${next}`);
    if (finiteBounds(target) && await isVisible(target)) {
      await this.restore(target);
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
    if (!this.store || this.restoring) return;
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
