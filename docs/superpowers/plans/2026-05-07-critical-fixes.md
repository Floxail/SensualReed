# SensualRead Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs (haptic disconnection, no error handling, circular dependency, missing status feedback) then polish UI with frontend-design.

**Architecture:** 
- Fix haptic integration by storing LiveHapticService instance in Zustand + connecting TriggerEngine to it
- Add error boundaries at screen level for crash safety
- Replace circular `require()` in theme with proper module organization
- Add connection status display showing device state (scanning/connected/disconnected)

**Tech Stack:** React Native 0.83, TypeScript 5.x, Zustand 5.x, react-native-ble-plx 3.x

---

## File Structure

| File | Purpose | Type |
|------|---------|------|
| `src/store/useAppStore.ts` | Add hapticService instance + connection state | Modify |
| `src/screens/ReaderScreen.tsx` | Connect TriggerEngine to haptic service | Modify |
| `src/theme/index.ts` | Remove circular dependency, use proper export | Modify |
| `src/components/ErrorBoundary.tsx` | New error boundary for crash protection | Create |
| `src/screens/HomeScreen.tsx` | Add connection status display | Modify |
| `src/services/bluetooth/LiveHapticService.ts` | Add connection state export | Modify |

---

## Task 1: Fix Theme Circular Dependency

**Files:**
- Modify: `src/theme/index.ts`
- Modify: `src/store/useAppStore.ts`

**Context:** Current theme system uses `require()` inside hooks to avoid circular dependency. This is fragile. Solution: export theme directly from colors, use store callback instead of hook inside theme.

- [ ] **Step 1: Update useAppStore to export current theme value**

Replace `src/store/useAppStore.ts` with updated version that exports theme state cleanly:

```typescript
// src/store/useAppStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LiveHapticService } from '../services/bluetooth/LiveHapticService';

interface AppSettings {
  theme: 'light' | 'dark';
  analysisEnabled: boolean;
  sensitivityLevel: number;
}

interface AppState {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  hapticService: LiveHapticService | null;
  setHapticService: (service: LiveHapticService | null) => void;
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: {
        theme: 'light',
        analysisEnabled: true,
        sensitivityLevel: 50,
      },
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),
      hapticService: null,
      setHapticService: (service) => set({ hapticService: service }),
      isConnected: false,
      setIsConnected: (connected) => set({ isConnected: connected }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
```

- [ ] **Step 2: Rewrite theme index to remove require()**

Replace `src/theme/index.ts` entirely to get theme from store properly:

```typescript
// src/theme/index.ts
/**
 * Theme System - Lovense Design
 * Exports theme utilities and hooks
 */

export { Colors, LightTheme, DarkTheme } from './colors';
export type { Theme, ThemeColors } from './colors';

import { LightTheme, DarkTheme } from './colors';
import { useAppStore } from '../store/useAppStore';

type AnyTheme = typeof LightTheme | typeof DarkTheme;

/**
 * Hook to get current theme based on app settings
 */
export function useTheme(): AnyTheme {
  const themeSetting = useAppStore((state) => state.settings.theme);
  return themeSetting === 'dark' ? DarkTheme : LightTheme;
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

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

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
```

- [ ] **Step 3: Test theme still works**

Run app:
```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx react-native start --reset-cache
```

Expected: App loads, theme toggle works, no errors in console about circular dependencies.

- [ ] **Step 4: Commit**

```bash
git add src/theme/index.ts src/store/useAppStore.ts
git commit -m "fix: remove circular dependency from theme system"
```

---

## Task 2: Create Error Boundary Component

**Files:**
- Create: `src/components/ErrorBoundary.tsx`

**Context:** App has no crash safety. Add React error boundary to wrap screens.

- [ ] **Step 1: Create ErrorBoundary component**

Create `src/components/ErrorBoundary.tsx`:

```typescript
import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useColors } from '../theme';

interface Props {
  children: ReactNode;
  screenName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary] ${this.props.screenName || 'Component'} crashed:`, error);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

const ErrorFallback: React.FC<{ error: Error | null; onReset: () => void }> = ({
  error,
  onReset,
}) => {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>Oops! Something went wrong</Text>
        {error && (
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {error.message}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onReset}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Update HomeScreen to use ErrorBoundary**

Modify `src/screens/HomeScreen.tsx` - wrap entire JSX in ErrorBoundary. Find the return statement and wrap:

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export const HomeScreen: React.FC = () => {
  // ... existing code ...

  return (
    <ErrorBoundary screenName="HomeScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* existing JSX */}
      </SafeAreaView>
    </ErrorBoundary>
  );
};
```

- [ ] **Step 3: Update ReaderScreen to use ErrorBoundary**

Modify `src/screens/ReaderScreen.tsx` - wrap entire JSX:

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export const ReaderScreen: React.FC = () => {
  // ... existing code ...

  return (
    <ErrorBoundary screenName="ReaderScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* existing JSX */}
      </SafeAreaView>
    </ErrorBoundary>
  );
};
```

- [ ] **Step 4: Update SettingsScreen to use ErrorBoundary**

Modify `src/screens/SettingsScreen.tsx`:

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export const SettingsScreen: React.FC = () => {
  // ... existing code ...

  return (
    <ErrorBoundary screenName="SettingsScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* existing JSX */}
      </SafeAreaView>
    </ErrorBoundary>
  );
};
```

- [ ] **Step 5: Update DeviceTestScreen to use ErrorBoundary**

Modify `src/screens/DeviceTestScreen.tsx`:

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export const DeviceTestScreen: React.FC = () => {
  // ... existing code ...

  return (
    <ErrorBoundary screenName="DeviceTestScreen">
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* existing JSX */}
      </SafeAreaView>
    </ErrorBoundary>
  );
};
```

- [ ] **Step 6: Test error boundary**

Run app and navigate to HomeScreen. Should load without errors.

```bash
npx react-native start --reset-cache
```

- [ ] **Step 7: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/screens/*.tsx
git commit -m "feat: add error boundary for crash safety"
```

---

## Task 3: Add Lovense Connection Status to Store

**Files:**
- Modify: `src/services/bluetooth/LiveHapticService.ts`
- Modify: `src/store/useAppStore.ts` (already done in Task 1)

**Context:** TriggerEngine needs to know if device is connected. LiveHapticService tracks this internally but doesn't expose it to the app. Add callback system.

- [ ] **Step 1: Add connection listener to LiveHapticService**

Modify `src/services/bluetooth/LiveHapticService.ts`. Find the class definition and add connection callback:

```typescript
export class LiveHapticService implements IHapticService {
  private bleManager: BleManager;
  private connectedDevice: Device | null = null;
  private deviceInfo: DeviceInfo | null = null;
  private txCharacteristic: Characteristic | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  // ... existing fields ...

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of connection change
   */
  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  // Find connect() method and update it to call notifyConnectionChange(true)
  // Find disconnect() method and update it to call notifyConnectionChange(false)
}
```

In the `connect()` method (around line ~80), after successfully connecting, add:
```typescript
this.notifyConnectionChange(true);
```

In the `disconnect()` method, after cleanup, add:
```typescript
this.notifyConnectionChange(false);
```

- [ ] **Step 2: Test connection callbacks work**

Run app and open DeviceTestScreen. Connect to device - should see connection state update.

```bash
npx react-native start --reset-cache
```

- [ ] **Step 3: Commit**

```bash
git add src/services/bluetooth/LiveHapticService.ts
git commit -m "feat: add connection state listener to LiveHapticService"
```

---

## Task 4: Connect TriggerEngine to Haptic Service in ReaderScreen

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**Context:** Currently TriggerEngine is created but never connected to the actual haptic service. Fix this by getting the service from store and connecting it.

- [ ] **Step 1: Import haptic service from store**

Modify `src/screens/ReaderScreen.tsx`. At the top with imports, add:

```typescript
import { LiveHapticService } from '../services/bluetooth/LiveHapticService';
```

- [ ] **Step 2: Initialize haptic service in ReaderScreen**

Find the `useEffect` that creates TriggerEngine (around line 74). Replace it with:

```typescript
// Initialize haptic service
useEffect(() => {
  const initializeHapticService = async () => {
    try {
      const hapticService = new LiveHapticService();
      useAppStore.setState({ hapticService });

      // Subscribe to connection state
      const unsubscribe = hapticService.onConnectionChange((connected) => {
        useAppStore.setState({ isConnected: connected });
      });

      return unsubscribe;
    } catch (error) {
      console.error('[ReaderScreen] Failed to initialize haptic service:', error);
    }
  };

  let unsubscribe: (() => void) | undefined;
  initializeHapticService().then(fn => { unsubscribe = fn; });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}, []);
```

- [ ] **Step 3: Connect TriggerEngine to haptic service**

Find the TriggerEngine initialization useEffect (around line 74, now further down). Update it to connect to the haptic service:

```typescript
// Initialize TriggerEngine and connect to haptic
useEffect(() => {
  triggerEngineRef.current = new TriggerEngine();

  // Connect to haptic service if available
  const hapticService = useAppStore.getState().hapticService;
  if (hapticService) {
    triggerEngineRef.current.setHapticService(hapticService);
  }

  // Subscribe to intensity changes
  const unsubscribe = triggerEngineRef.current.onIntensityChange((result: AnalysisResult) => {
    setCurrentIntensity(result.score);
    setMatchedKeywords(result.matchedKeywords.slice(0, 3));

    // Animate intensity bar
    Animated.spring(intensityAnim, {
      toValue: result.score,
      useNativeDriver: false,
      tension: 50,
      friction: 7,
    }).start();
  });

  return () => {
    unsubscribe();
    triggerEngineRef.current?.stop();
  };
}, []);
```

- [ ] **Step 4: Test haptic integration**

Run app:
```bash
npx react-native start --reset-cache
```

Open ReaderScreen, connect to Lovense device, open book. Change intensity bar - device should vibrate.

Expected: Device vibrates at different intensities as text is analyzed.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: connect TriggerEngine to haptic service"
```

---

## Task 5: Create Connection Status Display Component

**Files:**
- Create: `src/components/ConnectionStatus.tsx`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `src/screens/ReaderScreen.tsx`

**Context:** User can't see if device is connected. Add visual indicator.

- [ ] **Step 1: Create ConnectionStatus component**

Create `src/components/ConnectionStatus.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '../theme';
import { useAppStore } from '../store/useAppStore';

export const ConnectionStatus: React.FC = () => {
  const colors = useColors();
  const isConnected = useAppStore((state) => state.isConnected);

  const statusColor = isConnected ? '#10B981' : '#EF4444';
  const statusText = isConnected ? 'Connecté' : 'Déconnecté';
  const dotColor = isConnected ? colors.success || '#10B981' : colors.error || '#EF4444';

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, { color: colors.textMuted }]}>
        {statusText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Add ConnectionStatus to HomeScreen header**

Modify `src/screens/HomeScreen.tsx`. Find the header/title area and add:

```typescript
import { ConnectionStatus } from '../components/ConnectionStatus';

// In the JSX, add to the top bar:
<View style={[styles.header, { backgroundColor: colors.surface }]}>
  <Text style={[styles.title, { color: colors.text }]}>Ma Bibliothèque</Text>
  <ConnectionStatus />
</View>
```

- [ ] **Step 3: Add ConnectionStatus to ReaderScreen header**

Modify `src/screens/ReaderScreen.tsx`. Add to top of reader:

```typescript
import { ConnectionStatus } from '../components/ConnectionStatus';

// In the JSX header area:
<View style={[styles.header, { backgroundColor: colors.surface }]}>
  <Text style={[styles.bookTitle, { color: colors.text }]}>{bookTitle}</Text>
  <ConnectionStatus />
</View>
```

- [ ] **Step 4: Test connection status display**

Run app:
```bash
npx react-native start --reset-cache
```

Navigate to HomeScreen and ReaderScreen. Should see "Connecté" (green) or "Déconnecté" (red) status indicator.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConnectionStatus.tsx src/screens/HomeScreen.tsx src/screens/ReaderScreen.tsx
git commit -m "feat: add Lovense connection status indicator"
```

---

## Task 6: Update Theme Colors to Include Status Colors

**Files:**
- Modify: `src/theme/colors.ts`

**Context:** ErrorBoundary and ConnectionStatus need success/error colors. Add them to theme.

- [ ] **Step 1: Update colors.ts to export success/error colors**

Modify `src/theme/colors.ts`. Find the theme definitions and add to both LightTheme and DarkTheme:

```typescript
// In both theme objects, add:
success: '#10B981',
error: '#EF4444',
warning: '#F59E0B',
```

Example for LightTheme:
```typescript
export const LightTheme: Theme = {
  dark: false,
  colors: {
    primary: Colors.pink[500],
    background: Colors.white,
    surface: Colors.gray[50],
    text: Colors.gray[900],
    textSecondary: Colors.gray[600],
    textMuted: Colors.gray[500],
    border: Colors.gray[200],
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    // ... rest
  },
  // ...
};
```

- [ ] **Step 2: Update ThemeColors type to include new colors**

Update the `ThemeColors` interface in `src/theme/colors.ts`:

```typescript
export interface ThemeColors {
  primary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  error: string;
  warning: string;
  // ... rest of existing colors
}
```

- [ ] **Step 3: Test app still loads**

Run:
```bash
npx react-native start --reset-cache
```

Expected: No TypeScript errors, app loads.

- [ ] **Step 4: Commit**

```bash
git add src/theme/colors.ts
git commit -m "feat: add success/error/warning colors to theme"
```

---

## Summary

**Phase 1 Complete:** All critical bugs fixed.
- ✅ Theme circular dependency removed
- ✅ Error boundaries added for crash safety
- ✅ TriggerEngine connected to haptic service
- ✅ Connection status feedback added

**Next:** Phase 2 - Use frontend-design skill to polish UI (improve empty states, loading states, visual feedback during scanning/connecting).
