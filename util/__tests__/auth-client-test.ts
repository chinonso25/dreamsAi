import { beforeEach, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockClient = {
  getSession: jest.fn<() => Promise<unknown>>(),
  getCookie: jest.fn<() => string>(),
  signIn: { anonymous: jest.fn<() => Promise<unknown>>() },
  signOut: jest.fn<() => Promise<void>>(),
};
jest.mock('better-auth/react', () => ({ createAuthClient: () => mockClient }));
jest.mock('better-auth/client/plugins', () => ({ anonymousClient: () => ({}), emailOTPClient: () => ({}) }));
jest.mock('@better-auth/expo/client', () => ({ expoClient: () => ({}) }));
jest.mock('expo-secure-store', () => ({ setItemAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn<() => Promise<string | null>>(), setItem: jest.fn<() => Promise<void>>(), removeItem: jest.fn<() => Promise<void>>() }));

let client: typeof import('../auth-client');
const emailOwner = { id: 'email-a', email: 'a@example.invalid', isAnonymous: false };
const guestOwner = { id: 'guest-a', isAnonymous: true };
const session = (user = emailOwner) => ({ data: { user, session: { expiresAt: new Date(Date.now() + 3600000) } } });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  mockClient.getCookie.mockReturnValue('signed-session');
  mockClient.getSession.mockResolvedValue(session());
  jest.isolateModules(() => { client = jest.requireActual('../auth-client'); });
});

it('keeps an expired email account private instead of creating a guest', async () => {
  await client.rememberUser(emailOwner);
  mockClient.getSession.mockResolvedValue({ data: null });
  await expect(client.ensureSession()).rejects.toThrow('Sign in with your email again');
  expect(client.getCurrentUser()).toEqual(emailOwner);
  expect(mockClient.signIn.anonymous).not.toHaveBeenCalled();
});

it('reuses only a recently server-verified session and refreshes on demand', async () => {
  await client.rememberUser(emailOwner);
  await Promise.all([client.authenticatedHeaders(), client.authenticatedHeaders()]);
  await client.authenticatedHeaders();
  expect(mockClient.getSession).toHaveBeenCalledTimes(1);
  await client.ensureSession({ force: true });
  expect(mockClient.getSession).toHaveBeenCalledTimes(2);
  client.invalidateSession();
  await client.authenticatedHeaders();
  expect(mockClient.getSession).toHaveBeenCalledTimes(3);
});

it('does not reuse a verified cache after identity changes', async () => {
  await client.ensureSession();
  await client.rememberUser({ ...emailOwner, id: 'email-b' });
  mockClient.getSession.mockResolvedValue(session({ ...emailOwner, id: 'email-b' }));
  await client.authenticatedHeaders('email-b');
  expect(mockClient.getSession).toHaveBeenCalledTimes(2);
  await expect(client.authenticatedHeaders('email-a')).rejects.toThrow('original journal');
});

it('rejects a late session response after a different account signs in', async () => {
  let resolve!: (value: unknown) => void;
  mockClient.getSession.mockImplementation(() => new Promise(done => { resolve = done; }));
  const pending = client.ensureSession();
  await Promise.resolve(); await Promise.resolve();
  await client.rememberUser({ ...emailOwner, id: 'email-b' });
  resolve(session());
  await expect(pending).rejects.toThrow('account changed');
  expect(client.getCurrentUser()?.id).toBe('email-b');
});

it('permits first-run anonymous capture with a new private session', async () => {
  mockClient.getSession.mockResolvedValue({ data: null });
  mockClient.signIn.anonymous.mockResolvedValue({ data: { user: guestOwner } });
  expect(await client.ensureSession()).toEqual(guestOwner);
  expect(mockClient.signIn.anonymous).toHaveBeenCalledTimes(1);
});

it('ignores a stale disk identity read after a different account is remembered', async () => {
  let resolve!: (value: string | null) => void;
  jest.mocked(AsyncStorage.getItem).mockImplementation(() => new Promise(done => { resolve = done; }));
  const reading = client.cachedUser();
  await client.rememberUser({ ...emailOwner, id: 'email-b' });
  resolve(JSON.stringify(emailOwner));
  expect((await reading)?.id).toBe('email-b');
  expect(client.getCurrentUser()?.id).toBe('email-b');
});

it('expires the short session cache rather than trusting a remembered identity indefinitely', async () => {
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    await client.ensureSession();
    clock.mockReturnValue(now + 60001);
    await client.ensureSession();
    expect(mockClient.getSession).toHaveBeenCalledTimes(2);
  } finally { clock.mockRestore(); }
});
