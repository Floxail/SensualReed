/**
 * App Store - Zustand state management
 *
 * Central state store for the application
 */

import { create } from 'zustand';
import {
  Book,
  AppSettings,
  ConnectionState,
  ReaderState,
  AnalysisState,
  DeviceInfo,
  AnalysisResult,
} from '../types';

// Forward declare LiveHapticService type to avoid circular dependency
type LiveHapticService = any;

interface AppState {
  // Library
  books: Book[];
  addBook: (book: Book) => void;
  removeBook: (id: string) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Haptic Service
  hapticService: LiveHapticService | null;
  setHapticService: (service: LiveHapticService | null) => void;
  lastConnectedDeviceId: string | null;
  setLastConnectedDeviceId: (id: string | null) => void;

  // Connection
  connection: ConnectionState;
  setScanning: (isScanning: boolean) => void;
  setConnected: (device: DeviceInfo | null) => void;
  setAvailableDevices: (devices: DeviceInfo[]) => void;
  setConnectionError: (error: string | undefined) => void;

  // Reader
  reader: ReaderState;
  setCurrentBook: (book: Book | null) => void;
  setReaderPage: (page: number, total: number) => void;
  setReaderContent: (content: string) => void;
  setReaderLoading: (loading: boolean) => void;

  // Analysis
  analysis: AnalysisState;
  setAnalysisScore: (score: number) => void;
  setAnalysisResult: (result: AnalysisResult | null) => void;
  setAnalysisEnabled: (enabled: boolean) => void;
}

const defaultSettings: AppSettings = {
  hapticEnabled: true,
  sensitivity: 1.0,
  hapticServiceType: 'mock',
  fontSize: 16,
  fontFamily: 'serif',
  theme: 'light',
  lineHeight: 1.6,
  analysisEnabled: true,
  customKeywords: [],
  readerMargins: 'medium',
  readerDimOverlay: 0,
};

export const useAppStore = create<AppState>((set) => ({
  // Library
  books: [],
  addBook: (book) =>
    set((state) => ({ books: [...state.books, book] })),
  removeBook: (id) =>
    set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
  updateBook: (id, updates) =>
    set((state) => ({
      books: state.books.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    })),

  // Settings
  settings: defaultSettings,
  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
    })),

  // Haptic Service
  hapticService: null,
  setHapticService: (service) =>
    set({ hapticService: service }),
  lastConnectedDeviceId: null,
  setLastConnectedDeviceId: (id) =>
    set({ lastConnectedDeviceId: id }),

  // Connection
  connection: {
    isScanning: false,
    isConnected: false,
    connectedDevice: null,
    availableDevices: [],
  },
  setScanning: (isScanning) =>
    set((state) => ({
      connection: { ...state.connection, isScanning },
    })),
  setConnected: (device) =>
    set((state) => ({
      connection: {
        ...state.connection,
        isConnected: device !== null,
        connectedDevice: device,
      },
    })),
  setAvailableDevices: (devices) =>
    set((state) => ({
      connection: { ...state.connection, availableDevices: devices },
    })),
  setConnectionError: (error) =>
    set((state) => ({
      connection: { ...state.connection, lastError: error },
    })),

  // Reader
  reader: {
    currentBook: null,
    currentPage: 0,
    totalPages: 0,
    currentContent: '',
    isLoading: false,
  },
  setCurrentBook: (book) =>
    set((state) => ({
      reader: { ...state.reader, currentBook: book },
    })),
  setReaderPage: (page, total) =>
    set((state) => ({
      reader: { ...state.reader, currentPage: page, totalPages: total },
    })),
  setReaderContent: (content) =>
    set((state) => ({
      reader: { ...state.reader, currentContent: content },
    })),
  setReaderLoading: (loading) =>
    set((state) => ({
      reader: { ...state.reader, isLoading: loading },
    })),

  // Analysis
  analysis: {
    currentScore: 0,
    lastResult: null,
    isEnabled: true,
  },
  setAnalysisScore: (score) =>
    set((state) => ({
      analysis: { ...state.analysis, currentScore: score },
    })),
  setAnalysisResult: (result) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        lastResult: result,
        currentScore: result?.score ?? 0,
      },
    })),
  setAnalysisEnabled: (enabled) =>
    set((state) => ({
      analysis: { ...state.analysis, isEnabled: enabled },
    })),
}));
