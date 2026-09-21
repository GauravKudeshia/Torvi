import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suggestionSchema } from '../packages/contracts/src/index';
import { AssistantOverlay, answerText } from '../apps/desktop/src/assistant-overlay';
import { clampToWorkAreas, clampAssistantOpacity, DEFAULT_ASSISTANT_PREFERENCES, DEFAULT_SHORTCUT_PREFERENCES } from '../apps/desktop/src/window-state';
import { ShortcutManager, type ShortcutHandlers } from '../apps/desktop/src/shortcuts';
import { invoke, normalizeBridgeError } from '../apps/desktop/src/native-bridge';
import { requestMicrophone } from '../apps/desktop/src/microphone';

const display = (x: number, y: number, width: number, height: number) => ({ workArea: { position: { x, y }, size: { width, height } } });
test('window positioning preserves negative-coordinate monitors', () => {
  const bounds = { x: -1000, y: 40, width: 460, height: 58 };
  assert.deepEqual(clampToWorkAreas(bounds, [display(0, 25, 1920, 1055), display(-1280, 0, 1280, 800)]), bounds);
});
test('disconnected monitor positions recover inside the remaining work area', () => {
  assert.deepEqual(clampToWorkAreas({ x: 3200, y: 1900, width: 500, height: 500 }, [display(0, 24, 1440, 876)]),
    { x: 940, y: 400, width: 500, height: 500 });
});
test('oversized saved window shrinks to the available physical work area', () => {
  assert.deepEqual(clampToWorkAreas({ x: -200, y: -200, width: 2200, height: 1600 }, [display(0, 50, 1200, 750)]),
    { x: 0, y: 50, width: 1200, height: 750 });
  assert.equal(clampToWorkAreas({ x: 0, y: 0, width: 460, height: 58 }, []), null);
});
test('invalid persisted opacity cannot make the assistant disappear', () => {
  assert.equal(clampAssistantOpacity(NaN), 92);
  assert.equal(clampAssistantOpacity(-80), 15);
  assert.equal(clampAssistantOpacity(240), 100);
});
const suggestion = suggestionSchema.parse({
  answer: 'A natural answer.', directAnswer: 'Short answer.', supportingPoints: ['First point', 'Second point'],
  expandedAnswer: 'A longer natural paragraph.', bullets: [], followUps: [], confidence: 'medium',
  grounded: false, mode: 'general', responseMode: 'concise', caution: null,
});
test('Points, Paragraph and Adaptive format the same contract without new API requests', () => {
  assert.equal(answerText(suggestion, '', 'bullets', 'standard'), 'First point\nSecond point');
  assert.equal(answerText(suggestion, '', 'paragraph', 'standard'), 'A longer natural paragraph.');
  assert.equal(answerText(suggestion, '', 'adaptive', 'compact'), 'Short answer.');
  assert.equal(answerText(suggestion, 'Streaming', 'adaptive', 'standard'), 'Streaming');
  assert.equal(suggestionSchema.safeParse({ answer: 42 }).success, false);
});
function props(patch: Partial<React.ComponentProps<typeof AssistantOverlay>> = {}): React.ComponentProps<typeof AssistantOverlay> {
  const noop = () => {};
  return {
    panelState: 'collapsed', focusRequest: 0, shortcut: 'CommandOrControl+Enter', active: false, online: true,
    mode: 'general', question: '', questionIsLive: false, prompt: '', suggestion: null, streamingAnswer: '',
    loading: false, onCancel: noop, status: 'Ready', captureActionLabel: 'Listen', captureActionHint: 'Start microphone',
    captureActionKind: 'start', captureBusy: false, preferences: DEFAULT_ASSISTANT_PREFERENCES,
    onPanelChange: noop, onPromptChange: noop, onSubmit: noop, onQuickAction: noop, onClear: noop,
    onPreferencesChange: noop, onResetAppearance: noop, onToggleListening: noop, onShorter: noop, onExpand: noop,
    onFollowUp: noop, auxiliaryControls: null, onHide: noop, onClose: noop, onDragStart: noop, ...patch,
  };
}
test('the actual compact component renders no dashboard or answer panels', () => {
  const html = renderToStaticMarkup(React.createElement(AssistantOverlay, props()));
  assert.match(html, /Torvi compact assistant/);
  assert.match(html, /Idle/);
  assert.doesNotMatch(html, /hud-body|hud-footer|Dashboard|Current request|Suggested answer/);
});
test('the actual expanded component renders selected format, answer and recoverable error', () => {
  const html = renderToStaticMarkup(React.createElement(AssistantOverlay, props({
    panelState: 'expanded', suggestion, generationError: 'Retry the connection',
    preferences: { ...DEFAULT_ASSISTANT_PREFERENCES, responseStyle: 'bullets' },
  })));
  assert.match(html, /<li>First point<\/li>/);
  assert.match(html, /aria-pressed="true">Points/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Regenerate answer/);
});
test('unavailable native bridge rejects instead of returning preview success', async () => {
  await assert.rejects(invoke('capture_primary_screen'), /installed Torvi/);
});
test('audio failures render a single actionable audio retry instead of a duplicate AI error', () => {
  const html = renderToStaticMarkup(React.createElement(AssistantOverlay, props({
    panelState: 'expanded', captureError: 'Microphone initialization failed.', status: 'Microphone initialization failed.',
  })));
  assert.equal((html.match(/role="alert"/g) ?? []).length, 1);
  assert.match(html, />Retry audio<\/button>/);
  assert.doesNotMatch(html, />Retry<\/button>/);
});
test('native permission failures keep their actionable message and capture state', () => {
  const error = normalizeBridgeError({ message: 'Enable Screen Recording for Torvi.', state: 'permissionRequired', category: 'permission', stage: 'preflight', code: 42 });
  assert.equal(error.message, 'Enable Screen Recording for Torvi.');
  assert.equal((error as Error & { state: string }).state, 'permissionRequired');
  assert.equal((error as Error & { code: number }).code, 42);
  assert.equal(normalizeBridgeError(error), error);
});
test('rapid shortcut updates and disposal leave no stale registrations', async () => {
  const active = new Set<string>();
  const manager = new ShortcutManager({
    register: async (shortcut) => { await new Promise(resolve => setTimeout(resolve, 1)); assert.equal(active.has(shortcut), false); active.add(shortcut); },
    unregister: async (shortcuts) => { for (const shortcut of shortcuts) active.delete(shortcut); },
  });
  const handlers = Object.fromEntries(Object.keys(DEFAULT_SHORTCUT_PREFERENCES).map(key => [key, () => {}])) as ShortcutHandlers;
  const first = manager.update(DEFAULT_SHORTCUT_PREFERENCES, handlers);
  const next = manager.update({ ...DEFAULT_SHORTCUT_PREFERENCES, toggleAssistant: 'CommandOrControl+Shift+A' }, handlers);
  const dispose = manager.dispose();
  assert.deepEqual(await first, []);
  assert.deepEqual(await next, []);
  await dispose;
  assert.equal(active.size, 0);
});

test('microphone denial propagates and a late grant after timeout releases every track', async () => {
  await assert.rejects(requestMicrophone(async () => { throw new Error('denied'); }, 100), /denied/);
  let complete!: (stream: MediaStream) => void;
  let stopped = 0;
  const pending = requestMicrophone(() => new Promise(resolve => { complete = resolve; }), 5);
  await assert.rejects(pending, /timed out/);
  complete({ getTracks: () => [{ stop: () => stopped++ }] } as unknown as MediaStream);
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(stopped, 1);
});
