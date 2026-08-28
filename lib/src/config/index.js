import { createRequire } from "module";
import dotenv from "dotenv";
import { parseAndValidateMbkbucketVar, parseAndValidateBucketConnection } from "./validation.js";
import { createLogger } from "#logger";

dotenv.config();
const debugConfig = createLogger('config');
const require = createRequire(import.meta.url);

// Load mbkbucket package.json
let packageJson;
try {
  packageJson = require("mbkbucket/package.json");
} catch {
  packageJson = require("../../../package.json");
}

// Parent project version
let appVersion = "unknown";
try {
  appVersion = require("../../../../package.json")?.version ?? require(`${process.cwd()}/package.json`)?.version ?? "unknown";
} catch {
  try {
    appVersion = require(`${process.cwd()}/package.json`)?.version ?? "unknown";
  } catch {}
}

export function compareVersions(a = '', b = '') {
  const left = String(a).split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const right = String(b).split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function getLatestVersion() {
  try {
    const res = await fetch('https://raw.githubusercontent.com/MIbnEKhalid/mbkbucket/master/package.json');
    if (!res.ok) {
      debugConfig('GitHub API responded with status %s', res.status);
      return "0.0.0";
    }
    const data = await res.json();
    return data.version;
  } catch (err) {
    debugConfig('Error fetching latest version from GitHub: %s', err.message);
    return null;
  }
}

export async function checkVersion() {
  try {
    const latest = await getLatestVersion();
    if (!latest) return;
    const diff = compareVersions(latest, packageJson.version);
    if (diff > 0) {
      console.log(`[mbkbucket] ⚠️  Update available: v${latest} (current: v${packageJson.version})`);
    } else {
      debugConfig('Running latest version (%s).', packageJson.version);
    }
  } catch (err) {
    debugConfig('Failed to check for updates: %s', err.message);
  }
}

export function validateConfiguration() {
  try {
    return parseAndValidateMbkbucketVar(process.env.mbkbucketVar);
  } catch (err) {
    throw new Error(`[mbkbucket] Configuration Validation Failed:\n  - ${err.message}`);
  }
}

export function validateBucketConnection() {
  if (!process.env.BucketConnection) {
    console.warn(`[mbkbucket] ⚠️  BucketConnection not configured. You need to set this environment variable.`);
    console.warn(`[mbkbucket] Example format:\n[mbkbucket] BucketConnection={"r2":{"BUCKET_NAME":"my-bucket","ACCESS_KEY_ID":"key","SECRET_ACCESS_KEY":"secret","ENDPOINT":"https://..."}}`);
    return;
  }
  try {
    parseAndValidateBucketConnection(process.env.BucketConnection);
    debugConfig('BucketConnection validated');
  } catch (err) {
    throw new Error(`[mbkbucket] BucketConnection validation failed:\n  - ${err.message}`);
  }
}

export function validateAllConfiguration() {
  try {
    validateConfiguration();
    validateBucketConnection();
    return true;
  } catch (err) {
    console.error(err.message);
    return false;
  }
}

export const mbkbucketVar = validateConfiguration();

export {
  packageJson,
  appVersion
};
