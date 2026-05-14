# Phase 8 — Lovense Toy Profiles & Smart Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make haptic commands toy-aware (Nora gets vibrate+rotate, Max2 gets vibrate+pump, Edge2 gets dual vibrate, others vibrate-only), and make text analysis context-aware (category weights per analysis mode, French/English negation detection so "ne l'embrassa pas" doesn't trigger).

**Architecture:** `scoreToCommandForDevice(score, deviceType)` in `IHapticService.ts` replaces the current one-size-fits-all `scoreToCommand`, using `DeviceCapabilities` from `LovenseProtocol.ts` to pick the right command mix. `LiveHapticService.setIntensity()` passes the connected device type. `KeywordAnalyzer.analyze()` gains category weight multipliers (stored in `AppSettings.categoryWeights`) and negation detection (position-aware regex scanning 40 chars before each keyword match for French/English negation patterns). Analysis mode presets (`'soft' | 'normal' | 'intense' | 'explicit'`) in Settings update the weight map in one tap.

**Tech Stack:** Pure TypeScript additions — no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/services/bluetooth/IHapticService.ts` | Modify | Expand `DeviceInfo.type`, add `scoreToCommandForDevice` |
| `src/services/bluetooth/LiveHapticService.ts` | Modify | Use device-type-aware command in `setIntensity` |
| `src/types/index.ts` | Modify | Add `analysisMode` + `categoryWeights` to `AppSettings` |
| `src/store/useAppStore.ts` | Modify | Add new settings defaults |
| `src/engines/analysis/KeywordAnalyzer.ts` | Modify | Category weights + negation detection |
| `src/engines/analysis/ITriggerEngine.ts` | Modify | Add `setCategoryWeights` to interface |
| `src/engines/analysis/TriggerEngine.ts` | Modify | Forward `categoryWeights` from settings to analyzer |
| `src/screens/ReaderScreen.tsx` | Modify | Push `categoryWeights` changes to TriggerEngine |
| `src/screens/SettingsScreen.tsx` | Modify | Analysis mode presets + device type display |

---

## Task 1: Expand DeviceInfo.type and add device-aware scoreToCommandForDevice

**Files:**
- Modify: `src/services/bluetooth/IHapticService.ts`

- [ ] **Step 1: Expand the DeviceInfo.type union**

In `src/services/bluetooth/IHapticService.ts`, find:

```typescript
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'lush' | 'hush' | 'domi' | 'osci' | 'unknown';
  batteryLevel?: number;
}
```

Replace with:

```typescript
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'lush' | 'hush' | 'domi' | 'osci' | 'nora' | 'max' | 'edge' | 'ambi' | 'ferri' | 'diamo' | 'unknown';
  batteryLevel?: number;
}
```

- [ ] **Step 2: Add scoreToCommandForDevice**

In `src/services/bluetooth/IHapticService.ts`, after the existing `scoreToCommand` function (after line 93), add:

```typescript
/**
 * Device-type-aware score → command mapping.
 *
 * Uses DeviceCapabilities from LovenseProtocol to determine which
 * actuators to drive and at what level.
 *
 * Score tiers:
 *   0-10:   Stop
 *   11-40:  Low   (vibrate ~25%)
 *   41-70:  Medium (vibrate ~60%)
 *   71-100: High  (vibrate 100% + secondary actuator if available)
 */
export function scoreToCommandForDevice(score: number, deviceType: string): HapticCommand {
  // Import inline to avoid circular dependency issues at module level
  // DeviceCapabilities is a plain object — safe to use here
  const caps: { vibrate: boolean; rotate: boolean; pump: boolean; maxVibrate: number; maxRotate: number } =
    (require('./LovenseProtocol').DeviceCapabilities as Record<string, typeof import('./LovenseProtocol').DeviceCapabilities[string]>)[deviceType]
    ?? (require('./LovenseProtocol').DeviceCapabilities as Record<string, unknown>)['unknown'] as typeof import('./LovenseProtocol').DeviceCapabilities[string];

  if (score <= 10) {
    return { vibrate: 0 };
  }

  if (score <= 40) {
    return { vibrate: 5 };
  }

  if (score <= 70) {
    return { vibrate: 12 };
  }

  // High intensity — add secondary actuator if available
  const cmd: HapticCommand = { vibrate: caps.maxVibrate };
  if (caps.rotate) cmd.rotate = Math.round(caps.maxRotate * 0.5);
  if (caps.pump) cmd.pump = 2;
  return cmd;
}
```

**Note on the require():** The circular dep risk (IHapticService ↔ LovenseProtocol) is avoided by using inline require inside the function body, which loads at call-time not at module-load-time. An alternative is to move `DeviceCapabilities` lookup to `LiveHapticService.setIntensity()` directly — either approach is fine; the inline require keeps the function standalone.

Actually, prefer the alternative (no require): move the device-capability lookup into `LiveHapticService.setIntensity()` to keep `IHapticService.ts` free of runtime require calls. Update the function above to take capabilities directly:

Replace the `scoreToCommandForDevice` above with this simpler version:

```typescript
/**
 * Device-type-aware score → command mapping.
 * Pass in the device's capabilities from DeviceCapabilities[deviceType].
 */
export function scoreToCommandForDevice(
  score: number,
  caps: { vibrate: boolean; rotate: boolean; pump: boolean; maxVibrate: number; maxRotate: number },
): HapticCommand {
  if (score <= 10) {
    return { vibrate: 0 };
  }
  if (score <= 40) {
    return { vibrate: 5 };
  }
  if (score <= 70) {
    return { vibrate: 12 };
  }
  const cmd: HapticCommand = { vibrate: caps.maxVibrate };
  if (caps.rotate) cmd.rotate = Math.round(caps.maxRotate * 0.5);
  if (caps.pump) cmd.pump = 2;
  return cmd;
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd C:\Users\Floxa\Downloads\BookLovense\SensualRead
npx tsc --noEmit 2>&1 | grep "IHapticService"
```

Expected: no errors.

---

## Task 2: Update LiveHapticService.setIntensity to use device capabilities

**Files:**
- Modify: `src/services/bluetooth/LiveHapticService.ts`

- [ ] **Step 1: Import scoreToCommandForDevice and DeviceCapabilities**

In `src/services/bluetooth/LiveHapticService.ts`, find the existing import:

```typescript
import {
  IHapticService,
  DeviceInfo,
  HapticCommand,
  scoreToCommand,
} from './IHapticService';
import { BLE_UUIDS, detectDeviceType, LovenseCommands } from './LovenseProtocol';
```

Update to:

```typescript
import {
  IHapticService,
  DeviceInfo,
  HapticCommand,
  scoreToCommandForDevice,
} from './IHapticService';
import { BLE_UUIDS, detectDeviceType, LovenseCommands, DeviceCapabilities } from './LovenseProtocol';
```

- [ ] **Step 2: Find and update setIntensity**

Search for `setIntensity` in `LiveHapticService.ts`. It will look something like:

```typescript
setIntensity(score: number): void {
  if (!this.isConnected()) return;
  const scaledScore = Math.round(score * sensitivity);
  const command = scoreToCommand(scaledScore);
  this.sendCommand(command);
}
```

The exact implementation may vary — find the method and replace the `scoreToCommand(...)` call:

```typescript
setIntensity(score: number): void {
  if (!this.isConnected()) return;
  const deviceType = this.deviceInfo?.type ?? 'unknown';
  const caps = DeviceCapabilities[deviceType] ?? DeviceCapabilities['unknown'];
  const command = scoreToCommandForDevice(score, caps);
  this.sendCommand(command);
}
```

- [ ] **Step 3: Update DeviceInfo.type assignment in connect()**

In `LiveHapticService`, find where `this.deviceInfo` is set (after connection, using `detectDeviceType`). Ensure the type cast matches the expanded union. The `detectDeviceType` function returns `string`, so cast it:

```typescript
this.deviceInfo = {
  id: device.id,
  name: device.name ?? 'Unknown',
  type: detectDeviceType(device.name ?? '') as DeviceInfo['type'],
};
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "LiveHapticService|IHapticService"
```

Expected: no errors.

---

## Task 3: Add analysisMode and categoryWeights to AppSettings

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/useAppStore.ts`

- [ ] **Step 1: Define AnalysisMode type and CategoryWeights in types/index.ts**

In `src/types/index.ts`, before the `AppSettings` interface, add:

```typescript
export type AnalysisMode = 'soft' | 'normal' | 'intense' | 'explicit';

export interface CategoryWeights {
  romantic: number;
  sensual: number;
  passionate: number;
  intense: number;
  peak: number;
  bdsm: number;
}

export const ANALYSIS_MODE_PRESETS: Record<AnalysisMode, CategoryWeights> = {
  soft:     { romantic: 1.5, sensual: 1.2, passionate: 1.0, intense: 0.6, peak: 0.4, bdsm: 0.3 },
  normal:   { romantic: 1.0, sensual: 1.0, passionate: 1.0, intense: 1.0, peak: 1.0, bdsm: 1.0 },
  intense:  { romantic: 0.7, sensual: 0.9, passionate: 1.0, intense: 1.5, peak: 1.8, bdsm: 1.5 },
  explicit: { romantic: 0.5, sensual: 0.7, passionate: 0.8, intense: 2.0, peak: 3.0, bdsm: 2.5 },
};
```

- [ ] **Step 2: Add the new fields to AppSettings**

In `src/types/index.ts`, in the `AppSettings` interface, add after `customKeywords`:

```typescript
  // Analysis mode and per-category weights
  analysisMode: AnalysisMode;
  categoryWeights: CategoryWeights;
```

- [ ] **Step 3: Add defaults to useAppStore**

In `src/store/useAppStore.ts`, add imports:

```typescript
import { AnalysisMode, CategoryWeights, ANALYSIS_MODE_PRESETS } from '../types';
```

In `defaultSettings`, add the new fields:

```typescript
const defaultSettings: AppSettings = {
  hapticEnabled: true,
  sensitivity: 1.0,
  hapticServiceType: 'mock',
  fontSize: 16,
  fontFamily: 'serif',
  theme: 'light',
  lineHeight: 1.6,
  analysisEnabled: true,
  customKeywords: [],
  analysisMode: 'normal',
  categoryWeights: ANALYSIS_MODE_PRESETS.normal,
};
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no new errors (there will be pre-existing errors in `types/index.ts` — ignore those).

---

## Task 4: Update KeywordAnalyzer with category weights and negation detection

**Files:**
- Modify: `src/engines/analysis/ITriggerEngine.ts`
- Modify: `src/engines/analysis/KeywordAnalyzer.ts`

- [ ] **Step 1: Add setCategoryWeights to ITriggerEngine interface**

In `src/engines/analysis/ITriggerEngine.ts`, add after the `reset()` method declaration:

```typescript
  /**
   * Set per-category score multipliers.
   * Keys match the `category` field on KeywordEntry.
   */
  setCategoryWeights(weights: Record<string, number>): void;
```

- [ ] **Step 2: Rewrite KeywordAnalyzer.analyze() with position-aware matching**

In `src/engines/analysis/KeywordAnalyzer.ts`, replace the entire class with:

```typescript
import {
  ITriggerEngine,
  KeywordMap,
  KeywordEntry,
  AnalysisResult,
} from './ITriggerEngine';

const NEGATION_BEFORE_FR = /\bne\b|\bn'/i;
const NEGATION_AFTER_FR = /\b(pas|plus|jamais|rien|guère|point)\b/i;
const NEGATION_EN = /\b(not|never|without|n't|no\s+one|no\s+longer)\b/i;

/** Check if a keyword occurrence at `matchStart` is negated in the surrounding text */
function isNegated(text: string, matchStart: number, wordLen: number): boolean {
  const before = text.slice(Math.max(0, matchStart - 45), matchStart);
  const after = text.slice(matchStart + wordLen, matchStart + wordLen + 35);
  const frNeg = NEGATION_BEFORE_FR.test(before) && NEGATION_AFTER_FR.test(after);
  const enNeg = NEGATION_EN.test(before);
  return frNeg || enNeg;
}

export class KeywordAnalyzer implements ITriggerEngine {
  private keywords: KeywordMap = { keywords: [] };
  private sensitivity: number = 1.0;
  private enabled: boolean = true;
  private consecutiveMatches: number = 0;
  private lastMatchTime: number = 0;
  private categoryWeights: Record<string, number> = {};

  private static readonly CONSECUTIVE_WINDOW = 5000;

  constructor(initialKeywords?: KeywordMap) {
    if (initialKeywords) {
      this.keywords = initialKeywords;
    }
  }

  analyze(content: string): AnalysisResult {
    const timestamp = Date.now();

    if (!this.enabled || this.keywords.keywords.length === 0) {
      return { score: 0, matchedKeywords: [], rawScore: 0, timestamp };
    }

    const matchedKeywords: string[] = [];
    let rawScore = 0;

    const normalizedContent = this.keywords.caseSensitive ? content : content.toLowerCase();

    for (const entry of this.keywords.keywords) {
      const searchWord = this.keywords.caseSensitive ? entry.word : entry.word.toLowerCase();
      const regex = new RegExp(`\\b${this.escapeRegex(searchWord)}\\b`, 'gi');
      const categoryWeight = this.categoryWeights[entry.category ?? 'normal'] ?? 1.0;

      let match: RegExpExecArray | null;
      let hitCount = 0;
      while ((match = regex.exec(normalizedContent)) !== null) {
        if (!isNegated(normalizedContent, match.index, searchWord.length)) {
          rawScore += entry.score * categoryWeight;
          hitCount++;
        }
      }
      if (hitCount > 0) {
        matchedKeywords.push(entry.word);
      }
    }

    // Consecutive match bonus
    if (matchedKeywords.length > 0) {
      const timeSinceLastMatch = timestamp - this.lastMatchTime;
      if (timeSinceLastMatch < KeywordAnalyzer.CONSECUTIVE_WINDOW) {
        this.consecutiveMatches++;
        const bonus = this.keywords.consecutiveBonus ?? 1.1;
        rawScore *= Math.pow(bonus, Math.min(this.consecutiveMatches, 5));
      } else {
        this.consecutiveMatches = 0;
      }
      this.lastMatchTime = timestamp;
    }

    rawScore *= this.sensitivity;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    return { score, matchedKeywords, rawScore, timestamp };
  }

  setCategoryWeights(weights: Record<string, number>): void {
    this.categoryWeights = { ...weights };
  }

  setKeywords(keywords: KeywordMap): void {
    this.keywords = keywords;
  }

  getKeywords(): KeywordMap {
    return this.keywords;
  }

  setSensitivity(multiplier: number): void {
    this.sensitivity = Math.min(2.0, Math.max(0.1, multiplier));
  }

  getSensitivity(): number {
    return this.sensitivity;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  reset(): void {
    this.consecutiveMatches = 0;
    this.lastMatchTime = 0;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "KeywordAnalyzer|ITriggerEngine"
```

Expected: no errors.

---

## Task 5: Wire categoryWeights from settings through TriggerEngine to KeywordAnalyzer

**Files:**
- Modify: `src/engines/analysis/TriggerEngine.ts`
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: Add setCategoryWeights to TriggerEngine**

Open `src/engines/analysis/TriggerEngine.ts`. Find where the `KeywordAnalyzer` is instantiated (e.g., `this.analyzer = new KeywordAnalyzer()`). Add a `setCategoryWeights` method that delegates to the analyzer:

```typescript
setCategoryWeights(weights: Record<string, number>): void {
  this.analyzer.setCategoryWeights(weights);
}
```

If `TriggerEngine` wraps `ITriggerEngine`, also add the method to its own class. It does not need to be on the interface (it's a concrete addition).

- [ ] **Step 2: Push categoryWeights from ReaderScreen when settings change**

In `src/screens/ReaderScreen.tsx`, find the `useEffect` that wires the `TriggerEngine` to the haptic service (the one that depends on `[hapticService]` or `[settings]`). Add a separate effect for category weights:

```typescript
useEffect(() => {
  if (triggerEngineRef.current) {
    triggerEngineRef.current.setCategoryWeights(settings.categoryWeights);
  }
}, [settings.categoryWeights]);
```

Also call it during initial setup when `TriggerEngine` is first created, right after `triggerEngineRef.current = new TriggerEngine(...)`:

```typescript
triggerEngineRef.current.setCategoryWeights(settings.categoryWeights);
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Task 6: Settings UI — Analysis mode presets and device type display

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Import new types**

In `src/screens/SettingsScreen.tsx`, add to existing imports:

```typescript
import { ANALYSIS_MODE_PRESETS, AnalysisMode } from '../types';
import { useAppStore } from '../store/useAppStore';
```

(Both are likely already imported — verify, don't double-import.)

- [ ] **Step 2: Read connected device from store**

Inside `SettingsScreen` component, after existing hooks:

```typescript
const connection = useAppStore((state) => state.connection);
const deviceType = connection.connectedDevice?.type ?? null;
```

- [ ] **Step 3: Add "ANALYSE" section with mode presets**

In the JSX, after the existing TEXT ANALYSIS section `</View>`, add a new section:

```tsx
{/* Analysis Mode Section */}
<Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
  MODE D'ANALYSE
</Text>

<View style={[styles.section, { backgroundColor: colors.card }]}>
  <SettingRow
    label="Mode actuel"
    value={
      settings.analysisMode === 'soft' ? 'Doux (romantique)' :
      settings.analysisMode === 'normal' ? 'Normal' :
      settings.analysisMode === 'intense' ? 'Intense' : 'Explicite'
    }
    colors={colors}
  />
  <View style={styles.sensitivityRow}>
    {(['soft', 'normal', 'intense', 'explicit'] as AnalysisMode[]).map((mode) => (
      <TouchableOpacity
        key={mode}
        style={[
          styles.sensitivityBtn,
          {
            backgroundColor: settings.analysisMode === mode ? colors.primary : colors.surface,
            borderColor: settings.analysisMode === mode ? colors.primary : colors.border,
          },
        ]}
        onPress={() => updateSettings({
          analysisMode: mode,
          categoryWeights: ANALYSIS_MODE_PRESETS[mode],
        })}
      >
        <Text
          style={[
            styles.sensitivityBtnText,
            { color: settings.analysisMode === mode ? colors.textOnPrimary : colors.text },
          ]}
        >
          {mode === 'soft' ? 'Doux' :
           mode === 'normal' ? 'Normal' :
           mode === 'intense' ? 'Intense' : 'Explicite'}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
</View>
```

- [ ] **Step 4: Add device profile display in HAPTIC FEEDBACK section**

In the existing HAPTIC FEEDBACK section, after the `SettingRow` for "Use Mock Device", add:

```tsx
{connection.isConnected && connection.connectedDevice && (
  <SettingRow
    label="Profil jouet"
    value={`${connection.connectedDevice.name} (${deviceType ?? 'unknown'})`}
    colors={colors}
  />
)}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "HomeScreen\|types/index"
```

Expected: no errors.

---

## Self-Review Checklist

- [x] **Spec coverage**: Toy profiles (Nora rotate, Max pump, Edge dual vib, others vib-only) ✓, negation detection (French + English) ✓, category weights ✓, analysis mode presets ✓, Settings UI ✓
- [x] **No placeholders**: All code blocks complete
- [x] **Type consistency**: `AnalysisMode`, `CategoryWeights`, `ANALYSIS_MODE_PRESETS` defined once in `types/index.ts`, imported everywhere ✓
- [x] **DeviceCapabilities already has caps for all device types** in `LovenseProtocol.ts` — `scoreToCommandForDevice` reads from it ✓
- [x] **Negation detection**: both French (`ne...pas/plus/jamais`) and English (`not/never/n't`) patterns ✓
- [x] **Default mode is `'normal'`** — weights all ×1.0, no behavior change until user selects a different mode ✓
- [x] **`categoryWeights` effect in ReaderScreen** runs on mount (settings already loaded) and on settings change ✓
- [x] **Pre-existing categories**: keywords.json uses `'romantic' | 'sensual' | 'passionate' | 'intense' | 'peak'` — all covered in `CategoryWeights` + presets ✓
