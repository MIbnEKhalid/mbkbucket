import createDebug from "debug";
import dotenv from "dotenv";

dotenv.config();

if (process.env.DEBUG) {
  createDebug.enable(process.env.DEBUG);
}

/**
 * Creates a namespaced debug logger (e.g., `mbkbucket:s3`, `mbkbucket:api`).
 * @param {string} namespace
 * @returns {import("debug").Debugger}
 */
export function createLogger(namespace) {
  return createDebug(`mbkbucket:${namespace}`);
}
