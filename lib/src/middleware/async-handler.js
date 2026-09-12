/**
 * Wraps an async Express route handler so that any thrown/rejected errors
 * are forwarded to `next(err)` instead of crashing the process.
 */
export const wrap = (handler, onError) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(err => onError ? onError(err, req, res, next) : next(err));

/**
 * Combines wrap() with a standard JSON error response for API routes.
 */
export const wrapApi = (handler, fallbackMessage = 'Request failed') =>
  wrap(handler, (err, _req, res) => {
    console.error(`[mbkbucket] ${err.stack || err.message}`);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: err.message || fallbackMessage,
    });
  });
