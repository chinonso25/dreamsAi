import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../AuthProvider';
import { rebindJournalOwner, invalidateJournalRequests } from '@/util/journal';
import { rebindDraftOwner } from '@/util/drafts';
import { ensureSession } from '@/util/auth-client';

let mockOwner: { id: string; email?: string; isAnonymous: boolean };
const mockEmailSignIn = jest.fn<() => Promise<unknown>>();
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: false }) }));
jest.mock('@/util/auth-client', () => ({
  cachedUser: async () => mockOwner,
  ensureSession: jest.fn(),
  rememberUser: async (user: typeof mockOwner) => { mockOwner = user; },
  forgetDeletedUser: jest.fn(),
  authClient: { signIn: { emailOtp: () => mockEmailSignIn() } },
}));
jest.mock('@/util/journal', () => ({
  hydrateJournal: async () => {}, invalidateJournalRequests: jest.fn(),
  rebindJournalOwner: jest.fn(), refreshDreams: async () => {}, syncJournal: async () => {},
  beginAccountDeletion: jest.fn(), cancelAccountDeletion: jest.fn(), clearDeletedAccountJournal: jest.fn(),
  useJournalStore: { getState: () => ({ entries: [], deleted: [] }) },
}));
jest.mock('@/util/drafts', () => ({ rebindDraftOwner: jest.fn(), clearDeletedAccountDraft: jest.fn() }));
jest.mock('@/util/api', () => ({ apiRequest: jest.fn() }));
let auth: ReturnType<typeof useAuth>;
let tree: renderer.ReactTestRenderer;
function Probe() { const value = useAuth(); React.useEffect(() => { auth = value; }, [value]); return null; }
beforeEach(async () => {
  jest.clearAllMocks();
  mockOwner = { id: 'email-a', email: 'a@example.invalid', isAnonymous: false };
  jest.mocked(ensureSession).mockImplementation(async () => mockOwner);
  mockEmailSignIn.mockResolvedValue({ data: { user: { id: 'email-b', isAnonymous: false } } });
  await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); });
});
afterEach(async () => { await act(async () => tree.unmount()); });

it('never transfers a verified account when signing into a different email', async () => {
  await act(async () => auth.verifyEmailCode('b@example.invalid', '123456'));
  expect(rebindJournalOwner).toHaveBeenCalledWith('email-a', 'email-b', false);
  expect(rebindDraftOwner).toHaveBeenCalledWith('email-a', 'email-b', false);
  expect(invalidateJournalRequests).toHaveBeenCalled();
  expect(auth.user?.id).toBe('email-b');
});

it('transfers a guest only after a live guest session and successful email verification', async () => {
  mockOwner = { id: 'guest-a', isAnonymous: true };
  await act(async () => auth.reconnect());
  jest.clearAllMocks();
  await act(async () => auth.verifyEmailCode('b@example.invalid', '123456'));
  expect(ensureSession).toHaveBeenCalledWith({ force: true });
  expect(rebindJournalOwner).toHaveBeenCalledWith('guest-a', 'email-b', true);
  expect(rebindDraftOwner).toHaveBeenCalledWith('guest-a', 'email-b', true);
});

it('retains the cached account and does not rebind after session recovery fails', async () => {
  jest.mocked(ensureSession).mockRejectedValue(new Error('Sign in with your email again'));
  await act(async () => auth.reconnect());
  expect(auth.user?.id).toBe('email-a');
  expect(auth.error).toContain('Sign in with your email again');
  expect(rebindJournalOwner).not.toHaveBeenCalled();
  expect(rebindDraftOwner).not.toHaveBeenCalled();
});

it('does not transfer an expired guest cache when a fresh session has a different id', async () => {
  mockOwner = { id: 'guest-a', isAnonymous: true };
  jest.mocked(ensureSession).mockResolvedValue({ id: 'guest-b', isAnonymous: true });
  await act(async () => auth.verifyEmailCode('b@example.invalid', '123456'));
  expect(rebindJournalOwner).toHaveBeenCalledWith('guest-a', 'email-b', false);
  expect(rebindDraftOwner).toHaveBeenCalledWith('guest-a', 'email-b', false);
});
