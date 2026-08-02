import dotenv from "dotenv";
import { createApp } from "./src/app.js";
import { checkVersion } from "./src/config/index.js";
import { runHealthCheck } from "./src/services/s3.service.js";
import { createLogger } from "./src/utils/logger.js";

dotenv.config();

const debugServer = createLogger('server');
const port = process.env.PORT || 3004;

// Check for package updates and S3 connectivity on startup
await checkVersion();
await runHealthCheck();

// Create and start the Express application
const server = createApp();

server.listen(port, () => {
  debugServer("Server running on http://localhost:%s", port);
});

// Re-export the public API for consumers of this package (named exports only)
export * from "./src/services/s3.service.js";
export * from "./src/config/index.js";
export { default as bucket } from "./src/routes/index.js";

// Default export: the Express application instance
export default server;