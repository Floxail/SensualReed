/**
 * Lovense-inspired Color Palette
 *
 * Primary: Pink tones (Lovense brand)
 * Secondary: White/Light gray
 * Dark mode: Deep backgrounds with pink accents
 */

export const Colors = {
  // Lovense Pink Palette
  pink: {
    50: '#FFF0F5',   // Lavender blush
    100: '#FFE4EC',  // Light pink
    200: '#FFCCD8',  // Soft pink
    300: '#FFB3C4',  // Medium pink
    400: '#FF80A0',  // Vibrant pink
    500: '#FF4D7D',  // Primary Lovense pink
    600: '#E6336A',  // Dark pink
    700: '#CC1A57',  // Deep pink
    800: '#B30044',  // Rich pink
    900: '#800031',  // Darkest pink
  },

  // Neutral palette
  white: '#FFFFFF',
  black: '#000000',

  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },

  // Dark mode specific
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    card: '#2A2A2A',
    elevated: '#333333',
    border: '#404040',
  },

  // Semantic colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',

  // Transparent overlays
  overlay: {
    light: 'rgba(255, 255, 255, 0.8)',
    dark: 'rgba(0, 0, 0, 0.6)',
    pink: 'rgba(255, 77, 125, 0.15)',
  },
} as const;

/**
 * Light Theme
 */
export const LightTheme = {
  dark: false,
  colors: {
    // Core
    primary: Colors.pink[500],
    primaryLight: Colors.pink[200],
    primaryDark: Colors.pink[700],

    // Backgrounds
    background: Colors.white,
    surface: Colors.gray[50],
    card: Colors.white,

    // Text
    text: Colors.gray[900],
    textSecondary: Colors.gray[600],
    textMuted: Colors.gray[400],
    textOnPrimary: Colors.white,

    // Borders & Dividers
    border: Colors.gray[200],
    divider: Colors.gray[100],

    // Interactive elements
    buttonPrimary: Colors.pink[500],
    buttonPrimaryPressed: Colors.pink[600],
    buttonSecondary: Colors.pink[100],
    buttonSecondaryPressed: Colors.pink[200],
    buttonDisabled: Colors.gray[300],

    // Status
    success: Colors.success,
    warning: Colors.warning,
    error: Colors.error,
    info: Colors.info,

    // Special
    tabBar: Colors.white,
    tabBarIcon: Colors.gray[400],
    tabBarIconActive: Colors.pink[500],
    statusBar: Colors.pink[500],
    headerBackground: Colors.pink[500],
    headerText: Colors.white,

    // Reader specific
    readerBackground: '#FFFBF5', // Warm paper color
    readerText: Colors.gray[800],
    intensityLow: Colors.pink[200],
    intensityMedium: Colors.pink[400],
    intensityHigh: Colors.pink[600],
  },
} as const;

/**
 * Dark Theme
 */
export const DarkTheme = {
  dark: true,
  colors: {
    // Core
    primary: Colors.pink[400],
    primaryLight: Colors.pink[300],
    primaryDark: Colors.pink[600],

    // Backgrounds
    background: Colors.dark.background,
    surface: Colors.dark.surface,
    card: Colors.dark.card,

    // Text
    text: Colors.gray[100],
    textSecondary: Colors.gray[400],
    textMuted: Colors.gray[600],
    textOnPrimary: Colors.white,

    // Borders & Dividers
    border: Colors.dark.border,
    divider: Colors.gray[800],

    // Interactive elements
    buttonPrimary: Colors.pink[500],
    buttonPrimaryPressed: Colors.pink[400],
    buttonSecondary: Colors.pink[900],
    buttonSecondaryPressed: Colors.pink[800],
    buttonDisabled: Colors.gray[700],

    // Status
    success: '#66BB6A',
    warning: '#FFA726',
    error: '#EF5350',
    info: '#42A5F5',

    // Special
    tabBar: Colors.dark.surface,
    tabBarIcon: Colors.gray[500],
    tabBarIconActive: Colors.pink[400],
    statusBar: Colors.dark.background,
    headerBackground: Colors.dark.surface,
    headerText: Colors.pink[400],

    // Reader specific
    readerBackground: Colors.dark.background,
    readerText: Colors.gray[200],
    intensityLow: Colors.pink[700],
    intensityMedium: Colors.pink[500],
    intensityHigh: Colors.pink[400],
  },
} as const;

export type ThemeColors = typeof LightTheme.colors | typeof DarkTheme.colors;
export type Theme = typeof LightTheme | typeof DarkTheme;
