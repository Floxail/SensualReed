import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IRenderer, PageContent, BookMetadata } from './renderers/IRenderer';
import { getRendererForFile } from './renderers';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography } from '../../theme';
import { useAppStore } from '../../store/useAppStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAP_ZONE_WIDTH = SCREEN_WIDTH * 0.25;

const MARGIN_MAP: Record<string, number> = {
  small: 8,
  medium: 16,
  large: 28,
};

const CHAR_WIDTH_RATIO: Record<string, number> = {
  'serif': 0.50,
  'sans-serif': 0.48,
  'monospace': 0.60,
};

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

interface ReaderViewProps {
  filePath: string;
  initialPage?: number;
  initialCharOffset?: number;
  onContentChange?: (content: PageContent) => void;
  onMetadataLoaded?: (metadata: BookMetadata) => void;
  onError?: (error: Error) => void;
  onPageChange?: (page: number, total: number, charOffset: number) => void;
  onNextPageText?: (nextText: string) => void;
}

interface ReaderState {
  current: number;
  total: number;
  content: string;
  title: string;
  isLoading: boolean;
  error: string | null;
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
  const { isDark } = useThemeToggle();
  const settings = useAppStore((state) => state.settings);
  const insets = useSafeAreaInsets();

  const rendererRef = useRef<IRenderer | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const containerDims = useRef({ width: 0, height: 0 });
  const slideAnim = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  const tapLeftTouch = useRef({ startX: 0, startY: 0, moved: false });
  const tapRightTouch = useRef({ startX: 0, startY: 0, moved: false });

  const [state, setState] = useState<ReaderState>({
    current: 0,
    total: 0,
    content: '',
    title: '',
    isLoading: true,
    error: null,
  });

  const [pageBuffer, setPageBuffer] = useState({ prevText: '', currText: '', nextText: '' });
  const [dimsReady, setDimsReady] = useState(false);

  const recalcCharsPerPage = useCallback(() => {
    const { width, height } = containerDims.current;
    if (!width || !height || !rendererRef.current?.isLoaded()) return;
    const ratio = CHAR_WIDTH_RATIO[settings.fontFamily] ?? 0.50;
    const charsPerLine = Math.floor(width / (settings.fontSize * ratio));
    const linesPerPage = Math.floor(height / (settings.fontSize * settings.lineHeight));
    const newCharsPerPage = Math.max(800, charsPerLine * linesPerPage);
    rendererRef.current.setCharsPerPage(newCharsPerPage);
  }, [settings.fontSize, settings.lineHeight, settings.fontFamily]);

  const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setDimsReady(true);
    if (width === containerDims.current.width && height === containerDims.current.height) return;
    containerDims.current = { width, height };
    recalcCharsPerPage();
  }, [recalcCharsPerPage]);

  const updateBuffer = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    let cp = renderer.getCurrentPage();

    // Skip blank pages (defensive: max 3 skips forward)
    let skips = 0;
    while (skips < 3 && !/\S/.test(renderer.getPageText(cp) ?? '')) {
      if (cp < renderer.getTotalPages()) {
        renderer.nextPage();
        cp = renderer.getCurrentPage();
        skips++;
      } else {
        break;
      }
    }

    const nextText = renderer.getPageText(cp + 1) ?? '';
    setPageBuffer({
      prevText: renderer.getPageText(cp - 1) ?? '',
      currText: renderer.getPageText(cp) ?? '',
      nextText,
    });
    onNextPageText?.(nextText);
  }, [onNextPageText]);

  // Load file when path changes
  useEffect(() => {
    if (filePath) {
      setDimsReady(false);
      loadFile(filePath, initialPage);
    }
    return () => {
      rendererRef.current?.unload();
    };
  }, [filePath, initialPage]);

  // Repaginate when font settings change
  useEffect(() => {
    recalcCharsPerPage();
  }, [recalcCharsPerPage]);

  const loadFile = async (path: string, startPage: number = 1) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const timeoutId = setTimeout(() => {
      setDimsReady(true);
    }, 500);

    try {
      const renderer = getRendererForFile(path);
      if (!renderer) {
        throw new Error(`Unsupported file format: ${path.split('.').pop()}`);
      }

      await renderer.load(path);
      rendererRef.current = renderer;

      const unsubscribe = renderer.onContentChange((content) => {
        setState(prev => ({
          ...prev,
          current: content.pageNumber,
          total: renderer.getTotalPages(),
          content: content.text,
        }));
        updateBuffer();
        onContentChange?.(content);
        onPageChange?.(content.pageNumber, renderer.getTotalPages(), renderer.getCurrentCharOffset());
      });

      // If onLayout already fired before load completed, apply viewport dims now
      recalcCharsPerPage();

      // Use charOffset for precise resume if available, else fall back to page number
      if (initialCharOffset && initialCharOffset > 0) {
        renderer.goToCharOffset(initialCharOffset);
      } else if (startPage > 1 && startPage <= renderer.getTotalPages()) {
        renderer.goToPage(startPage);
      }

      const initialContent = renderer.getCurrentContent();
      const metadata = renderer.getMetadata();

      if (initialContent) {
        const cp = initialContent.pageNumber;
        setState({
          current: cp,
          total: renderer.getTotalPages(),
          content: initialContent.text,
          title: metadata?.title || '',
          isLoading: false,
          error: null,
        });
        const initialNextText = renderer.getPageText(cp + 1) ?? '';
        setPageBuffer({
          prevText: renderer.getPageText(cp - 1) ?? '',
          currText: renderer.getPageText(cp) ?? '',
          nextText: initialNextText,
        });
        onNextPageText?.(initialNextText);
        onContentChange?.(initialContent);
        onPageChange?.(cp, renderer.getTotalPages(), renderer.getCurrentCharOffset());
      }

      if (metadata) {
        onMetadataLoaded?.(metadata);
      }

      clearTimeout(timeoutId);
      return () => unsubscribe();
    } catch (error) {
      const err = error as Error;
      clearTimeout(timeoutId);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message,
      }));
      onError?.(err);
    }
  };

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

  if (state.isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.readerBackground }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading book...
        </Text>
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.readerBackground }]}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={[styles.errorText, { color: colors.error }]}>
          {state.error}
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.buttonPrimary }]}
          onPress={() => loadFile(filePath)}
        >
          <Text style={[styles.retryButtonText, { color: colors.textOnPrimary }]}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const readerPadding = MARGIN_MAP[settings.readerMargins ?? 'medium'] ?? 16;

  return (
    <View style={[styles.container, { backgroundColor: colors.readerBackground }]}>
      {/* Content area — overflow:hidden clips the slide animation */}
      <View style={styles.contentClip}>
        <Animated.View style={[styles.contentAnimated, { transform: [{ translateX: slideAnim }] }]}>
          <View style={styles.contentTouchable} onLayout={handleContentLayout}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { padding: readerPadding, paddingBottom: readerPadding + 24 }]}
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
            {/* Tap zones with jitter protection — ignore touches that moved > 10px */}
            <View
              style={styles.tapZoneLeft}
              onTouchStart={(e) => {
                tapLeftTouch.current = {
                  startX: e.nativeEvent.pageX,
                  startY: e.nativeEvent.pageY,
                  moved: false,
                };
              }}
              onTouchMove={(e) => {
                const dx = Math.abs(e.nativeEvent.pageX - tapLeftTouch.current.startX);
                const dy = Math.abs(e.nativeEvent.pageY - tapLeftTouch.current.startY);
                if (dx > 10 || dy > 14) tapLeftTouch.current.moved = true;
              }}
              onTouchEnd={() => {
                if (!tapLeftTouch.current.moved) animateAndTurnPage('prev');
              }}
            />
            <View
              style={styles.tapZoneRight}
              onTouchStart={(e) => {
                tapRightTouch.current = {
                  startX: e.nativeEvent.pageX,
                  startY: e.nativeEvent.pageY,
                  moved: false,
                };
              }}
              onTouchMove={(e) => {
                const dx = Math.abs(e.nativeEvent.pageX - tapRightTouch.current.startX);
                const dy = Math.abs(e.nativeEvent.pageY - tapRightTouch.current.startY);
                if (dx > 10 || dy > 14) tapRightTouch.current.moved = true;
              }}
              onTouchEnd={() => {
                if (!tapRightTouch.current.moved) animateAndTurnPage('next');
              }}
            />
          </View>
        </Animated.View>
      </View>

      {/* Brightness dim overlay */}
      {(settings.readerDimOverlay ?? 0) > 0 && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.dimOverlay,
            { opacity: settings.readerDimOverlay },
          ]}
          pointerEvents="none"
        />
      )}

      {/* Bottom Navigation */}
      <View style={[styles.navigation, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={[
            styles.navButton,
            { backgroundColor: state.current <= 1 ? colors.buttonDisabled : colors.buttonPrimary },
          ]}
          onPress={() => animateAndTurnPage('prev')}
          disabled={state.current <= 1}
        >
          <Text style={[styles.navButtonText, { color: colors.textOnPrimary }]}>
            Prev
          </Text>
        </TouchableOpacity>

        <View style={styles.pageInfoContainer}>
          <Text style={[styles.pageInfo, { color: colors.textSecondary }]}>
            {state.current} / {state.total}
          </Text>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${(state.current / Math.max(state.total, 1)) * 100}%`,
                },
              ]}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.navButton,
            { backgroundColor: state.current >= state.total ? colors.buttonDisabled : colors.buttonPrimary },
          ]}
          onPress={() => animateAndTurnPage('next')}
          disabled={state.current >= state.total}
        >
          <Text style={[styles.navButtonText, { color: colors.textOnPrimary }]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>

      {!dimsReady && (
        <View style={[StyleSheet.absoluteFillObject, styles.readyGate, { backgroundColor: colors.readerBackground }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
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
  contentClip: {
    flex: 1,
    overflow: 'hidden',
  },
  contentAnimated: {
    flex: 1,
  },
  contentTouchable: {
    flex: 1,
  },
  tapZoneLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: TAP_ZONE_WIDTH,
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: TAP_ZONE_WIDTH,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
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
    minWidth: 70,
    alignItems: 'center',
  },
  navButtonText: {
    ...Typography.button,
    fontSize: 14,
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
  readyGate: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  dimOverlay: {
    backgroundColor: '#000',
    zIndex: 10,
  },
});

export default ReaderView;
