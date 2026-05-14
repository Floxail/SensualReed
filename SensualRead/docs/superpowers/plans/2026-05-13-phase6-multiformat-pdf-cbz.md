# Phase 6 — Multi-Format: PDF & CBZ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add support for PDF and CBZ (comic/image archive) files so users can import and read them in SensualRead alongside existing EPUB/TXT.

**Architecture:** Two new renderers implement the existing `IRenderer` interface. `PdfRenderer` delegates visual rendering to the `react-native-pdf` native component — it manages page state and fires content-change callbacks but returns empty text (haptic engine stays idle for PDFs). `CbzRenderer` uses JSZip (already installed) to extract images from the ZIP archive and exposes each image as a page. `ReaderView` adds a `rendererType` check: `'text'` uses the existing text path, `'pdf'` renders a `<Pdf>` native component, `'image'` renders a single `<Image>` per page. The factory function and file picker are updated to accept `.pdf` and `.cbz`.

**Tech Stack:** react-native-pdf (new install), react-native-blob-util (peer dep of react-native-pdf), JSZip (already installed), react-native-fs (already installed), React Native Image component.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/reader/renderers/IRenderer.ts` | Modify | Add `getRendererType()` method |
| `src/components/reader/renderers/PdfRenderer.ts` | Create | PDF page state + native component integration |
| `src/components/reader/renderers/CbzRenderer.ts` | Create | CBZ ZIP extraction, image page sequence |
| `src/components/reader/renderers/index.ts` | Modify | Register new renderers in factory |
| `src/components/reader/ReaderView.tsx` | Modify | Conditional render: text / pdf / image paths |
| `src/screens/ReaderScreen.tsx` | Modify | File picker accepts .pdf and .cbz |
| `src/store/useLibraryStore.ts` | Modify | Add `'pdf' \| 'cbz'` to `fileType` union |

---

## Task 1: Install react-native-pdf and react-native-blob-util

**Files:**
- Modify: `android/app/build.gradle` (may need proguard rule)
- Modify: `android/app/src/main/AndroidManifest.xml` (already has INTERNET permission)

- [ ] **Step 1: Install packages**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npm install react-native-pdf react-native-blob-util
```

Expected output: both packages added to `node_modules` and `package.json`.

- [ ] **Step 2: Verify AndroidManifest has INTERNET permission**

Open `android/app/src/main/AndroidManifest.xml`. Confirm this line exists (it should from BLE setup):

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

If missing, add it after the other `<uses-permission>` lines.

- [ ] **Step 3: Verify TypeScript can resolve the module**

Run from `SensualRead/` directory:

```bash
npx tsc --noEmit 2>&1 | grep "react-native-pdf"
```

Expected: no errors about react-native-pdf. If `Cannot find module 'react-native-pdf'` appears, create a shim at `src/types/react-native-pdf.d.ts`:

```typescript
declare module 'react-native-pdf' {
  import React from 'react';
  import { ViewStyle } from 'react-native';

  export interface Source {
    uri?: string;
    base64?: string;
    cache?: boolean;
  }

  export interface PdfProps {
    source: Source;
    page?: number;
    scale?: number;
    minScale?: number;
    maxScale?: number;
    style?: ViewStyle;
    onLoadComplete?: (numberOfPages: number, filePath: string) => void;
    onPageChanged?: (page: number, numberOfPages: number) => void;
    onError?: (error: Error) => void;
    onPageSingleTap?: (page: number, x: number, y: number) => void;
    horizontal?: boolean;
    enablePaging?: boolean;
    fitPolicy?: number;
  }

  const Pdf: React.FC<PdfProps>;
  export default Pdf;
}
```

---

## Task 2: Extend IRenderer with `getRendererType()`

**Files:**
- Modify: `src/components/reader/renderers/IRenderer.ts`

- [ ] **Step 1: Add the method to the interface**

In `IRenderer.ts`, add after the `setCharsPerPage` method (line 113, before closing `}`):

```typescript
  /**
   * Returns the rendering strategy for this renderer.
   * 'text' = render PageContent.text (EPUB, TXT)
   * 'pdf'  = render using react-native-pdf native component
   * 'image' = render PageContent.images[0] as full-page image (CBZ)
   */
  getRendererType(): 'text' | 'pdf' | 'image';
```

- [ ] **Step 2: Add default implementation to EpubRenderer and TxtRenderer**

Open `src/components/reader/renderers/EpubRenderer.ts`. Add this method inside the class (at the end, before closing `}`):

```typescript
  getRendererType(): 'text' | 'pdf' | 'image' {
    return 'text';
  }
```

Open `src/components/reader/renderers/TxtRenderer.ts`. Add the same method:

```typescript
  getRendererType(): 'text' | 'pdf' | 'image' {
    return 'text';
  }
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: errors about `PdfRenderer` and `CbzRenderer` not yet having `getRendererType` — those come in the next tasks. No errors on EpubRenderer or TxtRenderer.

---

## Task 3: Create PdfRenderer

**Files:**
- Create: `src/components/reader/renderers/PdfRenderer.ts`

- [ ] **Step 1: Write PdfRenderer**

Create `src/components/reader/renderers/PdfRenderer.ts`:

```typescript
import { IRenderer, BookMetadata, PageContent, ContentChangeCallback } from './IRenderer';

/**
 * PdfRenderer — implements IRenderer for PDF files.
 *
 * Visual rendering is handled by the react-native-pdf <Pdf> component in
 * ReaderView; this class manages page state and metadata only.
 * getPageText() returns empty string — haptic engine stays idle for PDFs.
 */
export class PdfRenderer implements IRenderer {
  private _filePath: string | null = null;
  private _currentPage = 1;
  private _totalPages = 0;
  private _loaded = false;
  private _callbacks: ContentChangeCallback[] = [];

  canRender(filePath: string): boolean {
    return filePath.toLowerCase().endsWith('.pdf');
  }

  async load(filePath: string): Promise<void> {
    this._filePath = filePath;
    this._currentPage = 1;
    this._totalPages = 0; // will be set by onLoadComplete callback from <Pdf>
    this._loaded = true;
  }

  unload(): void {
    this._filePath = null;
    this._currentPage = 1;
    this._totalPages = 0;
    this._loaded = false;
    this._callbacks = [];
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  getMetadata(): BookMetadata | null {
    if (!this._filePath) return null;
    const fileName = this._filePath.split('/').pop() ?? 'Unknown';
    const title = fileName.replace(/\.pdf$/i, '');
    return {
      title,
      totalPages: this._totalPages,
      currentPage: this._currentPage,
    };
  }

  getCurrentContent(): PageContent | null {
    if (!this._loaded) return null;
    return { text: '', pageNumber: this._currentPage };
  }

  nextPage(): boolean {
    if (this._currentPage >= this._totalPages) return false;
    this._currentPage += 1;
    this._notifyChange();
    return true;
  }

  prevPage(): boolean {
    if (this._currentPage <= 1) return false;
    this._currentPage -= 1;
    this._notifyChange();
    return true;
  }

  goToPage(page: number): boolean {
    if (page < 1 || (this._totalPages > 0 && page > this._totalPages)) return false;
    this._currentPage = page;
    this._notifyChange();
    return true;
  }

  getCurrentPage(): number {
    return this._currentPage;
  }

  getTotalPages(): number {
    return this._totalPages;
  }

  onContentChange(callback: ContentChangeCallback): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }

  getSupportedExtensions(): string[] {
    return ['.pdf'];
  }

  getPageText(_pageNumber: number): string | null {
    return '';
  }

  setCharsPerPage(_chars: number): void {
    // No-op: PDFs have fixed visual layout
  }

  getRendererType(): 'text' | 'pdf' | 'image' {
    return 'pdf';
  }

  /** Called by ReaderView's <Pdf onLoadComplete> to set total page count */
  setTotalPages(total: number): void {
    this._totalPages = total;
    this._notifyChange();
  }

  /** Called by ReaderView's <Pdf onPageChanged> to sync page state */
  syncPage(page: number): void {
    this._currentPage = page;
    this._notifyChange();
  }

  /** File URI for the <Pdf source> prop */
  getFileUri(): string {
    return `file://${this._filePath}`;
  }

  private _notifyChange(): void {
    const content = this.getCurrentContent();
    if (content) {
      this._callbacks.forEach(cb => cb(content));
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | grep "PdfRenderer"
```

Expected: no errors on PdfRenderer.

---

## Task 4: Create CbzRenderer

**Files:**
- Create: `src/components/reader/renderers/CbzRenderer.ts`

CBZ files are ZIP archives containing image files (JPEG/PNG) named sequentially. Each image = one page.

- [ ] **Step 1: Write CbzRenderer**

Create `src/components/reader/renderers/CbzRenderer.ts`:

```typescript
import JSZip from 'jszip';
import RNFS from 'react-native-fs';
import { IRenderer, BookMetadata, PageContent, ContentChangeCallback } from './IRenderer';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export class CbzRenderer implements IRenderer {
  private _filePath: string | null = null;
  private _pages: string[] = []; // file:// URIs of extracted images
  private _currentPage = 1;
  private _loaded = false;
  private _callbacks: ContentChangeCallback[] = [];
  private _tempDir: string | null = null;

  canRender(filePath: string): boolean {
    const ext = filePath.toLowerCase();
    return ext.endsWith('.cbz') || ext.endsWith('.cbr');
  }

  async load(filePath: string): Promise<void> {
    this._filePath = filePath;
    this._pages = [];
    this._currentPage = 1;

    // Read ZIP binary
    const base64 = await RNFS.readFile(filePath, 'base64');
    const zip = await JSZip.loadAsync(base64, { base64: true });

    // Create temp directory for extracted images
    const timestamp = Date.now();
    const tempDir = `${RNFS.CachesDirectoryPath}/cbz_${timestamp}`;
    await RNFS.mkdir(tempDir);
    this._tempDir = tempDir;

    // Collect image entries, sort by name for reading order
    const imageEntries: Array<{ name: string; file: JSZip.JSZipObject }> = [];
    zip.forEach((relativePath, file) => {
      if (!file.dir) {
        const lower = relativePath.toLowerCase();
        if (IMAGE_EXTS.some(ext => lower.endsWith(ext))) {
          imageEntries.push({ name: relativePath, file });
        }
      }
    });
    imageEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    // Extract images to temp dir
    for (const entry of imageEntries) {
      const base64Data = await entry.file.async('base64');
      const safeName = entry.name.replace(/[\/\\:*?"<>|]/g, '_');
      const destPath = `${tempDir}/${safeName}`;
      await RNFS.writeFile(destPath, base64Data, 'base64');
      this._pages.push(`file://${destPath}`);
    }

    if (this._pages.length === 0) {
      throw new Error('No images found in CBZ archive');
    }

    this._loaded = true;
  }

  unload(): void {
    // Clean up temp files
    if (this._tempDir) {
      RNFS.unlink(this._tempDir).catch(() => {});
      this._tempDir = null;
    }
    this._filePath = null;
    this._pages = [];
    this._currentPage = 1;
    this._loaded = false;
    this._callbacks = [];
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  getMetadata(): BookMetadata | null {
    if (!this._filePath) return null;
    const fileName = this._filePath.split('/').pop() ?? 'Unknown';
    const title = fileName.replace(/\.(cbz|cbr)$/i, '');
    return {
      title,
      totalPages: this._pages.length,
      currentPage: this._currentPage,
    };
  }

  getCurrentContent(): PageContent | null {
    if (!this._loaded || this._pages.length === 0) return null;
    const imageUri = this._pages[this._currentPage - 1];
    return {
      text: '',
      images: [imageUri],
      pageNumber: this._currentPage,
    };
  }

  nextPage(): boolean {
    if (this._currentPage >= this._pages.length) return false;
    this._currentPage += 1;
    this._notifyChange();
    return true;
  }

  prevPage(): boolean {
    if (this._currentPage <= 1) return false;
    this._currentPage -= 1;
    this._notifyChange();
    return true;
  }

  goToPage(page: number): boolean {
    if (page < 1 || page > this._pages.length) return false;
    this._currentPage = page;
    this._notifyChange();
    return true;
  }

  getCurrentPage(): number {
    return this._currentPage;
  }

  getTotalPages(): number {
    return this._pages.length;
  }

  onContentChange(callback: ContentChangeCallback): () => void {
    this._callbacks.push(callback);
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }

  getSupportedExtensions(): string[] {
    return ['.cbz', '.cbr'];
  }

  getPageText(_pageNumber: number): string | null {
    return '';
  }

  setCharsPerPage(_chars: number): void {
    // No-op: CBZ has fixed image layout
  }

  getRendererType(): 'text' | 'pdf' | 'image' {
    return 'image';
  }

  private _notifyChange(): void {
    const content = this.getCurrentContent();
    if (content) {
      this._callbacks.forEach(cb => cb(content));
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "CbzRenderer"
```

Expected: no errors.

---

## Task 5: Update Factory and Library Store

**Files:**
- Modify: `src/components/reader/renderers/index.ts`
- Modify: `src/store/useLibraryStore.ts`

- [ ] **Step 1: Register new renderers in factory**

Open `src/components/reader/renderers/index.ts`. Replace the entire file content:

```typescript
export * from './IRenderer';
export * from './EpubRenderer';
export * from './TxtRenderer';
export * from './PdfRenderer';
export * from './CbzRenderer';

import { IRenderer } from './IRenderer';
import { EpubRenderer } from './EpubRenderer';
import { TxtRenderer } from './TxtRenderer';
import { PdfRenderer } from './PdfRenderer';
import { CbzRenderer } from './CbzRenderer';

export function getRendererForFile(filePath: string): IRenderer | null {
  const renderers: IRenderer[] = [
    new EpubRenderer(),
    new TxtRenderer(),
    new PdfRenderer(),
    new CbzRenderer(),
  ];

  for (const renderer of renderers) {
    if (renderer.canRender(filePath)) {
      return renderer;
    }
  }

  return null;
}

export function getSupportedExtensions(): string[] {
  return ['.epub', '.txt', '.pdf', '.cbz', '.cbr'];
}
```

- [ ] **Step 2: Add pdf/cbz to fileType in LibraryBook**

Open `src/store/useLibraryStore.ts`. Find line 22:

```typescript
  fileType: 'epub' | 'txt';
```

Change to:

```typescript
  fileType: 'epub' | 'txt' | 'pdf' | 'cbz';
```

Also update the `addBook` signature if it constrains `fileType` — search for `Omit<LibraryBook` and verify the type flows through correctly (it uses `Omit`, so the field is included automatically from the interface).

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no new errors.

---

## Task 6: Update ReaderView for PDF and Image rendering

**Files:**
- Modify: `src/components/reader/ReaderView.tsx`

The existing ReaderView renders text only. We add conditional paths:
- `rendererType === 'pdf'` → `<Pdf>` component (react-native-pdf)
- `rendererType === 'image'` → `<Image>` component  
- `rendererType === 'text'` → existing text path (unchanged)

- [ ] **Step 1: Add import for react-native-pdf and Image**

At the top of `src/components/reader/ReaderView.tsx`, after the existing React Native imports, add:

```typescript
import { Image } from 'react-native';
import Pdf, { PdfProps } from 'react-native-pdf';
import { PdfRenderer } from './renderers/PdfRenderer';
```

- [ ] **Step 2: Add rendererType state**

In `ReaderView`, after the `pageBuffer` state (around line 98), add:

```typescript
const [rendererType, setRendererType] = useState<'text' | 'pdf' | 'image'>('text');
```

- [ ] **Step 3: Set rendererType when file loads**

In the `loadFile` function, after `rendererRef.current = renderer;` (around line 169), add:

```typescript
setRendererType(renderer.getRendererType());
```

- [ ] **Step 4: Add PDF callbacks**

In the JSX return, replace the `<View style={styles.contentClip}>` block with:

```tsx
{/* Content area */}
<View style={styles.contentClip}>
  {rendererType === 'pdf' ? (
    /* PDF rendering via native component */
    <Pdf
      source={{ uri: (rendererRef.current as PdfRenderer)?.getFileUri(), cache: true }}
      page={state.current}
      style={styles.pdfView}
      fitPolicy={0}
      enablePaging={true}
      horizontal={true}
      onLoadComplete={(numberOfPages) => {
        (rendererRef.current as PdfRenderer)?.setTotalPages(numberOfPages);
      }}
      onPageChanged={(page) => {
        (rendererRef.current as PdfRenderer)?.syncPage(page);
      }}
      onError={(error) => {
        setState(prev => ({ ...prev, error: error.message }));
      }}
    />
  ) : rendererType === 'image' ? (
    /* CBZ image rendering */
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleTap}
      style={styles.contentTouchable}
    >
      <Image
        source={{ uri: pageBuffer.currText || undefined }}
        style={styles.pageImage}
        resizeMode="contain"
      />
    </TouchableOpacity>
  ) : (
    /* Text rendering (EPUB / TXT) — unchanged */
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
          <PageText
            text={pageBuffer.currText}
            color={colors.readerText}
            fontSize={settings.fontSize}
            lineHeight={settings.lineHeight}
            fontFamily={settings.fontFamily}
          />
        </ScrollView>
      </TouchableOpacity>
    </Animated.View>
  )}
</View>
```

**Note:** For CBZ the `pageBuffer.currText` is repurposed — the buffer holds the image URI in `currText` field for the image path (since CBZ pages have `images[0]` not text). Update `updateBuffer` to set `currText` to `content.images?.[0] ?? ''` when `rendererType === 'image'`.

Actually, modify `updateBuffer` to handle image renderers. After the existing `setPageBuffer` call in `updateBuffer`, it should use the images array. Replace the `setPageBuffer` call in `updateBuffer`:

```typescript
const currContent = renderer.getCurrentContent();
const prevContent = renderer.getPageText ? null : null; // only for text

if (renderer.getRendererType() === 'image') {
  const currImg = currContent?.images?.[0] ?? '';
  setPageBuffer({
    prevText: '',
    currText: currImg,
    nextText: '',
  });
  onNextPageText?.('');
} else {
  const nextText = renderer.getPageText(cp + 1) ?? '';
  setPageBuffer({
    prevText: renderer.getPageText(cp - 1) ?? '',
    currText: renderer.getPageText(cp) ?? '',
    nextText,
  });
  onNextPageText?.(nextText);
}
```

- [ ] **Step 5: Add new styles**

In the `StyleSheet.create({...})` at the bottom of ReaderView.tsx, add:

```typescript
  pdfView: {
    flex: 1,
    backgroundColor: '#000',
  },
  pageImage: {
    flex: 1,
    width: '100%',
  },
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Task 7: Update ReaderScreen File Picker

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: Find the file picker call**

In `ReaderScreen.tsx`, search for the `pick(` call (from `@react-native-documents/picker`). It has a `type` or `allowedFileTypes` array. The current call looks like:

```typescript
const result = await pick({
  allowMultiSelection: false,
  type: ['application/epub+zip', 'text/plain'],
});
```

- [ ] **Step 2: Add PDF and CBZ MIME types**

Update the `type` array:

```typescript
const result = await pick({
  allowMultiSelection: false,
  type: [
    'application/epub+zip',
    'text/plain',
    'application/pdf',
    'application/x-cbz',
    'application/x-cbr',
    'application/zip',          // some file managers report CBZ as zip
    'application/octet-stream', // fallback for unrecognized types
  ],
});
```

- [ ] **Step 3: Update fileType detection in addBook call**

Find where `fileType` is determined (probably `filePath.endsWith('.epub') ? 'epub' : 'txt'`). Expand it:

```typescript
const getFileType = (path: string): 'epub' | 'txt' | 'pdf' | 'cbz' => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.cbz') || lower.endsWith('.cbr')) return 'cbz';
  return 'txt';
};
```

Use `getFileType(localPath)` when calling `addBook(...)`.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Self-Review Checklist

- [x] **Spec coverage**: PDF rendering ✓, CBZ rendering ✓, file picker update ✓, library fileType ✓
- [x] **No placeholders**: All code blocks are complete
- [x] **Type consistency**: `getRendererType()` returns same union `'text' | 'pdf' | 'image'` throughout
- [x] **CbzRenderer.unlink**: temp files cleaned up on `unload()` ✓
- [x] **PdfRenderer.setTotalPages**: called from `<Pdf onLoadComplete>` ✓
- [x] **Haptic stays idle for PDF/CBZ**: `getPageText()` returns `''`, TriggerEngine gets empty string ✓
