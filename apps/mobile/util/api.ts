import { Platform } from 'react-native';
import { API_URL, authenticatedHeaders, getCurrentUser, invalidateSession } from './auth-client';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export type ApiOptions = RequestInit & { expectedOwner?: string };
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { expectedOwner, ...requestOptions } = options;
  const headers = await authenticatedHeaders(expectedOwner);
  const checkOwner = () => { if (expectedOwner && getCurrentUser()?.id !== expectedOwner) throw new Error('Your account changed. Please try again from your current journal.'); };
  checkOwner();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path.endsWith('/process') ? 120000 : 30000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${API_URL}${path}`, { ...requestOptions, credentials: Platform.OS === 'web' ? 'include' : 'omit', headers: { ...headers, ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: controller.signal });
    checkOwner();
    if (!response.ok) {
      if (response.status === 401) invalidateSession();
      const data = await response.json().catch(() => null);
      throw new ApiError(data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || (response.status === 401 ? 'Reconnect to your journal before syncing.' : 'Could not sync right now. Your dream is safe on this device.'), response.status);
    }
    if (response.status === 204) return undefined as T;
    const data = await response.json(); checkOwner();
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (options.signal?.aborted) throw error;
      throw new Error('The connection timed out. Your dream is safe; tap Retry to continue.');
    }
    if (error instanceof TypeError) throw new Error('Could not reach the cloud. Your dream is saved on this device. Retry when connected.');
    throw error;
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
}
