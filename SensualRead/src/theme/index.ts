/**
 * Theme System - Lovense Design
 *
 * Exports theme utilities and hooks
 */

export { Colors, LightTheme, DarkTheme } from './colors';
export type { Theme, ThemeColors } from './colors';

import { useColorScheme } from 'react-native';
import { LightTheme, DarkTheme } from './colors';
import { useAppStore } from '../store/useAppStore';

type AnyTheme = typeof LightTheme | typeof DarkTheme;

/**
 * Hook to get current theme based on app settings or system preference
 */
export function useTheme(): AnyTheme {
  const themeSetting = useAppStore((state) => state.settings.theme);
  const systemColorScheme = useColorScheme();

  if (themeSetting === 'dark') return DarkTheme;
  if (themeSetting === 'light') return LightTheme;

  // Default to system preference if setting is 'system' or anything else
  return systemColorScheme === 'dark' ? DarkTheme : LightTheme;
}

/**
 * Hook to get theme colors directly
 */
export function useColors() {
  const theme = useTheme();
  return theme.colors;
}

/**
 * Hook to check if dark mode is active
 */
export function useIsDarkMode(): boolean {
  const theme = useTheme();
  return theme.dark;
}

/**
 * Hook to toggle theme
 */
export function useThemeToggle() {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const currentTheme = useAppStore((state) => state.settings.theme);

  return {
    isDark: currentTheme === 'dark',
    toggle: () => {
      updateSettings({ theme: currentTheme === 'dark' ? 'light' : 'dark' });
    },
    setTheme: (theme: 'light' | 'dark') => {
      updateSettings({ theme });
    },
  };
}

/**
 * Get theme by name (for non-hook usage)
 */
export function getTheme(themeName: 'light' | 'dark'): AnyTheme {
  return themeName === 'dark' ? DarkTheme : LightTheme;
}

/**
 * Spacing scale (4px base)
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Border radius scale
 */
export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/**
 * Typography scale
 */
export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '600' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 24,
  },
} as const;

/**
 * Shadows
 */
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;
