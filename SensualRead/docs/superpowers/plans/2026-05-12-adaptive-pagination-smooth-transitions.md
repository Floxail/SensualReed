# Phase 4.1 — Adaptive Pagination & Smooth Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed-1500-char pagination with viewport-aware pagination, add 180ms slide transition animations, prefetch adjacent pages into a triple buffer, and memoize the text renderer component.

**Architecture:** `ReaderView` measures its content area via `onLayout` and computes `charsPerPage` from `floor(height/(fontSize×lineHeight)) × floor(width/(fontSize×charWidthRatio))`, calling `renderer.setCharsPerPage()` on initial layout and whenever font settings change. Adjacent pages are pre-fetched into `{ prevText, currText, nextText }` via a new `getPageText(n)` renderer method — instant since all pages are already in `renderer.pages[]`. Page turns trigger a 180ms horizontal `Animated` slide (native driver); content swaps mid-animation. A memoized `PageText` component prevents the navigation bar and intensity bar from causing text re-renders.

**Tech Stack:** React Native `Animated` API (native driver), `onLayout`, `LayoutChangeEvent`, `React.memo`, `useCallback`, TypeScript

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/reader/renderers/IRenderer.ts` | Add `getPageText(n)` and `setCharsPerPage(chars)` to interface |
| `src/components/reader/renderers/TxtRenderer.ts` | Fix `setCharsPerPage` to preserve reading position; add `getPageText` |
| `src/components/reader/renderers/EpubRenderer.ts` | Add `setCharsPerPage` (missing) + `getPageText` |
| `src/components/reader/ReaderView.tsx` | `onLayout` → adaptive chars; triple buffer; slide animation; `React.memo` |
| `SensualRead/CLAUDE.md` | Add ADR-007, update checklist and session context |

---

### Task 1: IRenderer — Add `getPageText` and `setCharsPerPage` to interface

**Files:**
- Modify: `src/components/reader/renderers/IRenderer.ts`

- [ ] **Step 1: Add two methods to the `IRenderer` interface**

Open `src/components/reader/renderers/IRenderer.ts`. Find `getSupportedExtensions(): string[];` (last line of the interface). After it, add:

```typescript
  /**
   * Get text content of a specific page without navigating to it.
   * Returns null if pageNumber is out of range or renderer is not loaded.
   */
  getPageText(pageNumber: number): string | null;

  /**
   * Recalculate pagination with new chars-per-page value.
   * Preserves approximate reading position via progress ratio.
   * Clamped to 500–5000 chars.
   */
  setCharsPerPage(chars: number): void;
```

- [ ] **Step 2: Verify interface change causes expected errors**

```powershell
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | Select-String "getPageText|setCharsPerPage"
```

Expected: lines mentioning `TxtRenderer` and/or `EpubRenderer` don't implement these methods yet. This confirms the interface addition is live.

- [ ] **Step 3: Commit**

```bash
git add src/components/reader/renderers/IRenderer.ts
git commit -m "feat: add getPageText and setCharsPerPage to IRenderer interface"
```

---

### Task 2: TxtRenderer — Position-Preserving `setCharsPerPage` + `getPageText`

**Files:**
- Modify: `src/components/reader/renderers/TxtRenderer.ts`

- [ ] **Step 1: Replace `setCharsPerPage` with position-preserving version**

Find the existing `setCharsPerPage` method (around line 161):

```typescript
  setCharsPerPage(chars: number): void {
    this.charsPerPage = Math.max(500, Math.min(5000, chars));
    if (this.loaded) {
      this.paginateContent();
      this.goToPage(Math.min(this.currentPage, this.totalPages));
    }
  }
```

Replace with:

```typescript
  setCharsPerPage(chars: number): void {
    this.charsPerPage = Math.max(500, Math.min(5000, chars));
    if (!this.loaded) return;
    const progress = this.totalPages > 1
      ? (this.currentPage - 1) / (this.totalPages - 1)
      : 0;
    this.paginateContent();
    this.currentPage = Math.max(1, Math.min(
      Math.round(progress * (this.totalPages - 1)) + 1,
      this.totalPages
    ));
    if (this.metadata) this.metadata.currentPage = this.currentPage;
    this.notifyContentChange();
  }
```

- [ ] **Step 2: Add `getPageText` method**

After the new `setCharsPerPage`, add:

```typescript
  getPageText(pageNumber: number): string | null {
    if (!this.loaded || pageNumber < 1 || pageNumber > this.totalPages) return null;
    return this.pages[pageNumber - 1] ?? null;
  }
```

- [ ] **Step 3: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-String "TxtRenderer"
```

Expected: no lines (no errors for TxtRenderer).

- [ ] **Step 4: Commit**

```bash
git add src/components/reader/renderers/TxtRenderer.ts
git commit -m "feat: position-preserving setCharsPerPage + getPageText in TxtRenderer"
```

---

### Task 3: EpubRenderer — Add `setCharsPerPage` + `getPageText`

**Files:**
- Modify: `src/components/reader/renderers/EpubRenderer.ts`

Context: `EpubRenderer` has `private charsPerPage: number = 1500` (line 34) but no public `setCharsPerPage` — it was never wired up. Add both methods after `getChapters()` (around line 170).

- [ ] **Step 1: Add `setCharsPerPage` method**

Find `getChapters()` method:

```typescript
  getChapters(): { title: string; startPage: number }[] {
    // TODO: Track chapter start pages
    return this.chapters.map((ch, i) => ({
      title: ch.title || `Chapter ${i + 1}`,
      startPage: 1,
    }));
  }
```

After the closing `}` of `getChapters`, add:

```typescript
  setCharsPerPage(chars: number): void {
    this.charsPerPage = Math.max(500, Math.min(5000, chars));
    if (!this.loaded) return;
    const progress = this.totalPages > 1
      ? (this.currentPage - 1) / (this.totalPages - 1)
      : 0;
    this.paginateContent();
    this.currentPage = Math.max(1, Math.min(
      Math.round(progress * (this.totalPages - 1)) + 1,
      this.totalPages
    ));
    if (this.metadata) {
      this.metadata.currentPage = this.currentPage;
      this.metadata.totalPages = this.totalPages;
    }
    this.notifyContentChange();
  }

  getPageText(pageNumber: number): string | null {
    if (!this.loaded || pageNumber < 1 || pageNumber > this.totalPages) return null;
    return this.pages[pageNumber - 1] ?? null;
  }
```

- [ ] **Step 2: Verify TypeScript — full clean build**

```powershell
npx tsc --noEmit 2>&1 | Measure-Object -Line
```

Expected: `Lines : 0` (zero errors across all files).

- [ ] **Step 3: Commit**

```bash
git add src/components/reader/renderers/EpubRenderer.ts
git commit -m "feat: setCharsPerPage + getPageText in EpubRenderer"
```

---

### Task 4: ReaderView — Adaptive Pagination via `onLayout`

**Files:**
- Modify: `src/components/reader/ReaderView.tsx`

Context: Content area currently uses whatever `charsPerPage` the renderer defaulted to (1500 chars). After this task, `ReaderView` measures its content area on first layout and re-computes `charsPerPage` whenever the content area size or font settings change.

- [ ] **Step 1: Add `LayoutChangeEvent` and `Animated` to RN imports**

Find the React Native import block:

```typescript
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  GestureResponderEvent,
} from 'react-native';
```

Replace with:

```typescript
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
```

- [ ] **Step 2: Add `containerDims` ref**

Find `const scrollViewRef = useRef<ScrollView>(null);` and add after it:

```typescript
const containerDims = useRef({ width: 0, height: 0 });
```

- [ ] **Step 3: Add char-width ratio map and `recalcCharsPerPage` callback**

After `containerDims`, add:

```typescript
const CHAR_WIDTH_RATIO: Record<string, number> = {
  'serif': 0.50,
  'sans-serif': 0.48,
  'monospace': 0.60,
};

const recalcCharsPerPage = useCallback(() => {
  const { width, height } = containerDims.current;
  if (!width || !height || !rendererRef.current?.isLoaded()) return;
  const ratio = CHAR_WIDTH_RATIO[settings.fontFamily] ?? 0.50;
  const charsPerLine = Math.floor(width / (settings.fontSize * ratio));
  const linesPerPage = Math.floor(height / (settings.fontSize * settings.lineHeight));
  const newCharsPerPage = Math.max(800, charsPerLine * linesPerPage);
  rendererRef.current.setCharsPerPage(newCharsPerPage);
}, [settings.fontSize, settings.lineHeight, settings.fontFamily]);
```

- [ ] **Step 4: Add `useEffect` to repaginate when font settings change**

After the existing `useEffect` for file loading (the one containing `loadFile(filePath, initialPage)`), add:

```typescript
useEffect(() => {
  recalcCharsPerPage();
}, [recalcCharsPerPage]);
```

- [ ] **Step 5: Add `handleContentLayout` callback**

After `recalcCharsPerPage`, add:

```typescript
const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
  const { width, height } = event.nativeEvent.layout;
  if (width === containerDims.current.width && height === containerDims.current.height) return;
  containerDims.current = { width, height };
  recalcCharsPerPage();
}, [recalcCharsPerPage]);
```

- [ ] **Step 6: Wire `onLayout` to the content TouchableOpacity**

Find in the JSX `return`:

```tsx
<TouchableOpacity
  activeOpacity={1}
  onPress={handleTap}
  style={styles.contentTouchable}
>
```

Replace with:

```tsx
<TouchableOpacity
  activeOpacity={1}
  onPress={handleTap}
  style={styles.contentTouchable}
  onLayout={handleContentLayout}
>
```

- [ ] **Step 7: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-String "ReaderView"
```

Expected: no lines.

- [ ] **Step 8: Commit**

```bash
git add src/components/reader/ReaderView.tsx
git commit -m "feat: adaptive pagination via onLayout in ReaderView"
```

---

### Task 5: ReaderView — Triple Buffer + Slide Animation

**Files:**
- Modify: `src/components/reader/ReaderView.tsx`

Context: Currently `state.content` holds the current page text and is swapped directly on page turn (visible flash). After this task: a triple buffer `{ prevText, currText, nextText }` pre-fetches adjacent pages; `handlePrevPage`/`handleNextPage` are replaced by `animateAndTurnPage` which slides the content out (180ms), swaps, then slides it in (180ms).

- [ ] **Step 1: Add slide animation refs**

After `const containerDims = useRef(...)`, add:

```typescript
const slideAnim = useRef(new Animated.Value(0)).current;
const isAnimating = useRef(false);
```

- [ ] **Step 2: Add `pageBuffer` state**

After the existing `const [state, setState] = useState<ReaderState>(...)` declaration, add:

```typescript
const [pageBuffer, setPageBuffer] = useState({ prevText: '', currText: '', nextText: '' });
```

- [ ] **Step 3: Add `updateBuffer` callback**

After `handleContentLayout`, add:

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

- [ ] **Step 4: Call `updateBuffer` from content-change subscription in `loadFile`**

Find the `onContentChange` subscription inside `loadFile`:

```typescript
const unsubscribe = renderer.onContentChange((content) => {
  setState(prev => ({
    ...prev,
    current: content.pageNumber,
    total: renderer.getTotalPages(),
    content: content.text,
  }));
  onContentChange?.(content);
  onPageChange?.(content.pageNumber, renderer.getTotalPages());
});
```

Replace with:

```typescript
const unsubscribe = renderer.onContentChange((content) => {
  setState(prev => ({
    ...prev,
    current: content.pageNumber,
    total: renderer.getTotalPages(),
    content: content.text,
  }));
  updateBuffer();
  onContentChange?.(content);
  onPageChange?.(content.pageNumber, renderer.getTotalPages());
});
```

- [ ] **Step 5: Populate buffer after initial load**

Find this block in `loadFile`:

```typescript
if (initialContent) {
  setState({
    current: initialContent.pageNumber,
    total: renderer.getTotalPages(),
    content: initialContent.text,
    title: metadata?.title || '',
    isLoading: false,
    error: null,
  });
  onContentChange?.(initialContent);
  onPageChange?.(initialContent.pageNumber, renderer.getTotalPages());
}
```

Replace with:

```typescript
if (initialContent) {
  setState({
    current: initialContent.pageNumber,
    total: renderer.getTotalPages(),
    content: initialContent.text,
    title: metadata?.title || '',
    isLoading: false,
    error: null,
  });
  const cp = initialContent.pageNumber;
  setPageBuffer({
    prevText: renderer.getPageText(cp - 1) ?? '',
    currText: renderer.getPageText(cp) ?? '',
    nextText: renderer.getPageText(cp + 1) ?? '',
  });
  onContentChange?.(initialContent);
  onPageChange?.(initialContent.pageNumber, renderer.getTotalPages());
}
```

- [ ] **Step 6: Replace `handlePrevPage` and `handleNextPage` with `animateAndTurnPage`**

Find and DELETE both callbacks:

```typescript
const handlePrevPage = useCallback(() => {
  if (rendererRef.current?.prevPage()) {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }
}, []);

const handleNextPage = useCallback(() => {
  if (rendererRef.current?.nextPage()) {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }
}, []);
```

Replace with:

```typescript
const animateAndTurnPage = useCallback((direction: 'next' | 'prev') => {
  if (isAnimating.current) return;
  if (direction === 'next' && state.current >= state.total) return;
  if (direction === 'prev' && state.current <= 1) return;

  isAnimating.current = true;
  const outOffset = direction === 'next' ? -SCREEN_WIDTH : SCREEN_WIDTH;
  const inOffset = direction === 'next' ? SCREEN_WIDTH : -SCREEN_WIDTH;

  Animated.timing(slideAnim, {
    toValue: outOffset,
    duration: 180,
    useNativeDriver: true,
  }).start(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    if (direction === 'next') {
      rendererRef.current?.nextPage();
    } else {
      rendererRef.current?.prevPage();
    }
    slideAnim.setValue(inOffset);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      isAnimating.current = false;
    });
  });
}, [slideAnim, state.current, state.total]);
```

Also DELETE the unused `goToPage` callback:

```typescript
const goToPage = useCallback((page: number) => {
  if (rendererRef.current?.goToPage(page)) {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }
}, []);
```

- [ ] **Step 7: Update `handleTap` to use `animateAndTurnPage`**

Find:

```typescript
const handleTap = useCallback((event: GestureResponderEvent) => {
  const { locationX } = event.nativeEvent;

  if (locationX < TAP_ZONE_WIDTH) {
    handlePrevPage();
  } else if (locationX > SCREEN_WIDTH - TAP_ZONE_WIDTH) {
    handleNextPage();
  }
}, [handlePrevPage, handleNextPage]);
```

Replace with:

```typescript
const handleTap = useCallback((event: GestureResponderEvent) => {
  const { locationX } = event.nativeEvent;
  if (locationX < TAP_ZONE_WIDTH) {
    animateAndTurnPage('prev');
  } else if (locationX > SCREEN_WIDTH - TAP_ZONE_WIDTH) {
    animateAndTurnPage('next');
  }
}, [animateAndTurnPage]);
```

- [ ] **Step 8: Update nav bar button `onPress` handlers**

Find the Prev nav button:

```tsx
<TouchableOpacity
  style={[
    styles.navButton,
    { backgroundColor: state.current <= 1 ? colors.buttonDisabled : colors.buttonPrimary },
  ]}
  onPress={handlePrevPage}
  disabled={state.current <= 1}
>
```

Replace `onPress={handlePrevPage}` with `onPress={() => animateAndTurnPage('prev')}`.

Find the Next nav button:

```tsx
<TouchableOpacity
  style={[
    styles.navButton,
    { backgroundColor: state.current >= state.total ? colors.buttonDisabled : colors.buttonPrimary },
  ]}
  onPress={handleNextPage}
  disabled={state.current >= state.total}
>
```

Replace `onPress={handleNextPage}` with `onPress={() => animateAndTurnPage('next')}`.

- [ ] **Step 9: Wrap content area in `Animated.View` with overflow clip; use `pageBuffer.currText`**

Find the main `return` content structure (the part that is NOT the loading/error states):

```tsx
return (
  <View style={[styles.container, { backgroundColor: colors.readerBackground }]}>
    {/* Content Area with tap zones */}
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleTap}
      style={styles.contentTouchable}
      onLayout={handleContentLayout}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
          {state.content}
        </Text>
      </ScrollView>
    </TouchableOpacity>

    {/* Bottom Navigation */}
```

Replace with:

```tsx
return (
  <View style={[styles.container, { backgroundColor: colors.readerBackground }]}>
    {/* Content area — overflow:hidden clips the slide animation */}
    <View style={styles.contentClip}>
      <Animated.View style={[styles.contentAnimated, { transform: [{ translateX: slideAnim }] }]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleTap}
          style={styles.contentTouchable}
          onLayout={handleContentLayout}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
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
              {pageBuffer.currText}
            </Text>
          </ScrollView>
        </TouchableOpacity>
      </Animated.View>
    </View>

    {/* Bottom Navigation */}
```

- [ ] **Step 10: Add `contentClip` and `contentAnimated` styles**

In `StyleSheet.create({...})`, find `contentTouchable: { flex: 1, }`. Add before it:

```typescript
  contentClip: {
    flex: 1,
    overflow: 'hidden',
  },
  contentAnimated: {
    flex: 1,
  },
```

- [ ] **Step 11: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-String "ReaderView"
```

Expected: no lines.

- [ ] **Step 12: Commit**

```bash
git add src/components/reader/ReaderView.tsx
git commit -m "feat: triple-buffer prefetch + slide animation in ReaderView"
```

---

### Task 6: ReaderView — `React.memo` PageText Component

**Files:**
- Modify: `src/components/reader/ReaderView.tsx`

Context: The `<Text>` node with book content re-renders whenever any `ReaderView` state changes (intensity bar updates from TriggerEngine trigger this). Extracting it as a memoized component means only actual text/style prop changes cause a re-render.

- [ ] **Step 1: Add `PageText` memoized component above `ReaderView`**

At the top of `ReaderView.tsx`, after the imports and after `const { width: SCREEN_WIDTH } = Dimensions.get('window');`, add:

```typescript
interface PageTextProps {
  text: string;
  color: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

const PageText = React.memo<PageTextProps>(({ text, color, fontSize, lineHeight, fontFamily }) => (
  <Text
    style={{
      color,
      fontSize,
      lineHeight: fontSize * lineHeight,
      fontFamily,
    }}
  >
    {text}
  </Text>
));
```

- [ ] **Step 2: Replace inline `<Text>` with `<PageText>` in the ScrollView**

Find in the JSX:

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
  {pageBuffer.currText}
</Text>
```

Replace with:

```tsx
<PageText
  text={pageBuffer.currText}
  color={colors.readerText}
  fontSize={settings.fontSize}
  lineHeight={settings.lineHeight}
  fontFamily={settings.fontFamily}
/>
```

- [ ] **Step 3: Remove now-unused `styles.text` from StyleSheet**

Find in `StyleSheet.create`:

```typescript
  text: {},
```

Delete this line.

- [ ] **Step 4: Verify TypeScript — full clean build**

```powershell
npx tsc --noEmit 2>&1 | Measure-Object -Line
```

Expected: `Lines : 0`.

- [ ] **Step 5: Commit**

```bash
git add src/components/reader/ReaderView.tsx
git commit -m "perf: memoize PageText to prevent re-renders on unrelated state changes"
```

---

### Task 7: CLAUDE.md — Document ADR-007 + Update Status

**Files:**
- Modify: `SensualRead/CLAUDE.md`

- [ ] **Step 1: Add ADR-007 section**

In `SensualRead/CLAUDE.md`, find the end of the ADR-006 block (the pink scale line ending with `#800031`). After the closing ` ``` ` of that block, add:

```markdown
### ADR-007: Adaptive Pagination & Smooth Transitions
- **Decision**: Viewport-based `charsPerPage` + `Animated` slide transitions + triple-buffer prefetch + `React.memo` PageText
- **Rationale**: Fixed 1500-char pagination wrong on small/large screens; hard page swap felt jarring; text re-rendered on every intensity bar update
- **Date**: 2026-05-12
- **Status**: IMPLEMENTED ✓

```
Pagination formula:
  charsPerPage = floor(height / (fontSize × lineHeight))
               × floor(width  / (fontSize × charWidthRatio))
  charWidthRatio: serif=0.50, sans-serif=0.48, monospace=0.60
  minimum: 800 chars

Transition (native driver, no JS thread blocking):
  180ms slide out → content swap → 180ms slide in
  isAnimating.current guard prevents double-tap queueing

Prefetch triple buffer { prevText, currText, nextText }:
  renderer.getPageText(n) = O(1), pages[] already in memory
  Updated on every onContentChange event

Memoization:
  PageText = React.memo with primitive props (color, fontSize, lineHeight, fontFamily, text)
  Shallow comparison prevents intensity updates from re-rendering text node
```
```

- [ ] **Step 2: Update Current Status checklist**

Find:

```markdown
- [ ] End-to-end integration testing with real device
```

Add these lines above it:

```markdown
- [x] **Adaptive pagination** (viewport-based charsPerPage via onLayout)
- [x] **Smooth slide transitions** (180ms Animated, native driver, overflow clip)
- [x] **Page prefetch** (triple buffer prevText/currText/nextText via getPageText)
- [x] **PageText memoization** (React.memo, prevents intensity bar re-renders)
```

- [ ] **Step 3: Add session context entry**

Find `## Current Session Context`. Add at the top (before the v0.11 session entry):

```markdown
### Session: 2026-05-12 (Phase 4.1 — Adaptive Pagination & Smooth Transitions)
- **What happened**:
  - `IRenderer`: added `getPageText(n): string | null` and `setCharsPerPage(chars): void` to interface
  - `TxtRenderer`: `setCharsPerPage` now preserves reading position via progress ratio; added `getPageText`
  - `EpubRenderer`: added `setCharsPerPage` (was never wired up) + `getPageText`
  - `ReaderView`: `onLayout` measures content container; `recalcCharsPerPage` recomputes on font size/line height/font family changes using per-family char width ratios
  - `ReaderView`: triple buffer `{ prevText, currText, nextText }` populated via `getPageText`; `updateBuffer` called on every content-change event
  - `ReaderView`: 180ms `Animated` horizontal slide (native driver) with `overflow: hidden` clip; `isAnimating` guard prevents double-tap queueing
  - `ReaderView`: `PageText = React.memo` with primitive props — intensity bar updates no longer re-render text node

- **Status**: No APK built yet — pending user test request
```

- [ ] **Step 4: Commit**

```bash
git add SensualRead/CLAUDE.md
git commit -m "docs: ADR-007 adaptive pagination and smooth transitions"
```
