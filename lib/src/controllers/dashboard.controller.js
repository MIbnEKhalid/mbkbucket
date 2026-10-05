import fs from "fs";
import path from "path";
import { resolveStorageName, getAvailableStorageNames, getStorageProvider, getStorageConfig } from "../services/storage.service.js";
import { storageManager } from "../core/storage/storage-manager.js";
import { renderPage, mbkautheVar } from "mbkauthe";
import { commonHandlebarsHelpers } from "../utils/helpers.js";
import { mbkbucketVar } from "../config/index.js";

/**
 * Render the main storage/bucket dashboard page.
 */
export function renderBucketDashboard(req, res) {
  const allBuckets = getAvailableStorageNames();
  const configuredDefaultBucket = mbkautheVar?.bucket;
  const isPortal = mbkautheVar?.APP_NAME === "portal";
  const bucketfilePath = isPortal ? "bucketportal.hbs" : "bucket.hbs";

  const mainLayoutPath = path.resolve(process.cwd(), "views", "layouts", "main");
  const hasMainLayout = fs.existsSync(`${mainLayoutPath}.hbs`) || fs.existsSync(mainLayoutPath);
  const portalLayout = (isPortal && hasMainLayout) && mainLayoutPath;

  let selectedBucket;
  let error = req.query.error;
  let providerType = 's3';
  let providerCapabilities = {};

  try {
    selectedBucket = resolveStorageName(req.query.bucket);
    const provider = getStorageProvider(selectedBucket);
    providerType = provider.type;
    providerCapabilities = provider.capabilities;
  } catch (err) {
    selectedBucket = mbkautheVar?.bucket;
    error ||= err.message;
  }

  const bucketOptions = allBuckets.map(name => {
    let type = 's3';
    try {
      const cfg = getStorageConfig(name);
      type = storageManager.inferProviderType(cfg);
    } catch {}
    return {
      name,
      type,
      isSelected: name === selectedBucket,
      isDefault: name === configuredDefaultBucket
    };
  });

  const publicViewEnabled = Boolean(mbkbucketVar?.publiView_enabled);

  renderPage(req, res, bucketfilePath, Boolean(portalLayout), {
    page: "Admin Bucket",
    helpers: commonHandlebarsHelpers,
    layout: portalLayout || false,
    bucketvar: selectedBucket,
    selectedBucket,
    bucketOptions,
    providerType,
    providerCapabilities,
    APP_NAME: mbkautheVar?.APP_NAME,
    publicViewEnabled,
    publiViewEnabled: publicViewEnabled,
    message: req.query.message,
    error,
    availableBuckets: allBuckets
  });
}
