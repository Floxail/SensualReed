# BLE Persistent Connection Design

**Date**: 2026-05-11  
**Status**: Approved

---

## Problem

1. `DeviceTestScreen` disconnects the BLE device on unmount (navigation away) — the cleanup `useEffect` calls `hapticService.current.disconnect()`.
2. `DeviceTestScreen` stores its `LiveHapticService` in a local `useRef` — never shared globally.
3. `ReaderScreen.initializeHapticService` always creates a **new** `LiveHapticService()`, overwriting the store and losing the existing connection.
4. No way to connect from the Reader when the device is disconnected.

---

## Solution

### 1. DeviceTestScreen — Store on connect, don't disconnect on unmount

**`handleConnect`** — after `await hapticService.current.connect(device.id)` succeeds, store the service globally:
```typescript
useAppStore.setState({ hapticService: hapticService.current });
```

**Cleanup `useEffect`** — stop vibration only, keep BLE connection alive:
```typescript
return () => {
  if (hapticService.current.isConnected()) {
    hapticService.current.stop();
    // No disconnect — connection persists across screens
  }
};
```

### 2. ReaderScreen — Reuse global service, never create new

Remove the `initializeHapticService` function that creates `new LiveHapticService()`.

Replace with a single `useEffect` that:
1. Reads the existing service from `useAppStore.getState().hapticService`
2. If connected, passes it to `TriggerEngine` via `triggerEngineRef.current.setHapticService(service)`
3. Subscribes to `hapticService.onConnectionChange(...)` to update local `isConnected` state

```typescript
const [isConnected, setIsConnected] = useState(
  () => useAppStore.getState().hapticService?.isConnected() ?? false
);

useEffect(() => {
  const service = useAppStore.getState().hapticService;
  if (!service) return;

  if (service.isConnected()) {
    triggerEngineRef.current?.setHapticService(service);
  }

  const unsubscribe = service.onConnectionChange((connected) => {
    setIsConnected(connected);
    if (connected && triggerEngineRef.current) {
      triggerEngineRef.current.setHapticService(service);
    }
  });

  return () => unsubscribe();
}, []);
```

### 3. Reader header — Connecter button when disconnected

Replace the `<ConnectionStatus />` component in the Reader header with inline logic:

- **Disconnected**: pink pill button `[● Connecter]` → `navigation.navigate('DeviceTest')`
- **Connected**: green dot badge `[● Connecté]` (non-tappable, display only)

Style: small pill, same height as the header row. Pink primary color for the "Connecter" state.

---

## Files to Change

| File | Change |
|------|--------|
| `src/screens/DeviceTestScreen.tsx` | Store service on connect; remove `.disconnect()` from cleanup |
| `src/screens/ReaderScreen.tsx` | Remove `initializeHapticService`; add store-based connection effect; replace `ConnectionStatus` with inline connect button |

---

## Out of Scope

- Auto-reconnect on BLE drop (not requested)
- Scan from Reader (not requested — navigate to DeviceTest instead)
- Changing `DeviceTestScreen` UI beyond the two targeted fixes
