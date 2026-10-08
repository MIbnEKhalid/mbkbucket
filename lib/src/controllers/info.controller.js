import { renderPage, mbkautheVar } from "mbkauthe";
import { packageJson, getLatestVersion, appVersion, mbkbucketVar } from "../config/index.js";
import { getAvailableBucketNames, getStorageProvider } from "../services/storage.service.js";
import { storageManager } from "../core/storage/storage-manager.js";

async function getInfoData(requestedBucket) {
  let latestVersion = 'unknown';
  try {
    latestVersion = (await getLatestVersion()) || 'unknown';
  } catch (err) {
    console.error("[mbkbucket] Error fetching latest version:", err);
  }

  const buckets = getAvailableBucketNames();
  let defaultBucket = requestedBucket;
  if (!defaultBucket || !buckets.includes(defaultBucket)) {
    defaultBucket = storageManager.getDefaultConnectionName() || (buckets[0] ?? '');
  }

  let providerType = 'S3';
  let capabilities = {};
  if (defaultBucket) {
    try {
      const provider = getStorageProvider(defaultBucket);
      providerType = (provider?.type || 's3').toUpperCase();
      capabilities = provider?.capabilities?.toJSON ? provider.capabilities.toJSON() : (provider?.capabilities || {});
    } catch {}
  }

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
    providerType,
    capabilities
  };
}

export async function infoPage(req, res) {
  renderPage(req, res, "mbkbucket_info.hbs", false, {
    pageTitle: "MBKBucket Information",
    ogUrl: "/mbkbucket/info",
    ...(await getInfoData(req.query?.bucket))
  });
}

export async function infoJson(req, res) {
  res.json(await getInfoData(req.query?.bucket));
}
