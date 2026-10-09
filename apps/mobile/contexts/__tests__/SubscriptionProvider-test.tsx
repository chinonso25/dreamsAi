import React from 'react';
import renderer from 'react-test-renderer';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import PurchasesUI from 'react-native-purchases-ui';
import { ensureSession } from '@/util/auth-client';
import { apiRequest } from '@/util/api';
import { SubscriptionProvider, useSubscription } from '../SubscriptionProvider';
import { queryClient } from '@/util/query-client';

let mockAuthUser = { id: 'guest-a', isAnonymous: true };
let mockCurrentUser = { id: 'guest-a', isAnonymous: true };
jest.mock('../AuthProvider', () => ({ useAuth: () => ({ user: mockAuthUser }) }));
jest.mock('@/util/auth-client', () => ({ getCurrentUser: () => mockCurrentUser, ensureSession: jest.fn() }));
jest.mock('@/util/api', () => ({ apiRequest: jest.fn() }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: { setLogLevel: jest.fn(), configure: jest.fn(), getCustomerInfo: jest.fn(), getOfferings: jest.fn(), addCustomerInfoUpdateListener: jest.fn(), removeCustomerInfoUpdateListener: jest.fn(), restorePurchases: jest.fn(), invalidateCustomerInfoCache: jest.fn(), logIn: jest.fn() }, LOG_LEVEL: { WARN: 'WARN', ERROR: 'ERROR' },
}));
jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: { presentPaywall: jest.fn(), PAYWALL_RESULT: { PURCHASED: 'PURCHASED', RESTORED: 'RESTORED', CANCELLED: 'CANCELLED', ERROR: 'ERROR', NOT_PRESENTED: 'NOT_PRESENTED' } },
}));
const inactive = { entitlements: { active: {} } } as CustomerInfo;
const active = { entitlements: { active: { pro: { isActive: true } } } } as unknown as CustomerInfo;
const otherEntitlement = { entitlements: { active: { unrelated: { isActive: true } } } } as unknown as CustomerInfo;
const offering = { identifier: 'main', availablePackages: [{ identifier: 'annual' }] };
const mainWithDiscount = { ...offering, metadata: { onboarding_discount_offering_id: 'annual_welcome' }, availablePackages: [{ identifier: 'annual', product: { price: 29.99, currencyCode: 'GBP', subscriptionPeriod: 'P1Y' } }] };
const welcome = { identifier: 'annual_welcome', availablePackages: [{ identifier: 'annual', product: { price: 10, currencyCode: 'GBP', subscriptionPeriod: 'P1Y' } }] };
function configureWelcome() {
  jest.mocked(Purchases.getOfferings).mockResolvedValue({ current: mainWithDiscount, all: { main: mainWithDiscount, annual_welcome: welcome } } as unknown as Awaited<ReturnType<typeof Purchases.getOfferings>>);
}
const api = jest.mocked(apiRequest) as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
let context: ReturnType<typeof useSubscription>;
function Probe() { const value = useSubscription(); React.useEffect(() => { context = value; }, [value]); return null; }
async function mount() { let tree!: renderer.ReactTestRenderer; await renderer.act(async () => { tree = renderer.create(<SubscriptionProvider><Probe /></SubscriptionProvider>); }); return tree; }
async function unmount(tree: renderer.ReactTestRenderer) { await renderer.act(async () => tree.unmount()); }
afterEach(() => { queryClient.clear(); });
beforeEach(() => {
  queryClient.setQueryDefaults(['account'], { gcTime: Infinity });
  queryClient.clear();
  jest.clearAllMocks(); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); mockAuthUser = { id: 'guest-a', isAnonymous: true }; mockCurrentUser = mockAuthUser;
  jest.mocked(ensureSession).mockImplementation(async () => mockCurrentUser);
  api.mockResolvedValue({ premium: false });
  jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(inactive);
  jest.mocked(Purchases.logIn).mockResolvedValue({ customerInfo: inactive, created: false });
  jest.mocked(Purchases.invalidateCustomerInfoCache).mockResolvedValue(undefined);
  jest.mocked(Purchases.getOfferings).mockResolvedValue({ current: offering, all: { main: offering } } as unknown as Awaited<ReturnType<typeof Purchases.getOfferings>>);
});
describe('reliable identity and paid unlocking', () => {
  it('unlocks using fresh purchase information without reconfiguring', async () => {
    const tree = await mount(); expect(context.isSubscribed).toBe(false);
    jest.mocked(PurchasesUI.presentPaywall).mockImplementation(async () => { jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(active); return PurchasesUI.PAYWALL_RESULT.PURCHASED; });
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('purchased'); });
    expect(context.isSubscribed).toBe(true); expect(Purchases.configure).toHaveBeenCalledTimes(1);
    expect(Purchases.invalidateCustomerInfoCache).toHaveBeenCalled(); await unmount(tree);
  });
  it('preserves cancellation without unlocking premium', async () => {
    const tree = await mount(); jest.mocked(PurchasesUI.presentPaywall).mockResolvedValue(PurchasesUI.PAYWALL_RESULT.CANCELLED);
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('cancelled'); });
    expect(context.isSubscribed).toBe(false); await unmount(tree);
  });
  it('offers the lower annual plan after closing the main paywall, and confirms its entitlement', async () => {
    configureWelcome(); const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockResolvedValueOnce(PurchasesUI.PAYWALL_RESULT.CANCELLED).mockImplementationOnce(async () => {
      jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(active); return PurchasesUI.PAYWALL_RESULT.PURCHASED;
    });
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('purchased'); });
    expect(PurchasesUI.presentPaywall).toHaveBeenNthCalledWith(1, expect.objectContaining({ offering: mainWithDiscount }));
    expect(PurchasesUI.presentPaywall).toHaveBeenNthCalledWith(2, expect.objectContaining({ offering: welcome }));
    expect(context.isSubscribed).toBe(true); await unmount(tree);
  });
  it('allows declining both paywalls without presenting a third or unlocking Premium', async () => {
    configureWelcome(); const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockResolvedValue(PurchasesUI.PAYWALL_RESULT.CANCELLED);
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('cancelled'); });
    expect(PurchasesUI.presentPaywall).toHaveBeenCalledTimes(2); expect(context.isSubscribed).toBe(false); await unmount(tree);
  });
  it('lets onboarding render its own decline offer without duplicating the native follow-up', async () => {
    configureWelcome(); const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockResolvedValue(PurchasesUI.PAYWALL_RESULT.CANCELLED);
    await renderer.act(async () => { expect(await context.showPaywall(undefined, { offerOnDecline: false })).toBe('cancelled'); });
    expect(PurchasesUI.presentPaywall).toHaveBeenCalledTimes(1); await unmount(tree);
  });
  it.each([{ storeResult: 'ERROR', outcome: 'error' }, { storeResult: 'NOT_PRESENTED', outcome: 'unavailable' }] as { storeResult: 'ERROR' | 'NOT_PRESENTED'; outcome: 'error' | 'unavailable' }[])('does not treat $storeResult as a decline', async ({ storeResult, outcome }) => {
    configureWelcome(); const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockResolvedValue(PurchasesUI.PAYWALL_RESULT[storeResult]);
    await renderer.act(async () => { expect(await context.showPaywall()).toBe(outcome); });
    expect(PurchasesUI.presentPaywall).toHaveBeenCalledTimes(1); await unmount(tree);
  });
  it('does not open the decline offer after the journal owner changes', async () => {
    configureWelcome(); const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockImplementationOnce(async () => {
      mockCurrentUser = { id: 'guest-b', isAnonymous: true }; return PurchasesUI.PAYWALL_RESULT.CANCELLED;
    });
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('error'); });
    expect(PurchasesUI.presentPaywall).toHaveBeenCalledTimes(1); await unmount(tree);
  });
  it('restores from newly returned entitlement and removes its listener', async () => {
    const tree = await mount(); jest.mocked(Purchases.restorePurchases).mockResolvedValue(active);
    await renderer.act(async () => { expect(await context.restorePurchases()).toBe(true); }); expect(context.isSubscribed).toBe(true);
    const listener = jest.mocked(Purchases.addCustomerInfoUpdateListener).mock.calls[0][0];
    await renderer.act(async () => listener(inactive)); expect(context.isSubscribed).toBe(false);
    await unmount(tree); expect(Purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
  });
  it('requires the named entitlement after purchase', async () => {
    const tree = await mount();
    jest.mocked(PurchasesUI.presentPaywall).mockImplementation(async () => { jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(otherEntitlement); return PurchasesUI.PAYWALL_RESULT.PURCHASED; });
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('error'); }); expect(context.isSubscribed).toBe(false); await unmount(tree);
  });
  it('synchronizes a newly established guest identity before presenting a paywall', async () => {
    const tree = await mount();
    jest.mocked(ensureSession).mockImplementation(async () => { mockCurrentUser = { id: 'guest-b', isAnonymous: true }; return mockCurrentUser; });
    let finishLogin!: (result: Awaited<ReturnType<typeof Purchases.logIn>>) => void;
    jest.mocked(Purchases.logIn).mockReturnValue(new Promise(resolve => { finishLogin = resolve; }));
    jest.mocked(PurchasesUI.presentPaywall).mockResolvedValue(PurchasesUI.PAYWALL_RESULT.CANCELLED);
    let outcome!: Promise<unknown>;
    await renderer.act(async () => { outcome = context.showPaywall(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(Purchases.logIn).toHaveBeenCalledWith('guest-b'); expect(PurchasesUI.presentPaywall).not.toHaveBeenCalled();
    await renderer.act(async () => { finishLogin({ customerInfo: inactive, created: false }); expect(await outcome).toBe('cancelled'); });
    expect(Purchases.configure).toHaveBeenCalledTimes(1); await unmount(tree);
  });
  it('blocks store purchases when a private journal session cannot be established', async () => {
    const tree = await mount(); jest.mocked(ensureSession).mockRejectedValue(new Error('Offline session'));
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('error'); });
    expect(PurchasesUI.presentPaywall).not.toHaveBeenCalled(); expect(Purchases.restorePurchases).not.toHaveBeenCalled(); await unmount(tree);
  });
  it('shares a busy guard across paywall and restore operations', async () => {
    const tree = await mount();
    let closePaywall!: (result: Awaited<ReturnType<typeof PurchasesUI.presentPaywall>>) => void;
    jest.mocked(PurchasesUI.presentPaywall).mockReturnValue(new Promise(resolve => { closePaywall = resolve; }));
    let pending!: Promise<unknown>;
    await renderer.act(async () => { pending = context.showPaywall(); for (let i = 0; i < 20; i++) await Promise.resolve(); });
    expect(PurchasesUI.presentPaywall).toHaveBeenCalledTimes(1);
    await renderer.act(async () => { expect(await context.restorePurchases()).toBe(false); expect(await context.showPaywall()).toBe('unavailable'); });
    expect(Purchases.restorePurchases).not.toHaveBeenCalled();
    await renderer.act(async () => { closePaywall(PurchasesUI.PAYWALL_RESULT.CANCELLED); await pending; }); await unmount(tree);
  });
  it('retains server-verified premium after guest-to-email linking', async () => {
    const tree = await mount();
    mockCurrentUser = { id: 'email-a', isAnonymous: false }; mockAuthUser = mockCurrentUser;
    api.mockResolvedValue({ premium: true });
    await renderer.act(async () => { tree.update(<SubscriptionProvider><Probe /></SubscriptionProvider>); });
    await renderer.act(async () => { expect(await context.ensurePremium()).toBe(true); });
    expect(context.isSubscribed).toBe(true); expect(Purchases.logIn).toHaveBeenCalledWith('email-a'); expect(PurchasesUI.presentPaywall).not.toHaveBeenCalled();
    await renderer.act(async () => { expect(await context.showPaywall()).toBe('restored'); }); expect(PurchasesUI.presentPaywall).not.toHaveBeenCalled(); await unmount(tree);
  });
  it('never transfers an old account entitlement to a different owner', async () => {
    api.mockResolvedValue({ premium: true }); const tree = await mount(); expect(context.isSubscribed).toBe(true);
    mockCurrentUser = { id: 'email-other', isAnonymous: false }; mockAuthUser = mockCurrentUser;
    api.mockResolvedValue({ premium: false });
    await renderer.act(async () => { tree.update(<SubscriptionProvider><Probe /></SubscriptionProvider>); });
    expect(context.isSubscribed).toBe(false); await unmount(tree);
  });
  it('unlocks fresh native premium immediately while the backend is offline', async () => {
    const tree = await mount(); api.mockRejectedValue(new TypeError('Failed to fetch'));
    jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(active);
    await renderer.act(async () => { expect(await context.ensurePremium()).toBe(true); });
    expect(context.isSubscribed).toBe(true); expect(PurchasesUI.presentPaywall).not.toHaveBeenCalled(); await unmount(tree);
  });
  it('refreshes the current email identity when the app returns to the foreground', async () => {
    const add = jest.spyOn(AppState, 'addEventListener'); const tree = await mount();
    const handler = add.mock.calls.find(call => call[0] === 'change')![1];
    mockCurrentUser = { id: 'email-a', isAnonymous: false }; mockAuthUser = mockCurrentUser;
    api.mockResolvedValue({ premium: true });
    await renderer.act(async () => { tree.update(<SubscriptionProvider><Probe /></SubscriptionProvider>); handler('active'); });
    expect(Purchases.logIn).toHaveBeenCalledWith('email-a'); expect(context.isSubscribed).toBe(true); await unmount(tree); add.mockRestore();
  });
});

it('does not let a late inactive SDK refresh override freshly verified premium', async () => {
  const tree = await mount();
  let resolveOlder!: (info: CustomerInfo) => void;
  jest.mocked(Purchases.getCustomerInfo).mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
  let older!: Promise<boolean>;
  await renderer.act(async () => { older = context.refreshSubscription(); for (let index = 0; index < 15; index++) await Promise.resolve(); });
  jest.mocked(Purchases.getCustomerInfo).mockResolvedValue(active);
  await renderer.act(async () => { expect(await context.refreshSubscription()).toBe(true); });
  await renderer.act(async () => { resolveOlder(inactive); expect(await older).toBe(true); });
  expect(context.isSubscribed).toBe(true); await unmount(tree);
});
it('shares overlapping server verification and fetches fresh data on the next explicit refresh', async () => {
  const tree = await mount();
  api.mockClear();
  let resolveShared!: (result: unknown) => void;
  api.mockImplementationOnce(() => new Promise(resolve => { resolveShared = resolve; }));
  let first!: Promise<boolean>; let second!: Promise<boolean>;
  await renderer.act(async () => {
    first = context.refreshSubscription(); second = context.refreshSubscription();
    for (let index = 0; index < 20; index++) await Promise.resolve();
  });
  expect(api).toHaveBeenCalledTimes(1);
  await renderer.act(async () => { resolveShared({ premium: false }); expect(await first).toBe(false); expect(await second).toBe(false); });
  api.mockResolvedValue({ premium: true });
  await renderer.act(async () => { expect(await context.refreshSubscription()).toBe(true); });
  expect(context.isSubscribed).toBe(true); await unmount(tree);
});
