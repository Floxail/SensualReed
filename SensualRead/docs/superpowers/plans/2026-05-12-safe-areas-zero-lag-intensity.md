# Phase 4.2 — Safe Areas & Zero-Lag Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded header padding with safe-area insets, pipe next-page text from ReaderView to ReaderScreen, and make vibration fire instantly on page turn via preloaded analysis.

**Architecture:** `useSafeAreaInsets()` replaces `paddingTop: 48/44` in all 4 screens (SafeAreaProvider already wraps root). `ReaderView` exposes `onNextPageText` prop, called in `updateBuffer` so ReaderScreen can pre-analyze the next page. `TriggerEngine` gains `preloadContent()` that caches an analysis result; `processContent()` applies that cache immediately then re-analyzes at +50ms for self-correction. The 300ms debounce is removed — pagination is event-driven (one fire per page turn), so debounce only adds lag.

**Tech Stack:** `react-native-safe-area-context` (already installed), TypeScript, existing `IHapticService.setIntensity()`, `ITriggerEngine.analyze()`

---

## Files Changed

| File | Change |
|------|--------|
| `src/engines/analysis/TriggerEngine.ts` | Remove debounce; add `preloadContent`; add `_applyResult`; update `stop` |
| `src/components/reader/ReaderView.tsx` | Add `onNextPageText` prop; call it in `updateBuffer` and after initial load |
| `src/screens/ReaderScreen.tsx` | `useSafeAreaInsets` for header+nav; add `handleNextPageText`; pass `onNextPageText` |
| `src/screens/DeviceTestScreen.tsx` | `useSafeAreaInsets` for header |
| `src/screens/SettingsScreen.tsx` | `useSafeAreaInsets` for header |
| `src/screens/HomeScreen.tsx` | `useSafeAreaInsets` for header |

---

### Task 1: TriggerEngine — Remove Debounce + Add Preload

**Files:**
- Modify: `src/engines/analysis/TriggerEngine.ts`

Context: Current `processContent` debounces 300ms before analyzing. This adds ~300ms lag to every page turn for zero benefit (pagination fires once per turn, not repeatedly). We remove the debounce entirely and add `preloadContent()` + `_applyResult()`.

- [ ] **Step 1: Replace the class body with the updated version**

Open `src/engines/analysis/TriggerEngine.ts`. Replace the entire file content with:

```typescript
import { KeywordAnalyzer } from './KeywordAnalyzer';
import { ITriggerEngine, KeywordMap, AnalysisResult } from './ITriggerEngine';
import { IHapticService } from '../../services/bluetooth';

export type ContentCallback = (content: string) => void;
export type IntensityCallback = (result: AnalysisResult) => void;

export class TriggerEngine {
  private analyzer: ITriggerEngine;
  private hapticService: IHapticService | null = null;
  private intensityListeners: Set<IntensityCallback> = new Set();
  private lastResult: AnalysisResult | null = null;
  private preloadedText: string = '';
  private preloadedResult: AnalysisResult | null = null;
  private preloadTimer: ReturnType<typeof setTimeout> | null = null;
  private reanalysisTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(analyzer?: ITriggerEngine) {
    this.analyzer = analyzer ?? new KeywordAnalyzer();
  }

  setHapticService(service: IHapticService): void {
    this.hapticService = service;
  }

  /**
   * Pre-analyze next page text in background.
   * Deferred with setTimeout(0) so it does not block the animation frame.
   * Result is cached and consumed by the next processContent() call.
   */
  preloadContent(text: string): void {
    if (this.preloadTimer) clearTimeout(this.preloadTimer);
    this.preloadTimer = setTimeout(() => {
      if (!text) return;
      this.preloadedResult = this.analyzer.analyze(text);
      this.preloadedText = text;
    }, 0);
  }

  /**
   * Process visible page text.
   * If a preloaded result exists for this exact text, applies it immediately
   * (zero lag), then re-analyzes at +50ms to self-correct.
   * Otherwise analyzes synchronously (no debounce — one call per page turn).
   */
  processContent(content: string): void {
    if (!content) return;

    if (this.reanalysisTimer) {
      clearTimeout(this.reanalysisTimer);
      this.reanalysisTimer = null;
    }

    if (this.preloadedResult && this.preloadedText === content) {
      const cached = this.preloadedResult;
      this.preloadedText = '';
      this.preloadedResult = null;
      this._applyResult(cached);

      // Self-correction: re-analyze after animation settles
      this.reanalysisTimer = setTimeout(() => {
        const fresh = this.analyzer.analyze(content);
        this._applyResult(fresh);
      }, 50);
      return;
    }

    const result = this.analyzer.analyze(content);
    this._applyResult(result);
  }

  setDebounce(_ms: number): void {
    // Debounce removed — kept for API compatibility
  }

  getAnalyzer(): ITriggerEngine {
    return this.analyzer;
  }

  loadKeywords(keywords: KeywordMap): void {
    this.analyzer.setKeywords(keywords);
  }

  onIntensityChange(callback: IntensityCallback): () => void {
    this.intensityListeners.add(callback);
    return () => {
      this.intensityListeners.delete(callback);
    };
  }

  getLastResult(): AnalysisResult | null {
    return this.lastResult;
  }

  stop(): void {
    if (this.preloadTimer) { clearTimeout(this.preloadTimer); this.preloadTimer = null; }
    if (this.reanalysisTimer) { clearTimeout(this.reanalysisTimer); this.reanalysisTimer = null; }
    this.preloadedText = '';
    this.preloadedResult = null;
    this.analyzer.reset();
    this.lastResult = null;
    if (this.hapticService && this.hapticService.isConnected()) {
      this.hapticService.stop();
    }
  }

  private _applyResult(result: AnalysisResult): void {
    this.lastResult = result;
    this.intensityListeners.forEach(listener => listener(result));
    if (this.hapticService && this.hapticService.isConnected()) {
      this.hapticService.setIntensity(result.score);
    }
    if (result.score > 0) {
      console.log(`[TriggerEngine] Score: ${result.score} | Keywords: ${result.matchedKeywords.join(', ')}`);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | Where-Object { $_ -match "TriggerEngine" }
```

Expected: no output (no errors on TriggerEngine).

---

### Task 2: ReaderView — Add `onNextPageText` Prop

**Files:**
- Modify: `src/components/reader/ReaderView.tsx`

Context: `ReaderView` already has `updateBuffer()` which populates `pageBuffer.nextText`. We add one prop `onNextPageText` and call it whenever the buffer updates and after the initial load.

- [ ] **Step 1: Add `onNextPageText` to `ReaderViewProps`**

Find:
```typescript
interface ReaderViewProps {
  filePath: string;
  initialPage?: number;
  onContentChange?: (content: PageContent) => void;
  onMetadataLoaded?: (metadata: BookMetadata) => void;
  onError?: (error: Error) => void;
  onPageChange?: (page: number, total: number) => void;
}
```

Replace with:
```typescript
interface ReaderViewProps {
  filePath: string;
  initialPage?: number;
  onContentChange?: (content: PageContent) => void;
  onMetadataLoaded?: (metadata: BookMetadata) => void;
  onError?: (error: Error) => void;
  onPageChange?: (page: number, total: number) => void;
  onNextPageText?: (nextText: string) => void;
}
```

- [ ] **Step 2: Destructure the new prop**

Find the component signature:
```typescript
export const ReaderView: React.FC<ReaderViewProps> = ({
  filePath,
  initialPage = 1,
  onContentChange,
  onMetadataLoaded,
  onError,
  onPageChange,
}) => {
```

Replace with:
```typescript
export const ReaderView: React.FC<ReaderViewProps> = ({
  filePath,
  initialPage = 1,
  onContentChange,
  onMetadataLoaded,
  onError,
  onPageChange,
  onNextPageText,
}) => {
```

- [ ] **Step 3: Call `onNextPageText` in `updateBuffer`**

Find:
```typescript
  const updateBuffer = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const cp = renderer.getCurrentPage();
    setPageBuffer({
      prevText: renderer.getPageText(cp - 1) ?? '',
      currText: renderer.getPageText(cp) ?? '',
      nextText: renderer.getPageText(cp + 1) ?? '',
    });
  }, []);
```

Replace with:
```typescript
  const updateBuffer = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const cp = renderer.getCurrentPage();
    const nextText = renderer.getPageText(cp + 1) ?? '';
    setPageBuffer({
      prevText: renderer.getPageText(cp - 1) ?? '',
      currText: renderer.getPageText(cp) ?? '',
      nextText,
    });
    onNextPageText?.(nextText);
  }, [onNextPageText]);
```

- [ ] **Step 4: Call `onNextPageText` after initial load**

Find the `setPageBuffer` call inside `loadFile` (after initial content loads):
```typescript
        setPageBuffer({
          prevText: renderer.getPageText(cp - 1) ?? '',
          currText: renderer.getPageText(cp) ?? '',
          nextText: renderer.getPageText(cp + 1) ?? '',
        });
```

Replace with:
```typescript
        const initialNextText = renderer.getPageText(cp + 1) ?? '';
        setPageBuffer({
          prevText: renderer.getPageText(cp - 1) ?? '',
          currText: renderer.getPageText(cp) ?? '',
          nextText: initialNextText,
        });
        onNextPageText?.(initialNextText);
```

- [ ] **Step 5: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Where-Object { $_ -match "ReaderView" }
```

Expected: no output.

---

### Task 3: ReaderScreen — Safe Areas + Wire `onNextPageText`

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

Context: ReaderScreen uses `paddingTop: 44` in the header StyleSheet and a fixed `paddingBottom` on the nav bar. We replace these with `useSafeAreaInsets()`. We also add `handleNextPageText` callback and pass `onNextPageText` to `<ReaderView>`.

- [ ] **Step 1: Add `useSafeAreaInsets` import**

Find:
```typescript
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
```

Replace with:
```typescript
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

- [ ] **Step 2: Call `useSafeAreaInsets` inside the component**

Find the line where `useNavigation` is called (near the top of the component body, around the other hooks). After `const settings = useAppStore(...)` or similar, add:

```typescript
  const insets = useSafeAreaInsets();
```

- [ ] **Step 3: Add `handleNextPageText` callback**

Find `handlePageChange`:
```typescript
  const handlePageChange = useCallback((page: number, total: number) => {
```

After that callback's closing `}, [...]);`, add:

```typescript
  const handleNextPageText = useCallback((nextText: string) => {
    if (settings.analysisEnabled && triggerEngineRef.current && nextText) {
      triggerEngineRef.current.preloadContent(nextText);
    }
  }, [settings.analysisEnabled]);
```

- [ ] **Step 4: Pass `onNextPageText` to `<ReaderView>`**

Find `<ReaderView` in the JSX. It currently has props like `onContentChange`, `onPageChange`, etc. Add:

```tsx
onNextPageText={handleNextPageText}
```

- [ ] **Step 5: Replace hardcoded header `paddingTop` with inset**

Find in `StyleSheet.create`:
```typescript
    paddingTop: 44,
```
(This is inside the `header` style.)

The entire header style entry looks like:
```typescript
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
```

The `paddingTop` is inside StyleSheet, but insets are dynamic — they must be applied inline. So:

**Remove** `paddingTop: 44,` from the StyleSheet `header` entry:
```typescript
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
```

**Find the `<View>` that uses `styles.header` in the JSX** and add inline `paddingTop`:
```tsx
<View style={[styles.header, { paddingTop: insets.top + 4 }]}>
```

- [ ] **Step 6: Add bottom inset to nav bar**

The ReaderScreen has a bottom navigation bar (the intensity / connection area). Find the outermost bottom bar `<View>` that contains the connection status and intensity bar. It will have a style like `styles.bottomBar` or `styles.footer`.

Search for it:
```powershell
Select-String -Path "src\screens\ReaderScreen.tsx" -Pattern "bottomBar|footer|intensity" | Select-Object -First 10
```

Once found, add `paddingBottom: insets.bottom` inline:
```tsx
<View style={[styles.WHATEVER_BOTTOM_STYLE, { paddingBottom: insets.bottom || Spacing.sm }]}>
```

(Replace `WHATEVER_BOTTOM_STYLE` with the actual style name found.)

- [ ] **Step 7: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Where-Object { $_ -match "ReaderScreen" }
```

Expected: no output.

---

### Task 4: DeviceTestScreen — Safe Areas

**Files:**
- Modify: `src/screens/DeviceTestScreen.tsx`

Context: DeviceTestScreen has `paddingTop: 48` in TWO style entries (`header` and `menuHeader`, line 276 and 289).

- [ ] **Step 1: Add `useSafeAreaInsets` import**

Find the existing imports. Add:
```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

- [ ] **Step 2: Call hook inside component**

Near the other hooks at the top of the component body, add:
```typescript
  const insets = useSafeAreaInsets();
```

- [ ] **Step 3: Remove hardcoded paddingTop from both style entries**

Find `header` style (line ~276):
```typescript
  header: { padding: Spacing.md, paddingTop: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
```

Replace with:
```typescript
  header: { padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
```

Find `menuHeader` style (line ~289):
```typescript
  menuHeader: { padding: Spacing.md, paddingTop: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
```

Replace with:
```typescript
  menuHeader: { padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
```

- [ ] **Step 4: Apply inset inline on both header Views**

Find the JSX `<View style={styles.header}>` — replace with:
```tsx
<View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
```

Find `<View style={styles.menuHeader}>` — replace with:
```tsx
<View style={[styles.menuHeader, { paddingTop: insets.top + Spacing.sm }]}>
```

- [ ] **Step 5: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Where-Object { $_ -match "DeviceTestScreen" }
```

Expected: no output.

---

### Task 5: SettingsScreen — Safe Areas

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

Context: SettingsScreen has `paddingTop: 48` in StyleSheet `header` entry (line 282).

- [ ] **Step 1: Add `useSafeAreaInsets` import**

Find:
```typescript
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography, Colors } from '../theme';
```

Replace with:
```typescript
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography, Colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

- [ ] **Step 2: Call hook inside component**

Near other hooks in the component body, add:
```typescript
  const insets = useSafeAreaInsets();
```

- [ ] **Step 3: Remove hardcoded paddingTop from StyleSheet**

Find (line ~282):
```typescript
  header: {
    paddingTop: 48,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
```

Replace with:
```typescript
  header: {
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
```

- [ ] **Step 4: Apply inset inline on header View**

Find in JSX:
```tsx
<View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
```

Replace with:
```tsx
<View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 8 }]}>
```

- [ ] **Step 5: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Where-Object { $_ -match "SettingsScreen" }
```

Expected: no output.

---

### Task 6: HomeScreen — Safe Areas

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

Context: HomeScreen has `paddingTop: 48` in StyleSheet `header` entry (line 218).

- [ ] **Step 1: Add `useSafeAreaInsets` import**

Find the imports block. Add:
```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

- [ ] **Step 2: Call hook inside component**

Near other hooks in the component body, add:
```typescript
  const insets = useSafeAreaInsets();
```

- [ ] **Step 3: Remove hardcoded paddingTop from StyleSheet**

Find (line ~218):
```typescript
    paddingTop: 48,
```

Delete this line from the `header` style entry.

- [ ] **Step 4: Apply inset inline on header View**

Find the JSX `<View` that uses `styles.header`. Add inline `paddingTop`:
```tsx
<View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 8 }]}>
```

(If the header View already has an inline style array, add `paddingTop: insets.top + 8` to it.)

- [ ] **Step 5: Full TypeScript clean build**

```powershell
npx tsc --noEmit 2>&1 | Where-Object { $_ -notmatch "HomeScreen\.tsx|types/index|HomeScreen" } | Measure-Object -Line
```

Expected: only the two pre-existing errors in `HomeScreen.tsx` (Typography.h4) and `types/index.ts` remain. Zero new errors.

---

### Task 7: CLAUDE.md — Update Session Context + Status

**Files:**
- Modify: `SensualRead/CLAUDE.md`

- [ ] **Step 1: Add Phase 4.2 items to Current Status checklist**

Find:
```markdown
- [x] **PageText memoization** (React.memo, prevents intensity bar re-renders)
- [ ] End-to-end integration testing with real device
```

Replace with:
```markdown
- [x] **PageText memoization** (React.memo, prevents intensity bar re-renders)
- [x] **Safe areas** (useSafeAreaInsets on all 4 screens — notch + gesture nav bar safe)
- [x] **Zero-lag intensity** (preloadContent pre-analyzes N+1; processContent applies cache immediately + re-analyzes at +50ms)
- [x] **Next-page text pipe** (ReaderView.onNextPageText → ReaderScreen.handleNextPageText → TriggerEngine.preloadContent)
- [ ] End-to-end integration testing with real device
```

- [ ] **Step 2: Add session entry**

Find `## Current Session Context`. Add at top:

```markdown
### Session: 2026-05-12 (Phase 4.2 — Safe Areas & Zero-Lag Intensity)
- **What happened**:
  - All 4 screens: replaced hardcoded `paddingTop: 48/44` with `useSafeAreaInsets().top` — text never hidden by notch or status bar
  - `ReaderScreen`: bottom bar gets `insets.bottom` — not overlapped by gesture navigation strip
  - `ReaderView`: added `onNextPageText` prop, called in `updateBuffer` and after initial load
  - `TriggerEngine`: removed 300ms debounce (pagination is event-driven, debounce was pure lag); added `preloadContent()` (deferred analysis, cached); `processContent()` uses cache if text matches then re-analyzes at +50ms (Option A)
  - Vibration latency: was ~485ms (180ms animation + 300ms debounce), now ~0ms (fires at page turn start)

- **Status**: No APK built yet — pending user test request
```

- [ ] **Step 3: Verify CLAUDE.md looks correct**

```powershell
Select-String -Path "SensualRead\CLAUDE.md" -Pattern "Safe areas|Zero-lag|Phase 4.2" | Select-Object LineNumber, Line
```

Expected: 3+ matching lines confirming all entries are in place.
