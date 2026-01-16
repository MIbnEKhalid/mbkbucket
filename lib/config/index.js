import { createRequire } from "module";

// Load package.json from mbkbucket package (not parent project)
const require = createRequire(import.meta.url);
let packageJson;
try {
    // Try to load from mbkbucket package directory
    packageJson = require("mbkbucket/package.json");
} catch {
    // Fallback to relative path (for development/testing)
    packageJson = require("../../package.json");
}

// Parent project version
let appVersion;
try {
    appVersion = require("../../../../package.json")?.version || "unknown";
} catch {
    // Fallback if path doesn't work
    try {
        appVersion = require(process.cwd() + "/package.json")?.version || "unknown";
    } catch {
        appVersion = "unknown";
    }
}

// Fetch latest version from GitHub
async function getLatestVersion() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/MIbnEKhalid/mbkbucket/master/package.json');
    if (!response.ok) {
      console.error(`[mbkbucket] GitHub API responded with status ${response.status}`);
      return "0.0.0";
    }

    const latestPackageJson = await response.json();
    return latestPackageJson.version;
  } catch (error) {
    console.error('[mbkbucket] Error fetching latest version from GitHub:', error);
    return null;
  }
}

// Version check with error handling
async function checkVersion() {
    try {
        const latestVersion = await getLatestVersion();
        if (latestVersion && latestVersion !== packageJson.version) {
            console.warn(`[mbkbucket] Current version (${packageJson.version}) is outdated. Latest version: ${latestVersion}. Consider updating mbkbucket.`);
        } else if (latestVersion) {
            console.info(`[mbkbucket] Running latest version (${packageJson.version}).`);
        }
    } catch (error) {
        console.warn(`[mbkbucket] Failed to check for updates: ${error.message}`);
    }
}
export { packageJson, appVersion, getLatestVersion, checkVersion };