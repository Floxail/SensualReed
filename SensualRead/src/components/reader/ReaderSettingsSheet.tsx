import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { useColors, Spacing, BorderRadius, Typography, Colors } from '../../theme';
import { useAppStore } from '../../store/useAppStore';

interface ReaderSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = 340;

const MARGIN_OPTIONS: Array<{ label: string; value: 'small' | 'medium' | 'large' }> = [
  { label: 'Étroit', value: 'small' },
  { label: 'Normal', value: 'medium' },
  { label: 'Large', value: 'large' },
];

const LINE_HEIGHT_OPTIONS = [1.2, 1.4, 1.6, 1.8];
const FONT_SIZE_OPTIONS = [14, 16, 18, 22];
const FONT_FAMILY_OPTIONS = [
  { label: 'Serif', value: 'serif' },
  { label: 'Sans', value: 'sans-serif' },
  { label: 'Mono', value: 'monospace' },
];
const DIM_LEVELS = [0, 0.15, 0.35, 0.55];
const DIM_LABELS = ['☀', '◑', '◐', '●'];

export const ReaderSettingsSheet: React.FC<ReaderSettingsSheetProps> = ({ visible, onClose }) => {
  const colors = useColors();
  const { settings, updateSettings } = useAppStore();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SHEET_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, opacityAnim]);

  if (!visible && slideAnim._value === SHEET_HEIGHT) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents={visible ? 'auto' : 'none'}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Affichage</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Font size */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Taille</Text>
          <View style={styles.optionGroup}>
            {FONT_SIZE_OPTIONS.map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.optionBtn,
                  {
                    backgroundColor: settings.fontSize === size ? colors.primary : colors.card,
                    borderColor: settings.fontSize === size ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ fontSize: size })}
              >
                <Text style={[
                  styles.optionBtnText,
                  { color: settings.fontSize === size ? colors.textOnPrimary : colors.text },
                ]}>
                  {size === 14 ? 'S' : size === 16 ? 'M' : size === 18 ? 'L' : 'XL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Line height */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Interligne</Text>
          <View style={styles.optionGroup}>
            {LINE_HEIGHT_OPTIONS.map((lh) => (
              <TouchableOpacity
                key={lh}
                style={[
                  styles.optionBtn,
                  {
                    backgroundColor: settings.lineHeight === lh ? colors.primary : colors.card,
                    borderColor: settings.lineHeight === lh ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ lineHeight: lh })}
              >
                <Text style={[
                  styles.optionBtnText,
                  { color: settings.lineHeight === lh ? colors.textOnPrimary : colors.text },
                ]}>
                  {lh}×
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Font family */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Police</Text>
          <View style={styles.optionGroup}>
            {FONT_FAMILY_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.optionBtn,
                  styles.optionBtnWide,
                  {
                    backgroundColor: settings.fontFamily === value ? colors.primary : colors.card,
                    borderColor: settings.fontFamily === value ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ fontFamily: value })}
              >
                <Text style={[
                  styles.optionBtnText,
                  { color: settings.fontFamily === value ? colors.textOnPrimary : colors.text, fontFamily: value },
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Marges */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Marges</Text>
          <View style={styles.optionGroup}>
            {MARGIN_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.optionBtn,
                  styles.optionBtnWide,
                  {
                    backgroundColor: settings.readerMargins === value ? colors.primary : colors.card,
                    borderColor: settings.readerMargins === value ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ readerMargins: value })}
              >
                <Text style={[
                  styles.optionBtnText,
                  { color: settings.readerMargins === value ? colors.textOnPrimary : colors.text },
                ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Luminosité (dim overlay) */}
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Luminosité</Text>
          <View style={styles.optionGroup}>
            {DIM_LEVELS.map((dim, i) => (
              <TouchableOpacity
                key={dim}
                style={[
                  styles.optionBtn,
                  styles.optionBtnWide,
                  {
                    backgroundColor: settings.readerDimOverlay === dim ? colors.primary : colors.card,
                    borderColor: settings.readerDimOverlay === dim ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ readerDimOverlay: dim })}
              >
                <Text style={[
                  styles.optionBtnText,
                  { color: settings.readerDimOverlay === dim ? colors.textOnPrimary : colors.text },
                ]}>
                  {DIM_LABELS[i]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    ...Typography.h3,
  },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  rowLabel: {
    ...Typography.caption,
    width: 72,
    fontWeight: '600',
  },
  optionGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBtnWide: {
    flex: 1,
  },
  optionBtnText: {
    ...Typography.caption,
    fontWeight: '600',
    fontSize: 11,
  },
});

export default ReaderSettingsSheet;
