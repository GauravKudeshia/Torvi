import type { CSSProperties } from 'react';
import { themes } from '@interview-copilot/design-tokens';

const palette = themes.dark;
export const meetingTheme = {
  '--meeting-bg': palette.background,
  '--meeting-surface': palette.surface,
  '--meeting-elevated': palette.elevated,
  '--meeting-text': palette.text,
  '--meeting-secondary': palette.secondary,
  '--meeting-border': palette.border,
  '--meeting-accent': palette.accent,
} as CSSProperties;
