/**
 * Centralized error classification for API and View routes.
 * Maps error messages to HTTP status codes and machine-readable error codes.
 */

const API_ERROR_RULES = [
  { match: 'bucketconnection environment variable is not set', status: 503, code: 'BUCKET_CONFIG_ERROR' },
  { match: ['no bucket selected', 'not found in bucketconnection'], status: 400, code: 'INVALID_BUCKET' },
  { match: 'already exists', status: 409, code: 'CONFLICT' },
  { match: 'not found', status: 404, code: 'NOT_FOUND' },
  { match: 'access denied', status: 403, code: 'ACCESS_DENIED' },
  { match: ['required', 'invalid', 'must be'], status: 400, code: 'VALIDATION_ERROR' },
];

const VIEW_ERROR_RULES = [
  { match: ['no bucket selected', 'not found in bucketconnection'], status: 400, code: 'INVALID_BUCKET' },
  { match: 'access denied', status: 403, code: 'ACCESS_DENIED' },
  { match: 'not found', status: 404, code: 'NOT_FOUND' },
  { match: ['invalid', 'required'], status: 400, code: 'VALIDATION_ERROR' },
];

function matchError(rules, error, fallbackMessage) {
  const message = String(error?.message || fallbackMessage);
  const lower = message.toLowerCase();
  const found = rules.find(r => Array.isArray(r.match) ? r.match.some(m => lower.includes(m)) : lower.includes(r.match));
  return { status: found?.status ?? 500, code: found?.code ?? 'INTERNAL_ERROR', message };
}

export function classifyApiError(error, fallbackMessage = 'Request failed') {
  return matchError(API_ERROR_RULES, error, fallbackMessage);
}

export function classifyViewError(error, fallbackMessage = 'Request failed') {
  return matchError(VIEW_ERROR_RULES, error, fallbackMessage);
}

export function sendApiError(res, error, fallbackMessage = 'Request failed') {
  const { status, code, message } = classifyApiError(error, fallbackMessage);
  return res.status(status).json({ success: false, code, error: message });
}

export function sendViewError(res, error, fallbackMessage = 'Request failed') {
  const { status, code, message } = classifyViewError(error, fallbackMessage);
  return res.status(status).json({ code, message });
}
