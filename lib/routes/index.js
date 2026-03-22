import express from "express";
import infoRoutes from "./info.js";
import viewRoutes from "./view.js";
import apiRoutes from "./api.js";
import { validateSessionAndRole, renderPage, mbkautheVar } from "mbkauthe";
import { resolveBucketName, getAvailableBucketNames } from "../s3.js";

const router = express.Router();

function renderBucketDashboard(req, res) {
  const allBuckets = getAvailableBucketNames();
  const configuredDefaultBucket = mbkautheVar?.bucket;

  let bucketfilePath;

  if(mbkautheVar?.APP_NAME === "portal") {
    bucketfilePath ="bucketportal.handlebars";
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

router.get('/mbkbucket', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  return renderBucketDashboard(req, res);
});

// Central bucket resolution for all /mbkbucket subroutes.
router.use('/mbkbucket', (req, _res, next) => {
  try {
    req.activeBucket = resolveBucketName(req.query.bucket);
    req.bucketResolveError = null;
  } catch (err) {
    req.activeBucket = null;
    req.bucketResolveError = err;
  }
  next();
});


router.use("/mbkbucket", infoRoutes);
router.use("/mbkbucket", viewRoutes);
router.use("/mbkbucket", apiRoutes);

export default router;