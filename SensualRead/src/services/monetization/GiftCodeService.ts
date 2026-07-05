import SHA256 from 'crypto-js/sha256';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GIFT_CODE_HASHES } from './giftCodes';
import { usePremiumStore } from '../../store/usePremiumStore';

const GIFT_STORAGE_KEY = 'gift_premium_hash';

export const GiftCodeService = {
  validate(rawCode: string): boolean {
    const normalized = rawCode.trim().toUpperCase();
    const hash = SHA256(normalized).toString();
    return GIFT_CODE_HASHES.includes(hash);
  },

  async activate(rawCode: string): Promise<void> {
    if (!GiftCodeService.validate(rawCode)) {
      throw new Error('INVALID_CODE');
    }
    const normalized = rawCode.trim().toUpperCase();
    const hash = SHA256(normalized).toString();
    await AsyncStorage.setItem(GIFT_STORAGE_KEY, hash);
    usePremiumStore.getState().setPremium('gift');
  },

  async restoreFromStorage(): Promise<boolean> {
    const stored = await AsyncStorage.getItem(GIFT_STORAGE_KEY);
    if (stored && GIFT_CODE_HASHES.includes(stored)) {
      usePremiumStore.getState().setPremium('gift');
      return true;
    }
    return false;
  },
};
