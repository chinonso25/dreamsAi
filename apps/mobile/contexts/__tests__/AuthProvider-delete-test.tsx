import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../AuthProvider';
import { apiRequest } from '@/util/api';
import { beginAccountDeletion, cancelAccountDeletion, clearDeletedAccountJournal, hydrateJournal } from '@/util/journal';
import { clearDeletedAccountDraft } from '@/util/drafts';
import { forgetDeletedUser } from '@/util/auth-client';

jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: false }) }));
jest.mock('@/util/auth-client', () => ({ cachedUser: async () => ({ id: 'email-owner', email: 'test@example.invalid', isAnonymous: false }), ensureSession: async () => ({ id: 'email-owner', isAnonymous: false }), rememberUser: jest.fn(), forgetDeletedUser: jest.fn<() => Promise<void>>(), authClient: {} }));
jest.mock('@/util/journal', () => ({ hydrateJournal: jest.fn<() => Promise<void>>(), invalidateJournalRequests: jest.fn(), rebindJournalOwner: jest.fn<() => Promise<void>>(), refreshDreams: jest.fn<() => Promise<void>>(), syncJournal: jest.fn<() => Promise<void>>(), beginAccountDeletion: jest.fn<() => Promise<void>>(), cancelAccountDeletion: jest.fn(), clearDeletedAccountJournal: jest.fn<() => Promise<void>>(), useJournalStore: { getState: () => ({ entries: [], deleted: [] }) } }));
jest.mock('@/util/drafts', () => ({ clearDeletedAccountDraft: jest.fn<() => Promise<void>>(), rebindDraftOwner: jest.fn<() => Promise<void>>() }));
jest.mock('@/util/api', () => ({ apiRequest: jest.fn<() => Promise<{ deleted: boolean }>>() }));
let auth!: ReturnType<typeof useAuth>;
let tree: renderer.ReactTestRenderer;
const deleteAPI = jest.mocked(apiRequest) as unknown as jest.Mock<() => Promise<{ deleted: boolean }>>;
function Probe() { const value = useAuth(); React.useEffect(() => { auth = value; }, [value]); return null; }
beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(hydrateJournal).mockResolvedValue(undefined);
  jest.mocked(clearDeletedAccountJournal).mockResolvedValue(undefined);
  jest.mocked(clearDeletedAccountDraft).mockResolvedValue(undefined);
  jest.mocked(forgetDeletedUser).mockResolvedValue(undefined);
  await act(async () => { tree = renderer.create(<AuthProvider><Probe /></AuthProvider>); });
});
afterEach(async () => { await act(async () => { tree.unmount(); }); });
it('waits for server acknowledgment before clearing any local journal, draft or session', async () => {
  let acknowledge!: (value: { deleted: boolean }) => void;
  deleteAPI.mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
  let pending!: Promise<{ cleanupWarning?: string }>;
  await act(async () => { pending = auth.deleteAccount(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(beginAccountDeletion).toHaveBeenCalledWith('email-owner');
  expect(clearDeletedAccountJournal).not.toHaveBeenCalled();
  expect(clearDeletedAccountDraft).not.toHaveBeenCalled();
  expect(forgetDeletedUser).not.toHaveBeenCalled();
  await act(async () => { acknowledge({ deleted: true }); await pending; });
  expect(apiRequest).toHaveBeenCalledWith('/v1/account', { method: 'DELETE', expectedOwner: 'email-owner' });
  expect(clearDeletedAccountJournal).toHaveBeenCalledWith('email-owner');
  expect(clearDeletedAccountDraft).toHaveBeenCalledWith('email-owner', []);
  expect(forgetDeletedUser).toHaveBeenCalledWith('email-owner');
});
it('keeps local data and its session when the server cannot confirm deletion', async () => {
  deleteAPI.mockRejectedValue(new Error('Connection interrupted'));
  await act(async () => { await expect(auth.deleteAccount()).rejects.toThrow('Connection interrupted'); });
  expect(cancelAccountDeletion).toHaveBeenCalledWith('email-owner');
  expect(clearDeletedAccountJournal).not.toHaveBeenCalled();
  expect(clearDeletedAccountDraft).not.toHaveBeenCalled();
  expect(forgetDeletedUser).not.toHaveBeenCalled();
});

it('requires an explicit boolean acknowledgment before clearing device data', async () => {
  deleteAPI.mockResolvedValue({ deleted: 'false' as unknown as boolean });
  await act(async () => { await expect(auth.deleteAccount()).rejects.toThrow('could not be confirmed'); });
  expect(clearDeletedAccountJournal).not.toHaveBeenCalled();
  expect(clearDeletedAccountDraft).not.toHaveBeenCalled();
  expect(forgetDeletedUser).not.toHaveBeenCalled();
});
