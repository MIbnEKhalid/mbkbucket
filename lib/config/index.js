import { createRequire } from "module";
import dotenv from "dotenv";
import { parseAndValidateMbkbucketVar, parseAndValidateBucketConnection } from "./validation.js";

dotenv.config();

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

// Comprehensive validation function
function validateConfiguration() {
    try {
        const parsed = parseAndValidateMbkbucketVar(process.env.mbkbucketVar);
        if (!process.env.mbkbucketVar) {
            console.log(`[mbkbucket] mbkbucketVar not defined, using defaults`);
        }
        console.log(`[mbkbucket] Configuration loaded`);
        return parsed;
    } catch (error) {
        throw new Error(`[mbkbucket] Configuration Validation Failed:\n  - ${error.message}`);
    }
}

// Validate BucketConnection configuration
function validateBucketConnection() {
    if (!process.env.BucketConnection) {
        console.warn(`[mbkbucket] ⚠️  BucketConnection not configured. You need to set this environment variable.`);
        console.warn(`[mbkbucket] Example format:`);
        console.warn(`[mbkbucket] BucketConnection={"r2":{"BUCKET_NAME":"my-bucket","ACCESS_KEY_ID":"key","SECRET_ACCESS_KEY":"secret","ENDPOINT":"https://..."}}`);
        return;
    }

    try {
        const bucketConfig = parseAndValidateBucketConnection(process.env.BucketConnection);
        const bucketNames = Object.keys(bucketConfig || {});

        console.log(`[mbkbucket] ✓ BucketConnection validated (${bucketNames.length} bucket(s): ${bucketNames.join(', ')})`);
        return bucketConfig;
    } catch (error) {
        console.error(`[mbkbucket] ❌ BucketConnection validation failed: ${error.message}`);
        console.error(`[mbkbucket] Current value (excerpt): ${process.env.BucketConnection.slice(0, 200)}...`);
        console.error(`[mbkbucket] Correct format example:`);
        console.error(`[mbkbucket] BucketConnection={"r2":{"BUCKET_NAME":"my-bucket","ACCESS_KEY_ID":"key","SECRET_ACCESS_KEY":"secret","ENDPOINT":"https://endpoint.com"}}`);
        console.error(`[mbkbucket] ⚠️  Note: Inner objects should NOT be quoted as strings!`);
        throw new Error(`[mbkbucket] Invalid BucketConnection configuration`);
    }
}

// Parse and validate mbkbucketVar once
const mbkbucketVar = validateConfiguration();
console.log(`[mbkbucket] mbkbucketVar configuration:`, mbkbucketVar);

// Validate BucketConnection
validateBucketConnection();

export { packageJson, appVersion, getLatestVersion, checkVersion };
export { mbkbucketVar };
export { parseAndValidateMbkbucketVar, parseAndValidateBucketConnection };