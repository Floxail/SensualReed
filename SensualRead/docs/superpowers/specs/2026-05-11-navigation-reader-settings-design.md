# Navigation Back Button + Reader Settings Design

**Date**: 2026-05-11  
**Status**: Approved

---

## Problem

1. DeviceTestScreen has no visible back button — the existing `←` unicode char is invisible/ignored by users on real device.
2. SettingsScreen Reader section (font size, font family) shows values but has no interactive controls.

---

## Solution

### 1. DeviceTestScreen — Pill Back Button

Replace the `backButton` / `backIcon` styles with a styled pill:

- Container: `flexDirection: 'row'`, `alignItems: 'center'`, `backgroundColor: rgba(255,255,255,0.25)`, `borderRadius: 20`, `paddingHorizontal: 12`, `paddingVertical: 6`
- Content: `‹` chevron (fontSize 18, color white, fontWeight bold) + `" Accueil"` text (fontSize 14, color white, fontWeight 600)
- Behavior: `onPress={() => navigation.goBack()}` — navigates back to Home
- Position: top-left in header, before burger menu icon

No changes to navigation stack or routes.

### 2. SettingsScreen — Interactive Reader Controls

Replace the two display-only `SettingRow` for Font Size and Font Family with active preset buttons.

**Font Size presets:**

| Label | Value (px) |
|-------|-----------|
| S     | 14        |
| M     | 16 (default) |
| L     | 18        |
| XL    | 22        |

**Font Family presets:**

| Label | Value          |
|-------|----------------|
| Serif | Georgia        |
| Sans  | System (default) |
| Mono  | Courier New    |

Button style: reuse existing `sensitivityBtn` / `sensitivityBtnText` pattern.  
Selected state: `backgroundColor: colors.primary`, text `colors.textOnPrimary`.  
Unselected state: `backgroundColor: colors.surface`, border `colors.border`.

**Store integration:**  
`updateSettings({ fontSize: value })` and `updateSettings({ fontFamily: value })` — already typed in `useAppStore`.

**ReaderView integration:**  
`ReaderView.tsx` already applies `settings.fontSize` + `settings.lineHeight` dynamically (line 222).  
`fontFamily` is hardcoded `'serif'` in the StyleSheet (line 323) — must move to the dynamic style object using `settings.fontFamily`.

---

## Files to Change

| File | Change |
|------|--------|
| `src/screens/DeviceTestScreen.tsx` | Replace back button content + update `backButton`/`backIcon` styles |
| `src/screens/SettingsScreen.tsx` | Replace Font Size + Font Family rows with preset buttons |
| `src/components/reader/ReaderView.tsx` | Read `settings.fontSize` + `settings.fontFamily` from store |

---

## Out of Scope

- Line height controls (not requested)
- Background color presets (not requested)
- In-reader floating toolbar (not requested — Settings only)
- Other screens' navigation (only DeviceTestScreen requested)
