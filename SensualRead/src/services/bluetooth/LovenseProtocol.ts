/**
 * LovenseProtocol - Protocol constants and utilities
 *
 * Reference: https://developer.lovense.com/
 */

// Lovense BLE UUID Patterns
export const BLE_UUIDS = {
  // Version 2 (Standard Nordic UART)
  SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  TX_CHARACTERISTIC: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Write
  RX_CHARACTERISTIC: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Notify

  // Version 1 (Legacy)
  LEGACY_SERVICE: '0000fff0-0000-1000-8000-00805f9b34fb',
  LEGACY_TX: '0000fff2-0000-1000-8000-00805f9b34fb', // Write
  LEGACY_RX: '0000fff1-0000-1000-8000-00805f9b34fb', // Notify/Read

  // Modern (Variable / XY30 Family)
  // Suffix shared by many modern Lovense devices
  MODERN_SUFFIX: '-4bd4-bbd5-a6920e4c5653',
  MODERN_TX_PART: '0002',
  MODERN_RX_PART: '0003'
} as const;

// Device type detection based on device name
export const DEVICE_PATTERNS: Record<string, RegExp> = {
  lush: /lush/i,
  hush: /hush/i,
  domi: /domi/i,
  osci: /osci/i,
  max: /max/i,
  nora: /nora/i,
  ambi: /ambi/i,
  edge: /edge/i,
  ferri: /ferri/i,
  diamo: /diamo/i,
};

/**
 * Detect device type from device name
 */
export function detectDeviceType(deviceName: string): string {
  for (const [type, pattern] of Object.entries(DEVICE_PATTERNS)) {
    if (pattern.test(deviceName)) {
      return type;
    }
  }
  return 'unknown';
}

/**
 * Lovense command builders
 */
export const LovenseCommands = {
  vibrate: (level: number): string => `Vibrate:${Math.min(20, Math.max(0, level))};`,
  rotate: (level: number): string => `Rotate:${Math.min(20, Math.max(0, level))};`,
  pump: (level: number): string => `Air:Level:${Math.min(3, Math.max(0, level))};`,
  stop: (): string => 'Vibrate:0;',
  battery: (): string => 'Battery;',
  deviceType: (): string => 'DeviceType;',

  /**
   * Create combined command
   */
  combined: (options: {
    vibrate?: number;
    rotate?: number;
    pump?: number;
  }): string => {
    const parts: string[] = [];
    if (options.vibrate !== undefined) {
      parts.push(`Vibrate:${Math.min(20, Math.max(0, options.vibrate))}`);
    }
    if (options.rotate !== undefined) {
      parts.push(`Rotate:${Math.min(20, Math.max(0, options.rotate))}`);
    }
    if (options.pump !== undefined) {
      parts.push(`Air:Level:${Math.min(3, Math.max(0, options.pump))}`);
    }
    return parts.join(';') + ';';
  },

  /**
   * Create pattern command
   * @param pattern - Array of levels (e.g., [5, 10, 15, 20, 15, 10, 5])
   * @param interval - Time between levels in ms (20-2000, default 100)
   */
  pattern: (pattern: number[], interval: number = 100): string => {
    const safePattern = pattern.map(p => Math.min(20, Math.max(0, p)));
    const safeInterval = Math.min(2000, Math.max(20, interval));
    return `Preset:${safePattern.join(',')};Speed:${Math.floor(safeInterval / 10)};`;
  },
};

/**
 * Device capabilities by type
 */
export const DeviceCapabilities: Record<string, {
  vibrate: boolean;
  rotate: boolean;
  pump: boolean;
  maxVibrate: number;
  maxRotate: number;
}> = {
  lush: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  hush: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  domi: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  osci: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  nora: { vibrate: true, rotate: true, pump: false, maxVibrate: 20, maxRotate: 20 },
  max: { vibrate: true, rotate: false, pump: true, maxVibrate: 20, maxRotate: 0 },
  edge: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  ambi: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  ferri: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  diamo: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
  unknown: { vibrate: true, rotate: false, pump: false, maxVibrate: 20, maxRotate: 0 },
};
