import dotenv from "dotenv";
import { createApp } from "./lib/src/app.js";
import { checkVersion } from "./lib/src/config/index.js";
import { runHealthCheck } from "./lib/src/services/s3.service.js";
import { createLogger } from "./lib/src/utils/logger.js";

dotenv.config();

const debugServer = createLogger('server');
const port = process.env.PORT || 3004;
const isDevMode = process.env.NODE_ENV === "dev";

// Create and start the Express application
const server = createApp();

if (isDevMode) {

  // Check for package updates and S3 connectivity on startup
  await checkVersion();
  await runHealthCheck();

  server.listen(port, () => {
    debugServer("Server running on http://localhost:%s", port);
  });

}

// Re-export the public API for consumers of this package (named exports only)
export * from "./lib/src/services/s3.service.js";
export * from "./lib/src/config/index.js";
export { default as bucket } from "./lib/src/routes/index.js";

// Default export: the Express application instance
export default server;