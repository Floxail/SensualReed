# BLE Persistent Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Lovense BLE connection alive when navigating from DeviceTestScreen to ReaderScreen, and add a "Connecter" button in the Reader header when disconnected.

**Architecture:** DeviceTestScreen stores its connected `LiveHapticService` in the global Zustand store on connect, and stops (but never disconnects) on unmount. ReaderScreen reads from the store instead of creating a new service. The existing TriggerEngine effect already reads from the store — only the bad `initializeHapticService` override needs removal.

**Tech Stack:** React Native, TypeScript, Zustand (`useAppStore`), `IHapticService` / `LiveHapticService`

---

## Files Changed

| File | Change |
|------|--------|
| `src/screens/DeviceTestScreen.tsx` | Add `useAppStore` import; store service on connect; remove `.disconnect()` from cleanup |
| `src/screens/ReaderScreen.tsx` | Remove `initializeHapticService` effect; add `isConnected` state + `onConnectionChange` subscription; replace `<ConnectionStatus />` with inline connect button |

---

### Task 1: DeviceTestScreen — Store Service + Fix Cleanup

**Files:**
- Modify: `src/screens/DeviceTestScreen.tsx`

- [ ] **Step 1: Add `useAppStore` import**

In `src/screens/DeviceTestScreen.tsx`, find the imports block. Add after the existing `../theme` import:

```typescript
import { useAppStore } from '../store/useAppStore';
```

- [ ] **Step 2: Store service in global store on connect**

Find `handleConnect` (looks like this):

```typescript
const handleConnect = async (device: DeviceInfo) => {
  setIsConnecting(true);
  try {
    await hapticService.current.connect(device.id);
  } catch (error) {
    Alert.alert('Erreur Connexion', error instanceof Error ? error.message : 'Inconnu');
  } finally {
    setIsConnecting(false);
  }
};
```

Replace with:

```typescript
const handleConnect = async (device: DeviceInfo) => {
  setIsConnecting(true);
  try {
    await hapticService.current.connect(device.id);
    useAppStore.setState({ hapticService: hapticService.current });
  } catch (error) {
    Alert.alert('Erreur Connexion', error instanceof Error ? error.message : 'Inconnu');
  } finally {
    setIsConnecting(false);
  }
};
```

- [ ] **Step 3: Fix cleanup — stop only, never disconnect**

Find the cleanup `useEffect` that calls `.disconnect()` on unmount (looks like this):

```typescript
useEffect(() => {
  return () => {
    if (hapticService.current.isConnected()) {
      hapticService.current.stop();
      hapticService.current.disconnect();
    }
  };
}, []);
```

Replace with:

```typescript
useEffect(() => {
  return () => {
    if (hapticService.current.isConnected()) {
      hapticService.current.stop();
    }
  };
}, []);
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | grep DeviceTestScreen
```

Expected: no new errors on `DeviceTestScreen.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/screens/DeviceTestScreen.tsx
git commit -m "fix: persist BLE connection when leaving DeviceTestScreen"
```

---

### Task 2: ReaderScreen — Reuse Global Service + Connect Button

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: Add `NativeStackNavigationProp` import**

Find the existing import:
```typescript
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
```

Replace with:
```typescript
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
```

- [ ] **Step 2: Type the navigation hook**

Find:
```typescript
const navigation = useNavigation();
```

Replace with:
```typescript
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
```

- [ ] **Step 3: Add `isConnected` state**

Find the block of `useState` declarations (around line 50). After `const [initialPage, setInitialPage] = useState...`, add:

```typescript
const [isConnected, setIsConnected] = useState(
  () => useAppStore.getState().hapticService?.isConnected() ?? false
);
```

- [ ] **Step 4: Remove `initializeHapticService` effect**

Find and DELETE the entire effect that creates a new `LiveHapticService` (it starts with `// Initialize haptic service`):

```typescript
// Initialize haptic service
useEffect(() => {
  const initializeHapticService = async () => {
    try {
      const hapticService = new LiveHapticService();
      useAppStore.setState({ hapticService });

      const unsubscribe = hapticService.onConnectionChange((connected) => {
        useAppStore.setState({ connection: { ...useAppStore.getState().connection, isConnected: connected } });
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

Delete this block entirely.

- [ ] **Step 5: Add connection state subscription effect**

After the `useState` declarations and before the existing TriggerEngine `useEffect`, add:

```typescript
// Subscribe to BLE connection state from global store
useEffect(() => {
  const service = useAppStore.getState().hapticService;
  if (!service) return;

  setIsConnected(service.isConnected());

  const unsubscribe = service.onConnectionChange((connected) => {
    setIsConnected(connected);
  });

  return () => unsubscribe();
}, []);
```

- [ ] **Step 6: Replace `<ConnectionStatus />` with inline connect button**

Find in the JSX header:
```tsx
<ConnectionStatus />
```

Replace with:
```tsx
{isConnected ? (
  <View style={styles.connectionBadge}>
    <View style={[styles.connectionDot, { backgroundColor: Colors.success }]} />
    <Text style={[styles.connectionText, { color: colors.headerText }]}>Connecté</Text>
  </View>
) : (
  <TouchableOpacity
    style={[styles.connectButton, { backgroundColor: colors.primary }]}
    onPress={() => navigation.navigate('DeviceTest')}
  >
    <View style={styles.connectionDot} />
    <Text style={styles.connectButtonText}>Connecter</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 7: Add new styles**

In `StyleSheet.create({...})`, add these entries anywhere (e.g. after `menuButtonText`):

```typescript
connectionBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 8,
  paddingVertical: 4,
},
connectionDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: 4,
  backgroundColor: '#fff',
},
connectionText: {
  fontSize: 12,
  fontWeight: '600',
},
connectButton: {
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 12,
  paddingHorizontal: 8,
  paddingVertical: 4,
},
connectButtonText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
},
```

- [ ] **Step 8: Remove unused `LiveHapticService` import**

Find:
```typescript
import { LiveHapticService } from '../services/bluetooth/LiveHapticService';
```

Delete this line (no longer instantiated in ReaderScreen).

- [ ] **Step 9: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep ReaderScreen
```

Expected: no new errors on `ReaderScreen.tsx`.

- [ ] **Step 10: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "fix: reuse global BLE service in Reader; add connect button when disconnected"
```

---

### Task 3: Build APK v0.11 + Manual Verification

- [ ] **Step 1: Update version in SettingsScreen**

In `src/screens/SettingsScreen.tsx`, find:
```tsx
<SettingRow
  label="SensualRead"
  value="Version 1.0.0"
  colors={colors}
/>
```

Replace `"Version 1.0.0"` with `"Version 0.11"`.

- [ ] **Step 2: Bundle JS**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res
```

Expected: `Done writing bundle output` (exit 0).

- [ ] **Step 3: Build APK**

```bash
cd android && ./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Copy APK**

```bash
cp android/app/build/outputs/apk/debug/app-debug.apk C:/Users/Floxa/Downloads/BookLovense/SensualRead-v0.11.apk
```

- [ ] **Step 5: Manual verification**

1. Install APK on device
2. Open app → tap "Connexion" → connect Lovense device
3. Header shows device name → navigate **back to Home** (tap "‹ Retour")
4. Tap a book → Reader opens
5. Header shows **"● Connecté"** (green dot) — not "Connecter"
6. Scroll through a passage with erotic keywords → intensity bar animates → device vibrates
7. Disconnect device in Settings → Reader header switches to **"Connecter"** button
8. Tap "Connecter" → navigates to DeviceTestScreen

### Task 4: Auto-Reconnection Logic (Persistance ID)

Objectif : Mémoriser le dernier appareil connecté pour tenter une reconnexion invisible au démarrage de l'application ou lors de l'ouverture du lecteur.
4.1 Mise à jour du Store (useAppStore.ts)

Ajouter un champ lastConnectedDeviceId dans l'état pour persister l'identifiant.

    - [ ] **Step 1 : Modifier le store**
    Ajouter lastConnectedDeviceId: string | null à l'interface du store et s'assurer que le middleware de persistance (si utilisé) inclut ce champ.

4.2 Implémentation dans DeviceTestScreen

    [ ] Étape 2 : Sauvegarder l'ID lors d'une connexion réussie
    Dans handleConnect, après useAppStore.setState({ hapticService: hapticService.current }), ajouter :

TypeScript

useAppStore.setState({ lastConnectedDeviceId: device.id });

4.3 Logique de reconnexion dans ReaderScreen

    [ ] Étape 3 : Tentative de reconnexion automatique
    Modifier le useEffect de souscription à la connexion pour inclure une tentative si le service est présent mais déconnecté.

TypeScript

useEffect(() => {
  const service = useAppStore.getState().hapticService;
  const lastId = useAppStore.getState().lastConnectedDeviceId;

  if (!service) return;

  const attemptReconnect = async () => {
    if (!service.isConnected() && lastId) {
      try {
        console.log('[AutoConnect] Tentative de reconnexion à:', lastId);
        await service.connect(lastId);
      } catch (e) {
        console.warn('[AutoConnect] Échec de la reconnexion automatique');
      }
    }
  };

  attemptReconnect();
  
  const unsubscribe = service.onConnectionChange((connected) => {
    setIsConnected(connected);
  });

  return () => unsubscribe();
}, []);