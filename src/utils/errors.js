/**
 * Centralized error classification for API routes.
 * Maps error messages to HTTP status codes and machine-readable error codes.
 */

/**
 * Classify an API-level error into { status, code, message }.
 * @param {Error} error
 * @param {string} fallbackMessage
 * @returns {{ status: number, code: string, message: string }}
 */
export function classifyApiError(error, fallbackMessage = 'Request failed') {
  const message = String(error?.message || fallbackMessage);
  const lower = message.toLowerCase();

  if (lower.includes('bucketconnection environment variable is not set')) {
    return { status: 503, code: 'BUCKET_CONFIG_ERROR', message };
  }
  if (lower.includes('no bucket selected') || lower.includes('not found in bucketconnection')) {
    return { status: 400, code: 'INVALID_BUCKET', message };
  }
  if (lower.includes('already exists')) {
    return { status: 409, code: 'CONFLICT', message };
  }
  if (lower.includes('not found')) {
    return { status: 404, code: 'NOT_FOUND', message };
  }
  if (lower.includes('access denied')) {
    return { status: 403, code: 'ACCESS_DENIED', message };
  }
  if (lower.includes('required') || lower.includes('invalid') || lower.includes('must be')) {
    return { status: 400, code: 'VALIDATION_ERROR', message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message };
}

/**
 * Classify a view-level error into { status, code, message }.
 * @param {Error} error
 * @param {string} fallbackMessage
 * @returns {{ status: number, code: string, message: string }}
 */
export function classifyViewError(error, fallbackMessage = 'Request failed') {
  const message = String(error?.message || fallbackMessage);
  const lower = message.toLowerCase();

  if (lower.includes('no bucket selected') || lower.includes('not found in bucketconnection')) {
    return { status: 400, code: 'INVALID_BUCKET', message };
  }
  if (lower.includes('access denied')) {
    return { status: 403, code: 'ACCESS_DENIED', message };
  }
  if (lower.includes('not found')) {
    return { status: 404, code: 'NOT_FOUND', message };
  }
  if (lower.includes('invalid') || lower.includes('required')) {
    return { status: 400, code: 'VALIDATION_ERROR', message };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message };
}

/**
 * Send a classified API error as JSON.
 */
export function sendApiError(res, error, fallbackMessage = 'Request failed') {
  const mapped = classifyApiError(error, fallbackMessage);
  return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
}

/**
 * Send a classified view error as JSON.
 */
export function sendViewError(res, error, fallbackMessage = 'Request failed') {
  const mapped = classifyViewError(error, fallbackMessage);
  return res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
}
