# Phase 4.2 — Safe Areas & Zero-Lag Intensity Design

**Date**: 2026-05-12
**Status**: Approved

---

## Problem

1. All screens use hardcoded `paddingTop: 48` / `paddingTop: 44` — text hidden by notch on physical devices with dynamic island or punch-hole cameras; nav bar overlaps bottom content on gesture-navigation phones.
2. `ReaderView.pageBuffer.nextText` is prefetched but never exposed to `ReaderScreen` — the pre-analysis opportunity is wasted.
3. `TriggerEngine.processContent()` debounces 300ms before analyzing. Combined with the 180ms slide animation, vibration starts 480ms after the user turns the page. The debounce was designed for scroll-driven content updates but pagination is event-driven (one fire per page turn) — the debounce only adds lag with zero benefit.

---

## Solution

### 1. Safe Areas — 4 screens

Replace all hardcoded top/bottom padding with `useSafeAreaInsets()` from `react-native-safe-area-context` (already installed, `SafeAreaProvider` already wraps root in `App.tsx`).

**Pattern (same for all screens):**
```typescript
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const insets = useSafeAreaInsets();

// Header: replace paddingTop: 48 with:
{ paddingTop: insets.top + 8 }

// Bottom nav bar (ReaderScreen only): add:
{ paddingBottom: insets.bottom + Spacing.md }
```

**Files:**
| File | Change |
|------|--------|
| `src/screens/ReaderScreen.tsx` | `insets.top` in header + `insets.bottom` on nav bar |
| `src/screens/DeviceTestScreen.tsx` | `insets.top` in header |
| `src/screens/SettingsScreen.tsx` | `insets.top` in header |
| `src/screens/HomeScreen.tsx` | `insets.top` in header |

---

### 2. Next-Page Text Pipe — ReaderView → ReaderScreen

Add one optional prop to `ReaderView`:

```typescript
// ReaderViewProps
onNextPageText?: (nextText: string) => void;
```

Called inside `updateBuffer` immediately after `setPageBuffer`:

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

Also called after initial load in `loadFile` with `renderer.getPageText(cp + 1) ?? ''`.

In `ReaderScreen`:
```typescript
const handleNextPageText = useCallback((nextText: string) => {
  if (settings.analysisEnabled && triggerEngineRef.current && nextText) {
    triggerEngineRef.current.preloadContent(nextText);
  }
}, [settings.analysisEnabled]);

// Pass to ReaderView:
<ReaderView onNextPageText={handleNextPageText} ... />
```

---

### 3. TriggerEngine — Remove Debounce + Option-A Preload

#### 3a. Remove 300ms debounce

The debounce timer in `processContent` is removed. Pagination fires exactly once per page turn — there is no rapid-fire scenario to protect against.

#### 3b. Add `preloadContent(text: string): void`

Runs analysis deferred (`setTimeout(0)`) so it doesn't block the animation frame. Stores result in `preloadedText` / `preloadedResult`.

```typescript
private preloadedText: string = '';
private preloadedResult: AnalysisResult | null = null;
private preloadTimer: ReturnType<typeof setTimeout> | null = null;

preloadContent(text: string): void {
  if (this.preloadTimer) clearTimeout(this.preloadTimer);
  this.preloadTimer = setTimeout(() => {
    const result = this.analyzer.analyze(text);
    this.preloadedText = text;
    this.preloadedResult = result;
  }, 0);
}
```

#### 3b. Modify `processContent` — Option A

```typescript
processContent(text: string): void {
  if (!text) return;

  // Option A: use preloaded result immediately if text matches
  if (this.preloadedResult && this.preloadedText === text) {
    const result = this.preloadedResult;
    this.preloadedText = '';
    this.preloadedResult = null;
    this._applyResult(result);

    // Re-analyze after 50ms to self-correct (in case display differs)
    setTimeout(() => {
      const fresh = this.analyzer.analyze(text);
      this._applyResult(fresh);
    }, 50);
    return;
  }

  // Normal path (no preloaded result): analyze synchronously, no debounce
  const result = this.analyzer.analyze(text);
  this._applyResult(result);
}

private _applyResult(result: AnalysisResult): void {
  this.intensityListeners.forEach(cb => cb(result));
  if (this.hapticService?.isConnected()) {
    const command = this.scoreToCommand(result.score);
    this.hapticService.sendCommand(command);
  }
}
```

#### 3c. Update `stop()`

Clear `preloadTimer` on stop:
```typescript
stop(): void {
  if (this.preloadTimer) clearTimeout(this.preloadTimer);
  this.hapticService?.stop();
}
```

---

## Latency Before vs After

| Step | Before | After |
|------|--------|-------|
| Slide animation | 180ms | 180ms (unchanged) |
| Debounce | 300ms | 0ms (removed) |
| Analysis | ~5ms | 0ms (preloaded) |
| **Total to vibration** | **~485ms** | **~0ms** (fires at page turn start) |

Re-analysis (self-correction) runs at T+230ms (end of animation + 50ms) — invisible to user.

---

## Files Changed

| File | Change |
|------|--------|
| `src/screens/ReaderScreen.tsx` | `useSafeAreaInsets`, `handleNextPageText`, pass `onNextPageText` to ReaderView |
| `src/screens/DeviceTestScreen.tsx` | `useSafeAreaInsets` header |
| `src/screens/SettingsScreen.tsx` | `useSafeAreaInsets` header |
| `src/screens/HomeScreen.tsx` | `useSafeAreaInsets` header |
| `src/components/reader/ReaderView.tsx` | `onNextPageText` prop + call in `updateBuffer` |
| `src/engines/analysis/TriggerEngine.ts` | Remove debounce, add `preloadContent`, add `_applyResult`, update `stop` |

---

## Out of Scope

- iOS safe area (MVP is Android-only)
- Multi-format rendering (Phase 5)
- OPDS catalog
