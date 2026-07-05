// src/services/monetization/AdService.ts
import mobileAds, {
  InterstitialAd,
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  BannerAdSize,
} from 'react-native-google-mobile-ads';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AD_UNITS } from '../../config/adUnits';
import { usePremiumStore } from '../../store/usePremiumStore';

const AD_OPEN_COUNT_KEY = 'ad_open_count';
const INTERSTITIAL_EVERY_N = 3;

export const BannerAdConfig = {
  unitId: AD_UNITS.BANNER,
  size: BannerAdSize.BANNER,
};

class AdServiceClass {
  private interstitial: InterstitialAd | null = null;
  private interstitialLoaded = false;

  initialize(): void {
    if (usePremiumStore.getState().isPremium) return;
    mobileAds().initialize();
    this._preloadInterstitial();
  }

  private _preloadInterstitial(): void {
    this.interstitialLoaded = false;
    this.interstitial = InterstitialAd.createForAdRequest(AD_UNITS.INTERSTITIAL);

    this.interstitial.addAdEventListener(AdEventType.LOADED, () => {
      this.interstitialLoaded = true;
    });

    this.interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      this._preloadInterstitial();
    });

    this.interstitial.addAdEventListener(AdEventType.ERROR, () => {
      this.interstitialLoaded = false;
    });

    this.interstitial.load();
  }

  destroyAll(): void {
    this.interstitial = null;
    this.interstitialLoaded = false;
  }

  async showInterstitialIfNeeded(): Promise<void> {
    if (usePremiumStore.getState().isPremium) return;
    if (!this.interstitialLoaded || !this.interstitial) return;

    const raw = await AsyncStorage.getItem(AD_OPEN_COUNT_KEY);
    const count = parseInt(raw ?? '0', 10);
    const newCount = count + 1;
    await AsyncStorage.setItem(AD_OPEN_COUNT_KEY, String(newCount));

    if (newCount % INTERSTITIAL_EVERY_N !== 0) return;

    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);

      const unsubClosed = this.interstitial!.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          clearTimeout(timer);
          unsubClosed();
          unsubError();
          resolve();
        }
      );

      const unsubError = this.interstitial!.addAdEventListener(
        AdEventType.ERROR,
        () => {
          clearTimeout(timer);
          unsubClosed();
          unsubError();
          resolve();
        }
      );

      this.interstitial!.show();
    });
  }

  async showRewarded(): Promise<boolean> {
    if (usePremiumStore.getState().isPremium) return false;

    return new Promise((resolve) => {
      const rewarded = RewardedAd.createForAdRequest(AD_UNITS.REWARDED);
      let earned = false;

      const unsubLoaded = rewarded.addAdEventListener(
        RewardedAdEventType.LOADED,
        () => rewarded.show()
      );

      const unsubEarned = rewarded.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earned = true;
        }
      );

      const unsubClosed = rewarded.addAdEventListener(
        AdEventType.CLOSED,
        () => {
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          resolve(earned);
        }
      );

      const unsubError = rewarded.addAdEventListener(
        AdEventType.ERROR,
        () => {
          unsubLoaded();
          unsubEarned();
          unsubClosed();
          unsubError();
          resolve(false);
        }
      );

      rewarded.load();
    });
  }
}

export const AdService = new AdServiceClass();
