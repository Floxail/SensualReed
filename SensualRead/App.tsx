/**
 * SensualRead - E-Reader with Lovense Integration
 */

import React, { useState, useEffect } from 'react';
import { StatusBar, useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { PermissionScreen, checkPermissionsComplete } from './src/screens/PermissionScreen';
import { MonetizationService } from './src/services/monetization/MonetizationService';
import { AdService } from './src/services/monetization/AdService';
import { usePremiumStore } from './src/store/usePremiumStore';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [isLoading, setIsLoading] = useState(true);
  const [showPermissions, setShowPermissions] = useState(false);

  useEffect(() => {
    checkFirstLaunch();
  }, []);

  const checkFirstLaunch = async () => {
    const permissionsComplete = await checkPermissionsComplete();
    if (!permissionsComplete) {
      setShowPermissions(true);
    }

    // Initialiser monétisation (IAP + gift code restore)
    try {
      await MonetizationService.initialize();
    } catch {
      // Pas bloquant — l'app fonctionne sans réseau
    }

    // Initialiser AdMob seulement si pas premium
    if (!usePremiumStore.getState().isPremium) {
      AdService.initialize();
    }

    setIsLoading(false);
  };

  const handlePermissionsComplete = () => {
    setShowPermissions(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDarkMode ? '#121212' : '#FFFFFF' }]}>
        <ActivityIndicator size="large" color="#FF4D7D" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#121212' : '#FFFFFF'}
      />
      {showPermissions ? (
        <PermissionScreen onComplete={handlePermissionsComplete} />
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
