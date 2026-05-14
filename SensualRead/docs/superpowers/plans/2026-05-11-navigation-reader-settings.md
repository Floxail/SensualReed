# Navigation Back Button + Reader Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible "‹ Accueil" pill button to DeviceTestScreen and make font size + font family settings interactive in SettingsScreen.

**Architecture:** Three isolated file edits — DeviceTestScreen gets a styled back button, SettingsScreen gets preset buttons reusing existing `sensitivityBtn` styles, ReaderView moves fontFamily from hardcoded StyleSheet to dynamic settings-driven style.

**Tech Stack:** React Native, TypeScript, Zustand (`useAppStore`)

---

## Files Changed

| File | Change |
|------|--------|
| `src/screens/DeviceTestScreen.tsx` | Replace `backIcon` text with pill button (chevron + "Accueil") |
| `src/screens/SettingsScreen.tsx` | Replace Font Size + Font Family display rows with preset buttons |
| `src/components/reader/ReaderView.tsx` | Move `fontFamily` from StyleSheet to dynamic `settings.fontFamily` |

---

### Task 1: DeviceTestScreen — Pill Back Button

**Files:**
- Modify: `src/screens/DeviceTestScreen.tsx:233-235` (button content)
- Modify: `src/screens/DeviceTestScreen.tsx:594-607` (styles)

- [ ] **Step 1: Replace back button JSX**

In `src/screens/DeviceTestScreen.tsx`, find this block (around line 233):

```tsx
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
  <Text style={styles.backIcon}>←</Text>
</TouchableOpacity>
```

Replace with:

```tsx
<TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
  <Text style={styles.backChevron}>‹</Text>
  <Text style={styles.backLabel}>Accueil</Text>
</TouchableOpacity>
```

- [ ] **Step 2: Update styles**

In the same file's `StyleSheet.create({...})`, find and replace the `backButton` and `backIcon` entries:

```typescript
// REMOVE these:
backButton: {
  padding: 8,
  marginRight: 4,
},
backIcon: {
  fontSize: 24,
  color: '#fff',
  fontWeight: 'bold',
},
```

```typescript
// ADD these:
backButton: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.25)',
  borderRadius: 20,
  paddingHorizontal: 12,
  paddingVertical: 6,
  marginRight: 8,
},
backChevron: {
  fontSize: 20,
  color: '#fff',
  fontWeight: 'bold',
  lineHeight: 24,
  marginRight: 2,
},
backLabel: {
  fontSize: 14,
  color: '#fff',
  fontWeight: '600',
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit
```

Expected: no errors related to `backIcon` (the old style key is removed).

- [ ] **Step 4: Commit**

```bash
git add src/screens/DeviceTestScreen.tsx
git commit -m "feat: replace invisible back arrow with pill button on DeviceTestScreen"
```

---

### Task 2: SettingsScreen — Font Size Preset Buttons

**Files:**
- Modify: `src/screens/SettingsScreen.tsx:174-197` (Reader section)

- [ ] **Step 1: Replace Font Size SettingRow with presets**

In `src/screens/SettingsScreen.tsx`, find the Reader section (around line 174). Replace:

```tsx
<View style={[styles.section, { backgroundColor: colors.card }]}>
  <SettingRow
    label="Font Size"
    value={`${settings.fontSize}px`}
    colors={colors}
  />

  <SettingRow
    label="Line Height"
    value={`${settings.lineHeight}x`}
    colors={colors}
  />

  <SettingRow
    label="Font Family"
    value={settings.fontFamily}
    colors={colors}
  />
</View>
```

With:

```tsx
<View style={[styles.section, { backgroundColor: colors.card }]}>
  <SettingRow
    label="Taille de police"
    value={`${settings.fontSize}px`}
    colors={colors}
  />
  <View style={styles.sensitivityRow}>
    {[14, 16, 18, 22].map((size) => (
      <TouchableOpacity
        key={size}
        style={[
          styles.sensitivityBtn,
          {
            backgroundColor: settings.fontSize === size ? colors.primary : colors.surface,
            borderColor: settings.fontSize === size ? colors.primary : colors.border,
          },
        ]}
        onPress={() => updateSettings({ fontSize: size })}
      >
        <Text
          style={[
            styles.sensitivityBtnText,
            { color: settings.fontSize === size ? colors.textOnPrimary : colors.text },
          ]}
        >
          {size === 14 ? 'S' : size === 16 ? 'M' : size === 18 ? 'L' : 'XL'}
        </Text>
      </TouchableOpacity>
    ))}
  </View>

  <SettingRow
    label="Interlignage"
    value={`${settings.lineHeight}x`}
    colors={colors}
  />

  <SettingRow
    label="Police"
    value={settings.fontFamily}
    colors={colors}
  />
  <View style={styles.sensitivityRow}>
    {[
      { label: 'Serif', value: 'serif' },
      { label: 'Sans', value: 'sans-serif' },
      { label: 'Mono', value: 'monospace' },
    ].map(({ label, value }) => (
      <TouchableOpacity
        key={value}
        style={[
          styles.sensitivityBtn,
          {
            backgroundColor: settings.fontFamily === value ? colors.primary : colors.surface,
            borderColor: settings.fontFamily === value ? colors.primary : colors.border,
          },
        ]}
        onPress={() => updateSettings({ fontFamily: value })}
      >
        <Text
          style={[
            styles.sensitivityBtnText,
            { color: settings.fontFamily === value ? colors.textOnPrimary : colors.text },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
</View>
```

Note: `sensitivityRow`, `sensitivityBtn`, `sensitivityBtnText` styles already exist in this file — no new styles needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat: add interactive font size and font family presets in Settings"
```

---

### Task 3: ReaderView — Apply fontFamily from Settings

**Files:**
- Modify: `src/components/reader/ReaderView.tsx:220-224` (dynamic style)
- Modify: `src/components/reader/ReaderView.tsx:322-324` (StyleSheet)

`settings` is already imported via `useAppStore` at line 55 — no new imports needed.

- [ ] **Step 1: Add fontFamily to dynamic text style**

Find the `<Text>` with dynamic style (around line 217):

```tsx
<Text
  style={[
    styles.text,
    {
      color: colors.readerText,
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * settings.lineHeight,
    },
  ]}
>
```

Replace with:

```tsx
<Text
  style={[
    styles.text,
    {
      color: colors.readerText,
      fontSize: settings.fontSize,
      lineHeight: settings.fontSize * settings.lineHeight,
      fontFamily: settings.fontFamily,
    },
  ]}
>
```

- [ ] **Step 2: Remove hardcoded fontFamily from StyleSheet**

Find in `StyleSheet.create`:

```typescript
text: {
  fontFamily: 'serif',
},
```

Replace with:

```typescript
text: {},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/reader/ReaderView.tsx
git commit -m "fix: apply fontFamily from settings in ReaderView (was hardcoded serif)"
```

---

### Task 4: Build APK + Manual Verification

- [ ] **Step 1: Build debug APK**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead\android
.\gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 2: Install on device**

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 3: Verify back button**

1. Open app → tap "Connexion" button on Home
2. DeviceTestScreen: confirm pill "‹ Accueil" visible top-left on pink header
3. Tap it → returns to Home

- [ ] **Step 4: Verify font settings**

1. From Home → tap ⚙️ → Settings
2. Scroll to READER section
3. Tap "XL" font size → value updates to "22px"
4. Tap "Mono" font family → value updates to "monospace"
5. Navigate to Reader with a book → confirm text uses larger monospace font
6. Return to Settings → selected buttons still highlighted (Zustand state persists)

- [ ] **Step 5: Copy APK for distribution**

```bash
copy android\app\build\outputs\apk\debug\app-debug.apk C:\Users\Floxa\Downloads\BookLovense\SensualRead-ui-settings.apk
```
