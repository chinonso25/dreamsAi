import { Platform } from 'react-native';
import { API_URL, authenticatedHeaders } from './auth-client';
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await authenticatedHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path.endsWith('/process') ? 120000 : 30000);
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, credentials: Platform.OS === 'web' ? 'include' : 'omit', headers: { ...headers, ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(data?.error?.message || (typeof data?.error === 'string' ? data.error : null) || (response.status === 401 ? 'Reconnect to your journal before syncing.' : 'Could not sync right now. Your dream is safe on this device.'), response.status);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The connection timed out. Your dream is safe; tap Retry to continue.');
    if (error instanceof TypeError) throw new Error('Could not reach the cloud. Your dream is saved on this device. Retry when connected.');
    throw error;
  } finally { clearTimeout(timer); }
}
