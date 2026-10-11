import { createNotFoundHandler, createErrorHandler } from "mbkutils";

export const notFoundHandler = createNotFoundHandler({
  appName: "mbkbucket",
  defaultPage: "/",
  defaultPageName: "Home",
});

export const globalErrorHandler = createErrorHandler({
  appName: "mbkbucket",
  defaultPage: "/",
  defaultPageName: "Home",
});

export default { notFoundHandler, globalErrorHandler };
