/**
 * MockHapticService - Mock implementation for development
 *
 * This service simulates Lovense device behavior without requiring
 * actual hardware. Useful for UI development and testing.
 */

import {
  IHapticService,
  DeviceInfo,
  HapticCommand,
  scoreToCommand,
} from './IHapticService';

export class MockHapticService implements IHapticService {
  private connected: boolean = false;
  private currentDevice: DeviceInfo | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private currentIntensity: number = 0;

  // Simulated devices for testing
  private mockDevices: DeviceInfo[] = [
    { id: 'mock-lush-001', name: 'Lush 3 (Mock)', type: 'lush', batteryLevel: 85 },
    { id: 'mock-hush-001', name: 'Hush (Mock)', type: 'hush', batteryLevel: 92 },
  ];

  async scan(): Promise<DeviceInfo[]> {
    console.log('[MockHaptic] Scanning for devices...');
    // Simulate scan delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log(`[MockHaptic] Found ${this.mockDevices.length} devices`);
    return this.mockDevices;
  }

  async connect(deviceId: string): Promise<void> {
    console.log(`[MockHaptic] Connecting to device: ${deviceId}`);
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const device = this.mockDevices.find(d => d.id === deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    this.currentDevice = device;
    this.connected = true;
    this.notifyConnectionChange(true);
    console.log(`[MockHaptic] Connected to ${device.name}`);
  }

  async disconnect(): Promise<void> {
    console.log('[MockHaptic] Disconnecting...');
    this.connected = false;
    this.currentDevice = null;
    this.currentIntensity = 0;
    this.notifyConnectionChange(false);
    console.log('[MockHaptic] Disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectedDevice(): DeviceInfo | null {
    return this.currentDevice;
  }

  setIntensity(score: number): void {
    if (!this.connected) {
      console.warn('[MockHaptic] Not connected, ignoring intensity change');
      return;
    }

    this.currentIntensity = score;
    const command = scoreToCommand(score);
    this.sendCommand(command);
  }

  sendCommand(command: HapticCommand): void {
    if (!this.connected) {
      console.warn('[MockHaptic] Not connected, ignoring command');
      return;
    }

    const parts: string[] = [];
    if (command.vibrate !== undefined) {
      parts.push(`Vibrate:${command.vibrate}`);
    }
    if (command.rotate !== undefined) {
      parts.push(`Rotate:${command.rotate}`);
    }
    if (command.pump !== undefined) {
      parts.push(`Pump:${command.pump}`);
    }

    console.log(`[MockHaptic] >>> COMMAND: ${parts.join(';')};`);
  }

  stop(): void {
    console.log('[MockHaptic] Stopping all haptics');
    this.currentIntensity = 0;
    this.sendCommand({ vibrate: 0, rotate: 0 });
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  // Dev helper: get current intensity for debugging
  getCurrentIntensity(): number {
    return this.currentIntensity;
  }
}
