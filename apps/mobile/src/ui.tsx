import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { themes } from '@interview-copilot/design-tokens';
export const palette = themes.dark;
export function Action({ children, onPress, secondary = false, disabled = false, label }: { children: string; onPress: () => void; secondary?: boolean; disabled?: boolean; label?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label ?? children} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [ui.button, secondary ? ui.secondary : ui.primary, { opacity: disabled ? .45 : pressed ? .75 : 1 }]}><Text style={secondary ? ui.secondaryText : ui.primaryText}>{children}</Text></Pressable>;
}
export function Empty({ title, copy }: { title: string; copy: string }) { return <View style={ui.empty}><Text style={ui.sectionTitle}>{title}</Text><Text style={ui.copy}>{copy}</Text></View>; }
export function Failure({ text }: { text: string }) { return text ? <View style={ui.error}><Text accessibilityRole="alert" style={ui.errorText}>{text}</Text></View> : null; }
export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 22, gap: 18, paddingBottom: 36 },
  header: { padding: 22, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: palette.accent, fontSize: 11, fontWeight: '600', letterSpacing: 1.8, marginBottom: 10 },
  title: { color: palette.text, fontSize: 32, fontWeight: '600', letterSpacing: -1 },
  sectionTitle: { color: palette.text, fontSize: 19, fontWeight: '600', marginBottom: 8 },
  copy: { color: palette.secondary, fontSize: 14, lineHeight: 23 },
  metadata: { color: palette.tertiary, fontSize: 12, lineHeight: 20 },
  card: { padding: 20, gap: 10, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.surface, color: palette.text, padding: 13, fontSize: 15 },
  button: { minHeight: 46, paddingHorizontal: 17, paddingVertical: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  primary: { backgroundColor: palette.accent },
  secondary: { backgroundColor: palette.elevated, borderWidth: 1, borderColor: palette.border },
  primaryText: { color: palette.onAccent, fontSize: 14, fontWeight: '600' },
  secondaryText: { color: palette.text, fontSize: 14, fontWeight: '500' },
  empty: { paddingVertical: 38, paddingHorizontal: 12, gap: 8 },
  error: { marginHorizontal: 22, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: palette.error, borderRadius: 12 },
  errorText: { color: palette.error, fontSize: 13, lineHeight: 20 },
  dock: { padding: 16, gap: 10, borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: palette.surface, gap: 4 },
  tab: { flex: 1, minHeight: 44, padding: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: palette.elevated },
  tabText: { color: palette.secondary, fontSize: 14 },
  tabTextActive: { color: palette.text, fontWeight: '600' },
});
