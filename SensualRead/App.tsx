/**
 * SensualRead - E-Reader with Lovense Integration
 */

import React, { useState, useEffect } from 'react';
import { StatusBar, useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { PermissionScreen, checkPermissionsComplete } from './src/screens/PermissionScreen';

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
