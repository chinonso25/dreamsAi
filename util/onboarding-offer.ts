import type { PurchasesOffering } from 'react-native-purchases';

export function discountedOffering(current: PurchasesOffering | undefined, offerings: PurchasesOffering[] | null) {
  const identifier = current?.metadata?.onboarding_discount_offering_id;
  if (typeof identifier !== 'string') return undefined;
  const candidate = offerings?.find(item => item.identifier === identifier && item.identifier !== current?.identifier);
  if (!candidate?.availablePackages.length) return undefined;
  // Only call it a discount when every package is cheaper for the same currency and renewal period.
  const cheaper = candidate.availablePackages.every(pkg => {
    const product = pkg.product;
    if (!product.subscriptionPeriod || product.price <= 0) return false;
    return current?.availablePackages.some(base => base.product.currencyCode === product.currencyCode && base.product.subscriptionPeriod === product.subscriptionPeriod && base.product.price > product.price);
  });
  return cheaper ? candidate : undefined;
}

export function periodLabel(period: string | null) {
  const match = period?.match(/^P(\d+)([DWMY])$/);
  if (!match) return 'per billing period';
  const units: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year' };
  return match[1] === '1' ? `per ${units[match[2]]}` : `every ${match[1]} ${units[match[2]]}s`;
}
