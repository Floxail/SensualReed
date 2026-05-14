/**
 * AppNavigator - React Navigation setup with Lovense theme
 */

import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  HomeScreen,
  ReaderScreen,
  SettingsScreen,
  DeviceTestScreen,
} from '../screens';
import { RootStackParamList } from '../types';
import { useTheme, Colors } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Set to 'DeviceTest' for hardware testing, 'Home' for normal operation
const INITIAL_ROUTE: keyof RootStackParamList = 'Home';

// Custom navigation themes
const LovenseLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.pink[500],
    background: Colors.white,
    card: Colors.white,
    text: Colors.gray[900],
    border: Colors.gray[200],
    notification: Colors.pink[500],
  },
};

const LovenseDarkTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    primary: Colors.pink[400],
    background: Colors.dark.background,
    card: Colors.dark.surface,
    text: Colors.gray[100],
    border: Colors.dark.border,
    notification: Colors.pink[400],
  },
};

export const AppNavigator: React.FC = () => {
  const theme = useTheme();
  const navTheme = theme.dark ? LovenseDarkTheme : LovenseLightTheme;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={INITIAL_ROUTE}
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.colors.headerBackground,
          },
          headerTintColor: theme.colors.headerText,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: theme.colors.background,
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DeviceTest"
          component={DeviceTestScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
