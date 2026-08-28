import path from "path";
import { resolveBucketName, getAvailableBucketNames } from "../services/s3.service.js";
import { renderPage, mbkautheVar } from "mbkauthe";
import { commonHandlebarsHelpers } from "../utils/helpers.js";

/**
 * Render the main bucket dashboard page.
 */
export function renderBucketDashboard(req, res) {
  const allBuckets = getAvailableBucketNames();
  const configuredDefaultBucket = mbkautheVar?.bucket;
  const isPortal = mbkautheVar?.APP_NAME === "portal";
  const bucketfilePath = isPortal ? "bucketportal.handlebars" : "bucket.handlebars";
  const portalLayout = isPortal ? path.resolve(process.cwd(), "views", "layouts", "main") : false;

  let selectedBucket;

  try {
    selectedBucket = resolveBucketName(req.query.bucket);
  } catch (err) {
    const fallbackSelected = mbkautheVar?.bucket;
    const bucketOptions = allBuckets.map((name) => ({
      name,
      isSelected: name === fallbackSelected,
      isDefault: name === configuredDefaultBucket
    }));
    return renderPage(req, res, bucketfilePath, isPortal, {
      page: "Admin Bucket",
      helpers: commonHandlebarsHelpers,
      ...(isPortal ? { layout: portalLayout } : {}),
      bucketvar: mbkautheVar?.bucket,
      selectedBucket: fallbackSelected,
      bucketOptions,
      APP_NAME: mbkautheVar?.APP_NAME,
      message: req.query.message,
      error: req.query.error || err.message,
      availableBuckets: allBuckets
    });
  }

  const bucketOptions = allBuckets.map((name) => ({
    name,
    isSelected: name === selectedBucket,
    isDefault: name === configuredDefaultBucket
  }));

  renderPage(req, res, bucketfilePath, isPortal, {
    page: "Admin Bucket",
    helpers: commonHandlebarsHelpers,
    ...(isPortal ? { layout: portalLayout } : {}),
    bucketvar: selectedBucket,
    selectedBucket,
    bucketOptions,
    APP_NAME: mbkautheVar?.APP_NAME,
    message: req.query.message,
    error: req.query.error,
    availableBuckets: allBuckets
  });
}
