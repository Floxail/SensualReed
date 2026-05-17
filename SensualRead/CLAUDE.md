# CLAUDE.md - SensualRead Project Memory

> **RULE**: Always read this file at the start of each session. Always update it at the end.
> **VERSIONING RULE**: Current version = **v0.34**. Each new APK build → increment by 0.01 AND update `"Version X.XX"` string in `src/screens/SettingsScreen.tsx` (ABOUT section). Stop only when user says "c'est la v1".

---

## Project Overview
SensualRead is a mobile e-reader that triggers Lovense toy vibrations based on erotic text analysis. 3-layer decoupled architecture: Reader Engine → Trigger System → Haptic Manager.

---

## Current Status

### Completed Phases
- [x] **Phase 1** — Project scaffolding, folder structure, interface stubs
- [x] **Phase 2** — Haptic Manager: BLE, MockHapticService, LiveHapticService, DeviceTestScreen
- [x] **Phase 3** — Reader Engine: TxtRenderer, EpubRenderer, ReaderView, ReaderScreen
- [x] **Phase 4** — Library & Polish: persistence, EPUB formatting, navigation, reader personalization, adaptive pagination, smooth transitions, prefetch, safe areas, zero-lag intensity
- [x] **Phase 5** — Library covers + Bulk import: EpubCoverExtractor, BulkImportService, cover display in HomeScreen, scanner modal

### Bug Fixes Applied
- [x] **v0.16** — Scroll blocked in reader: replaced `TouchableOpacity` wrapper around `ScrollView` with plain `View` + two absolute-positioned tap overlays (left/right 25% zones)
- [x] **v0.17** — Blank pages after reinstall: race condition in `ReaderView` where `onLayout` fired before renderer loaded → `recalcCharsPerPage` returned early → default `charsPerPage=1500` used forever. Fixed by calling `recalcCharsPerPage()` in `loadFile` after renderer loads and listener subscribed.

### Phase 5.5: Ultra-Stability + Refonte Visuelle (COMPLETE — v0.18 → v0.19)
- [x] **Snapshot System** — `charOffset` (char position at page start) stored alongside `currentPage` in `LibraryBook`. Renderers expose `getCurrentCharOffset()` / `goToCharOffset(offset)`. On resume, precise text position used instead of page number (immune to `charsPerPage` changes from font changes). `pageInfo` state in `ReaderScreen` now includes `charOffset` so AppState background saves are also offset-accurate.
- [x] **Ready-Gate UI** — `ReaderView` shows `ActivityIndicator` overlay until `onLayout` fires with valid dimensions (`dimsReady` state). 500ms safety timeout fallback. Gate resets on new book load (`setDimsReady(false)` in filePath effect). User never sees flash of mis-paginated text.
- [x] **AppState Persistence** — `ReaderScreen` subscribes to `AppState.addEventListener('change')`. When app goes `background` or `inactive`, `updateProgress` is called immediately with latest page + charOffset. Ensures position is saved even if user hard-closes app without turning a page.
- [x] **Adaptive Buffering** — `TriggerEngine.processContent` fallback path (no cache hit) now deferred via `setTimeout(..., 0)`. Text truncated to first 4000 chars before analysis in all paths. Zero-lag cache-hit path untouched (still synchronous). Analysis never blocks the main thread during page-turn animation.
- [x] **Grid Library (v0.19)** — `HomeScreen` redesigned with 3-column `flexWrap` grid. `BookGridCard` shows portrait cover, format badge (EPUB/TXT in color), progress % badge, progress bar overlay, elevation:4 shadow. Empty state with inline import button (no deps on EmptyState/PremiumButton).
- [x] **Jitter Protection (v0.19)** — Tap zones in `ReaderView` replaced with plain `View` + `onTouchStart/Move/End` handlers. Page turn only fires if movement < 10px horizontal AND < 14px vertical. Eliminates false page turns during scroll.
- [x] **BottomSheet Reader Settings (v0.19)** — `ReaderSettingsSheet` component: slides in from bottom via `Animated.timing`, backdrop dismiss. Controls: font size, line height, font family, margins (small/medium/large), brightness dim overlay (4 levels: 0/0.15/0.35/0.55). Triggered by "Aa" button in reader header.
- [x] **Brightness Dim Overlay (v0.19)** — `readerDimOverlay` (0–0.7) stored in `AppSettings`. `ReaderView` renders absolute-fill black `View` with that opacity, `pointerEvents="none"`.
- [x] **Adaptive Margins (v0.19)** — `readerMargins` ('small'/'medium'/'large') maps to 8/16/28px reader padding. Applied dynamically in `ReaderView` scrollContent.
- [x] **IRenderer Binary Prep (v0.19)** — `PageContent.binaryData?: Uint8Array` added. `IRenderer.getSourceType()` method added. TxtRenderer + EpubRenderer return `'text'`. Phase 6 PDF/CBZ renderers override to `'binary'`.
- [x] **services/parsers Architecture (v0.19)** — `IParser` interface + `TxtParser` + `EpubParser` stubs created in `src/services/parsers/`. Separates file I/O from renderer pagination logic (Book Story–style data/parser/ pattern). Phase 6 will wire renderers to parsers.

### Phase 8.5: Continuous Scroll Reader — book-story inspired (COMPLETE — v0.31)
- [x] **Removed pagination** — `charsPerPage` / page buffer / slide animation eliminated
- [x] **FlatList of paragraphs** — `getFullText()` → `split(/\n\n+/)` → one `ParagraphText` item per paragraph
- [x] **Zero blank pages** — no page sizing math, Compose-style lazy rendering
- [x] **Tap zones** — left tap = scroll ↑ by 90% of screen height, right tap = scroll ↓
- [x] **Stable viewable handler** — `onViewableItemsChanged` uses ref pattern; updates TriggerEngine with visible text + preloads next 8 paragraphs
- [x] **Position restore** — `charOffset` → binary search on paragraph `charOffset` array → `scrollToOffset` after 150ms
- [x] **Progress** — shows `X%` instead of `X/Y pages`; `onPageChange` fires with `(paragraphIndex, totalParagraphs, charOffset)`
- [x] `IRenderer.getFullText()` added to interface; `EpubRenderer` + `TxtRenderer` implement it

### Phase 8: On-Device AI Contextual Scoring (COMPLETE — v0.30)
- [x] **CamemBERT ONNX INT8** — `lovense_camembert.onnx` (~106 MB) in `android/app/src/main/assets/models/`
- [x] **OnDeviceAIAnalyzer** — Implements `ITriggerEngine`. `initialize()` copies model from assets on first launch. `preloadAsync(text)` runs ONNX inference async. `analyze()` returns cached score synchronously (zero lag).
- [x] **Hot-Swap Fallback** — `TriggerEngine` starts with `KeywordAnalyzer`, calls `_initAI()` on construction. On AI ready → swaps `this.analyzer` to `OnDeviceAIAnalyzer` seamlessly.
- [x] **Triple-Buffer Integration** — `TriggerEngine.preloadContent()` now calls `aiAnalyzer.preloadAsync(text)` for page N+1, then caches `analyze()` result. AI inference never blocks main thread.
- [x] **CamembertTokenizer** — Pure JS BPE tokenizer loading `tokenizer.json` from DocumentDirectory. Metaspace pre-tokenization, ▁ prefix, pad to MAX_LEN=128.
- [x] **AI Badge** — `ReaderScreen` shows `✦ AI` label when AI model hot-swaps in (replaces keyword display).
- [x] **Startup Sequence**: (1) App opens → KeywordAnalyzer active; (2) ONNX session created async (~5s first launch, instant after); (3) Hot-swap fires silently; (4) All subsequent page turns use AI scoring.

### Planned Phases (plans written, not yet executed)
- [ ] **Phase 6** — PDF + CBZ/CBR renderer support → `docs/superpowers/plans/2026-05-13-phase6-multiformat-pdf-cbz.md`
- [ ] **Phase 7** — OPDS catalog client (download books from catalogs) → `docs/superpowers/plans/2026-05-13-phase7-opds-client.md`

**Current phase**: Phase 8 On-Device AI COMPLETE → **Phase 6 READY**
**Current APK**: `SensualRead-v0.34.apk` (to build)

---

## Tech Stack (INSTALLED)

| Layer | Technology | Version | Status |
|-------|------------|---------|--------|
| Framework | React Native CLI | 0.83.1 | ✓ |
| Language | TypeScript | 5.x | ✓ |
| BLE | react-native-ble-plx | 3.x | ✓ |
| State | Zustand | 4.x | ✓ |
| Navigation | React Navigation | 6.x | ✓ |
| Storage | AsyncStorage | latest | ✓ |
| FS | react-native-fs | latest | ✓ |
| ZIP | jszip | latest | ✓ |
| File Picker | @react-native-documents/picker | ^12.0.0 | ✓ |
| Buffer | buffer | latest | ✓ |

> Using `@react-native-documents/picker` (not `react-native-document-picker`) for RN 0.83 compat.

**Target**: Android (MVP) → iOS (future)
**Formats**: EPUB/TXT (done) → PDF, CBZ, CBR (Phase 6)

---

## Architecture Decision Records (ADR)

### ADR-001: React Native CLI over Expo/Flutter — VALIDATED ✓

### ADR-002: 3-Layer Decoupled Architecture — VALIDATED ✓
```
Reader Engine → (text stream) → Trigger System → (score 0-100) → Haptic Manager → Lovense
```

### ADR-003: Haptic Service Strategy Pattern — IMPLEMENTED ✓
- `MockHapticService`: console logging for dev
- `LiveHapticService`: real BLE, Nordic UART protocol

### ADR-004: Renderer Strategy Pattern — IMPLEMENTED ✓
- `TxtRenderer`: RNFS read + smart paragraph/sentence pagination
- `EpubRenderer`: JSZip + OPF spine + HTML→text + metadata

### ADR-005: Intensity Score Mapping — IMPLEMENTED ✓
```
0-10   → Stop    (Vibrate:0)
11-40  → Low     (Vibrate:5)
41-80  → Medium  (Vibrate:15)
81-100 → High    (Vibrate:20 + Rotate:5)
```

### ADR-006: Lovense Design System — IMPLEMENTED ✓
```
Light: primary=#FF4D7D, bg=#FFFFFF, surface=#FAFAFA, readerBg=#FFFBF5
Dark:  primary=#FF80A0, bg=#121212, surface=#1E1E1E, readerBg=#121212
Pink scale: #FFF0F5 → #FF4D7D → #800031
```

### ADR-007: Continuous Scroll Reader — UPDATED v0.31 ✓
```
Architecture: FlatList of paragraphs (no pages, no charsPerPage)
Paragraph split: fullText.split(/\n\n+/) → ParagraphItem{id, text, charOffset}
Tap zones: left 25% = scroll up 90% height, right 25% = scroll down 90% height
Position: charOffset → paragraph binary search → initialScrollIndex (number|null) on FlatList mount; onScrollToIndexFailed Promise(100ms).then(scrollToIndex) fallback
TriggerEngine: onViewableItemsChanged → processContent(visible paragraphs), preloadContent(next 8)
Progress: paragraphIndex / totalParagraphs → % display
getItemLayout: estimatedHeight = fontSize × lineHeight × 4 (rough, for FlatList optimization)
```

### ADR-008: Library Persistence — IMPLEMENTED ✓
```
Store: useLibraryStore (Zustand + AsyncStorage)
Book: id, title, author, filePath, coverImagePath, currentPage, totalPages, addedAt, lastReadAt
Progress: saved on every page turn
Covers: EpubCoverExtractor extracts from EPUB manifest → saves to library folder
```

### ADR-010: Snapshot System — IMPLEMENTED ✓
```
charOffset stored in LibraryBook alongside currentPage
IRenderer.getCurrentCharOffset() → raw startIndex of page in full text
IRenderer.goToCharOffset(offset) → linear scan of pageOffsets[], calls goToPage()
TxtRenderer/EpubRenderer: pageOffsets[] built during paginateContent(), reset on setCharsPerPage()
Resume priority: charOffset > 0 → goToCharOffset, else → goToPage(initialPage)
AsyncStorage schema migration: charOffset ?? book.charOffset ?? 0 (no undefined risk)
```

### ADR-009: Bulk Import — IMPLEMENTED ✓
```
BulkImportService: scans 7 default dirs (Downloads, Documents, Books, etc.) recursively depth=2
Filters: .epub, .txt files only
UI: scanner modal in HomeScreen with checkbox list + Annuler/Importer buttons
```

---

## Folder Structure (Phase 5 Complete)

```
SensualRead/
├── src/
│   ├── components/
│   │   ├── reader/
│   │   │   ├── ReaderView.tsx           # Main reader component
│   │   │   ├── ReaderSettingsSheet.tsx  # BottomSheet: font/lh/margins/dim (v0.19)
│   │   │   ├── renderers/
│   │   │   │   ├── IRenderer.ts
│   │   │   │   ├── TxtRenderer.ts       # ✓ plain text + pagination
│   │   │   │   ├── EpubRenderer.ts      # ✓ JSZip + OPF + HTML→text
│   │   │   │   └── index.ts             # factory
│   │   │   └── index.ts
│   │   └── ErrorBoundary.tsx
│   │
│   ├── engines/analysis/
│   │   ├── ITriggerEngine.ts
│   │   ├── KeywordAnalyzer.ts           # regex analysis
│   │   ├── TriggerEngine.ts             # preloadContent + zero-lag
│   │   └── keywords.json               # 107 FR/EN keywords
│   │
│   ├── services/
│   │   ├── bluetooth/
│   │   │   ├── IHapticService.ts
│   │   │   ├── MockHapticService.ts
│   │   │   ├── LiveHapticService.ts     # ✓ BLE + persistent connection
│   │   │   └── LovenseProtocol.ts
│   │   └── library/
│   │       ├── EpubCoverExtractor.ts    # ✓ extracts cover from EPUB
│   │       ├── BulkImportService.ts     # ✓ scans device folders
│   │       ├── index.ts
│   │       └── (see services/parsers/ below)
│   │   └── parsers/                     # Phase 6 prep — file I/O decoupled from renderers
│   │       ├── IParser.ts               # Interface: parse() → ParsedBook
│   │       ├── TxtParser.ts             # .txt paragraph extraction
│   │       ├── EpubParser.ts            # .epub stub (Phase 6)
│   │       └── index.ts
│   │
│   ├── store/
│   │   ├── useAppStore.ts               # theme + hapticService global
│   │   └── useLibraryStore.ts           # library persistence (AsyncStorage)
│   │
│   ├── theme/
│   │   ├── colors.ts
│   │   └── index.ts                     # useColors, useTheme, useThemeToggle
│   │
│   ├── screens/
│   │   ├── HomeScreen.tsx               # ✓ library + covers + bulk import modal
│   │   ├── ReaderScreen.tsx             # ✓ reader + TriggerEngine + cover extraction
│   │   ├── SettingsScreen.tsx           # ✓ appearance, haptics, analysis, reader prefs
│   │   └── DeviceTestScreen.tsx         # ✓ BLE testing
│   │
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   │
│   ├── types/index.ts
│   └── utils/index.ts
│
├── docs/superpowers/
│   ├── plans/
│   │   ├── 2026-05-13-phase6-multiformat-pdf-cbz.md    # PDF + CBZ renderers
│   │   ├── 2026-05-13-phase7-opds-client.md            # OPDS catalog client
│   │   └── 2026-05-13-phase8-lovense-profiles-ai-analysis.md  # profiles + smart analysis
│   └── specs/
│       └── (specs written during brainstorming sessions)
│
├── android/
│   └── app/src/main/AndroidManifest.xml  # ✓ BLE + storage permissions
│
├── App.tsx
├── CLAUDE.md
└── package.json
```

---

## Known Pre-existing TypeScript Errors (ignore in grep/build)

These exist in the codebase but don't block builds:
- `Typography.h4` in `HomeScreen.tsx` (key missing from Typography)
- `DeviceInfo` / `AnalysisResult` in `types/index.ts` (unused stubs)

Filter command: `grep -v "HomeScreen\|types/index"`

---

## Lovense Protocol
```
Service:  6e400001-b5a3-f393-e0a9-e50e24dcca9e
TX (write): 6e400002-b5a3-f393-e0a9-e50e24dcca9e
RX (notify): 6e400003-b5a3-f393-e0a9-e50e24dcca9e

Commands:  Vibrate:N;  Rotate:N;  Vibrate:N;Rotate:M;  Battery;   (N = 0-20)
```

---

## Build Commands
```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead

# Bundle JS (required before assembleDebug for standalone APK)
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res

# Build APK
cd android && ./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk
# Copy:   cp ... C:\Users\Floxa\Downloads\BookLovense\SensualRead-vX.XX.apk

# Dev (requires connected device)
npx react-native start --reset-cache
npx react-native run-android
```

---

## Session History (recent → old)

### 2026-05-17 — v0.34 — Refactor Reading Position Restoration
- **Refinement of v0.33**: `initialScrollIndex` state typed `number | null` instead of `number`
- **Reset**: `setInitialScrollIndex(null)` at `loadFile` start (null = no scroll, cleaner than 0)
- **Set**: `setInitialScrollIndex(startIndex > 0 ? startIndex : null)` — null for index 0 (top of book)
- **FlatList prop**: `initialScrollIndex={initialScrollIndex ?? undefined}` — null → undefined → no scroll applied
- **`onScrollToIndexFailed`**: replaced two-step `scrollToOffset + setTimeout(scrollToIndex, 200)` with `new Promise(resolve => setTimeout(resolve, 100)).then(() => scrollToIndex)` — single retry, no intermediate pixel offset guess
- **Files**: `ReaderView.tsx`, `SettingsScreen.tsx` (version bump), `CLAUDE.md`

### 2026-05-17 — v0.33 — Fix Position Restoration
- **Bug**: resuming a large book re-opened from the beginning — `estimatedParaHeight × targetIndex` scrolled to wrong pixel, FlatList snapped back to top because items at that offset weren't rendered yet
- **Root cause**: `pendingScrollIndexRef` + 150ms `scrollToOffset` — items outside the render window cause FlatList to reset scroll to 0
- **Fix**: replaced with `initialScrollIndex` state set during `loadFile`, passed as FlatList prop — FlatList handles this natively at mount before any JS paint
- **`onScrollToIndexFailed`**: safety handler — scrolls by `averageItemLength × index`, then retries `scrollToIndex` after 200ms for high-index cases
- **Reset guard**: `setInitialScrollIndex(0)` at `loadFile` start prevents stale index when reopening a book at position 0
- **Files**: `ReaderView.tsx`, `SettingsScreen.tsx` (version bump), `CLAUDE.md`

### 2026-05-17 — v0.32 — Reading Progress Persistence UI
- **Already implemented**: `useLibraryStore` had `currentPage`, `charOffset`, `lastReadAt`, `updateProgress()`, Zustand persist with AsyncStorage — fully functional since v0.18
- **Already implemented**: `ReaderScreen.handlePageChange` calls `updateProgress()` on every scroll; AppState listener saves on background
- **Already implemented**: book load in ReaderScreen restores `initialPage` + `initialCharOffset` from store
- **Added**: `BookGridCard` footer now shows "▶ Lire" pill (surface) or "↩ Reprendre" pill (primary color) based on `progress > 0`
- **Already present**: progress % badge and progress bar overlay on covers (since v0.19 grid)

### 2026-05-15 — v0.31 — Phase 8.5: Continuous Scroll Reader (book-story inspired)
- **Motivation**: blank pages on BlueStacks (bad charsPerPage calc) + visible slide animation
- **ReaderView.tsx**: full rewrite — FlatList of paragraphs, no pagination, no slide animation
- **IRenderer.ts**: added `getFullText(): string` to interface
- **EpubRenderer.ts**: implemented `getFullText()` → chapters joined with `\n\n`
- **TxtRenderer.ts**: already had `getFullText()`, now part of interface
- **Tap behavior**: left tap = scroll ↑ 90% screen, right tap = scroll ↓ 90% screen
- **Position restore**: `charOffset` → paragraph search → `scrollToOffset` (150ms delay)
- **Progress**: shows percentage instead of page X/Y

### 2026-05-15 — v0.30 — Phase 8: On-Device AI Contextual Scoring
- **OnDeviceAIAnalyzer**: `src/services/ai/OnDeviceAIAnalyzer.ts` — implements `ITriggerEngine`, copies model from `assets/models/` on first launch, `preloadAsync()` runs ONNX inference, `analyze()` returns cached score synchronously
- **CamembertTokenizer**: `fromPath()` static method added for post-copy asset loading
- **TriggerEngine hot-swap**: `_initAI()` runs on construction, swaps `this.analyzer` from `KeywordAnalyzer` → `OnDeviceAIAnalyzer` when ONNX session ready; `onAiModelReady()` callback for UI
- **Triple-Buffer AI preload**: `preloadContent()` calls `aiAnalyzer.preloadAsync(text)` then caches sync result — AI inference on page N+1 while user reads page N
- **ReaderScreen**: simplified (AIScorer wiring removed), `✦ AI` badge appears on hot-swap, single `TriggerEngine.onIntensityChange` drives all UI
- **Assets**: `android/app/src/main/assets/models/lovense_camembert.onnx` + `tokenizer.json`
- **Build fix**: patched `onnxruntime-react-native` build.gradle `VersionNumber` → Groovy tokenize (incompatible with Gradle 9+)
- **Tools**: `export_tokenizer.py` extracts `tokenizer.json` from HF cache

### 2026-05-14 — v0.19 — Phase 5.5 Visual Premium + Phase 6 Prep
- **HomeScreen Grid**: 3-col flexWrap grid, BookGridCard with cover fill, format badge, progress overlay, elevation:4
- **Empty State**: inline (no PremiumButton dep), import button CTA
- **Jitter Protection**: View + touch tracking (dx>10 || dy>14 = scroll, not tap)
- **BottomSheet**: `ReaderSettingsSheet` — Animated slide-in, font size/lh/family/margins/dim
- **Brightness**: `readerDimOverlay` in AppSettings → absolute black overlay with pointer-events:none
- **Margins**: `readerMargins` small/medium/large → 8/16/28px reader padding
- **IRenderer Binary Prep**: `binaryData?` in PageContent, `getSourceType()` on IRenderer
- **services/parsers**: IParser + TxtParser + EpubParser stubs for Phase 6 decoupling
- **Files**: HomeScreen.tsx, ReaderView.tsx, ReaderScreen.tsx, ReaderSettingsSheet.tsx (new), IRenderer.ts, TxtRenderer.ts, EpubRenderer.ts, types/index.ts, useAppStore.ts, SettingsScreen.tsx, services/parsers/

### 2026-05-14 — v0.18 — Phase 5.5 Ultra-Stability
- **Snapshot System**: `charOffset` in `LibraryBook`, `pageOffsets[]` in TxtRenderer/EpubRenderer, `goToCharOffset()` API on IRenderer; `pageInfo` in ReaderScreen now tracks charOffset; AppState save includes charOffset
- **Ready-Gate UI**: `dimsReady` state in ReaderView + absolute-fill `ActivityIndicator` overlay + 500ms safety timeout + reset on filePath change
- **AppState Persistence**: `AppState.addEventListener` in ReaderScreen saves progress on background/inactive
- **Adaptive Buffering**: TriggerEngine fallback analysis deferred via `setTimeout(0)`, 4000-char truncation in all analysis paths
- **Files**: TriggerEngine.ts, IRenderer.ts, TxtRenderer.ts, EpubRenderer.ts, useLibraryStore.ts, ReaderView.tsx, ReaderScreen.tsx, SettingsScreen.tsx

### 2026-05-14 — v0.17 — Blank pages race condition fix
- **Bug**: after reinstall, ReaderView showed blank/clipped pages on resume
- **Root cause**: `onLayout` fires before renderer loads → `recalcCharsPerPage` skips (renderer not ready) → renderer loads with default `charsPerPage=1500` → never corrected
- **Fix**: added `recalcCharsPerPage()` call in `loadFile` after `rendererRef.current = renderer` + listener subscribed
- **Files**: `src/components/reader/ReaderView.tsx`, `src/screens/SettingsScreen.tsx` (version bump)

### 2026-05-13 — v0.16 — Scroll fix + Phase 5 (covers + bulk import)
- **Scroll bug**: `TouchableOpacity` wrapping `ScrollView` blocked Android scroll gestures
- **Fix**: replaced wrapper with plain `View` + two absolute `TouchableOpacity` overlays (left/right 25% = tap zones only)
- **Phase 5 features**:
  - `EpubCoverExtractor`: 3-strategy cover extraction (meta tag → first manifest image), saves to library folder
  - `BulkImportService`: scans 7 default dirs recursively (depth=2), deduplicates by path
  - `HomeScreen`: cover images on book cards, scanner modal with checkbox select + bulk import
  - `ReaderScreen`: triggers cover extraction on new EPUB import
  - `useLibraryStore`: added `coverImagePath`, `updateCover` action

### 2026-05-12 — v0.12-0.15 — Phase 4 (Library, Adaptive Pagination, Zero-Lag)
- Library persistence via AsyncStorage (`useLibraryStore`)
- Adaptive pagination: `onLayout` → `charsPerPage` from viewport dims
- Triple-buffer prefetch, React.memo PageText
- 180ms slide transition (native driver)
- Zero-lag intensity: `preloadContent` + Option A cache
- BLE persistent connection (store-level service, no disconnect on screen nav)
- Safe areas on all screens, font size/family presets in Settings
- French keyword dict (107 mots)
