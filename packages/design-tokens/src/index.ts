export const colors = {
  cream: '#f7f7f8',
  navy: '#292b32',
  lime: '#3c83f6',
  limeDeep: '#2e73e7',
  ink: '#08090b',
  muted: '#686b76',
  line: '#e4e4e7',
  surface: '#ffffff',
  surfaceElevated: '#fafafa',
  surfaceStrong: '#edeef2',
  accentSoft: '#edf5ff',
  success: '#2cb463',
  warning: '#d99126',
  danger: '#dc4c4c',
} as const;

export const radii = { small: 8, medium: 14, large: 20, pill: 999 } as const;

// Semantic palettes for native meeting surfaces. Legacy colors stay compatible.
export const themes = {
  dark: {
    background: '#0b0d11', surface: '#14171d', elevated: '#1e222b', overlay: '#20242e',
    text: '#f3f5fa', secondary: '#b0b8c8', tertiary: '#949daf', border: '#2b303b',
    accent: '#a5baff', accentSurface: '#24304c', onAccent: '#101829',
    recording: '#f29a9e', success: '#87d9bc', warning: '#edc785', error: '#ffa6ae',
  },
  light: {
    background: '#f5f6f9', surface: '#ffffff', elevated: '#e9edf5', overlay: '#ffffff',
    text: '#171b25', secondary: '#4e596d', tertiary: '#616b7c', border: '#d8dde7',
    accent: '#345ab5', accentSurface: '#e8eeff', onAccent: '#ffffff',
    recording: '#ae3040', success: '#216749', warning: '#805211', error: '#b42f43',
  },
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const motion = { fast: 120, normal: 180, easing: 'cubic-bezier(.2,.8,.2,1)' } as const;
