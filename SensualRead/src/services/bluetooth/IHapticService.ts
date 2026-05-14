/**
 * IHapticService - Interface for haptic feedback services
 *
 * This interface defines the contract for all haptic service implementations.
 * Implementations: MockHapticService (dev), LiveHapticService (prod)
 */

export interface DeviceInfo {
  id: string;
  name: string;
  type: 'lush' | 'hush' | 'domi' | 'osci' | 'unknown';
  batteryLevel?: number;
}

export interface HapticCommand {
  vibrate?: number;  // 0-20
  rotate?: number;   // 0-20
  pump?: number;     // 0-3 (for Max)
}

export interface IHapticService {
  /**
   * Scan for available Lovense devices
   * @returns Promise resolving to array of discovered devices
   */
  scan(): Promise<DeviceInfo[]>;

  /**
   * Connect to a specific device
   * @param deviceId - The device ID to connect to
   */
  connect(deviceId: string): Promise<void>;

  /**
   * Disconnect from current device
   */
  disconnect(): Promise<void>;

  /**
   * Check if currently connected to a device
   */
  isConnected(): boolean;

  /**
   * Get current connected device info
   */
  getConnectedDevice(): DeviceInfo | null;

  /**
   * Set intensity based on analysis score (0-100)
   * This method handles the translation to Lovense commands
   * @param score - Intensity score from 0-100
   */
  setIntensity(score: number): void;

  /**
   * Send raw haptic command to device
   * @param command - The haptic command to send
   */
  sendCommand(command: HapticCommand): void;

  /**
   * Stop all haptic feedback
   */
  stop(): void;

  /**
   * Subscribe to connection state changes
   * @param callback - Function called when connection state changes
   * @returns Unsubscribe function
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void;
}

/**
 * Score to Command mapping logic
 *
 * Score 0-10:   Stop (Vibrate: 0)
 * Score 11-40:  Low (Vibrate: 5)
 * Score 41-80:  Medium (Vibrate: 15)
 * Score 81-100: High (Vibrate: 20 + Rotate: 5)
 */
export function scoreToCommand(score: number): HapticCommand {
  if (score <= 10) {
    return { vibrate: 0 };
  } else if (score <= 40) {
    return { vibrate: 5 };
  } else if (score <= 80) {
    return { vibrate: 15 };
  } else {
    return { vibrate: 20, rotate: 5 };
  }
}
