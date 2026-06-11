import createDebug from "debug";
import dotenv from "dotenv";

dotenv.config();

if (process.env.DEBUG) {
  createDebug.enable(process.env.DEBUG);
}

export function createLogger(namespace) {
  return createDebug(`mbkbucket:${namespace}`);
}
