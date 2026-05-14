/**
 * SettingsScreen - App configuration
 *
 * STATUS: STUB - Implementation pending
 */

import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography, Colors } from '../theme';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Setting Row Component
const SettingRow: React.FC<{
  label: string;
  value?: string;
  rightElement?: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}> = ({ label, value, rightElement, colors }) => (
  <View style={[styles.setting, { borderBottomColor: colors.divider }]}>
    <View style={styles.settingLeft}>
      <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
      {value && (
        <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
          {value}
        </Text>
      )}
    </View>
    {rightElement}
  </View>
);

export const SettingsScreen: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const colors = useColors();
  const { isDark, toggle: toggleTheme } = useThemeToggle();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  return (
    <ErrorBoundary screenName="SettingsScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.headerBackground}
      />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBackground, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backChevron, { color: colors.headerText }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.headerText }]}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Appearance Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          APPEARANCE
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            label={isDark ? 'Dark Mode' : 'Light Mode'}
            colors={colors}
            rightElement={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: Colors.pink[300] }}
                thumbColor={isDark ? colors.primary : colors.textMuted}
              />
            }
          />
        </View>

        {/* Haptic Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          HAPTIC FEEDBACK
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            label="Enable Haptics"
            colors={colors}
            rightElement={
              <Switch
                value={settings.hapticEnabled}
                onValueChange={(value) => updateSettings({ hapticEnabled: value })}
                trackColor={{ false: colors.border, true: Colors.pink[300] }}
                thumbColor={settings.hapticEnabled ? colors.primary : colors.textMuted}
              />
            }
          />

          <SettingRow
            label="Use Mock Device"
            value="For development testing"
            colors={colors}
            rightElement={
              <Switch
                value={settings.hapticServiceType === 'mock'}
                onValueChange={(value) =>
                  updateSettings({ hapticServiceType: value ? 'mock' : 'live' })
                }
                trackColor={{ false: colors.border, true: Colors.pink[300] }}
                thumbColor={settings.hapticServiceType === 'mock' ? colors.primary : colors.textMuted}
              />
            }
          />

          <SettingRow
            label="Sensitivity"
            value={`${(settings.sensitivity * 100).toFixed(0)}%`}
            colors={colors}
          />

          {/* Sensitivity Buttons */}
          <View style={styles.sensitivityRow}>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((val) => (
              <TouchableOpacity
                key={val}
                style={[
                  styles.sensitivityBtn,
                  {
                    backgroundColor: settings.sensitivity === val ? colors.primary : colors.surface,
                    borderColor: settings.sensitivity === val ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ sensitivity: val })}
              >
                <Text
                  style={[
                    styles.sensitivityBtnText,
                    { color: settings.sensitivity === val ? colors.textOnPrimary : colors.text },
                  ]}
                >
                  {(val * 100).toFixed(0)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Analysis Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          TEXT ANALYSIS
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            label="Enable Analysis"
            colors={colors}
            rightElement={
              <Switch
                value={settings.analysisEnabled}
                onValueChange={(value) => updateSettings({ analysisEnabled: value })}
                trackColor={{ false: colors.border, true: Colors.pink[300] }}
                thumbColor={settings.analysisEnabled ? colors.primary : colors.textMuted}
              />
            }
          />

          <SettingRow
            label="Custom Keywords"
            value={`${settings.customKeywords.length} defined`}
            colors={colors}
          />
        </View>

        {/* Reader Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          READER
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            label="Taille de police"
            value={`${settings.fontSize}px`}
            colors={colors}
          />
          <View style={styles.sensitivityRow}>
            {[14, 16, 18, 22].map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.sensitivityBtn,
                  {
                    backgroundColor: settings.fontSize === size ? colors.primary : colors.surface,
                    borderColor: settings.fontSize === size ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ fontSize: size })}
              >
                <Text
                  style={[
                    styles.sensitivityBtnText,
                    { color: settings.fontSize === size ? colors.textOnPrimary : colors.text },
                  ]}
                >
                  {size === 14 ? 'S' : size === 16 ? 'M' : size === 18 ? 'L' : 'XL'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <SettingRow
            label="Interlignage"
            value={`${settings.lineHeight}x`}
            colors={colors}
          />

          <SettingRow
            label="Police"
            value={settings.fontFamily}
            colors={colors}
          />
          <View style={styles.sensitivityRow}>
            {[
              { label: 'Serif', value: 'serif' },
              { label: 'Sans', value: 'sans-serif' },
              { label: 'Mono', value: 'monospace' },
            ].map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.sensitivityBtn,
                  {
                    backgroundColor: settings.fontFamily === value ? colors.primary : colors.surface,
                    borderColor: settings.fontFamily === value ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => updateSettings({ fontFamily: value })}
              >
                <Text
                  style={[
                    styles.sensitivityBtnText,
                    { color: settings.fontFamily === value ? colors.textOnPrimary : colors.text },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* About Section */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          ABOUT
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            label="SensualRead"
            value="Version 0.19"
            colors={colors}
          />

          <SettingRow
            label="Protocol"
            value="Lovense Nordic UART"
            colors={colors}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  title: {
    ...Typography.h2,
  },
  content: {
    flex: 1,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    marginHorizontal: Spacing.md,
  },
  section: {
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flex: 1,
  },
  settingLabel: {
    ...Typography.body,
  },
  settingValue: {
    ...Typography.caption,
    marginTop: 2,
  },
  sensitivityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  sensitivityBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  sensitivityBtnText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: Spacing.xxl,
  },
});

export default SettingsScreen;
