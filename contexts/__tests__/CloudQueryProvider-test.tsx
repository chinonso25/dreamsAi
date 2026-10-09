import React from 'react';
import renderer from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { CloudQueryProvider } from '../CloudQueryProvider';
import { queryClient } from '@/util/query-client';

jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(), getNetworkStateAsync: jest.fn() }));
let networkListener!: (state: Network.NetworkState) => void;
let appListener!: (state: AppStateStatus) => void;
const removeNetwork = jest.fn(); const removeApp = jest.fn();
const originalOS = Platform.OS;
beforeEach(() => {
  queryClient.setQueryDefaults(['account'], { gcTime: Infinity });
  jest.clearAllMocks(); queryClient.clear(); onlineManager.setOnline(true);
  Object.defineProperty(Platform, 'OS', { value: 'ios' });
  jest.mocked(Network.addNetworkStateListener).mockImplementation(listener => { networkListener = listener; return { remove: removeNetwork }; });
  jest.mocked(Network.getNetworkStateAsync).mockResolvedValue({ isConnected: true, isInternetReachable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => { appListener = listener; return { remove: removeApp }; });
});
afterEach(() => { queryClient.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); Object.defineProperty(Platform, 'OS', { value: originalOS }); jest.restoreAllMocks(); });

it('uses native reachability and app focus and releases both subscriptions', async () => {
  let tree!: renderer.ReactTestRenderer;
  await renderer.act(async () => { tree = renderer.create(<CloudQueryProvider><></></CloudQueryProvider>); });
  expect(onlineManager.isOnline()).toBe(true);
  renderer.act(() => networkListener({ isConnected: true, isInternetReachable: false }));
  expect(onlineManager.isOnline()).toBe(false);
  renderer.act(() => appListener('background')); expect(focusManager.isFocused()).toBe(false);
  renderer.act(() => { networkListener({ isConnected: true, isInternetReachable: true }); appListener('active'); });
  expect(onlineManager.isOnline()).toBe(true); expect(focusManager.isFocused()).toBe(true);
  renderer.act(() => tree.unmount());
  expect(removeNetwork).toHaveBeenCalledTimes(1); expect(removeApp).toHaveBeenCalledTimes(1);
});

it('does not let an old initial network read overwrite a newer offline event', async () => {
  let resolveInitial!: (state: Network.NetworkState) => void;
  jest.mocked(Network.getNetworkStateAsync).mockImplementation(() => new Promise(resolve => { resolveInitial = resolve; }));
  let tree!: renderer.ReactTestRenderer;
  await renderer.act(async () => { tree = renderer.create(<CloudQueryProvider><></></CloudQueryProvider>); });
  renderer.act(() => networkListener({ isConnected: false }));
  await renderer.act(async () => resolveInitial({ isConnected: true, isInternetReachable: true }));
  expect(onlineManager.isOnline()).toBe(false);
  renderer.act(() => tree.unmount());
});
