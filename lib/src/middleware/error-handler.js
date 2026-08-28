import { createLogger } from "#logger";

const debugServer = createLogger('server');

const BASE_ERROR_DATA = { layout: false, pagename: "Home", page: "/" };

export function notFoundHandler(req, res) {
  debugServer("Path not found: %s %s", req.method, req.url);
  return res.status(404).render("Error/dError.handlebars", {
    ...BASE_ERROR_DATA,
    code: 404,
    error: "Not Found",
    message: "The requested page was not found.",
  });
}

export function globalErrorHandler(err, _req, res, _next) {
  console.error(`[mbkbucket] ${err.stack}`);
  return res.status(500).render("Error/dError.handlebars", {
    ...BASE_ERROR_DATA,
    code: 500,
    error: "Internal app Error",
    message: "An unexpected error occurred on the app.",
    details: err.message,
  });
}
