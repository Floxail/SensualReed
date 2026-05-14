/**
 * Library Store - Manages book library with persistence
 *
 * Features:
 * - Save imported books permanently
 * - Track reading progress (current page)
 * - Persist across app restarts
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileName: string;
  fileType: 'epub' | 'txt';
  currentPage: number;
  totalPages: number;
  charOffset: number; // char offset of current page start in full text (0 if unknown)
  lastReadAt: number; // timestamp
  addedAt: number; // timestamp
  coverColor?: string; // generated color for display
  coverImagePath: string | null; // path to cover image file
}

interface LibraryState {
  books: LibraryBook[];
  addBook: (book: Omit<LibraryBook, 'id' | 'addedAt' | 'lastReadAt' | 'currentPage' | 'coverColor' | 'coverImagePath' | 'charOffset'>) => LibraryBook;
  removeBook: (id: string) => Promise<void>;
  updateProgress: (id: string, currentPage: number, totalPages?: number, charOffset?: number) => void;
  updateCover: (id: string, coverImagePath: string) => void;
  getBook: (id: string) => LibraryBook | undefined;
  getRecentBooks: (limit?: number) => LibraryBook[];
}

// Generate a random pastel color for book covers
const generateCoverColor = (): string => {
  const colors = [
    '#FFB3BA', // pink
    '#FFDFBA', // peach
    '#FFFFBA', // yellow
    '#BAFFC9', // mint
    '#BAE1FF', // sky
    '#E8BAFF', // lavender
    '#FFB3E6', // rose
    '#B3FFE8', // aqua
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Generate unique ID
const generateId = (): string => {
  return `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Get permanent library directory
export const getLibraryPath = (): string => {
  return `${RNFS.DocumentDirectoryPath}/library`;
};

// Ensure library directory exists
export const ensureLibraryDir = async (): Promise<void> => {
  const libraryPath = getLibraryPath();
  const exists = await RNFS.exists(libraryPath);
  if (!exists) {
    await RNFS.mkdir(libraryPath);
  }
};

// Copy book to library
export const copyBookToLibrary = async (
  sourcePath: string,
  fileName: string
): Promise<string> => {
  await ensureLibraryDir();
  const destPath = `${getLibraryPath()}/${fileName}`;

  // If file already exists, add timestamp to avoid overwrite
  const exists = await RNFS.exists(destPath);
  if (exists) {
    const timestamp = Date.now();
    const ext = fileName.split('.').pop();
    const baseName = fileName.replace(`.${ext}`, '');
    const newFileName = `${baseName}_${timestamp}.${ext}`;
    const newDestPath = `${getLibraryPath()}/${newFileName}`;
    await RNFS.copyFile(sourcePath, newDestPath);
    return newDestPath;
  }

  await RNFS.copyFile(sourcePath, destPath);
  return destPath;
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],

      addBook: (bookData) => {
        const newBook: LibraryBook = {
          ...bookData,
          id: generateId(),
          currentPage: 1,
          charOffset: 0,
          addedAt: Date.now(),
          lastReadAt: Date.now(),
          coverColor: generateCoverColor(),
          coverImagePath: null,
        };

        set((state) => ({
          books: [newBook, ...state.books],
        }));

        return newBook;
      },

      removeBook: async (id) => {
        const book = get().books.find((b) => b.id === id);
        if (book) {
          // Delete file from library
          try {
            const exists = await RNFS.exists(book.filePath);
            if (exists) {
              await RNFS.unlink(book.filePath);
            }
          } catch (error) {
            console.warn('Failed to delete book file:', error);
          }
        }

        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
        }));
      },

      updateProgress: (id, currentPage, totalPages, charOffset) => {
        set((state) => ({
          books: state.books.map((book) =>
            book.id === id
              ? {
                  ...book,
                  currentPage,
                  totalPages: totalPages ?? book.totalPages,
                  charOffset: charOffset ?? book.charOffset ?? 0,
                  lastReadAt: Date.now(),
                }
              : book
          ),
        }));
      },

      updateCover: (id, coverImagePath) => {
        set((state) => ({
          books: state.books.map((book) =>
            book.id === id ? { ...book, coverImagePath } : book
          ),
        }));
      },

      getBook: (id) => {
        return get().books.find((b) => b.id === id);
      },

      getRecentBooks: (limit = 5) => {
        return [...get().books]
          .sort((a, b) => b.lastReadAt - a.lastReadAt)
          .slice(0, limit);
      },
    }),
    {
      name: 'sensualread-library',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useLibraryStore;
