/**
 * LiveHapticService - Real BLE implementation for Lovense devices
 *
 * Uses react-native-ble-plx for Bluetooth Low Energy communication.
 * Implements multiple Lovense protocols (Nordic, Legacy, and Modern).
 */

import { BleManager, Device, Characteristic, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  IHapticService,
  DeviceInfo,
  HapticCommand,
  scoreToCommand,
} from './IHapticService';
import { BLE_UUIDS, detectDeviceType, LovenseCommands } from './LovenseProtocol';
import { Buffer } from 'buffer';

// Scan timeout in milliseconds
const SCAN_TIMEOUT = 10000;

// Command throttle to prevent overwhelming the device
const COMMAND_THROTTLE_MS = 50;

export class LiveHapticService implements IHapticService {
  private bleManager: BleManager;
  private connectedDevice: Device | null = null;
  private deviceInfo: DeviceInfo | null = null;
  private txCharacteristic: Characteristic | null = null;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private isInitialized: boolean = false;
  private lastCommandTime: number = 0;
  private pendingCommand: HapticCommand | null = null;
  private commandTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.bleManager = new BleManager();
    this.initialize();
  }

  /**
   * Initialize BLE manager and check state
   */
  private async initialize(): Promise<void> {
    try {
      const state = await this.bleManager.state();
      if (state !== State.PoweredOn) {
        console.log('[LiveHaptic] Waiting for Bluetooth to power on...');
        await new Promise<void>((resolve) => {
          const subscription = this.bleManager.onStateChange((newState) => {
            if (newState === State.PoweredOn) {
              subscription.remove();
              resolve();
            }
          }, true);
        });
      }
      this.isInitialized = true;
      console.log('[LiveHaptic] BLE Manager initialized');
    } catch (error) {
      console.error('[LiveHaptic] Failed to initialize:', error);
    }
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      if (Number(Platform.Version) >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (error) {
      console.error('[LiveHaptic] Permission request failed:', error);
      return false;
    }
  }

  async scan(): Promise<DeviceInfo[]> {
    if (!this.isInitialized) await this.initialize();
    const hasPermissions = await this.requestPermissions();
    if (!hasPermissions) throw new Error('Bluetooth permissions not granted');

    return new Promise((resolve, reject) => {
      const discoveredDevices: Map<string, DeviceInfo> = new Map();
      const timeoutId = setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(Array.from(discoveredDevices.values()));
      }, SCAN_TIMEOUT);

      this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          clearTimeout(timeoutId);
          this.bleManager.stopDeviceScan();
          reject(error);
          return;
        }

        if (device && device.name) {
          const deviceType = detectDeviceType(device.name);
          const isLovense = device.name.toLowerCase().includes('lvs-') || device.name.toLowerCase().includes('lovense') || deviceType !== 'unknown';

          if (isLovense || device.name.length > 0) {
            const info: DeviceInfo = {
              id: device.id,
              name: device.name,
              type: (isLovense ? deviceType : 'unknown') as DeviceInfo['type'],
            };
            if (!discoveredDevices.has(device.id)) {
              discoveredDevices.set(device.id, info);
            }
          }
        }
      });
    });
  }

  async connect(deviceId: string): Promise<void> {
    console.log(`[LiveHaptic] Connecting to ${deviceId}`);
    try {
      if (this.connectedDevice) await this.disconnect();

      const device = await this.bleManager.connectToDevice(deviceId, { autoConnect: false, timeout: 10000 });
      await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      console.log(`[LiveHaptic] Discovered ${services.length} services`);

      for (const service of services) {
        const characteristics = await service.characteristics();
        for (const char of characteristics) {
          const uuid = char.uuid.toLowerCase();

          // Check for TX (Write)
          const isStandardTX = uuid === BLE_UUIDS.TX_CHARACTERISTIC.toLowerCase();
          const isLegacyTX = uuid === BLE_UUIDS.LEGACY_TX.toLowerCase();
          const isModernTX = uuid.endsWith(BLE_UUIDS.MODERN_SUFFIX.toLowerCase()) && uuid.includes(BLE_UUIDS.MODERN_TX_PART);

          if (isStandardTX || isLegacyTX || isModernTX) {
            this.txCharacteristic = char;
            console.log(`[LiveHaptic] FOUND TX: ${uuid}`);
          }

          // Check for RX (Notify)
          const isStandardRX = uuid === BLE_UUIDS.RX_CHARACTERISTIC.toLowerCase();
          const isLegacyRX = uuid === BLE_UUIDS.LEGACY_RX.toLowerCase();
          const isModernRX = uuid.endsWith(BLE_UUIDS.MODERN_SUFFIX.toLowerCase()) && uuid.includes(BLE_UUIDS.MODERN_RX_PART);

          if (isStandardRX || isLegacyRX || isModernRX) {
            try {
              await char.monitor((error, characteristic) => {
                if (characteristic?.value) {
                  const response = Buffer.from(characteristic.value, 'base64').toString('utf-8');
                  console.log(`[LiveHaptic] <<< RX: ${response}`);
                }
              });
              console.log(`[LiveHaptic] ENABLED RX: ${uuid}`);
            } catch (e) {
              console.warn(`[LiveHaptic] Failed to monitor RX ${uuid}`);
            }
          }
        }
      }

      // Final fallback: if still no TX, take any writable characteristic in a service that has 0001 in its UUID
      if (!this.txCharacteristic) {
        console.log('[LiveHaptic] TX not found by UUID, trying fallback by properties...');
        for (const service of services) {
          if (service.uuid.toLowerCase().includes('0001')) {
            const characteristics = await service.characteristics();
            for (const char of characteristics) {
              if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
                this.txCharacteristic = char;
                console.log(`[LiveHaptic] FALLBACK TX: ${char.uuid}`);
                break;
              }
            }
          }
          if (this.txCharacteristic) break;
        }
      }

      if (!this.txCharacteristic) throw new Error('TX characteristic not found');

      this.connectedDevice = device;
      this.deviceInfo = { id: device.id, name: device.name || 'Unknown', type: detectDeviceType(device.name || '') as DeviceInfo['type'] };

      device.onDisconnected(() => this.handleDisconnection());
      this.notifyConnectionChange(true);

      // Query battery
      await this.sendRawCommand(LovenseCommands.battery());
    } catch (error) {
      console.error('[LiveHaptic] Connection failed:', error);
      this.handleDisconnection();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connectedDevice) {
      try { await this.sendRawCommand(LovenseCommands.stop()); } catch (e) {}
      try { await this.bleManager.cancelDeviceConnection(this.connectedDevice.id); } catch (e) {}
    }
    this.handleDisconnection();
  }

  private handleDisconnection(): void {
    this.connectedDevice = null;
    this.deviceInfo = null;
    this.txCharacteristic = null;
    if (this.commandTimer) clearTimeout(this.commandTimer);
    this.commandTimer = null;
    this.pendingCommand = null;
    this.notifyConnectionChange(false);
  }

  isConnected(): boolean {
    return this.connectedDevice !== null && this.txCharacteristic !== null;
  }

  getConnectedDevice(): DeviceInfo | null {
    return this.deviceInfo;
  }

  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.isConnected());
    return () => { this.connectionListeners.delete(callback); };
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  setIntensity(score: number): void {
    if (this.isConnected()) this.sendCommand(scoreToCommand(score));
  }

  sendCommand(command: HapticCommand): void {
    if (!this.isConnected()) return;
    this.pendingCommand = command;
    const now = Date.now();
    const elapsed = now - this.lastCommandTime;

    if (elapsed >= COMMAND_THROTTLE_MS) {
      this.executePendingCommand();
    } else if (!this.commandTimer) {
      this.commandTimer = setTimeout(() => {
        this.commandTimer = null;
        this.executePendingCommand();
      }, COMMAND_THROTTLE_MS - elapsed);
    }
  }

  private executePendingCommand(): void {
    if (!this.pendingCommand) return;
    this.sendRawCommand(LovenseCommands.combined(this.pendingCommand));
    this.lastCommandTime = Date.now();
    this.pendingCommand = null;
  }

  private async sendRawCommand(command: string): Promise<void> {
    if (!this.txCharacteristic) return;
    try {
      const base64 = Buffer.from(command, 'utf-8').toString('base64');
      await this.txCharacteristic.writeWithResponse(base64);
    } catch (error) {
      console.error('[LiveHaptic] Command failed:', error);
    }
  }

  stop(): void {
    if (this.commandTimer) clearTimeout(this.commandTimer);
    this.commandTimer = null;
    this.pendingCommand = null;
    this.sendRawCommand(LovenseCommands.stop());
  }

  destroy(): void {
    if (this.connectedDevice) this.disconnect();
    this.bleManager.destroy();
  }
}
