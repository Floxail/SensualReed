/**
 * PermissionScreen - First launch permission setup
 *
 * Requests all necessary permissions automatically for a smooth user experience.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors, Spacing, BorderRadius, Typography } from '../theme';

const PERMISSIONS_KEY = 'sensualread_permissions_granted';

interface PermissionScreenProps {
  onComplete: () => void;
}

export const PermissionScreen: React.FC<PermissionScreenProps> = ({ onComplete }) => {
  const colors = useColors();
  const [step, setStep] = useState<'welcome' | 'requesting' | 'error'>('welcome');
  const [errorMessage, setErrorMessage] = useState('');

  const requestAllPermissions = async () => {
    setStep('requesting');

    if (Platform.OS !== 'android') {
      // iOS - permissions handled differently
      await markPermissionsComplete();
      onComplete();
      return;
    }

    try {
      const apiLevel = Platform.Version as number;
      let allGranted = true;

      if (apiLevel >= 31) {
        // Android 12+ - Request Bluetooth permissions
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        allGranted =
          results['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          results['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        // Android 11 and below - Need location for BLE
        const locationResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Localisation requise',
            message: 'SensualRead a besoin de la localisation pour scanner les appareils Bluetooth.',
            buttonPositive: 'Autoriser',
            buttonNegative: 'Refuser',
          }
        );
        allGranted = locationResult === PermissionsAndroid.RESULTS.GRANTED;
      }

      if (allGranted) {
        await markPermissionsComplete();
        onComplete();
      } else {
        setStep('error');
        setErrorMessage(
          'Les permissions Bluetooth sont nécessaires pour connecter votre jouet Lovense.'
        );
      }
    } catch (error) {
      console.error('Permission request error:', error);
      setStep('error');
      setErrorMessage('Erreur lors de la demande de permissions.');
    }
  };

  const markPermissionsComplete = async () => {
    await AsyncStorage.setItem(PERMISSIONS_KEY, 'true');
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const retryPermissions = () => {
    setStep('welcome');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {step === 'welcome' && (
        <>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{"💕"}</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Bienvenue sur SensualRead
          </Text>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            L'application qui synchronise vos lectures avec votre jouet Lovense
          </Text>

          <View style={styles.featureList}>
            <FeatureItem
              icon="📚"
              text="Lisez vos ebooks (EPUB, TXT)"
              color={colors.textSecondary}
            />
            <FeatureItem
              icon="📊"
              text="Analyse automatique du texte"
              color={colors.textSecondary}
            />
            <FeatureItem
              icon="📳"
              text="Vibrations synchronisées"
              color={colors.textSecondary}
            />
          </View>

          <View style={styles.permissionNote}>
            <Text style={[styles.noteText, { color: colors.textSecondary }]}>
              Pour fonctionner, l'app a besoin d'accéder au Bluetooth pour connecter votre jouet.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.buttonPrimary }]}
            onPress={requestAllPermissions}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>
              Commencer
            </Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'requesting' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text }]}>
            Configuration en cours...
          </Text>
        </View>
      )}

      {step === 'error' && (
        <>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{"⚠️"}</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>
            Permissions requises
          </Text>

          <Text style={[styles.errorText, { color: colors.textSecondary }]}>
            {errorMessage}
          </Text>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.buttonPrimary }]}
            onPress={retryPermissions}
          >
            <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>
              Réessayer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, { borderColor: colors.border }]}
            onPress={openSettings}
          >
            <Text style={[styles.buttonSecondaryText, { color: colors.text }]}>
              Ouvrir les paramètres
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={async () => {
              await markPermissionsComplete();
              onComplete();
            }}
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>
              Continuer sans Bluetooth
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

interface FeatureItemProps {
  icon: string;
  text: string;
  color: string;
}

const FeatureItem: React.FC<FeatureItemProps> = ({ icon, text, color }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={[styles.featureText, { color }]}>{text}</Text>
  </View>
);

// Check if permissions have already been requested
export const checkPermissionsComplete = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(PERMISSIONS_KEY);
    return value === 'true';
  } catch {
    return false;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    ...Typography.h1,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  featureList: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  featureText: {
    ...Typography.body,
    flex: 1,
  },
  permissionNote: {
    backgroundColor: 'rgba(255, 77, 125, 0.1)',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    width: '100%',
  },
  noteText: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  buttonText: {
    ...Typography.button,
    fontSize: 18,
  },
  buttonSecondary: {
    width: '100%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  buttonSecondaryText: {
    ...Typography.button,
  },
  skipButton: {
    paddingVertical: Spacing.md,
  },
  skipText: {
    ...Typography.bodySmall,
    textDecorationLine: 'underline',
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.body,
    marginTop: Spacing.lg,
  },
  errorText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
});

export default PermissionScreen;
