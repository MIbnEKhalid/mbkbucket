import dotenv from "dotenv";
import { createApp } from "./lib/src/app.js";
import { checkVersion } from "./lib/src/config/index.js";
import { runHealthCheck } from "./lib/src/services/s3.service.js";
import { createLogger } from "#logger";

dotenv.config();

const debugServer = createLogger('server');
const port = process.env.PORT || 3004;
const server = createApp();

if (process.env.NODE_ENV === "dev") {
  await checkVersion();
  await runHealthCheck();
  server.listen(port, () => {
    debugServer("Server running on http://localhost:%s", port);
  });
}

export * from "./lib/src/services/s3.service.js";
export * from "./lib/src/config/index.js";
export { default as bucket } from "./lib/src/routes/index.js";
export default server;