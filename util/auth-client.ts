import { createAuthClient } from 'better-auth/react';
import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.thedreamer.app').replace(/\/$/, '');
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [anonymousClient(), emailOTPClient(), ...(Platform.OS === 'web' ? [] : [expoClient({ scheme: 'dreamai', storage: SecureStore })])],
});
export type DreamerUser = { id: string; email?: string; name?: string; isAnonymous?: boolean | null };
let currentUser: DreamerUser | null = null;
let pendingSession: Promise<DreamerUser> | null = null;
export function getCurrentUser() { return currentUser; }
export async function rememberUser(user: DreamerUser) {
  currentUser = user;
  await AsyncStorage.setItem('dreamer-owner-v1', JSON.stringify(user));
}
export async function cachedUser(): Promise<DreamerUser | null> {
  if (currentUser) return currentUser;
  const raw = await AsyncStorage.getItem('dreamer-owner-v1');
  if (raw) { try { currentUser = JSON.parse(raw); } catch {} }
  return currentUser;
}

/** Remove only the session belonging to the account that the server has deleted. */
export async function forgetDeletedUser(owner: string) {
  if (pendingSession) await pendingSession.catch(() => undefined);
  if (currentUser && currentUser.id !== owner) return;
  currentUser = null;
  await AsyncStorage.removeItem('dreamer-owner-v1');
  try { await authClient.signOut(); } catch { /* The deleted server session is already invalid. */ }
  if (Platform.OS !== 'web') {
    // These are the documented default Expo client storagePrefix keys. A failed
    // sign-out request must not leave a usable cached native session behind.
    await SecureStore.setItemAsync('better-auth_cookie', '{}');
    await SecureStore.setItemAsync('better-auth_session_data', '{}');
  }
}
export async function ensureSession(): Promise<DreamerUser> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const result = await authClient.getSession({ query: { disableCookieCache: true } });
    if (result.error) throw new Error('Your journal is saved on this device. Reconnect to sync it.');
    if (result.data?.user) { await rememberUser(result.data.user); return result.data.user; }
    const signed = await authClient.signIn.anonymous();
    if (signed.error || !signed.data?.user) throw new Error('Could not connect to your private journal. You can keep saving on this device.');
    await rememberUser(signed.data.user); return signed.data.user;
  })();
  try { return await pendingSession; } finally { pendingSession = null; }
}
export async function authenticatedHeaders(): Promise<Record<string, string>> {
  await ensureSession();
  if (Platform.OS === 'web') return {};
  const cookies = await authClient.getCookie();
  if (!cookies) throw new Error('Your session needs to reconnect before syncing.');
  return { Cookie: cookies };
}
