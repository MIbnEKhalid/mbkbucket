import { createLogger } from "#logger";
import { isJsonRequest, sendError, sanitizeErrorDetails } from "mbkauthe";

const debugServer = createLogger('server');

const BASE_ERROR_DATA = { layout: false, pagename: "Home", page: "/" };

export function notFoundHandler(req, res, next) {
  const url = req.originalUrl || req.url || '';
  if (!url.startsWith('/mbkbucket') && typeof next === 'function') {
    return next();
  }

  debugServer("Path not found: %s %s", req.method, req.url);

  if (isJsonRequest(req)) {
    return sendError(res, "The requested API route was not found.", {
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      req,
    });
  }

  return res.status(404).render("Error/dError.handlebars", {
    ...BASE_ERROR_DATA,
    code: 404,
    error: "Not Found",
    message: "The requested page was not found.",
  });
}

export function globalErrorHandler(err, req, res, _next) {
  console.error(`[mbkbucket] ${err.stack || err}`);

  const statusCode = Number(err.status || err.statusCode || 500);

  if (isJsonRequest(req)) {
    return sendError(res, err, {
      statusCode,
      req,
      details: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }

  const sanitizedDetails = err.message ? sanitizeErrorDetails(err.message) : undefined;

  return res.status(statusCode).render("Error/dError.handlebars", {
    ...BASE_ERROR_DATA,
    code: statusCode,
    error: statusCode >= 500 ? "Internal app Error" : (err.name || "Client Error"),
    message: err.message || "An unexpected error occurred on the app.",
    ...(sanitizedDetails ? { details: sanitizedDetails } : {}),
  });
}
