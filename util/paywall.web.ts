import type { PurchasesOffering } from 'react-native-purchases';
import type { StorePaywallResult } from './paywall';

// The mobile native presenter must not be imported into web or server rendering.
export async function presentStorePaywall(offering: PurchasesOffering): Promise<StorePaywallResult> {
  void offering;
  return 'unavailable';
}
