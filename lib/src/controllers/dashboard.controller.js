import fs from "fs";
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

  const mainLayoutPath = path.resolve(process.cwd(), "views", "layouts", "main");
  const hasMainLayout = fs.existsSync(`${mainLayoutPath}.handlebars`) || fs.existsSync(mainLayoutPath);
  const portalLayout = (isPortal && hasMainLayout) ? mainLayoutPath : false;

  let selectedBucket;
  let error = req.query.error;

  try {
    selectedBucket = resolveBucketName(req.query.bucket);
  } catch (err) {
    selectedBucket = mbkautheVar?.bucket;
    error ||= err.message;
  }

  const bucketOptions = allBuckets.map(name => ({
    name,
    isSelected: name === selectedBucket,
    isDefault: name === configuredDefaultBucket
  }));

  renderPage(req, res, bucketfilePath, portalLayout ? true : false, {
    page: "Admin Bucket",
    helpers: commonHandlebarsHelpers,
    ...(portalLayout ? { layout: portalLayout } : { layout: false }),
    bucketvar: selectedBucket,
    selectedBucket,
    bucketOptions,
    APP_NAME: mbkautheVar?.APP_NAME,
    message: req.query.message,
    error,
    availableBuckets: allBuckets
  });
}
