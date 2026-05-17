import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  ViewToken,
  ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IRenderer, PageContent, BookMetadata } from './renderers/IRenderer';
import { getRendererForFile } from './renderers';
import { useColors, Spacing, BorderRadius, Typography } from '../../theme';
import { useAppStore } from '../../store/useAppStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAP_ZONE_WIDTH = SCREEN_WIDTH * 0.25;

const MARGIN_MAP: Record<string, number> = {
  small: 8,
  medium: 16,
  large: 28,
};

interface ParagraphItem {
  id: string;
  text: string;
  charOffset: number;
}

interface ParagraphTextProps {
  text: string;
  color: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  padding: number;
}

const ParagraphText = React.memo<ParagraphTextProps>(({ text, color, fontSize, lineHeight, fontFamily, padding }) => (
  <Text
    style={{
      color,
      fontSize,
      lineHeight: fontSize * lineHeight,
      fontFamily,
      paddingHorizontal: padding,
      paddingVertical: fontSize * 0.4,
    }}
  >
    {text}
  </Text>
));

export interface ReaderViewProps {
  filePath: string;
  initialPage?: number;
  initialCharOffset?: number;
  onContentChange?: (content: PageContent) => void;
  onMetadataLoaded?: (metadata: BookMetadata) => void;
  onError?: (error: Error) => void;
  onPageChange?: (page: number, total: number, charOffset: number) => void;
  onNextPageText?: (nextText: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  filePath,
  initialPage = 1,
  initialCharOffset,
  onContentChange,
  onMetadataLoaded,
  onError,
  onPageChange,
  onNextPageText,
}) => {
  const colors = useColors();
  const settings = useAppStore((state) => state.settings);
  const insets = useSafeAreaInsets();

  const rendererRef = useRef<IRenderer | null>(null);
  const flatListRef = useRef<FlatList<ParagraphItem>>(null);
  const scrollOffsetRef = useRef(0);
  const containerHeightRef = useRef(0);
  const tapLeftTouch = useRef({ startX: 0, startY: 0, moved: false });
  const tapRightTouch = useRef({ startX: 0, startY: 0, moved: false });

  // Stable refs so the onViewableItemsChanged handler (set once) always sees fresh data
  const paragraphsRef = useRef<ParagraphItem[]>([]);
  const callbacksRef = useRef({ onContentChange, onPageChange, onNextPageText });
  useEffect(() => {
    callbacksRef.current = { onContentChange, onPageChange, onNextPageText };
  }, [onContentChange, onPageChange, onNextPageText]);

  const [paragraphs, setParagraphs] = useState<ParagraphItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 1, total: 1, charOffset: 0 });
  const [initialScrollIndex, setInitialScrollIndex] = useState<number | null>(null);

  useEffect(() => {
    paragraphsRef.current = paragraphs;
  }, [paragraphs]);

  const readerPadding = MARGIN_MAP[settings.readerMargins ?? 'medium'] ?? 16;
  // Rough height estimate per paragraph — used for scroll position restoration
  const estimatedParaHeight = Math.round(settings.fontSize * settings.lineHeight * 4 + settings.fontSize * 0.8);

  const parseParagraphs = useCallback((text: string): ParagraphItem[] => {
    const segments = text.split(/\n\n+/);
    let offset = 0;
    const items: ParagraphItem[] = [];
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (trimmed.length > 0) {
        items.push({ id: String(items.length), text: trimmed, charOffset: offset });
      }
      offset += seg.length + 2;
    }
    return items;
  }, []);

  const loadFile = useCallback(async (
    path: string,
    charOffset: number = 0,
    startPage: number = 1,
  ) => {
    setIsLoading(true);
    setLoadError(null);
    setParagraphs([]);
    setInitialScrollIndex(null);
    scrollOffsetRef.current = 0;

    try {
      const renderer = getRendererForFile(path);
      if (!renderer) throw new Error(`Format non supporté : ${path.split('.').pop()}`);

      await renderer.load(path);
      rendererRef.current = renderer;

      const fullText = renderer.getFullText();
      if (!fullText.trim()) throw new Error('Le fichier ne contient pas de texte lisible.');

      const items = parseParagraphs(fullText);
      setParagraphs(items);

      // Find paragraph containing the saved char offset
      let startIndex = 0;
      if (charOffset > 0 && items.length > 0) {
        const idx = items.findIndex((p, i) => {
          const next = items[i + 1];
          return charOffset >= p.charOffset && (!next || charOffset < next.charOffset);
        });
        startIndex = idx >= 0 ? idx : 0;
      }

      setInitialScrollIndex(startIndex > 0 ? startIndex : null);

      const metadata = renderer.getMetadata();
      if (metadata) onMetadataLoaded?.(metadata);

      if (items.length > 0) {
        const initialText = items.slice(0, 8).map(p => p.text).join('\n\n');
        onContentChange?.({ text: initialText, pageNumber: 1 });
        const si = items[startIndex] ?? items[0];
        onPageChange?.(startIndex + 1, items.length, si.charOffset);
        setProgress({ current: startIndex + 1, total: items.length, charOffset: si.charOffset });
      }

      setIsLoading(false);
    } catch (err) {
      const e = err as Error;
      setLoadError(e.message);
      setIsLoading(false);
      onError?.(e);
    }
  }, [parseParagraphs, onMetadataLoaded, onContentChange, onPageChange, onError]);

  useEffect(() => {
    if (filePath) {
      loadFile(filePath, initialCharOffset ?? 0, initialPage);
    }
    return () => {
      rendererRef.current?.unload();
    };
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable handler — cannot be reassigned after FlatList mount
  const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!viewableItems.length) return;
    const paras = paragraphsRef.current;
    if (!paras.length) return;

    const first = viewableItems[0].item as ParagraphItem;
    const last = viewableItems[viewableItems.length - 1].item as ParagraphItem;
    const firstIndex = parseInt(first.id, 10);
    const lastIndex = parseInt(last.id, 10);
    const total = paras.length;

    setProgress({ current: firstIndex + 1, total, charOffset: first.charOffset });

    const { onContentChange: onCC, onPageChange: onPC, onNextPageText: onNPT } = callbacksRef.current;
    const visibleText = viewableItems.map(vi => (vi.item as ParagraphItem).text).join('\n\n');
    onCC?.({ text: visibleText, pageNumber: firstIndex + 1 });
    onPC?.(firstIndex + 1, total, first.charOffset);

    // Preload next ~8 paragraphs for TriggerEngine AI prefetch
    const preloadText = paras.slice(lastIndex + 1, lastIndex + 9).map(p => p.text).join('\n\n');
    if (preloadText) onNPT?.(preloadText);
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 15 });

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: estimatedParaHeight,
    offset: estimatedParaHeight * index,
    index,
  }), [estimatedParaHeight]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<ParagraphItem>) => (
    <ParagraphText
      text={item.text}
      color={colors.readerText}
      fontSize={settings.fontSize}
      lineHeight={settings.lineHeight}
      fontFamily={settings.fontFamily}
      padding={readerPadding}
    />
  ), [colors.readerText, settings.fontSize, settings.lineHeight, settings.fontFamily, readerPadding]);

  const scrollByPage = useCallback((direction: 'next' | 'prev') => {
    const delta = containerHeightRef.current * (direction === 'next' ? 0.9 : -0.9);
    const newOffset = Math.max(0, scrollOffsetRef.current + delta);
    flatListRef.current?.scrollToOffset({ offset: newOffset, animated: true });
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.readerBackground }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Chargement...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.readerBackground }]}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={[styles.errorText, { color: colors.error }]}>{loadError}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.buttonPrimary }]}
          onPress={() => loadFile(filePath, initialCharOffset ?? 0, initialPage)}
        >
          <Text style={[styles.retryButtonText, { color: colors.textOnPrimary }]}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progressPercent = progress.total > 0 ? progress.current / progress.total : 0;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.readerBackground }]}
      onLayout={(e) => { containerHeightRef.current = e.nativeEvent.layout.height; }}
    >
      {/* Continuous paragraph list — book-story style */}
      <FlatList
        ref={flatListRef}
        data={paragraphs}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex ?? undefined}
        onScrollToIndexFailed={(info) => {
          new Promise(resolve => setTimeout(resolve, 100)).then(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
          });
        }}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        initialNumToRender={25}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      />

      {/* Tap zones — left = scroll up, right = scroll down */}
      <View
        style={styles.tapZoneLeft}
        onTouchStart={(e) => {
          tapLeftTouch.current = { startX: e.nativeEvent.pageX, startY: e.nativeEvent.pageY, moved: false };
        }}
        onTouchMove={(e) => {
          const dx = Math.abs(e.nativeEvent.pageX - tapLeftTouch.current.startX);
          const dy = Math.abs(e.nativeEvent.pageY - tapLeftTouch.current.startY);
          if (dx > 10 || dy > 14) tapLeftTouch.current.moved = true;
        }}
        onTouchEnd={() => {
          if (!tapLeftTouch.current.moved) scrollByPage('prev');
        }}
      />
      <View
        style={styles.tapZoneRight}
        onTouchStart={(e) => {
          tapRightTouch.current = { startX: e.nativeEvent.pageX, startY: e.nativeEvent.pageY, moved: false };
        }}
        onTouchMove={(e) => {
          const dx = Math.abs(e.nativeEvent.pageX - tapRightTouch.current.startX);
          const dy = Math.abs(e.nativeEvent.pageY - tapRightTouch.current.startY);
          if (dx > 10 || dy > 14) tapRightTouch.current.moved = true;
        }}
        onTouchEnd={() => {
          if (!tapRightTouch.current.moved) scrollByPage('next');
        }}
      />

      {/* Brightness dim overlay */}
      {(settings.readerDimOverlay ?? 0) > 0 && (
        <View
          style={[StyleSheet.absoluteFillObject, styles.dimOverlay, { opacity: settings.readerDimOverlay }]}
          pointerEvents="none"
        />
      )}

      {/* Bottom navigation */}
      <View style={[styles.navigation, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={[styles.navButton, { backgroundColor: progress.current <= 1 ? colors.buttonDisabled : colors.buttonPrimary }]}
          onPress={() => scrollByPage('prev')}
          disabled={progress.current <= 1}
        >
          <Text style={[styles.navButtonText, { color: colors.textOnPrimary }]}>↑</Text>
        </TouchableOpacity>

        <View style={styles.pageInfoContainer}>
          <Text style={[styles.pageInfo, { color: colors.textSecondary }]}>
            {Math.round(progressPercent * 100)}%
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${progressPercent * 100}%` },
              ]}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.navButton, { backgroundColor: progress.current >= progress.total ? colors.buttonDisabled : colors.buttonPrimary }]}
          onPress={() => scrollByPage('next')}
          disabled={progress.current >= progress.total}
        >
          <Text style={[styles.navButtonText, { color: colors.textOnPrimary }]}>↓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    ...Typography.body,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  retryButtonText: {
    ...Typography.button,
  },
  listContent: {
    paddingTop: Spacing.sm,
  },
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 64,
    width: TAP_ZONE_WIDTH,
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 64,
    width: TAP_ZONE_WIDTH,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  navButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    minWidth: 50,
    alignItems: 'center',
  },
  navButtonText: {
    ...Typography.button,
    fontSize: 18,
  },
  pageInfoContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  pageInfo: {
    ...Typography.bodySmall,
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: 4,
    width: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  dimOverlay: {
    backgroundColor: '#000',
    zIndex: 10,
  },
});

export default ReaderView;
