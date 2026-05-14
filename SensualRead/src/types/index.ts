/**
 * Type Definitions - Global TypeScript types
 */

// Re-export types from modules
export type { DeviceInfo, HapticCommand, IHapticService } from '../services/bluetooth';
export type { KeywordMap, KeywordEntry, AnalysisResult, ITriggerEngine } from '../engines/analysis';
export type { BookMetadata, PageContent, IRenderer } from '../components/reader/renderers';

// App-wide types
export interface Book {
  id: string;
  filePath: string;
  title: string;
  author?: string;
  cover?: string;
  lastRead?: number;       // Timestamp
  lastPage?: number;
  totalPages?: number;
  format: 'epub' | 'txt' | 'pdf' | 'cbz' | 'cbr';
}

export interface AppSettings {
  // Haptic settings
  hapticEnabled: boolean;
  sensitivity: number;     // 0.1 - 2.0
  hapticServiceType: 'mock' | 'live';

  // Reader settings
  fontSize: number;
  fontFamily: string;
  theme: 'light' | 'dark' | 'sepia';
  lineHeight: number;

  // Analysis settings
  analysisEnabled: boolean;
  customKeywords: string[]; // User-added keywords
}

export interface ConnectionState {
  isScanning: boolean;
  isConnected: boolean;
  connectedDevice: DeviceInfo | null;
  availableDevices: DeviceInfo[];
  lastError?: string;
}

export interface ReaderState {
  currentBook: Book | null;
  currentPage: number;
  totalPages: number;
  currentContent: string;
  isLoading: boolean;
}

export interface AnalysisState {
  currentScore: number;
  lastResult: AnalysisResult | null;
  isEnabled: boolean;
}

// Navigation types
export type RootStackParamList = {
  Home: undefined;
  Reader: { bookId?: string } | undefined;
  Settings: undefined;
  DeviceConnect: undefined;
  DeviceTest: undefined;
};
