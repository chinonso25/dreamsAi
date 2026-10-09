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
/** Missing server credentials must not replace the locally retained journal owner. */
export class SessionRecoveryError extends Error {
  readonly code = 'SESSION_RECOVERY_REQUIRED';
  readonly owner: DreamerUser;
  constructor(owner: DreamerUser) {
    super(owner.isAnonymous === true
      ? 'Your guest connection expired. Your saved dreams remain on this device. Reconnect this journal from Settings.'
      : 'Sign in with your email again to reconnect this journal. Your saved dreams remain on this device.');
    this.name = 'SessionRecoveryError';
    this.owner = { ...owner };
  }
}
let currentUser: DreamerUser | null = null;
let pendingSession: Promise<DreamerUser> | null = null;
let identityVersion = 0;
let verifiedSession: { owner: string; until: number } | null = null;
let ownerWrites: Promise<void> = Promise.resolve();
export function invalidateSession() { verifiedSession = null; }
export function getCurrentUser() { return currentUser; }
export async function rememberUser(user: DreamerUser) {
  identityVersion += 1;
  invalidateSession();
  currentUser = user;
  const snapshot = JSON.stringify(user);
  const next = ownerWrites.catch(() => undefined).then(() => AsyncStorage.setItem('dreamer-owner-v1', snapshot));
  ownerWrites = next;
  await next;
}
export async function cachedUser(): Promise<DreamerUser | null> {
  if (currentUser) return currentUser;
  const raw = await AsyncStorage.getItem('dreamer-owner-v1');
  if (currentUser) return currentUser;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'id' in parsed && typeof parsed.id === 'string' && parsed.id) currentUser = parsed as DreamerUser;
    } catch { /* Invalid identity data cannot establish ownership. */ }
  }
  return currentUser;
}

/** Remove only the session belonging to the account that the server has deleted. */
export async function forgetDeletedUser(owner: string) {
  if (pendingSession) await pendingSession.catch(() => undefined);
  if (currentUser && currentUser.id !== owner) return;
  identityVersion += 1;
  invalidateSession();
  currentUser = null;
  await ownerWrites.catch(() => undefined);
  await AsyncStorage.removeItem('dreamer-owner-v1');
  try { await authClient.signOut(); } catch { /* The deleted server session is already invalid. */ }
  if (Platform.OS !== 'web') {
    // These are the documented default Expo client storagePrefix keys. A failed
    // sign-out request must not leave a usable cached native session behind.
    await SecureStore.setItemAsync('better-auth_cookie', '{}');
    await SecureStore.setItemAsync('better-auth_session_data', '{}');
  }
}
export async function ensureSession({ force = false }: { force?: boolean } = {}): Promise<DreamerUser> {
  if (pendingSession) return pendingSession;
  if (!force && currentUser && verifiedSession?.owner === currentUser.id && verifiedSession.until > Date.now()) return currentUser;
  const version = identityVersion;
  const pending = (async () => {
    const previous = await cachedUser();
    const result = await authClient.getSession({ query: { disableCookieCache: true } });
    if (version !== identityVersion) throw new Error('Your account changed. Try again from your current journal.');
    if (result.error) throw new Error('Your journal is saved on this device. Reconnect to sync it.');
    if (result.data?.user) {
      await rememberUser(result.data.user);
      if (currentUser?.id !== result.data.user.id) throw new Error('Your account changed. Try again from your current journal.');
      const expiresAt = new Date(result.data.session.expiresAt).getTime();
      verifiedSession = { owner: result.data.user.id, until: Math.min(Date.now() + 60000, expiresAt) };
      return result.data.user;
    }
    // This includes expired guests: replacing their identity would hide retained
    // offline entries and drafts. Recovery must be an explicit account operation.
    if (previous) { invalidateSession(); throw new SessionRecoveryError(previous); }
    const signed = await authClient.signIn.anonymous();
    if (version !== identityVersion) throw new Error('Your account changed. Try again from your current journal.');
    if (signed.error || !signed.data?.user) throw new Error('Could not connect to your private journal. You can keep saving on this device.');
    await rememberUser(signed.data.user);
    if (currentUser?.id !== signed.data.user.id) throw new Error('Your account changed. Try again from your current journal.');
    verifiedSession = { owner: signed.data.user.id, until: Date.now() + 60000 };
    return signed.data.user;
  })();
  pendingSession = pending;
  try { return await pending; } finally { if (pendingSession === pending) pendingSession = null; }
}
export async function authenticatedHeaders(expectedOwner?: string): Promise<Record<string, string>> {
  const session = await ensureSession();
  if (expectedOwner && session.id !== expectedOwner) throw new Error('Your account changed. This operation was kept with its original journal.');
  if (Platform.OS === 'web') return {};
  const cookies = await authClient.getCookie();
  if (!cookies) throw new Error('Your session needs to reconnect before syncing.');
  return { Cookie: cookies };
}
