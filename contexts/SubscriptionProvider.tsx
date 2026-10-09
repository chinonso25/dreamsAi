import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import Purchases, { PurchasesOffering, CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { useAuth } from './AuthProvider';
import { presentStorePaywall, StorePaywallResult } from '@/util/paywall';
import { ensureSession, getCurrentUser, type DreamerUser } from '@/util/auth-client';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/util/query-client';
import { entitlementQueryOptions } from '@/util/entitlement-query';
import { discountedOffering } from '@/util/onboarding-offer';

export type PaywallOutcome = StorePaywallResult;
export type PaywallOptions = { offerOnDecline?: boolean };
type SubscriptionContextType = {
  isSubscribed: boolean; isLoading: boolean; customerInfo: CustomerInfo | null; offerings: PurchasesOffering[] | null;
  showPaywall: (offering?: PurchasesOffering, options?: PaywallOptions) => Promise<PaywallOutcome>;
  restorePurchases: () => Promise<boolean>; reloadOfferings: () => Promise<void>; refreshSubscription: () => Promise<boolean>; ensurePremium: () => Promise<boolean>;
};
const SubscriptionContext = createContext<SubscriptionContextType>({
  isSubscribed: false, isLoading: true, customerInfo: null, offerings: null,
  showPaywall: async () => 'unavailable', restorePurchases: async () => false,
  reloadOfferings: async () => {}, refreshSubscription: async () => false, ensurePremium: async () => false,
});
export const useSubscription = () => useContext(SubscriptionContext);
export const PREMIUM_ENTITLEMENT = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'pro';
export const hasSubscription = (info: CustomerInfo | null) => Boolean(info?.entitlements.active[PREMIUM_ENTITLEMENT]?.isActive);
const orderedOfferings = (fetched: Awaited<ReturnType<typeof Purchases.getOfferings>>) => fetched.current ? [fetched.current, ...Object.values(fetched.all).filter(item => item.identifier !== fetched.current?.identifier)] : Object.values(fetched.all);

export function SubscriptionProvider({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const { user } = useAuth();
  const userRef = useRef(user);
  const alive = useRef(false);
  const customerId = useRef<string | undefined>(undefined);
  const identityQueue = useRef<Promise<void>>(Promise.resolve());
  const configuration = useRef<Promise<void> | null>(null);
  const configured = useRef(false);
  const operationBusy = useRef(false);
  const sdkRefreshVersion = useRef(0);
  const serverRefreshVersion = useRef(0);
  const sdkState = useRef<{ ownerId?: string; info: CustomerInfo | null }>({ info: null });
  const serverState = useRef<{ ownerId?: string; premium: boolean }>({ premium: false });
  const [customer, setCustomer] = useState<{ ownerId?: string; info: CustomerInfo | null }>({ info: null });
  const [server, setServer] = useState<{ ownerId?: string; premium: boolean }>({ premium: false });
  const [offerings, setOfferings] = useState<PurchasesOffering[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const ownerId = getCurrentUser()?.id || user?.id;
  const entitlement = useQuery({
    ...entitlementQueryOptions(ownerId || ''),
    enabled: Boolean(ownerId && !disabled && !isLoading),
  }, queryClient);
  useEffect(() => {
    if (!entitlement.data || entitlement.data.ownerId !== getCurrentUser()?.id) return;
    serverState.current = entitlement.data;
  }, [entitlement.data]);
  const customerInfo = customer.ownerId === ownerId ? customer.info : null;
  const serverVerification = entitlement.data && entitlement.data.ownerId === ownerId ? entitlement.data : server;
  const isSubscribed = Boolean(ownerId && (hasSubscription(customerInfo) || serverVerification.ownerId === ownerId && serverVerification.premium));
  useEffect(() => { userRef.current = user; }, [user]);
  const publishSDK = (id: string | undefined, info: CustomerInfo) => {
    const previous = sdkState.current;
    if (previous.ownerId === id && previous.info?.requestDate && info.requestDate && Date.parse(info.requestDate) < Date.parse(previous.info.requestDate)) return;
    const next = { ownerId: id, info };
    sdkState.current = next;
    if (alive.current) setCustomer(next);
  };
  const currentOwner = () => getCurrentUser() || userRef.current;
  const knownPremium = (id: string) => sdkState.current.ownerId === id && hasSubscription(sdkState.current.info) || serverState.current.ownerId === id && serverState.current.premium;

  useEffect(() => {
    alive.current = true;
    let active = true;
    let listening = false;
    const listener = (info: CustomerInfo) => {
      const owner = currentOwner();
      // SDK identity callbacks arriving from a previous login must not unlock a new account.
      if (active && owner?.id === customerId.current) { sdkRefreshVersion.current += 1; publishSDK(customerId.current, info); }
    };
    if (!configuration.current) configuration.current = (async () => {
      if (disabled) return;
      const key = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || 'appl_GzltUTpIKEodjEDumPUnpTEfrBi' : Platform.OS === 'android' ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY : undefined;
      if (!key) return;
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
      const id = currentOwner()?.id;
      Purchases.configure({ apiKey: key, appUserID: id });
      customerId.current = id;
      configured.current = true;
    })();
    void configuration.current.then(async () => {
      if (!active || !configured.current) return;
      Purchases.addCustomerInfoUpdateListener(listener); listening = true;
      const version = ++sdkRefreshVersion.current;
      const [info, fetched] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
      if (active && version === sdkRefreshVersion.current && currentOwner()?.id === customerId.current) publishSDK(customerId.current, info);
      if (active) setOfferings(orderedOfferings(fetched));
    }).catch(() => { /* Journal access stays available if store setup fails. */ }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; alive.current = false; if (listening) Purchases.removeCustomerInfoUpdateListener(listener); };
    // The SDK is configured once. Identity changes use the serialized login below.
  }, [disabled]);

  async function synchronizeIdentity(requireFreshSession: boolean): Promise<DreamerUser> {
    await configuration.current;
    let owner: DreamerUser | null = currentOwner();
    if (requireFreshSession || !owner) owner = await ensureSession({ force: requireFreshSession });
    if (!owner) throw new Error('Reconnect to your private journal before opening purchases.');
    const id = owner.id;
    const queued = identityQueue.current.catch(() => undefined).then(async () => {
      if (currentOwner()?.id !== id) throw new Error('Your account changed. Please try again from your current journal.');
      if (!configured.current || customerId.current === id) return;
      sdkRefreshVersion.current += 1;
      const result = await Purchases.logIn(id);
      customerId.current = id;
      if (currentOwner()?.id === id) publishSDK(id, result.customerInfo);
    });
    identityQueue.current = queued;
    await queued;
    if (currentOwner()?.id !== id) throw new Error('Your account changed. Please try again from your current journal.');
    return owner;
  }
  async function serverEntitlement(id: string): Promise<boolean> {
    if (!onlineManager.isOnline()) return currentOwner()?.id === id && serverState.current.ownerId === id && serverState.current.premium;
    const version = ++serverRefreshVersion.current;
    try {
      const response = await queryClient.fetchQuery({ ...entitlementQueryOptions(id), staleTime: 0 });
      if (currentOwner()?.id !== id) return false;
      if (version !== serverRefreshVersion.current) return serverState.current.ownerId === id && serverState.current.premium;
      const next = { ownerId: id, premium: response.premium === true };
      serverState.current = next;
      if (alive.current) setServer(next);
      return next.premium;
    } catch { return currentOwner()?.id === id && serverState.current.ownerId === id && serverState.current.premium; }
  }
  async function refreshForOwner(owner: DreamerUser) {
    const id = owner.id;
    const version = ++sdkRefreshVersion.current;
    const serverCheck = serverEntitlement(id);
    let sdkPremium = false;
    if (configured.current && customerId.current === id) {
      try {
        await Purchases.invalidateCustomerInfoCache();
        const info = await Purchases.getCustomerInfo();
        if (currentOwner()?.id !== id || customerId.current !== id) return false;
        if (version === sdkRefreshVersion.current) { publishSDK(id, info); sdkPremium = hasSubscription(info); }
        else sdkPremium = sdkState.current.ownerId === id && hasSubscription(sdkState.current.info);
      } catch { sdkPremium = sdkState.current.ownerId === id && hasSubscription(sdkState.current.info); }
    }
    // A fresh native entitlement unlocks immediately even if our backend is unavailable.
    if (sdkPremium) { void serverCheck; return true; }
    return await serverCheck;
  }
  const refreshSubscription = async () => {
    if (disabled) return false;
    const owner = await synchronizeIdentity(false);
    return refreshForOwner(owner);
  };
  const refreshRef = useRef(refreshSubscription);
  useEffect(() => { refreshRef.current = refreshSubscription; });
  useEffect(() => {
    if (disabled) return;
    void refreshRef.current().catch(() => undefined);
  }, [user?.id, isLoading, disabled]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refreshRef.current().catch(() => undefined); });
    return () => listener.remove();
  }, []);
  const reloadOfferings = async () => {
    await configuration.current;
    if (!configured.current) return;
    setIsLoading(true);
    try { setOfferings(orderedOfferings(await Purchases.getOfferings())); }
    catch { setOfferings(null); }
    finally { if (alive.current) setIsLoading(false); }
  };

  const showPaywall = async (offering?: PurchasesOffering, options?: PaywallOptions): Promise<PaywallOutcome> => {
    if (disabled || Platform.OS === 'web' || operationBusy.current) return 'unavailable';
    operationBusy.current = true;
    try {
      // Establish the Cloudflare guest/email identity before the store can sell a purchase.
      const owner = await synchronizeIdentity(true);
      if (await refreshForOwner(owner)) return 'restored';
      if (!configured.current || currentOwner()?.id !== owner.id) return 'unavailable';
      let available = offerings;
      let target = offering ?? available?.[0];
      if (!target) {
        const fetched = await Purchases.getOfferings();
        available = orderedOfferings(fetched);
        target = fetched.current ?? undefined;
      }
      if (!target?.availablePackages.length) return 'unavailable';
      let result = await presentStorePaywall(target);
      // One follow-up only. Onboarding renders its own offer screen after a decline.
      if (result === 'cancelled' && options?.offerOnDecline !== false) {
        if (currentOwner()?.id !== owner.id) return 'error';
        if (knownPremium(owner.id)) return 'restored';
        const alternative = discountedOffering(target, available);
        if (alternative) result = await presentStorePaywall(alternative);
      }
      if (result === 'purchased' || result === 'restored') {
        if (currentOwner()?.id !== owner.id) return 'error';
        if (!await refreshForOwner(owner)) return 'error';
      }
      return result;
    } catch { return 'error'; }
    finally { operationBusy.current = false; }
  };
  const restorePurchases = async () => {
    if (disabled || operationBusy.current) return false;
    operationBusy.current = true;
    try {
      const owner = await synchronizeIdentity(true);
      if (!configured.current) { Alert.alert('Purchases unavailable', 'Restore purchases in the mobile app with the store account used to subscribe.'); return await serverEntitlement(owner.id); }
      sdkRefreshVersion.current += 1;
      const info = await Purchases.restorePurchases();
      if (currentOwner()?.id !== owner.id) return false;
      publishSDK(owner.id, info);
      const restored = hasSubscription(info) || await serverEntitlement(owner.id);
      if (!restored) Alert.alert('No active subscription', 'No active subscription was found for this store account.');
      return restored;
    } catch {
      const id = currentOwner()?.id;
      if (id && knownPremium(id)) return true;
      Alert.alert('Couldn’t restore purchases', 'Reconnect and try again with the store account used to subscribe.'); return false;
    } finally { operationBusy.current = false; }
  };
  const ensurePremium = async () => {
    try { if (await refreshSubscription()) return true; } catch {
      const id = currentOwner()?.id;
      if (id && knownPremium(id)) return true;
    }
    const outcome = await showPaywall();
    return outcome === 'purchased' || outcome === 'restored';
  };
  return <SubscriptionContext.Provider value={{ isSubscribed, isLoading, customerInfo, offerings, showPaywall, restorePurchases, reloadOfferings, refreshSubscription, ensurePremium }}>{children}</SubscriptionContext.Provider>;
}
