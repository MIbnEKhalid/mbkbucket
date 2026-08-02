import { createLogger } from "../utils/logger.js";

const debugServer = createLogger('server');

/**
 * Global 404 handler — renders error page via Handlebars.
 */
export function notFoundHandler(req, res) {
  debugServer("Path not found: %s %s", req.method, req.url);
  return res.status(404).render("Error/dError.handlebars", {
    layout: false,
    code: 404,
    error: "Not Found",
    message: "The requested page was not found.",
    pagename: "Home",
    page: "/",
  });
}

/**
 * Global error handler — catches unhandled errors from routes/middleware.
 */
export function globalErrorHandler(err, req, res, _next) {
  console.error(`[mbkbucket] ${err.stack}`);
  return res.status(500).render("Error/dError.handlebars", {
    layout: false,
    code: 500,
    error: "Internal app Error",
    message: "An unexpected error occurred on the app.",
    details: err.message,
    pagename: "Home",
    page: "/",
  });
}
