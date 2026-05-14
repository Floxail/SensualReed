/**
 * Bluetooth Services - Haptic Manager Layer
 */

export * from './IHapticService';
export * from './MockHapticService';
export * from './LiveHapticService';
export * from './LovenseProtocol';

// Factory function to get appropriate service based on environment
import { IHapticService } from './IHapticService';
import { MockHapticService } from './MockHapticService';
import { LiveHapticService } from './LiveHapticService';

export type HapticServiceType = 'mock' | 'live';

export function createHapticService(type: HapticServiceType = 'mock'): IHapticService {
  switch (type) {
    case 'live':
      return new LiveHapticService();
    case 'mock':
    default:
      return new MockHapticService();
  }
}
