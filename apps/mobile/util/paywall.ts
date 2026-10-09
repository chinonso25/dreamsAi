import PurchasesUI from 'react-native-purchases-ui';
import type { PurchasesOffering } from 'react-native-purchases';

export type StorePaywallResult = 'purchased' | 'restored' | 'cancelled' | 'unavailable' | 'error';
export async function presentStorePaywall(offering: PurchasesOffering): Promise<StorePaywallResult> {
  const result = await PurchasesUI.presentPaywall({ offering, displayCloseButton: true, fontFamily: 'Outfit' });
  if (result === PurchasesUI.PAYWALL_RESULT.PURCHASED) return 'purchased';
  if (result === PurchasesUI.PAYWALL_RESULT.RESTORED) return 'restored';
  if (result === PurchasesUI.PAYWALL_RESULT.ERROR) return 'error';
  if (result === PurchasesUI.PAYWALL_RESULT.NOT_PRESENTED) return 'unavailable';
  return 'cancelled';
}
