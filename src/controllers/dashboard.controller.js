import { resolveBucketName, getAvailableBucketNames } from "../services/s3.service.js";
import { renderPage, mbkautheVar } from "mbkauthe";

/**
 * Render the main bucket dashboard page.
 */
export function renderBucketDashboard(req, res) {
  const allBuckets = getAvailableBucketNames();
  const configuredDefaultBucket = mbkautheVar?.bucket;

  let bucketfilePath;
  if (mbkautheVar?.APP_NAME === "portal") {
    bucketfilePath = "bucketportal.handlebars";
  } else {
    bucketfilePath = "bucket.handlebars";
  }

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
    return renderPage(req, res, bucketfilePath, mbkautheVar?.APP_NAME === "portal" ? true : false, {
      page: "Admin Bucket",
      layout: true,
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

  renderPage(req, res, bucketfilePath, mbkautheVar?.APP_NAME === "portal" ? true : false, {
    page: "Admin Bucket",
    bucketvar: selectedBucket,
    selectedBucket,
    bucketOptions,
    APP_NAME: mbkautheVar?.APP_NAME,
    message: req.query.message,
    error: req.query.error,
    availableBuckets: allBuckets
  });
}
