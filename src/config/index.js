import { createRequire } from "module";
import dotenv from "dotenv";
import { parseAndValidateMbkbucketVar, parseAndValidateBucketConnection } from "./validation.js";
import { createLogger } from "../utils/logger.js";

dotenv.config();
const debugConfig = createLogger('config');

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

function compareVersions(a, b) {
    const left = String(a || '').split(/[.-]/).map((part) => parseInt(part, 10) || 0);
    const right = String(b || '').split(/[.-]/).map((part) => parseInt(part, 10) || 0);
    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i += 1) {
        const diff = (left[i] || 0) - (right[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Fetch latest version from GitHub
async function getLatestVersion() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/MIbnEKhalid/mbkbucket/master/package.json');
    if (!response.ok) {
      debugConfig('GitHub API responded with status %s', response.status);
      return "0.0.0";
    }

    const latestPackageJson = await response.json();
    return latestPackageJson.version;
  } catch (error) {
    debugConfig('Error fetching latest version from GitHub: %s', error.message);
    return null;
  }
}

// Version check with error handling
async function checkVersion() {
    try {
        const latestVersion = await getLatestVersion();
        if (latestVersion && compareVersions(latestVersion, packageJson.version) > 0) {
            debugConfig('Current version (%s) is outdated. Latest version: %s.', packageJson.version, latestVersion);
        } else if (latestVersion && compareVersions(latestVersion, packageJson.version) < 0) {
            debugConfig('Current version (%s) is newer than published version: %s.', packageJson.version, latestVersion);
        } else if (latestVersion) {
            debugConfig('Running latest version (%s).', packageJson.version);
        }
    } catch (error) {
        debugConfig('Failed to check for updates: %s', error.message);
    }
}

// Comprehensive validation function
function validateConfiguration() {
    try {
        const parsed = parseAndValidateMbkbucketVar(process.env.mbkbucketVar);
        if (!process.env.mbkbucketVar) {
            debugConfig('mbkbucketVar not defined, using defaults');
        }
        debugConfig('Configuration loaded');
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
        parseAndValidateBucketConnection(process.env.BucketConnection);
        debugConfig('BucketConnection configuration validated successfully');
    } catch (error) {
        throw new Error(`[mbkbucket] BucketConnection validation failed:\n  - ${error.message}`);
    }
}

// Validate all configuration at startup
function validateAllConfiguration() {
    try {
        validateConfiguration();
        validateBucketConnection();
        debugConfig('All configurations validated successfully');
        return true;
    } catch (error) {
        console.error(error.message);
        return false;
    }
}

const mbkbucketVar = validateConfiguration();

export {
    packageJson,
    appVersion,
    mbkbucketVar,
    checkVersion,
    getLatestVersion,
    validateConfiguration,
    validateBucketConnection,
    validateAllConfiguration
};
