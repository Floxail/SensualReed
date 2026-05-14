/**
 * DeviceTestScreen - Test screen for Lovense device connection
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  Switch,
  Animated,
  Pressable,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceInfo, IHapticService } from '../services/bluetooth';
import { LiveHapticService } from '../services/bluetooth/LiveHapticService';
import { MockHapticService } from '../services/bluetooth/MockHapticService';
import { Colors, Spacing, BorderRadius, useColors, useThemeToggle, ThemeColors } from '../theme';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAppStore } from '../store/useAppStore';

const USE_MOCK = false;

const MenuItem: React.FC<{
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  colors: ThemeColors;
}> = ({ icon, label, value, onPress, rightElement, colors }) => (
  <TouchableOpacity
    style={[styles.menuItem, { borderBottomColor: colors.border }]}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    <View style={styles.menuItemLeft}>
      <Text style={styles.menuItemIcon}>{icon}</Text>
      <View>
        <Text style={[styles.menuItemLabel, { color: colors.text }]}>{label}</Text>
        {value && <Text style={[styles.menuItemValue, { color: colors.textSecondary }]}>{value}</Text>}
      </View>
    </View>
    {rightElement}
  </TouchableOpacity>
);

export const DeviceTestScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.0);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const slideAnim = useRef(new Animated.Value(-300)).current;

  const colors = useColors();
  const { isDark, toggle: toggleTheme } = useThemeToggle();

  const hapticService = useRef<IHapticService>(
    USE_MOCK ? new MockHapticService() : new LiveHapticService()
  );

  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<DeviceInfo | null>(null);
  const [currentIntensity, setCurrentIntensity] = useState(0);

  const openMenu = () => {
    setMenuVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeMenu = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setMenuVisible(false));
  };

  useEffect(() => {
    const unsubscribe = hapticService.current.onConnectionChange((connected) => {
      if (connected) {
        setConnectedDevice(hapticService.current.getConnectedDevice());
      } else {
        setConnectedDevice(null);
        useAppStore.getState().setHapticService(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setDevices([]);
    try {
      const foundDevices = await hapticService.current.scan();
      setDevices(foundDevices);
    } catch (error) {
      Alert.alert('Erreur Scan', error instanceof Error ? error.message : 'Inconnu');
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async (device: DeviceInfo) => {
    setIsConnecting(true);
    try {
      await hapticService.current.connect(device.id);
      useAppStore.getState().setHapticService(hapticService.current);
      useAppStore.getState().setLastConnectedDeviceId(device.id);
    } catch (error) {
      Alert.alert('Erreur Connexion', error instanceof Error ? error.message : 'Inconnu');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await hapticService.current.disconnect();
    setCurrentIntensity(0);
    useAppStore.getState().setHapticService(null);
  };

  const handleSetIntensity = (intensity: number) => {
    if (!hapticEnabled) return;
    const finalIntensity = Math.min(100, Math.max(0, Math.round(intensity * sensitivity)));
    setCurrentIntensity(finalIntensity);
    hapticService.current.setIntensity(finalIntensity);
  };

  const handleStop = () => {
    setCurrentIntensity(0);
    hapticService.current.stop();
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity <= 30) return colors.intensityLow;
    if (intensity <= 70) return colors.intensityMedium;
    return colors.intensityHigh;
  };

  return (
    <ErrorBoundary screenName="DeviceTestScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: colors.textOnPrimary }]}>Lovense</Text>
            <Text style={[styles.subtitle, { color: Colors.pink[200] }]}>Test & Connexion</Text>
          </View>
          <TouchableOpacity onPress={openMenu} style={styles.gearButton}>
            <Text style={styles.gearIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={menuVisible} transparent animationType="none" onRequestClose={closeMenu}>
          <Pressable style={styles.menuOverlay} onPress={closeMenu}>
            <Animated.View style={[styles.menuContainer, { backgroundColor: colors.background, transform: [{ translateX: slideAnim }] }]}>
              <Pressable style={{ flex: 1 }} onPress={(e) => e.stopPropagation()}>
                <View style={[styles.menuHeader, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
                  <Text style={[styles.menuTitle, { color: colors.textOnPrimary }]}>Réglages</Text>
                  <TouchableOpacity onPress={closeMenu} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>X</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.menuContent}>
                  <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>APPARENCE</Text>
                  <View style={[styles.menuItem, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.menuItemLabel, { color: colors.text }]}>{isDark ? 'Mode Sombre' : 'Mode Clair'}</Text>
                    <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: colors.border, true: Colors.pink[300] }} thumbColor={isDark ? colors.primary : colors.textMuted} />
                  </View>

                  <Text style={[styles.menuSectionTitle, { color: colors.textMuted, marginTop: 20 }]}>HAPTIQUE (CONFORT)</Text>
                  <MenuItem icon="📳" label="Vibrations" value={hapticEnabled ? "Activées" : "Désactivées"} colors={colors} rightElement={<Switch value={hapticEnabled} onValueChange={setHapticEnabled} trackColor={{ false: colors.border, true: Colors.pink[300] }} thumbColor={hapticEnabled ? colors.primary : colors.textMuted} />} />

                  <View style={styles.menuItemNonClickable}>
                    <Text style={[styles.menuItemLabel, { color: colors.text }]}>Sensibilité: {(sensitivity * 100).toFixed(0)}%</Text>
                  </View>
                  <View style={styles.sensitivityGrid}>
                    {[0.5, 0.75, 1.0, 1.5, 2.0].map((val) => (
                      <TouchableOpacity
                        key={val}
                        onPress={() => setSensitivity(val)}
                        style={[styles.sensitivityBtn, {
                          backgroundColor: sensitivity === val ? colors.primary : colors.card,
                          borderColor: sensitivity === val ? colors.primary : colors.border
                        }]}
                      >
                        <Text style={{ color: sensitivity === val ? '#fff' : colors.text, fontSize: 12 }}>{val}x</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </Pressable>
            </Animated.View>
          </Pressable>
        </Modal>

        <View style={[styles.statusBar, { backgroundColor: connectedDevice ? Colors.success : colors.textMuted }]}>
          <Text style={styles.statusText}>{connectedDevice ? `Connecté: ${connectedDevice.name}` : 'Déconnecté'}</Text>
          {connectedDevice && <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}><Text style={styles.disconnectButtonText}>Déconnecter</Text></TouchableOpacity>}
        </View>

        {!connectedDevice ? (
          <View style={styles.section}>
            <TouchableOpacity style={[styles.scanButton, { backgroundColor: colors.buttonPrimary }, isScanning && { backgroundColor: colors.buttonDisabled }]} onPress={handleScan} disabled={isScanning}>
              {isScanning ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={[styles.scanButtonText, { color: colors.textOnPrimary }]}>Scanner les appareils</Text>}
            </TouchableOpacity>
            <FlatList data={devices} keyExtractor={(item) => item.id} style={styles.deviceList} renderItem={({ item }) => (
              <TouchableOpacity style={[styles.deviceItem, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleConnect(item)} disabled={isConnecting}>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.deviceType, { color: colors.textSecondary }]}>Modèle: {item.type}</Text>
                </View>
                {isConnecting && <ActivityIndicator size="small" color={colors.primary} />}
              </TouchableOpacity>
            )} ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textMuted }]}>{isScanning ? 'Recherche en cours...' : 'Aucun appareil trouvé.'}</Text>} />
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Contrôle d'intensité</Text>
            <View style={styles.intensityDisplay}>
              <Text style={[styles.intensityValue, { color: getIntensityColor(currentIntensity) }]}>{currentIntensity}</Text>
              <Text style={[styles.intensityLabel, { color: colors.textSecondary }]}>/ 100</Text>
            </View>
            <View style={[styles.intensityBarBg, { backgroundColor: colors.border }]}>
              <View style={[styles.intensityBarFill, { backgroundColor: getIntensityColor(currentIntensity), width: `${currentIntensity}%` }]} />
            </View>
            <View style={styles.intensityGrid}>
              {[0, 20, 40, 60, 80, 100].map((value) => (
                <TouchableOpacity key={value} style={[styles.intensityButton, { backgroundColor: currentIntensity === value ? colors.primary : colors.card, borderColor: currentIntensity === value ? colors.primary : colors.border }]} onPress={() => handleSetIntensity(value)}>
                  <Text style={[styles.intensityButtonText, { color: currentIntensity === value ? colors.textOnPrimary : colors.text }]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.stopButton, { backgroundColor: colors.error }]} onPress={handleStop}>
              <Text style={styles.stopButtonText}>STOP</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: { padding: 8, minWidth: 36, justifyContent: 'center', alignItems: 'center' },
  backChevron: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  gearButton: { padding: 8, minWidth: 36, justifyContent: 'center', alignItems: 'center' },
  gearIcon: { fontSize: 22, color: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 12 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuContainer: { width: 300, height: '100%' },
  menuHeader: { padding: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuTitle: { fontSize: 20, fontWeight: 'bold' },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  menuContent: { flex: 1, padding: Spacing.md },
  menuSectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8 },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
  menuItemIcon: { fontSize: 20, marginRight: 14 },
  menuItemLabel: { fontSize: 16, fontWeight: '500' },
  menuItemValue: { fontSize: 13, marginTop: 2 },
  menuItemNonClickable: { paddingVertical: 14 },
  sensitivityGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sensitivityBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, flex: 1, alignItems: 'center', marginHorizontal: 2 },
  statusBar: { padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  disconnectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: BorderRadius.sm },
  disconnectButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  section: { padding: Spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: Spacing.md },
  scanButton: { padding: 18, borderRadius: BorderRadius.lg, alignItems: 'center', marginBottom: Spacing.md },
  scanButtonText: { fontSize: 17, fontWeight: '700' },
  deviceList: { maxHeight: 300 },
  deviceItem: { padding: 14, borderRadius: BorderRadius.lg, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 17, fontWeight: '600' },
  deviceType: { fontSize: 14, marginTop: 2 },
  emptyText: { textAlign: 'center', marginTop: 24, fontSize: 15 },
  intensityDisplay: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: Spacing.sm },
  intensityValue: { fontSize: 64, fontWeight: 'bold' },
  intensityLabel: { fontSize: 24, marginLeft: 4 },
  intensityBarBg: { height: 8, borderRadius: 4, marginBottom: Spacing.md, overflow: 'hidden' },
  intensityBarFill: { height: '100%', borderRadius: 4 },
  intensityGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  intensityButton: { width: '31%', padding: 16, borderRadius: BorderRadius.lg, alignItems: 'center', borderWidth: 2 },
  intensityButtonText: { fontSize: 20, fontWeight: '700' },
  stopButton: { padding: 20, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.md },
  stopButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
});

export default DeviceTestScreen;
