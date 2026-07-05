/**
 * SettingsScreen - App configuration
 *
 * STATUS: STUB - Implementation pending
 */

import React, { useEffect } from 'react';
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
  TextInput,
  ToastAndroid,
} from 'react-native';
import { usePremiumStore } from '../store/usePremiumStore';
import { MonetizationService } from '../services/monetization/MonetizationService';
import { GiftCodeService } from '../services/monetization/GiftCodeService';
import { AdService } from '../services/monetization/AdService';
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

  const { isPremium, source, sepiaUnlocked, unlockSepia } = usePremiumStore();
  const [productPrice, setProductPrice] = React.useState<string>('...');
  const [giftCode, setGiftCode] = React.useState('');
  const [purchaseLoading, setPurchaseLoading] = React.useState(false);
  const [giftLoading, setGiftLoading] = React.useState(false);
  const [rewardLoading, setRewardLoading] = React.useState(false);

  useEffect(() => {
    if (!isPremium) {
      MonetizationService.getProductPrice().then(setProductPrice);
    }
  }, [isPremium]);

  const handlePurchase = async () => {
    setPurchaseLoading(true);
    try {
      await MonetizationService.purchase();
      AdService.destroyAll();
      ToastAndroid.show('Premium activé !', ToastAndroid.SHORT);
    } catch (e: any) {
      if (e?.message !== 'CANCELLED') {
        ToastAndroid.show("Erreur lors de l'achat. Réessaie.", ToastAndroid.SHORT);
      }
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleRestore = async () => {
    setPurchaseLoading(true);
    try {
      const found = await MonetizationService.restorePurchases();
      if (found) {
        AdService.destroyAll();
        ToastAndroid.show('Achat restauré !', ToastAndroid.SHORT);
      } else {
        ToastAndroid.show('Aucun achat trouvé.', ToastAndroid.SHORT);
      }
    } catch {
      ToastAndroid.show('Erreur réseau. Réessaie.', ToastAndroid.SHORT);
    } finally {
      setPurchaseLoading(false);
    }
  };

  const handleGiftCode = async () => {
    if (!giftCode.trim()) return;
    setGiftLoading(true);
    try {
      await GiftCodeService.activate(giftCode);
      AdService.destroyAll();
      setGiftCode('');
      ToastAndroid.show('Code cadeau activé !', ToastAndroid.SHORT);
    } catch {
      ToastAndroid.show('Code invalide.', ToastAndroid.SHORT);
    } finally {
      setGiftLoading(false);
    }
  };

  const handleRewarded = async () => {
    setRewardLoading(true);
    try {
      const earned = await AdService.showRewarded();
      if (earned) {
        unlockSepia();
        updateSettings({ theme: 'sepia' });
        ToastAndroid.show('Thème Sepia déverrouillé !', ToastAndroid.SHORT);
      }
    } finally {
      setRewardLoading(false);
    }
  };

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
        {/* ── SECTION PREMIUM ── */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          PREMIUM
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {isPremium ? (
            <View style={{ padding: Spacing.md }}>
              <Text style={[styles.settingLabel, { color: colors.primary }]}>
                ✦ Premium actif ✓
              </Text>
              <Text style={[styles.settingValue, { color: colors.textSecondary, marginTop: 4 }]}>
                Source : {source === 'gift' ? 'Code cadeau' : 'Achat'}
              </Text>
            </View>
          ) : (
            <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                ✦ SensualRead Premium
              </Text>
              <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                Lisez sans interruption publicitaire.
              </Text>

              <TouchableOpacity
                style={[styles.premiumBtn, { backgroundColor: colors.primary }]}
                onPress={handlePurchase}
                disabled={purchaseLoading}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>
                  {purchaseLoading ? 'Traitement...' : `Acheter — ${productPrice}`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleRestore} disabled={purchaseLoading}>
                <Text style={{ color: colors.primary, textAlign: 'center', marginTop: 4 }}>
                  Restaurer un achat
                </Text>
              </TouchableOpacity>

              <View style={{ marginTop: Spacing.sm }}>
                <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                  Code cadeau :
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <TextInput
                    style={[styles.codeInput, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                    value={giftCode}
                    onChangeText={setGiftCode}
                    placeholder="MONCODE"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={[styles.premiumBtn, { backgroundColor: colors.primary, paddingHorizontal: 16 }]}
                    onPress={handleGiftCode}
                    disabled={giftLoading}
                  >
                    <Text style={{ color: '#FFFFFF' }}>
                      {giftLoading ? '...' : 'Activer'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {!isPremium && !sepiaUnlocked && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textMuted, marginTop: Spacing.lg }]}>
              BONUS
            </Text>
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <TouchableOpacity
                style={{ padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}
                onPress={handleRewarded}
                disabled={rewardLoading}
              >
                <Text style={{ fontSize: 20 }}>📺</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: colors.text }]}>
                    {rewardLoading ? 'Chargement...' : 'Regarder une pub'}
                  </Text>
                  <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
                    Déverrouille le thème Sepia (permanent)
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

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
            value="Version 0.36"
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
  premiumBtn: {
    backgroundColor: '#FF4D7D',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
});

export default SettingsScreen;
