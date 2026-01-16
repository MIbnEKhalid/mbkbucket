import { checkVersion } from "./lib/config/index.js";

if (process.env.test === "dev") {
    console.log("[mbkbucket] Dev mode is enabled. Starting server in dev mode.");
}

if (process.env.test !== "dev") {
    await checkVersion();
}