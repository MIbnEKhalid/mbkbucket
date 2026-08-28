import { renderPage, mbkautheVar } from "mbkauthe";
import { packageJson, getLatestVersion } from "../config/index.js";

async function getInfoData() {
  let latestVersion = 'unknown';
  try {
    latestVersion = (await getLatestVersion()) || 'unknown';
  } catch (err) {
    console.error("[mbkbucket] Error fetching latest version:", err);
  }
  return {
    CurrentVersion: packageJson.version,
    latestVersion,
    APP_NAME: mbkautheVar?.APP_NAME
  };
}

/**
 * Render the mbkbucket info page (Handlebars).
 */
export async function infoPage(req, res) {
  const data = await getInfoData();
  renderPage(req, res, "mbkbucket_info.handlebars", false, {
    page: "MBK Bucket Info",
    ...data
  });
}

/**
 * Return bucket info as JSON.
 */
export async function infoJson(_req, res) {
  res.json(await getInfoData());
}
