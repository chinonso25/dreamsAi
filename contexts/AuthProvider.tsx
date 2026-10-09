import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNetworkState } from 'expo-network';
import { cachedUser, DreamerUser, ensureSession, authClient, rememberUser, forgetDeletedUser } from '@/util/auth-client';
import { beginAccountDeletion, cancelAccountDeletion, clearDeletedAccountJournal, hydrateJournal, invalidateJournalRequests, rebindJournalOwner, refreshDreams, syncJournal, useJournalStore } from '@/util/journal';
import { clearDeletedAccountDraft, rebindDraftOwner } from '@/util/drafts';
import { apiRequest } from '@/util/api';

type Context = { user: DreamerUser | null; isAuthenticated: boolean; isGuest: boolean; loading: boolean; error?: string; reconnect: () => Promise<void>; sendEmailCode: (email: string) => Promise<void>; verifyEmailCode: (email: string, otp: string) => Promise<void>; deleteAccount: () => Promise<{ cleanupWarning?: string }> };
const AuthContext = createContext<Context>({ user: null, isAuthenticated: false, isGuest: true, loading: false, reconnect: async () => {}, sendEmailCode: async () => {}, verifyEmailCode: async () => {}, deleteAccount: async () => ({}) });
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DreamerUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const deleting = useRef(false);
  const accountOperation = useRef(false);
  const connection = useRef<Promise<void> | null>(null);
  const identityEpoch = useRef(0);
  const network = useNetworkState();
  const reconnect = async () => {
    if (deleting.current || accountOperation.current) return;
    if (connection.current) return connection.current;
    const epoch = ++identityEpoch.current;
    connection.current = (async () => { try {
      const previous = await cachedUser();
      const next = await ensureSession({ force: true });
      if (epoch !== identityEpoch.current) return;
      if (previous?.id !== next.id) invalidateJournalRequests();
      setUser(next); setError(undefined);
      if (previous?.id !== next.id) await rebindJournalOwner(previous?.id, next.id);
      await rebindDraftOwner(previous?.id, next.id);
      await refreshDreams();
    } catch (e) { setError(e instanceof TypeError ? 'Could not reach the cloud. Your dreams are saved on this device.' : e instanceof Error ? e.message : 'Your journal is saved here. Reconnect to sync.'); }
    })();
    try { await connection.current; } finally { connection.current = null; }
  };
  useEffect(() => {
    let active = true;
    const epoch = identityEpoch.current;
    void hydrateJournal().catch(() => {});
    void cachedUser().then(value => { if (active && epoch === identityEpoch.current) setUser(value); }).catch(() => { if (active && epoch === identityEpoch.current) setError('Your saved identity could not be read. Please retry reconnecting.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (network.isConnected !== false) void reconnect();
    // Network transitions restore sync without blocking local capture.
  }, [network.isConnected]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void reconnect(); });
    const interval = setInterval(() => { if (AppState.currentState === 'active' && !deleting.current && !accountOperation.current) void syncJournal(); }, 30000);
    return () => { listener.remove(); clearInterval(interval); };
  }, []);
  const sendEmailCode = async (email: string) => {
    if (accountOperation.current || deleting.current) throw new Error('An account operation is already in progress.');
    accountOperation.current = true;
    setLoading(true);
    try {
      if (connection.current) await connection.current;
      // Flush the guest journal before Better Auth moves ownership to the email account.
      await syncJournal();
      const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'sign-in' });
      if (result.error) throw new Error(result.error.message || 'Could not send your sign-in code. Please try again.');
    } finally { accountOperation.current = false; setLoading(false); }
  };
  const verifyEmailCode = async (email: string, otp: string) => {
    if (accountOperation.current || deleting.current) throw new Error('An account operation is already in progress.');
    accountOperation.current = true;
    setLoading(true);
    try {
      if (connection.current) await connection.current;
      await syncJournal();
      identityEpoch.current += 1;
      const previous = await cachedUser();
      // Only a live anonymous session proves the server linked the old guest to this account.
      const linkedGuest = previous?.isAnonymous === true ? await ensureSession({ force: true }) : undefined;
      invalidateJournalRequests();
      const result = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: otp.trim() });
      if (result.error || !result.data?.user) throw new Error(result.error?.message || 'That code could not be verified. Request a new code and try again.');
      await rememberUser(result.data.user); setUser(result.data.user);
      const transferGuest = Boolean(linkedGuest?.isAnonymous && linkedGuest.id === previous?.id);
      await rebindJournalOwner(previous?.id, result.data.user.id, transferGuest);
      await rebindDraftOwner(previous?.id, result.data.user.id, transferGuest);
      setError(undefined); await refreshDreams();
    } finally { accountOperation.current = false; setLoading(false); }
  };
  const deleteAccount = async () => {
    if (!user || user.isAnonymous) throw new Error('Only an email account can be deleted here.');
    if (deleting.current) throw new Error('Account deletion is already in progress.');
    if (accountOperation.current) throw new Error('Finish the current account operation before deleting this account.');
    const owner = user.id;
    deleting.current = true; setLoading(true);
    let acknowledged = false;
    try {
      if (connection.current) await connection.current;
      identityEpoch.current += 1;
      const session = await ensureSession({ force: true });
      if (session.id !== owner) throw new Error('Your session changed. Reconnect to your email account before deleting it.');
      invalidateJournalRequests();
      await rebindDraftOwner(owner, owner);
      await beginAccountDeletion(owner);
      const result = await apiRequest<{ deleted: boolean }>('/v1/account', { method: 'DELETE', expectedOwner: owner });
      if (result.deleted !== true) throw new Error('Account deletion could not be confirmed. Your journal has been retained.');
      acknowledged = true;
      const warnings: string[] = [];
      const journal = useJournalStore.getState();
      const protectedFiles = [...journal.entries, ...journal.deleted].filter(entry => entry.user_id !== owner).map(entry => entry.local_audio_uri).filter((uri): uri is string => Boolean(uri));
      try { await clearDeletedAccountJournal(owner); } catch (cause) { warnings.push(cause instanceof Error ? cause.message : 'Some journal data could not be removed from this device.'); }
      try { await clearDeletedAccountDraft(owner, protectedFiles); } catch (cause) { warnings.push(cause instanceof Error ? cause.message : 'The draft could not be removed from this device.'); }
      try { await forgetDeletedUser(owner); } catch { warnings.push('The account was deleted, but its saved sign-in data could not be cleared. Please restart the app.'); }
      setUser(null);
      const cleanupWarning = warnings.length ? warnings.join(' ') : undefined;
      setError(cleanupWarning);
      return { cleanupWarning };
    } finally {
      if (!acknowledged) cancelAccountDeletion(owner);
      deleting.current = false; setLoading(false);
      if (acknowledged) void reconnect();
    }
  };
  return <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), isGuest: !user || Boolean(user.isAnonymous), loading, error, reconnect, sendEmailCode, verifyEmailCode, deleteAccount }}>{children}</AuthContext.Provider>;
}
