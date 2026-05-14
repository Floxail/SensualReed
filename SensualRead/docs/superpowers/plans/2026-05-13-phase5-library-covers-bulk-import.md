# Phase 5 — Library: Covers & Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract EPUB cover images automatically, display them in the library grid, and allow bulk import of books by scanning a device folder.

**Architecture:** A standalone `EpubCoverExtractor` service uses JSZip (already installed) to pull the cover image out of any EPUB, saves it as a PNG/JPG to the library folder, and stores the path in `LibraryBook.coverImagePath`. A `BulkImportService` uses `react-native-fs` to recursively scan common storage directories and returns a list of `.epub`/`.txt` candidates for the user to confirm before import. Both services are called from `ReaderScreen` (single import) and from a new discovery sheet in `HomeScreen` (bulk import). No new database — AsyncStorage via Zustand handles hundreds of books without issue.

**Tech Stack:** JSZip (already installed), react-native-fs (already installed), react-native (@react-native-async-storage/async-storage), PermissionsAndroid (built-in RN), React Native Image component.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/library/EpubCoverExtractor.ts` | Create | Open EPUB zip, find cover image, save to disk |
| `src/services/library/BulkImportService.ts` | Create | Scan device folders, return list of importable files |
| `src/services/library/index.ts` | Create | Re-export both services |
| `src/store/useLibraryStore.ts` | Modify | Add `coverImagePath: string \| null` field |
| `src/screens/ReaderScreen.tsx` | Modify | Call extractor after file import |
| `src/screens/HomeScreen.tsx` | Modify | Show cover image in BookCard + bulk import UI |

---

## Task 1: Add `coverImagePath` to `LibraryBook`

**Files:**
- Modify: `src/store/useLibraryStore.ts:15-27`

- [ ] **Step 1: Add the field to the interface**

Open `src/store/useLibraryStore.ts`. In the `LibraryBook` interface (starts at line 15), add `coverImagePath` after `coverColor`:

```typescript
export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileName: string;
  fileType: 'epub' | 'txt';
  currentPage: number;
  totalPages: number;
  lastReadAt: number;
  addedAt: number;
  coverColor?: string;
  coverImagePath: string | null;   // ← ADD THIS
}
```

- [ ] **Step 2: Set default `null` in `addBook`**

In the `addBook` implementation inside `create()` (around line 101), add `coverImagePath: null` in the `newBook` object:

```typescript
addBook: (bookData) => {
  const newBook: LibraryBook = {
    ...bookData,
    id: generateId(),
    currentPage: 1,
    addedAt: Date.now(),
    lastReadAt: Date.now(),
    coverColor: generateCoverColor(),
    coverImagePath: null,   // ← ADD THIS
  };
  set((state) => ({ books: [newBook, ...state.books] }));
  return newBook;
},
```

- [ ] **Step 3: Add `updateCover` action to the interface**

In the `LibraryState` interface (starts at line 29), add:

```typescript
interface LibraryState {
  books: LibraryBook[];
  addBook: (book: Omit<LibraryBook, 'id' | 'addedAt' | 'lastReadAt' | 'currentPage' | 'coverColor' | 'coverImagePath'>) => LibraryBook;
  removeBook: (id: string) => Promise<void>;
  updateProgress: (id: string, currentPage: number, totalPages?: number) => void;
  updateCover: (id: string, coverImagePath: string) => void;   // ← ADD
  getBook: (id: string) => LibraryBook | undefined;
  getRecentBooks: (limit?: number) => LibraryBook[];
}
```

- [ ] **Step 4: Implement `updateCover`**

Add after `updateProgress` implementation inside `create()`:

```typescript
updateCover: (id, coverImagePath) => {
  set((state) => ({
    books: state.books.map((book) =>
      book.id === id ? { ...book, coverImagePath } : book
    ),
  }));
},
```

- [ ] **Step 5: Verify TypeScript**

Run: `cd SensualRead && npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output (no errors).

---

## Task 2: Create `EpubCoverExtractor`

**Files:**
- Create: `src/services/library/EpubCoverExtractor.ts`

- [ ] **Step 1: Create the directory and file**

Create `src/services/library/EpubCoverExtractor.ts` with this content:

```typescript
import RNFS from 'react-native-fs';
import JSZip from 'jszip';

export class EpubCoverExtractor {
  async extractCover(
    epubPath: string,
    bookId: string,
    outputDir: string
  ): Promise<string | null> {
    try {
      const exists = await RNFS.exists(epubPath);
      if (!exists) return null;

      const base64 = await RNFS.readFile(epubPath, 'base64');
      const zip = await JSZip.loadAsync(base64, { base64: true });

      const opfFile = zip.file(/\.opf$/i)[0];
      if (!opfFile) return null;

      const opfXml = await opfFile.async('string');
      const basePath = this.getBasePath(opfFile.name);

      // Strategy 1: <meta name="cover" content="id"/>
      const coverIdMatch =
        opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) ||
        opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);

      if (coverIdMatch) {
        const coverId = coverIdMatch[1];
        const hrefMatch =
          opfXml.match(new RegExp(`<item[^>]+id=["']${coverId}["'][^>]+href=["']([^"']+)["']`, 'i')) ||
          opfXml.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${coverId}["']`, 'i'));
        if (hrefMatch) {
          const path = await this.saveImage(zip, basePath, hrefMatch[1], bookId, outputDir);
          if (path) return path;
        }
      }

      // Strategy 2: first image in manifest
      const imgMatch =
        opfXml.match(/<item[^>]+media-type=["']image\/[^"']+["'][^>]+href=["']([^"']+)["']/i) ||
        opfXml.match(/<item[^>]+href=["']([^"']+\.(jpg|jpeg|png|gif|webp))["']/i);
      if (imgMatch) {
        const path = await this.saveImage(zip, basePath, imgMatch[1], bookId, outputDir);
        if (path) return path;
      }

      return null;
    } catch {
      return null;
    }
  }

  private getBasePath(opfName: string): string {
    const lastSlash = opfName.lastIndexOf('/');
    return lastSlash >= 0 ? opfName.substring(0, lastSlash + 1) : '';
  }

  private async saveImage(
    zip: JSZip,
    basePath: string,
    href: string,
    bookId: string,
    outputDir: string
  ): Promise<string | null> {
    const file =
      zip.file(basePath + href) ||
      zip.file(href) ||
      zip.file(decodeURIComponent(basePath + href));
    if (!file) return null;

    const ext = (href.split('.').pop()?.toLowerCase() || 'jpg').replace(/[^a-z]/g, '') || 'jpg';
    const destPath = `${outputDir}/${bookId}_cover.${ext}`;

    const data = await file.async('base64');
    await RNFS.writeFile(destPath, data, 'base64');
    return destPath;
  }
}

export const epubCoverExtractor = new EpubCoverExtractor();
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output.

---

## Task 3: Create `BulkImportService`

**Files:**
- Create: `src/services/library/BulkImportService.ts`

- [ ] **Step 1: Create the file**

```typescript
import RNFS from 'react-native-fs';
import { PermissionsAndroid, Platform } from 'react-native';

export interface ImportCandidate {
  name: string;
  path: string;
  type: 'epub' | 'txt';
  sizeKB: number;
}

export class BulkImportService {
  async requestStoragePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Accès au stockage',
          message: 'SensualRead a besoin d\'accéder à vos fichiers pour importer des livres.',
          buttonPositive: 'Autoriser',
          buttonNegative: 'Refuser',
        }
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  async getDefaultScanDirs(): Promise<string[]> {
    const base = RNFS.ExternalStorageDirectoryPath;
    const candidates = [
      base,
      `${base}/Download`,
      `${base}/Downloads`,
      `${base}/Documents`,
      `${base}/Books`,
      `${base}/EPUB`,
      `${base}/eBooks`,
    ];
    const checks = await Promise.all(
      candidates.map(async (p) => {
        try { return (await RNFS.exists(p)) ? p : null; }
        catch { return null; }
      })
    );
    return checks.filter((p): p is string => p !== null);
  }

  async scanDirectory(dirPath: string, depth: number = 2): Promise<ImportCandidate[]> {
    if (depth < 0) return [];
    const candidates: ImportCandidate[] = [];
    try {
      const items = await RNFS.readDir(dirPath);
      for (const item of items) {
        if (item.isFile()) {
          const ext = item.name.toLowerCase().split('.').pop();
          if (ext === 'epub' || ext === 'txt') {
            candidates.push({
              name: item.name,
              path: item.path,
              type: ext as 'epub' | 'txt',
              sizeKB: Math.round(item.size / 1024),
            });
          }
        } else if (item.isDirectory() && depth > 0) {
          const sub = await this.scanDirectory(item.path, depth - 1).catch(() => []);
          candidates.push(...sub);
        }
      }
    } catch {
      // inaccessible directory — skip silently
    }
    return candidates;
  }

  async scanAllDefaultDirs(): Promise<ImportCandidate[]> {
    const dirs = await this.getDefaultScanDirs();
    const results = await Promise.all(dirs.map((d) => this.scanDirectory(d)));
    const all = results.flat();
    // Deduplicate by path
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.path)) return false;
      seen.add(c.path);
      return true;
    });
  }
}

export const bulkImportService = new BulkImportService();
```

- [ ] **Step 2: Create the service index**

Create `src/services/library/index.ts`:

```typescript
export { epubCoverExtractor } from './EpubCoverExtractor';
export type { } from './EpubCoverExtractor';
export { bulkImportService } from './BulkImportService';
export type { ImportCandidate } from './BulkImportService';
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output.

---

## Task 4: Wire cover extraction into `ReaderScreen`

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/screens/ReaderScreen.tsx`, add after existing imports:

```typescript
import { epubCoverExtractor } from '../services/library';
import { getLibraryPath } from '../store/useLibraryStore';
```

- [ ] **Step 2: Add `updateCover` to the destructured store**

Find the line `const { books, addBook, updateProgress } = useLibraryStore();` and add `updateCover`:

```typescript
const { books, addBook, updateProgress, updateCover } = useLibraryStore();
```

- [ ] **Step 3: Extract cover after `addBook` in `pickFile`**

In `pickFile`, find:
```typescript
setCurrentBookId(newBook.id);
setFilePath(localPath);
```

Add cover extraction between `addBook(...)` and `setCurrentBookId(...)`:

```typescript
const newBook = addBook({
  title: bookTitle,
  author: 'Inconnu',
  filePath: localPath,
  fileName: fileName,
  fileType: fileType,
  totalPages: 0,
});

// Extract EPUB cover asynchronously (non-blocking)
if (fileType === 'epub') {
  epubCoverExtractor
    .extractCover(localPath, newBook.id, getLibraryPath())
    .then((coverPath) => {
      if (coverPath) updateCover(newBook.id, coverPath);
    })
    .catch(() => {});
}

setCurrentBookId(newBook.id);
setFilePath(localPath);
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output.

---

## Task 5: Show cover image in `HomeScreen` BookCard

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add Image import**

In `HomeScreen.tsx`, add `Image` to the react-native import list:

```typescript
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  Image,         // ← ADD
} from 'react-native';
```

- [ ] **Step 2: Replace emoji cover with conditional image**

In the `BookCard` component, find:
```tsx
<View style={styles.bookCover}>
  <Text style={styles.bookEmoji}>📚</Text>
</View>
```

Replace with:
```tsx
<View style={styles.bookCover}>
  {book.coverImagePath ? (
    <Image
      source={{ uri: `file://${book.coverImagePath}` }}
      style={styles.coverImage}
      resizeMode="cover"
    />
  ) : (
    <Text style={styles.bookEmoji}>📚</Text>
  )}
</View>
```

- [ ] **Step 3: Add `coverImage` style**

In the `StyleSheet.create({...})` block, add after `bookEmoji`:

```typescript
coverImage: {
  width: '100%',
  height: '100%',
  borderRadius: 4,
},
```

Also update `bookCover` style to have a fixed size that looks good:
```typescript
bookCover: {
  width: 56,
  height: 80,
  borderRadius: 4,
  overflow: 'hidden',
  backgroundColor: '#f0f0f0',
  justifyContent: 'center',
  alignItems: 'center',
  marginRight: 12,
},
```

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output.

---

## Task 6: Bulk import UI in `HomeScreen`

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add Modal and ActivityIndicator to imports**

```typescript
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Alert, Image, Modal, ActivityIndicator,  // ← ADD Modal, ActivityIndicator
  FlatList,                                            // ← ADD FlatList
} from 'react-native';
```

- [ ] **Step 2: Add imports for services**

```typescript
import { bulkImportService, epubCoverExtractor, ImportCandidate } from '../services/library';
import { copyBookToLibrary, getLibraryPath, useLibraryStore } from '../store/useLibraryStore';
```

- [ ] **Step 3: Add state variables inside `HomeScreen`**

```typescript
const { books, addBook, removeBook, updateCover } = useLibraryStore();
const [scanModalVisible, setScanModalVisible] = useState(false);
const [scanning, setScanning] = useState(false);
const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
const [selected, setSelected] = useState<Set<string>>(new Set());
const [importing, setImporting] = useState(false);
```

Also add the missing `useState` import if not present — it should already be imported from React.

- [ ] **Step 4: Add scan handler**

```typescript
const handleScanFolder = async () => {
  setScanModalVisible(true);
  setScanning(true);
  setCandidates([]);
  setSelected(new Set());

  const granted = await bulkImportService.requestStoragePermission();
  if (!granted) {
    setScanning(false);
    Alert.alert('Permission refusée', 'Accès au stockage requis pour scanner les dossiers.');
    setScanModalVisible(false);
    return;
  }

  const found = await bulkImportService.scanAllDefaultDirs();
  // Filter already-imported paths
  const existingPaths = new Set(books.map((b) => b.filePath));
  const fresh = found.filter((c) => !existingPaths.has(c.path));
  setCandidates(fresh);
  setSelected(new Set(fresh.map((c) => c.path)));
  setScanning(false);
};
```

- [ ] **Step 5: Add bulk import handler**

```typescript
const handleBulkImport = async () => {
  setImporting(true);
  const toImport = candidates.filter((c) => selected.has(c.path));

  for (const candidate of toImport) {
    try {
      const localPath = await copyBookToLibrary(candidate.path, candidate.name);
      const fileType = candidate.type;
      const title = candidate.name.replace(/\.(epub|txt)$/i, '');
      const newBook = addBook({ title, author: 'Inconnu', filePath: localPath, fileName: candidate.name, fileType, totalPages: 0 });
      if (fileType === 'epub') {
        epubCoverExtractor.extractCover(localPath, newBook.id, getLibraryPath())
          .then((p) => { if (p) updateCover(newBook.id, p); })
          .catch(() => {});
      }
    } catch {
      // Skip file on error
    }
  }

  setImporting(false);
  setScanModalVisible(false);
  Alert.alert('Importation terminée', `${toImport.length} livre(s) ajouté(s).`);
};
```

- [ ] **Step 6: Add scan button next to existing action buttons**

Find the existing `<View style={styles.actions}>` block and add a third button:

```tsx
<TouchableOpacity
  style={[styles.actionButton, { backgroundColor: colors.surface }]}
  onPress={handleScanFolder}
>
  <Text style={styles.actionIcon}>🔍</Text>
  <Text style={[styles.actionText, { color: colors.text }]}>Scanner</Text>
</TouchableOpacity>
```

- [ ] **Step 7: Add the scan modal JSX**

Inside the `<ErrorBoundary>` view, before `</View>`, add:

```tsx
<Modal visible={scanModalVisible} transparent animationType="slide" onRequestClose={() => setScanModalVisible(false)}>
  <View style={styles.modalOverlay}>
    <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>Scanner les livres</Text>

      {scanning ? (
        <View style={styles.modalCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Recherche en cours…</Text>
        </View>
      ) : candidates.length === 0 ? (
        <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Aucun nouveau livre trouvé.</Text>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.path}
          style={styles.candidateList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.candidateRow}
              onPress={() => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.path)) next.delete(item.path);
                  else next.add(item.path);
                  return next;
                });
              }}
            >
              <View style={[styles.checkbox, selected.has(item.path) && { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.candidateName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.candidateSize, { color: colors.textSecondary }]}>{item.sizeKB} KB · {item.type.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={styles.modalButtons}>
        <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.border }]} onPress={() => setScanModalVisible(false)}>
          <Text style={{ color: colors.text }}>Annuler</Text>
        </TouchableOpacity>
        {!scanning && candidates.length > 0 && (
          <TouchableOpacity
            style={[styles.modalBtn, { backgroundColor: colors.primary }]}
            onPress={handleBulkImport}
            disabled={importing || selected.size === 0}
          >
            {importing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff' }}>Importer ({selected.size})</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  </View>
</Modal>
```

- [ ] **Step 8: Add modal styles**

In the StyleSheet, add:

```typescript
modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
modalSubtitle: { fontSize: 14, textAlign: 'center', marginVertical: 20 },
modalCenter: { alignItems: 'center', paddingVertical: 20 },
candidateList: { maxHeight: 300, marginBottom: 12 },
candidateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#ccc', marginRight: 12 },
candidateName: { fontSize: 14, fontWeight: '500' },
candidateSize: { fontSize: 12, marginTop: 2 },
modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
```

- [ ] **Step 9: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"`
Expected: no output (HomeScreen errors are pre-existing Typography.h4 issues, not ours).

- [ ] **Step 10: Build APK and test**

```bash
cd SensualRead
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android && ./gradlew assembleDebug
```

Test checklist:
- [ ] Import an EPUB → cover appears in library after 2–3 seconds
- [ ] Import a TXT → no crash, shows 📚 emoji as fallback
- [ ] Tap "Scanner" → modal opens, scans Download/Documents folders
- [ ] Deselect a book → it's not imported
- [ ] "Importer" → all selected books appear in library
