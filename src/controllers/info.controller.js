import { renderPage, mbkautheVar } from "mbkauthe";
import { packageJson, getLatestVersion } from "../config/index.js";

/**
 * Render the mbkbucket info page (Handlebars).
 */
export async function infoPage(req, res) {
  let latestVersion = 'unknown';
  try {
    latestVersion = await getLatestVersion();
  } catch (err) {
    console.error("[mbkauthe] Error fetching package-lock.json:", err);
  }
  renderPage(req, res, "mbkbucket_info.handlebars", false, {
    page: "MBK Bucket Info",
    CurrentVersion: packageJson.version,
    latestVersion,
    APP_NAME: mbkautheVar?.APP_NAME
  });
}

/**
 * Return bucket info as JSON.
 */
export async function infoJson(req, res) {
  let latestVersion = 'unknown';
  try {
    latestVersion = await getLatestVersion();
  } catch (err) {
    console.error("[mbkauthe] Error fetching package-lock.json:", err);
  }
  res.json({
    CurrentVersion: packageJson.version,
    latestVersion,
    APP_NAME: mbkautheVar?.APP_NAME
  });
}
