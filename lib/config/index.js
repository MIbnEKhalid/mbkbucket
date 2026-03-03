import { createRequire } from "module";
import dotenv from "dotenv";

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
    const errors = [];

    // Parse and validate mbkbucketVar
    let mbkbucketVar;
    try {
        if (!process.env.mbkbucketVar) {
            // If mbkbucketVar is not defined, use empty object (defaults will be applied later)
            mbkbucketVar = {};
            console.log(`[mbkbucket] mbkbucketVar not defined, using defaults`);
        } else {
            mbkbucketVar = JSON.parse(process.env.mbkbucketVar);
        }
    } catch (error) {
        errors.push("Invalid JSON in process.env.mbkbucketVar");
        throw new Error(`[mbkbucket] Configuration Error:\n  - ${errors.join('\n  - ')}`);
    }

    if (!mbkbucketVar || typeof mbkbucketVar !== 'object') {
        errors.push("mbkbucketVar must be a valid object");
        throw new Error(`[mbkbucket] Configuration Error:\n  - ${errors.join('\n  - ')}`);
    }

    // Apply defaults for optional keys (booleans now)
    const defaults = {
        p_view_inline: true,
        publiView_enabled: false
    };

    const usedDefaults = [];
    Object.entries(defaults).forEach(([key, defaultVal]) => {
        const current = mbkbucketVar[key];
        if (current === undefined || (typeof current === 'string' && current.trim() === '')) {
            mbkbucketVar[key] = defaultVal;
            usedDefaults.push(key);
        }
    });

    // Helper to normalize various truthy/falsy representations
    function normalizeBool(val) {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const norm = val.trim().toLowerCase();
            if (['true', 't', '1', 'yes', 'y', 'on'].includes(norm)) return true;
            if (['false', 'f', '0', 'no', 'n', 'off'].includes(norm)) return false;
            return val; // return original so later validation will flag it
        }
        return val;
    }

    // Normalize boolean-like values early so validation works on cleaned values;
    // results are actual booleans.
    ['p_view_inline', 'publiView_enabled'].forEach(k => {
        if (k in mbkbucketVar) {
            mbkbucketVar[k] = normalizeBool(mbkbucketVar[k]);
        }
    });

    // Validate that applied values are proper booleans (after defaults and normalization)
    // Note: p_view_inline and publiView_enabled are optional - defaults are applied above
    ['p_view_inline', 'publiView_enabled'].forEach(key => {
        if (mbkbucketVar[key] !== undefined && typeof mbkbucketVar[key] !== 'boolean') {
            errors.push(`mbkbucketVar.${key} must be a boolean if provided`);
        }
    });

    if (errors.length > 0) {
        throw new Error(`[mbkbucket] Configuration Validation Failed:\n  - ${errors.join('\n  - ')}`);
    }

    const summary = usedDefaults.length > 0 ? ` (defaults applied: ${usedDefaults.join(', ')})` : '';
    console.log(`[mbkbucket] Configuration loaded${summary}`);
    return mbkbucketVar;
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
        const bucketConfig = JSON.parse(process.env.BucketConnection);
        
        if (!bucketConfig || typeof bucketConfig !== 'object' || Object.keys(bucketConfig).length === 0) {
            throw new Error('BucketConnection must be a non-empty object');
        }

        // Validate each bucket configuration
        const bucketNames = Object.keys(bucketConfig);
        for (const bucketName of bucketNames) {
            const config = bucketConfig[bucketName];
            
            if (!config || typeof config !== 'object') {
                throw new Error(`Bucket '${bucketName}' configuration must be an object, not a string. Remove quotes around the inner JSON object.`);
            }
            
            const requiredFields = ['BUCKET_NAME', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'ENDPOINT'];
            const missingFields = requiredFields.filter(field => !config[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`Bucket '${bucketName}' is missing required fields: ${missingFields.join(', ')}`);
            }
        }

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