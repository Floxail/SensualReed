/**
 * ReaderScreen - E-reader view with analysis integration
 *
 * Full e-reader with:
 * - File loading (EPUB/TXT)
 * - Text analysis via TriggerEngine
 * - Intensity visualization
 * - Haptic feedback integration
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Alert,
  Animated,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pick } from '@react-native-documents/picker';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography, Colors } from '../theme';
import { ReaderView } from '../components/reader';
import { ReaderSettingsSheet } from '../components/reader/ReaderSettingsSheet';
import { PageContent, BookMetadata } from '../components/reader/renderers';
import { TriggerEngine } from '../engines/analysis/TriggerEngine';
import { AnalysisResult } from '../engines/analysis';
import { useAppStore } from '../store/useAppStore';
import { useLibraryStore, copyBookToLibrary, getLibraryPath } from '../store/useLibraryStore';
import { epubCoverExtractor } from '../services/library';
import { RootStackParamList } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EmptyState } from '../components/EmptyState';
import { PremiumButton } from '../components/PremiumButton';

type ReaderScreenRouteProp = RouteProp<RootStackParamList, 'Reader'>;

export const ReaderScreen: React.FC = () => {
  const colors = useColors();
  const { isDark } = useThemeToggle();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ReaderScreenRouteProp>();
  const settings = useAppStore((state) => state.settings);
  const insets = useSafeAreaInsets();

  // Library store
  const { books, addBook, updateProgress, updateCover } = useLibraryStore();

  // State
  const [filePath, setFilePath] = useState<string | null>(null);
  const [bookTitle, setBookTitle] = useState<string>('Select a Book');
  const [currentIntensity, setCurrentIntensity] = useState(0);
  const [pageInfo, setPageInfo] = useState({ current: 0, total: 0, charOffset: 0 });
  const [matchedKeywords, setMatchedKeywords] = useState<string[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [initialPage, setInitialPage] = useState<number>(1);
  const [initialCharOffset, setInitialCharOffset] = useState<number>(0);
  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const hapticService = useAppStore((state) => state.hapticService);
  const [isConnected, setIsConnected] = useState(false);

  // Animation for intensity bar
  const intensityAnim = useRef(new Animated.Value(0)).current;

  const triggerEngineRef = useRef<TriggerEngine | null>(null);
  const [isAiActive, setIsAiActive] = useState(false);

  // Load book from library if bookId is provided
  useEffect(() => {
    const bookId = route.params?.bookId;
    if (bookId) {
      const book = books.find(b => b.id === bookId);
      if (book) {
        setFilePath(book.filePath);
        setBookTitle(book.title);
        setCurrentBookId(book.id);
        setInitialPage(book.currentPage || 1);
        setInitialCharOffset(book.charOffset || 0);
        console.log(`[ReaderScreen] Loaded book from library: ${book.title}, page ${book.currentPage}`);
      }
    }
  }, [route.params?.bookId, books]);

  // Sync connection state and TriggerEngine when hapticService changes
  useEffect(() => {
    if (!hapticService) {
      setIsConnected(false);
      return;
    }

    setIsConnected(hapticService.isConnected());

    if (triggerEngineRef.current) {
      triggerEngineRef.current.setHapticService(hapticService);
    }

    const lastId = useAppStore.getState().lastConnectedDeviceId;
    if (!hapticService.isConnected() && lastId) {
      hapticService.connect(lastId).catch(() => {
        console.warn('[AutoConnect] Échec de la reconnexion automatique');
      });
    }

    const unsubscribe = hapticService.onConnectionChange((connected: boolean) => {
      setIsConnected(connected);
    });

    return () => unsubscribe();
  }, [hapticService]);

  // Initialize TriggerEngine and connect to haptic
  useEffect(() => {
    triggerEngineRef.current = new TriggerEngine();

    // Connect to haptic service if available
    const hapticService = useAppStore.getState().hapticService;
    if (hapticService) {
      triggerEngineRef.current.setHapticService(hapticService);
    }

    const unsubscribe = triggerEngineRef.current.onIntensityChange((result: AnalysisResult) => {
      setCurrentIntensity(result.score);
      setMatchedKeywords(result.matchedKeywords.slice(0, 3));
      Animated.spring(intensityAnim, {
        toValue: result.score,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      }).start();
    });

    // Show AI badge when model hot-swaps in
    const unsubAi = triggerEngineRef.current.onAiModelReady(() => setIsAiActive(true));

    return () => {
      unsubscribe();
      unsubAi();
      triggerEngineRef.current?.stop();
    };
  }, []);

  // Save reading progress when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (currentBookId && pageInfo.current > 0) {
          updateProgress(currentBookId, pageInfo.current, pageInfo.total, pageInfo.charOffset);
        }
      }
    });
    return () => subscription.remove();
  }, [currentBookId, pageInfo, updateProgress]);

  const handleContentChange = useCallback((content: PageContent) => {
    if (settings.analysisEnabled) {
      triggerEngineRef.current?.processContent(content.text);
    }
  }, [settings.analysisEnabled]);

  // Handle metadata loaded
  const handleMetadataLoaded = useCallback((metadata: BookMetadata) => {
    setBookTitle(metadata.title || 'Unknown Book');
  }, []);

  // Pre-analyze next page text for zero-lag intensity
  const handleNextPageText = useCallback((nextText: string) => {
    if (settings.analysisEnabled && triggerEngineRef.current && nextText) {
      triggerEngineRef.current.preloadContent(nextText);
    }
  }, [settings.analysisEnabled]);

  // Handle page change - also save progress to library
  const handlePageChange = useCallback((page: number, total: number, charOffset: number) => {
    setPageInfo({ current: page, total, charOffset });

    if (currentBookId) {
      updateProgress(currentBookId, page, total, charOffset);
    }
  }, [currentBookId, updateProgress]);

  // Handle errors
  const handleError = useCallback((error: Error) => {
    Alert.alert('Error', error.message);
  }, []);

  // Pick a file
  const pickFile = async () => {
    try {
      // Use allFiles type for better compatibility
      const results = await pick({
        mode: 'open',
      });

      // Handle cancellation (returns null or empty)
      if (!results || results.length === 0) {
        return;
      }

      const result = results[0];
      if (!result || !result.uri) {
        return;
      }

      const contentUri = result.uri;
      const fileName = result.name || `book_${Date.now()}.txt`;

      // Check file extension
      const ext = fileName.toLowerCase().split('.').pop();
      if (ext !== 'txt' && ext !== 'epub') {
        Alert.alert('Unsupported Format', 'Please select a .txt or .epub file.');
        return;
      }

      // For content:// URIs, copy to library folder permanently
      let localPath = contentUri;
      if (contentUri.startsWith('content://')) {
        try {
          // Copy to permanent library location
          localPath = await copyBookToLibrary(contentUri, fileName);
        } catch (copyError: any) {
          console.error('Failed to copy file:', copyError);
          Alert.alert('Error', `Failed to access file: ${copyError?.message || 'Unknown error'}`);
          return;
        }
      }

      // Determine file type
      const fileType = fileName.toLowerCase().split('.').pop() as 'epub' | 'txt';
      const bookTitle = fileName.replace(/\.(epub|txt)$/i, '');

      // Add book to library (id, addedAt, lastReadAt, currentPage, coverColor are auto-generated)
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
      setBookTitle(bookTitle);
      setInitialPage(1);
      setInitialCharOffset(0);

      console.log(`[ReaderScreen] Book added to library: ${newBook.id}`);
    } catch (error: any) {
      // User cancelled - not an error (check multiple patterns)
      const errorStr = String(error?.message || error || '').toLowerCase();
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELED' ||
        error?.code === 'CANCELED' ||
        errorStr.includes('cancel') ||
        errorStr.includes('user') ||
        errorStr.includes('dismiss')
      ) {
        return;
      }
      console.error('Document picker error:', error);
      Alert.alert('Error', `Failed to pick file: ${error?.message || 'Unknown error'}`);
    }
  };

  // Get intensity color based on level
  const getIntensityColor = (intensity: number) => {
    if (intensity <= 30) return colors.intensityLow;
    if (intensity <= 70) return colors.intensityMedium;
    return colors.intensityHigh;
  };

  // Interpolate bar width
  const barWidth = intensityAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <ErrorBoundary screenName="ReaderScreen">
      <View style={[styles.container, { backgroundColor: colors.readerBackground }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.headerBackground}
        />

        {/* Header with intensity bar */}
        <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 4 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={[styles.backButtonText, { color: colors.headerText }]}>
              ←
            </Text>
          </TouchableOpacity>

          {isConnected ? (
            <View style={styles.connectionBadge}>
              <View style={[styles.connectionDot, { backgroundColor: Colors.success }]} />
              <Text style={[styles.connectionText, { color: colors.headerText }]}>Connecté</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.connectButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('DeviceTest')}
            >
              <View style={styles.connectionDot} />
              <Text style={styles.connectButtonText}>Connecter</Text>
            </TouchableOpacity>
          )}

          <View style={styles.headerCenter}>
            <Text
              style={[styles.bookTitle, { color: colors.headerText }]}
              numberOfLines={1}
            >
              {bookTitle}
            </Text>

            {/* Intensity bar */}
            <View style={styles.intensityContainer}>
              <View style={[styles.intensityBarBg, { backgroundColor: colors.border }]}>
                <Animated.View
                  style={[
                    styles.intensityBarFill,
                    {
                      backgroundColor: getIntensityColor(currentIntensity),
                      width: barWidth,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.intensityValue, { color: colors.headerText }]}>
                {currentIntensity}
              </Text>
            </View>

            {/* Analysis label */}
            {isAiActive ? (
              <Text style={[styles.keywordsText, { color: Colors.pink[200] }]}>✦ AI</Text>
            ) : matchedKeywords.length > 0 ? (
              <Text style={[styles.keywordsText, { color: Colors.pink[200] }]} numberOfLines={1}>
                {matchedKeywords.join(', ')}
              </Text>
            ) : null}
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.aaButton}
              onPress={() => setSettingsSheetVisible(true)}
            >
              <Text style={[styles.aaButtonText, { color: colors.headerText }]}>Aa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={pickFile}>
              <Text style={[styles.menuButtonText, { color: colors.headerText }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Reader Content */}
        {filePath ? (
          <ReaderView
            filePath={filePath}
            initialPage={initialPage}
            initialCharOffset={initialCharOffset}
            onContentChange={handleContentChange}
            onMetadataLoaded={handleMetadataLoaded}
            onPageChange={handlePageChange}
            onNextPageText={handleNextPageText}
            onError={handleError}
          />
        ) : (
          <EmptyState
            icon="📖"
            title="Aucun livre ouvert"
            subtitle="Sélectionnez un livre pour commencer"
            description="Ouvrez un fichier EPUB ou TXT pour analyser le contenu et synchroniser votre appareil Lovense."
            action={
              <PremiumButton
                onPress={pickFile}
                label="Sélectionner un livre"
                icon="📚"
                variant="primary"
                size="large"
              />
            }
          />
        )}

        {/* Reader settings bottom sheet */}
        <ReaderSettingsSheet
          visible={settingsSheetVisible}
          onClose={() => setSettingsSheetVisible(false)}
        />
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  backButton: {
    padding: Spacing.sm,
    minWidth: 44,
  },
  backButtonText: {
    fontSize: 24,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: Spacing.sm,
  },
  bookTitle: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  intensityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  intensityBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  intensityBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  intensityValue: {
    ...Typography.caption,
    fontWeight: '700',
    marginLeft: Spacing.sm,
    minWidth: 28,
    textAlign: 'right',
  },
  keywordsText: {
    ...Typography.caption,
    marginTop: 2,
    fontStyle: 'italic',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aaButton: {
    padding: Spacing.sm,
    minWidth: 36,
    alignItems: 'center',
  },
  aaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  menuButton: {
    padding: Spacing.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 28,
    fontWeight: '300',
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
    backgroundColor: '#fff',
  },
  connectionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  pickButton: {
    width: '100%',
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  pickButtonIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  pickButtonText: {
    ...Typography.h3,
  },
  pickButtonSubtext: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  infoContainer: {
    marginTop: Spacing.xxl,
    width: '100%',
  },
  infoTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  infoText: {
    ...Typography.body,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.md,
  },
});

export default ReaderScreen;
