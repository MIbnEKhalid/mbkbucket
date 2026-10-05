import { renderPage, mbkautheVar } from "mbkauthe";
import { packageJson, getLatestVersion, appVersion, mbkbucketVar } from "../config/index.js";
import { getAvailableBucketNames, getStorageProvider } from "../services/storage.service.js";
import { storageManager } from "../core/storage/storage-manager.js";

async function getInfoData() {
  let latestVersion = 'unknown';
  try {
    latestVersion = (await getLatestVersion()) || 'unknown';
  } catch (err) {
    console.error("[mbkbucket] Error fetching latest version:", err);
  }

  const buckets = getAvailableBucketNames();
  const defaultBucket = storageManager.getDefaultConnectionName() || (buckets[0] ?? '');
  let providerType = 'S3';
  if (defaultBucket) {
    try {
      const provider = getStorageProvider(defaultBucket);
      providerType = (provider?.type || 's3').toUpperCase();
    } catch {}
  }

  // Safe subset only - strictly prevent leaking passwords, DB connection strings, OAuth secrets, or storage credentials
  const safeMbkautheVar = {
    APP_NAME: mbkautheVar?.APP_NAME || mbkautheVar?.app_name || "mbkbucket",
  };

  const safeMbkbucketVar = {
    publiView_enabled: Boolean(mbkbucketVar?.publiView_enabled),
    p_view_inline: Boolean(mbkbucketVar?.p_view_inline)
  };

  return {
    CurrentVersion: packageJson.version,
    version: packageJson.version,
    latestVersion,
    APP_NAME: safeMbkautheVar.APP_NAME,
    APP_VERSION: appVersion,
    mbkautheVar: safeMbkautheVar,
    mbkbucketVar: safeMbkbucketVar,
    defaultBucket,
    configuredBucketsCount: buckets.length,
    providerType
  };
}

/**
 * Render the mbkbucket info page (Handlebars).
 */
export async function infoPage(req, res) {
  renderPage(req, res, "mbkbucket_info.hbs", false, {
    pageTitle: "MBKBucket Information",
    ogUrl: "/mbkbucket/info",
    ...(await getInfoData())
  });
}

/**
 * Return bucket info as JSON.
 */
export async function infoJson(_req, res) {
  res.json(await getInfoData());
}
