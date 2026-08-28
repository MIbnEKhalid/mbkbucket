/**
 * Wraps an async Express route handler so that any thrown/rejected errors
 * are forwarded to `next(err)` instead of crashing the process.
 *
 * Usage:
 *   router.get('/path', wrap(myAsyncHandler));
 *
 * If a custom error handler is provided, it receives (error, req, res, next)
 * and can send a custom response instead of forwarding to Express error middleware.
 */
export function wrap(handler, onError) {
  return (req, res, next) => {
    const result = handler(req, res, next);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => {
        if (onError) {
          return onError(err, req, res, next);
        }
        next(err);
      });
    }
  };
}

/**
 * Combines wrap() with a standard JSON error response for API routes.
 * The `fallbackMessage` is used when the error has no message.
 */
export function wrapApi(handler, fallbackMessage = 'Request failed') {
  return wrap(handler, (err, _req, res) => {
    console.error(`[mbkbucket] ${err.stack || err.message}`);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      error: err.message || fallbackMessage,
    });
  });
}
