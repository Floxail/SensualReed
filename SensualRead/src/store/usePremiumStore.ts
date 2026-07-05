import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PremiumSource } from '../types';

interface PremiumState {
  isPremium: boolean;
  source: PremiumSource | null;
  sepiaUnlocked: boolean;
  setPremium: (source: PremiumSource) => void;
  clearPremium: () => void;
  unlockSepia: () => void;
}

export const usePremiumStore = create<PremiumState>()(
  persist(
    (set) => ({
      isPremium: false,
      source: null,
      sepiaUnlocked: false,
      setPremium: (source) => set({ isPremium: true, source }),
      clearPremium: () => set({ isPremium: false, source: null }),
      unlockSepia: () => set({ sepiaUnlocked: true }),
    }),
    {
      name: 'premium-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
