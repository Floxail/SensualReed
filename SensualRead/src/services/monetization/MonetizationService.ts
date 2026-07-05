import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { REVENUECAT_ANDROID_KEY } from '../../config/keys';
import { usePremiumStore } from '../../store/usePremiumStore';
import { GiftCodeService } from './GiftCodeService';

const ENTITLEMENT_ID = 'SensualRead Pro';

export const MonetizationService = {
  async initialize(): Promise<void> {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    await Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });

    try {
      const info = await Purchases.getCustomerInfo();
      if (info.entitlements.active[ENTITLEMENT_ID]) {
        usePremiumStore.getState().setPremium('iap');
        return;
      }
    } catch {
      // No network → try local fallback
    }

    await GiftCodeService.restoreFromStorage();
  },

  async purchase(): Promise<void> {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.lifetime ?? offerings.current?.availablePackages[0];

    if (!pkg) {
      throw new Error('NO_PRODUCT');
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        usePremiumStore.getState().setPremium('iap');
      }
    } catch (e: any) {
      if (e?.userCancelled || e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        throw new Error('CANCELLED');
      }
      throw new Error(e?.message ?? 'PURCHASE_FAILED');
    }
  },

  async restorePurchases(): Promise<boolean> {
    const info = await Purchases.restorePurchases();
    if (info.entitlements.active[ENTITLEMENT_ID]) {
      usePremiumStore.getState().setPremium('iap');
      return true;
    }
    return false;
  },

  async getProductPrice(): Promise<string> {
    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.lifetime ?? offerings.current?.availablePackages[0];
      return pkg?.product.priceString ?? '~4,99 €';
    } catch {
      return '~4,99 €';
    }
  },
};
