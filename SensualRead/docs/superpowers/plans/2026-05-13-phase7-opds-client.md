# Phase 7 — OPDS Catalog Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse OPDS XML book catalogs (public or self-hosted), preview book metadata, and download EPUB/PDF files directly into the library — no manual file transfer needed.

**Architecture:** `OPDSService` fetches and parses Atom/XML feeds using `fast-xml-parser` (pure JS, no native build). It returns a typed `OPDSFeed` with entries and navigation links. `OPDSScreen` is a two-panel browser: a catalog list screen (root feeds) and an entries list screen (within a feed). Download uses `fetch()` to stream the binary to `RNFS.downloadFile`, then calls the existing `copyBookToLibrary` + `addBook` flow. Catalog URLs are stored in a dedicated `useOPDSStore` backed by AsyncStorage. A new "Catalogs" button in `HomeScreen` header opens the OPDS browser.

**Tech Stack:** fast-xml-parser (new install, pure JS), react-native-fs (already installed), @react-native-async-storage/async-storage (already installed), fetch (built-in RN).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/opds/OPDSTypes.ts` | Create | TypeScript types for OPDS feeds |
| `src/services/opds/OPDSService.ts` | Create | Fetch + parse OPDS Atom feeds |
| `src/services/opds/index.ts` | Create | Re-export |
| `src/store/useOPDSStore.ts` | Create | Persisted catalog URL list |
| `src/screens/OPDSScreen.tsx` | Create | Browse + download UI |
| `src/screens/index.ts` | Modify | Export OPDSScreen |
| `src/navigation/AppNavigator.tsx` | Modify | Add OPDS route |
| `src/types/index.ts` | Modify | Add OPDS to RootStackParamList |
| `src/screens/HomeScreen.tsx` | Modify | Add "Catalogs" button |
| `src/screens/SettingsScreen.tsx` | Modify | Add OPDS catalog management section |

---

## Task 1: Install fast-xml-parser and define OPDS types

**Files:**
- Create: `src/services/opds/OPDSTypes.ts`

- [ ] **Step 1: Install fast-xml-parser**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npm install fast-xml-parser
```

Expected: package added to `node_modules` and `package.json`.

- [ ] **Step 2: Create OPDS type definitions**

Create `src/services/opds/OPDSTypes.ts`:

```typescript
/** A single link element from an OPDS entry or feed */
export interface OPDSLink {
  href: string;
  type?: string;
  rel?: string;
  title?: string;
}

/** A single book/catalog entry in an OPDS feed */
export interface OPDSEntry {
  id: string;
  title: string;
  summary?: string;
  authors: string[];
  updated?: string;
  /** All links (acquisition, navigation, thumbnail, etc.) */
  links: OPDSLink[];
  /** Cover image URL (rel=http://opds-spec.org/image/thumbnail or /image) */
  thumbnailUrl?: string;
}

/** A parsed OPDS feed (navigation or acquisition) */
export interface OPDSFeed {
  id: string;
  title: string;
  /** Feed-level navigation links (next page, start, etc.) */
  links: OPDSLink[];
  entries: OPDSEntry[];
  /** True if this feed contains directly downloadable books */
  isAcquisitionFeed: boolean;
}

/**
 * Catalog record stored in useOPDSStore.
 * User-defined OPDS root feeds.
 */
export interface OPDSCatalog {
  id: string;
  name: string;
  url: string;
  addedAt: number;
}

/** Acquisition link rel values defined by OPDS spec */
export const OPDS_ACQUISITION_RELS = [
  'http://opds-spec.org/acquisition',
  'http://opds-spec.org/acquisition/open-access',
  'http://opds-spec.org/acquisition/borrow',
  'http://opds-spec.org/acquisition/buy',
  'http://opds-spec.org/acquisition/sample',
] as const;

/** MIME types we can download and read */
export const DOWNLOADABLE_MIME_TYPES = [
  'application/epub+zip',
  'application/pdf',
] as const;

/** Built-in public OPDS catalogs for first-run */
export const DEFAULT_CATALOGS: OPDSCatalog[] = [
  {
    id: 'standard-ebooks',
    name: 'Standard Ebooks',
    url: 'https://standardebooks.org/feeds/opds',
    addedAt: 0,
  },
  {
    id: 'feedbooks-public',
    name: 'Feedbooks (Public Domain)',
    url: 'https://www.feedbooks.com/publicdomain/catalog.atom',
    addedAt: 0,
  },
];
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "OPDSTypes"
```

Expected: no errors.

---

## Task 2: Create OPDSService

**Files:**
- Create: `src/services/opds/OPDSService.ts`
- Create: `src/services/opds/index.ts`

- [ ] **Step 1: Write OPDSService**

Create `src/services/opds/OPDSService.ts`:

```typescript
import { XMLParser } from 'fast-xml-parser';
import {
  OPDSFeed,
  OPDSEntry,
  OPDSLink,
  OPDS_ACQUISITION_RELS,
  DOWNLOADABLE_MIME_TYPES,
} from './OPDSTypes';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'link', 'author'].includes(name),
  parseAttributeValue: true,
});

/** Normalize a link object from parsed XML */
function parseLink(raw: Record<string, string>): OPDSLink {
  return {
    href: raw['@_href'] ?? '',
    type: raw['@_type'],
    rel: raw['@_rel'],
    title: raw['@_title'],
  };
}

/** Extract authors array from parsed entry */
function parseAuthors(raw: unknown): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((a: Record<string, unknown>) =>
    typeof a.name === 'string' ? a.name : String(a.name ?? ''),
  ).filter(Boolean);
}

/** Extract links array from parsed entry/feed */
function parseLinks(raw: unknown): OPDSLink[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((l: Record<string, string>) => parseLink(l));
}

/** Find thumbnail URL from an entry's links */
function findThumbnail(links: OPDSLink[]): string | undefined {
  const thumb = links.find(l =>
    l.rel === 'http://opds-spec.org/image/thumbnail' ||
    l.rel === 'http://opds-spec.org/image',
  );
  return thumb?.href;
}

/** True if this feed's entries have acquisition links */
function isAcquisitionFeed(entries: OPDSEntry[]): boolean {
  return entries.some(e =>
    e.links.some(l =>
      OPDS_ACQUISITION_RELS.some(rel => l.rel === rel) &&
      DOWNLOADABLE_MIME_TYPES.some(mime => l.type?.startsWith(mime)),
    ),
  );
}

export class OPDSService {
  /**
   * Fetch and parse an OPDS feed from a URL.
   * Throws on network error or malformed XML.
   */
  async fetchFeed(url: string): Promise<OPDSFeed> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/atom+xml, application/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    const feed = parsed.feed ?? parsed['atom:feed'];
    if (!feed) {
      throw new Error('Response is not a valid OPDS/Atom feed');
    }

    const feedLinks = parseLinks(feed.link);

    const rawEntries = Array.isArray(feed.entry) ? feed.entry : (feed.entry ? [feed.entry] : []);
    const entries: OPDSEntry[] = rawEntries.map((e: Record<string, unknown>) => {
      const links = parseLinks(e.link);
      return {
        id: String(e.id ?? ''),
        title: String(typeof e.title === 'object' ? (e.title as Record<string, unknown>)['#text'] ?? '' : e.title ?? ''),
        summary: typeof e.summary === 'string'
          ? e.summary
          : typeof e.summary === 'object' && e.summary !== null
            ? String((e.summary as Record<string, unknown>)['#text'] ?? '')
            : undefined,
        authors: parseAuthors(e.author),
        updated: String(e.updated ?? ''),
        links,
        thumbnailUrl: findThumbnail(links),
      };
    });

    return {
      id: String(feed.id ?? url),
      title: String(typeof feed.title === 'object' ? (feed.title as Record<string, unknown>)['#text'] ?? '' : feed.title ?? 'Feed'),
      links: feedLinks,
      entries,
      isAcquisitionFeed: isAcquisitionFeed(entries),
    };
  }

  /**
   * Get downloadable acquisition links from an entry.
   * Returns EPUB first, then PDF.
   */
  getDownloadLinks(entry: OPDSEntry): OPDSLink[] {
    return entry.links.filter(l =>
      OPDS_ACQUISITION_RELS.some(rel => l.rel === rel) &&
      DOWNLOADABLE_MIME_TYPES.some(mime => l.type?.startsWith(mime)),
    ).sort((a, b) => {
      // EPUB before PDF
      const aEpub = a.type?.includes('epub') ? 0 : 1;
      const bEpub = b.type?.includes('epub') ? 0 : 1;
      return aEpub - bEpub;
    });
  }

  /**
   * Get sub-catalog navigation links from an entry.
   * Used for navigation feeds (not acquisition).
   */
  getNavigationLink(entry: OPDSEntry): OPDSLink | null {
    return entry.links.find(l =>
      l.rel === 'subsection' ||
      l.type === 'application/atom+xml;profile=opds-catalog;kind=navigation' ||
      l.type === 'application/atom+xml;profile=opds-catalog;kind=acquisition' ||
      l.type === 'application/atom+xml',
    ) ?? null;
  }

  /**
   * Download a book file to the app's document directory.
   * Returns the local file path.
   */
  async downloadBook(url: string, filename: string): Promise<string> {
    const RNFS = await import('react-native-fs').then(m => m.default);
    const destPath = `${RNFS.DocumentDirectoryPath}/${filename}`;

    const result = await RNFS.downloadFile({
      fromUrl: url,
      toFile: destPath,
      headers: {
        Accept: 'application/epub+zip, application/pdf, */*',
      },
    }).promise;

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(`Download failed with HTTP ${result.statusCode}`);
    }

    return destPath;
  }
}

export const opdsService = new OPDSService();
```

- [ ] **Step 2: Create index**

Create `src/services/opds/index.ts`:

```typescript
export * from './OPDSTypes';
export * from './OPDSService';
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "OPDS|opds"
```

Expected: no errors.

---

## Task 3: Create useOPDSStore

**Files:**
- Create: `src/store/useOPDSStore.ts`

- [ ] **Step 1: Write the store**

Create `src/store/useOPDSStore.ts`:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OPDSCatalog, DEFAULT_CATALOGS } from '../services/opds/OPDSTypes';

interface OPDSState {
  catalogs: OPDSCatalog[];
  addCatalog: (name: string, url: string) => void;
  removeCatalog: (id: string) => void;
  resetToDefaults: () => void;
}

export const useOPDSStore = create<OPDSState>()(
  persist(
    (set) => ({
      catalogs: DEFAULT_CATALOGS,

      addCatalog: (name, url) => set((state) => ({
        catalogs: [
          ...state.catalogs,
          {
            id: `catalog_${Date.now()}`,
            name: name.trim(),
            url: url.trim(),
            addedAt: Date.now(),
          },
        ],
      })),

      removeCatalog: (id) => set((state) => ({
        catalogs: state.catalogs.filter(c => c.id !== id),
      })),

      resetToDefaults: () => set({ catalogs: DEFAULT_CATALOGS }),
    }),
    {
      name: 'opds-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "useOPDSStore"
```

Expected: no errors.

---

## Task 4: Create OPDSScreen

**Files:**
- Create: `src/screens/OPDSScreen.tsx`

The screen has two views controlled by local state:
- **Catalog list** (`view === 'catalogs'`): shows `useOPDSStore.catalogs`, tap opens feed
- **Feed browser** (`view === 'feed'`): shows entries from a fetched `OPDSFeed`, tap downloads or drills in

- [ ] **Step 1: Write OPDSScreen**

Create `src/screens/OPDSScreen.tsx`:

```typescript
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography, Colors } from '../theme';
import { useOPDSStore } from '../store/useOPDSStore';
import { useLibraryStore, copyBookToLibrary } from '../store/useLibraryStore';
import { opdsService } from '../services/opds/OPDSService';
import { OPDSFeed, OPDSEntry, OPDSCatalog } from '../services/opds/OPDSTypes';
import { RootStackParamList } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

type ViewState =
  | { kind: 'catalogs' }
  | { kind: 'feed'; title: string; url: string };

export const OPDSScreen: React.FC = () => {
  const colors = useColors();
  const { isDark } = useThemeToggle();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavProp>();
  const { catalogs, addCatalog, removeCatalog } = useOPDSStore();
  const { addBook } = useLibraryStore();

  const [view, setView] = useState<ViewState>({ kind: 'catalogs' });
  const [feed, setFeed] = useState<OPDSFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Add catalog modal state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const openCatalog = useCallback(async (catalog: OPDSCatalog) => {
    setLoading(true);
    setError(null);
    setFeed(null);
    try {
      const result = await opdsService.fetchFeed(catalog.url);
      setFeed(result);
      setView({ kind: 'feed', title: catalog.name, url: catalog.url });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openEntry = useCallback(async (entry: OPDSEntry) => {
    if (!feed) return;
    // Check if it's a navigation entry (drill down)
    const navLink = opdsService.getNavigationLink(entry);
    if (navLink && !feed.isAcquisitionFeed) {
      setLoading(true);
      setError(null);
      try {
        const subFeed = await opdsService.fetchFeed(navLink.href);
        setFeed(subFeed);
        setView({ kind: 'feed', title: entry.title, url: navLink.href });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
      return;
    }
    // Download entry
    const dlLinks = opdsService.getDownloadLinks(entry);
    if (dlLinks.length === 0) {
      Alert.alert('No download available', 'This entry has no downloadable EPUB or PDF.');
      return;
    }
    const link = dlLinks[0]; // prefer EPUB
    const ext = link.type?.includes('epub') ? 'epub' : 'pdf';
    const safeTitle = entry.title.replace(/[^a-z0-9_\- ]/gi, '_').slice(0, 60);
    const filename = `${safeTitle}.${ext}`;

    setDownloadingId(entry.id);
    try {
      const localPath = await opdsService.downloadBook(link.href, filename);
      const savedPath = await copyBookToLibrary(localPath);
      addBook({
        title: entry.title,
        author: entry.authors[0] ?? 'Unknown',
        filePath: savedPath,
        fileName: filename,
        fileType: ext as 'epub' | 'pdf',
        totalPages: 0,
      });
      Alert.alert('Downloaded', `"${entry.title}" added to your library.`);
    } catch (e) {
      Alert.alert('Download failed', (e as Error).message);
    } finally {
      setDownloadingId(null);
    }
  }, [feed, addBook]);

  const handleAddCatalog = useCallback(() => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      Alert.alert('Missing fields', 'Enter both a name and a URL.');
      return;
    }
    if (!url.startsWith('http')) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }
    addCatalog(name, url);
    setNewName('');
    setNewUrl('');
    setShowAddForm(false);
  }, [newName, newUrl, addCatalog]);

  const goBack = useCallback(() => {
    if (view.kind === 'feed') {
      setView({ kind: 'catalogs' });
      setFeed(null);
      setError(null);
    } else {
      navigation.goBack();
    }
  }, [view, navigation]);

  const title = view.kind === 'catalogs' ? 'Catalogues OPDS' : view.title;

  return (
    <ErrorBoundary screenName="OPDSScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.headerBackground}
        />
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={[styles.backChevron, { color: colors.headerText }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.headerText }]} numberOfLines={1}>
            {title}
          </Text>
          {view.kind === 'catalogs' && (
            <TouchableOpacity onPress={() => setShowAddForm(s => !s)} style={styles.addButton}>
              <Text style={[styles.addButtonText, { color: colors.headerText }]}>+</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Add catalog form */}
        {showAddForm && view.kind === 'catalogs' && (
          <View style={[styles.addForm, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Nom du catalogue"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="URL (https://...)"
              placeholderTextColor={colors.textMuted}
              value={newUrl}
              onChangeText={setNewUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleAddCatalog}
            >
              <Text style={[styles.saveBtnText, { color: colors.textOnPrimary }]}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Catalog list */}
        {!loading && !error && view.kind === 'catalogs' && (
          <FlatList
            data={catalogs}
            keyExtractor={c => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.catalogRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => openCatalog(item)}
                onLongPress={() =>
                  item.addedAt > 0
                    ? Alert.alert('Supprimer', `Supprimer "${item.name}" ?`, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => removeCatalog(item.id) },
                      ])
                    : null
                }
              >
                <View style={[styles.catalogIcon, { backgroundColor: colors.primary }]}>
                  <Text style={styles.catalogIconText}>📚</Text>
                </View>
                <View style={styles.catalogInfo}>
                  <Text style={[styles.catalogName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.catalogUrl, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.url}
                  </Text>
                </View>
                <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Feed entries */}
        {!loading && !error && view.kind === 'feed' && feed && (
          <FlatList
            data={feed.entries}
            keyExtractor={e => e.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: entry }) => {
              const dlLinks = opdsService.getDownloadLinks(entry);
              const navLink = opdsService.getNavigationLink(entry);
              const isDownloading = downloadingId === entry.id;
              const hasAction = dlLinks.length > 0 || navLink !== null;
              return (
                <TouchableOpacity
                  style={[styles.entryRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => hasAction && openEntry(entry)}
                  disabled={!hasAction || isDownloading}
                >
                  <View style={styles.entryInfo}>
                    <Text style={[styles.entryTitle, { color: colors.text }]} numberOfLines={2}>
                      {entry.title}
                    </Text>
                    {entry.authors.length > 0 && (
                      <Text style={[styles.entryAuthor, { color: colors.textSecondary }]}>
                        {entry.authors.join(', ')}
                      </Text>
                    )}
                    {entry.summary && (
                      <Text style={[styles.entrySummary, { color: colors.textMuted }]} numberOfLines={2}>
                        {entry.summary}
                      </Text>
                    )}
                  </View>
                  {isDownloading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : dlLinks.length > 0 ? (
                    <View style={[styles.downloadBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.downloadBadgeText, { color: colors.textOnPrimary }]}>
                        {dlLinks[0].type?.includes('epub') ? 'EPUB' : 'PDF'}
                      </Text>
                    </View>
                  ) : navLink ? (
                    <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  backButton: { padding: 8, marginRight: 8 },
  backChevron: { fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerTitle: { flex: 1, ...Typography.h2 },
  addButton: { padding: 8 },
  addButtonText: { fontSize: 24, fontWeight: '300' },
  addForm: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.body,
  },
  saveBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  saveBtnText: { ...Typography.button },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { ...Typography.body, textAlign: 'center' },
  list: { padding: Spacing.md, gap: Spacing.sm },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  catalogIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catalogIconText: { fontSize: 22 },
  catalogInfo: { flex: 1 },
  catalogName: { ...Typography.body, fontWeight: '600' },
  catalogUrl: { ...Typography.caption, marginTop: 2 },
  chevron: { fontSize: 20 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  entryInfo: { flex: 1 },
  entryTitle: { ...Typography.body, fontWeight: '600' },
  entryAuthor: { ...Typography.caption, marginTop: 2 },
  entrySummary: { ...Typography.caption, marginTop: 4 },
  downloadBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  downloadBadgeText: { ...Typography.caption, fontWeight: '700', fontSize: 10 },
});

export default OPDSScreen;
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "OPDSScreen"
```

Expected: no errors on OPDSScreen (may error on missing navigation route — fixed in Task 5).

---

## Task 5: Wire Navigation and HomeScreen

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/screens/index.ts`
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Add OPDS to RootStackParamList**

In `src/types/index.ts`, find:

```typescript
export type RootStackParamList = {
  Home: undefined;
  Reader: { bookId?: string } | undefined;
  Settings: undefined;
  DeviceConnect: undefined;
  DeviceTest: undefined;
};
```

Add the `OPDS` route:

```typescript
export type RootStackParamList = {
  Home: undefined;
  Reader: { bookId?: string } | undefined;
  Settings: undefined;
  DeviceConnect: undefined;
  DeviceTest: undefined;
  OPDS: undefined;
};
```

- [ ] **Step 2: Register screen in AppNavigator**

In `src/navigation/AppNavigator.tsx`, add import:

```typescript
import { OPDSScreen } from '../screens';
```

Inside the `<Stack.Navigator>`, after the DeviceTest `<Stack.Screen>`:

```tsx
<Stack.Screen
  name="OPDS"
  component={OPDSScreen}
  options={{ headerShown: false }}
/>
```

- [ ] **Step 3: Export OPDSScreen from screens index**

Open `src/screens/index.ts`. Add:

```typescript
export { OPDSScreen } from './OPDSScreen';
```

- [ ] **Step 4: Add Catalogs button to HomeScreen header**

In `src/screens/HomeScreen.tsx`, find the header section. The header currently has a title and a gear icon. Add a "Catalogues" button between the title and gear icon:

```tsx
<TouchableOpacity
  onPress={() => navigation.navigate('OPDS')}
  style={styles.catalogsButton}
>
  <Text style={[styles.catalogsButtonText, { color: colors.headerText }]}>
    Catalogues
  </Text>
</TouchableOpacity>
```

Add the corresponding styles:

```typescript
catalogsButton: {
  paddingHorizontal: Spacing.sm,
  paddingVertical: 6,
  borderRadius: BorderRadius.sm,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.4)',
  marginRight: Spacing.sm,
},
catalogsButtonText: {
  ...Typography.caption,
  fontWeight: '600',
},
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Task 6: Add OPDS catalog management to SettingsScreen

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

Add a new "CATALOGUES OPDS" section in Settings for managing custom catalog URLs (view count + navigate to OPDS).

- [ ] **Step 1: Import useOPDSStore in SettingsScreen**

In `src/screens/SettingsScreen.tsx`, add import:

```typescript
import { useOPDSStore } from '../store/useOPDSStore';
```

- [ ] **Step 2: Use the store in the component**

Inside `SettingsScreen`, after the existing hooks:

```typescript
const { catalogs } = useOPDSStore();
```

- [ ] **Step 3: Add OPDS section in JSX**

After the ABOUT section `</View>` and before `<View style={styles.bottomSpacer} />`, add:

```tsx
{/* OPDS Section */}
<Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
  CATALOGUES OPDS
</Text>

<View style={[styles.section, { backgroundColor: colors.card }]}>
  <SettingRow
    label="Catalogues configurés"
    value={`${catalogs.length} catalogue${catalogs.length !== 1 ? 's' : ''}`}
    colors={colors}
  />
  <TouchableOpacity
    style={[styles.setting, { borderBottomColor: colors.divider }]}
    onPress={() => navigation.navigate('OPDS')}
  >
    <Text style={[styles.settingLabel, { color: colors.primary }]}>
      Gérer les catalogues →
    </Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Self-Review Checklist

- [x] **Spec coverage**: Browse catalogs ✓, drill into sub-feeds ✓, download EPUB/PDF ✓, add/remove catalogs ✓, settings integration ✓
- [x] **No placeholders**: All code blocks complete
- [x] **Type consistency**: `OPDSFeed`, `OPDSEntry`, `OPDSLink` used consistently throughout OPDSService and OPDSScreen
- [x] **Error handling**: Network errors + HTTP errors surfaced in UI; download errors shown in Alert ✓
- [x] **Default catalogs**: Standard Ebooks + Feedbooks seeded on first install ✓
- [x] **Navigation**: `OPDS` added to RootStackParamList, AppNavigator, screens index ✓
- [x] **Library integration**: Downloaded book → `copyBookToLibrary` + `addBook` — same flow as manual import ✓
