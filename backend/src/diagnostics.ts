import { APIError } from './types';

/** Only application-owned categories are logged. Never forward an error message,
 * request URL/body, account ID, file key, provider response or credentials. */
export function reportFailure(operation: string, error: unknown) {
  console.error('dreamer_failure', {
    operation,
    category: error instanceof APIError ? 'api' : 'unexpected',
    status: error instanceof APIError ? error.status : 503,
    code: error instanceof APIError ? error.code : 'SERVICE_UNAVAILABLE',
  });
}
