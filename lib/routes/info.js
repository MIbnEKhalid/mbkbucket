import express from "express";
import { renderPage, mbkautheVar } from "mbkauthe";
import { packageJson, getLatestVersion } from "../config/index.js";

const router = express.Router();

router.get(['/info', "/i"], async (req, res) => {
  let latestVersion = 'unknown';
  try {
    latestVersion = await getLatestVersion();
  } catch (err) {
    console.error("[mbkauthe] Error fetching package-lock.json:", err);
  }
  renderPage(req, res, "mbkbucket_info.handlebars", false, { page: "MBK Bucket Info", CurrentVersion: packageJson.version, latestVersion, APP_NAME: mbkautheVar?.APP_NAME });
});


router.get(['/info.json', "/i.json"], async (req, res) => {
  let latestVersion = 'unknown';
  try {
    latestVersion = await getLatestVersion();
  } catch (err) {
    console.error("[mbkauthe] Error fetching package-lock.json:", err);
  }
  res.json({CurrentVersion:packageJson.version, latestVersion, APP_NAME: mbkautheVar?.APP_NAME });
});

export default router;