/**
 * CLI Authentication Helper
 *
 * Handles mbkauthe device-flow login for the mbkbucket CLI.
 * Stores credentials in ~/.mbkbucket/config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLogger } from '../utils/logger.js';

const debugCli = createLogger('cli:auth');

export const CONFIG_DIR = path.join(os.homedir(), '.mbkbucket');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_TIME_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Read the stored CLI config.
 * @returns {{ token?: string, tokenPrefix?: string, username?: string, serverUrl?: string, profile?: object }}
 */
export function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    debugCli('Failed to read config: %s', err.message);
    return {};
  }
}

/**
 * Write config to disk.
 * @param {object} config
 */
export function writeConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error(`❌ Failed to write config: ${err.message}`);
    throw err;
  }
}

/**
 * Clear stored credentials (logout).
 */
export function clearConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    return true;
  } catch (err) {
    debugCli('Failed to clear config: %s', err.message);
    return false;
  }
}

/**
 * Merge partial config into stored config.
 * @param {object} partial
 */
export function updateConfig(partial) {
  const current = readConfig();
  const updated = { ...current, ...partial };
  writeConfig(updated);
  return updated;
}

/**
 * Check if the user is logged in (has a stored token).
 */
export function isLoggedIn() {
  const cfg = readConfig();
  return !!(cfg.token && cfg.serverUrl);
}

/**
 * Get the stored API token.
 */
export function getStoredToken() {
  return readConfig().token || null;
}

/**
 * Get the stored server URL.
 */
export function getStoredServerUrl() {
  return readConfig().serverUrl || null;
}

/**
 * Perform a device-flow login against an mbkauthe-powered server.
 *
 * @param {{ serverUrl: string, profileKey?: string }} options
 * @returns {Promise<{ token: string, tokenPrefix: string, username: string, profile: object }>}
 */
export async function deviceFlowLogin({ serverUrl, profileKey }) {
  const baseUrl = String(serverUrl).replace(/\/+$/, '');

  // --- Step 1: Request a device code ---
  console.log(`🔑 Requesting device login from ${baseUrl} ...`);

  let deviceResp;
  try {
    const res = await fetch(`${baseUrl}/api/cli/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: `mbkbucket-cli-${os.hostname()}`,
        ...(profileKey ? { profileKey } : {}),
      }),
    });

    deviceResp = await res.json();

    if (!deviceResp.success) {
      throw new Error(deviceResp.message || 'Failed to initiate device login');
    }
  } catch (err) {
    if (err.message.includes('Failed to initiate') || err.message.includes('fetch')) {
      throw new Error(
        `Could not reach mbkauthe server at ${baseUrl}/api/cli/device.\n` +
        `Verify the server URL and that CLI_AUTH_ENABLED=true on the server.`
      );
    }
    throw err;
  }

  const {
    verificationUrl,
    userCode,
    deviceCode,
    expiresIn,
    interval,
    profile,
  } = deviceResp;

  // --- Step 2: Prompt user to approve ---
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│                                                         │');
  console.log(`│   🌐 Open this URL in your browser to approve:           │`);
  console.log(`│   ${verificationUrl.padEnd(53)}│`);
  console.log(`│                                                         │`);
  console.log(`│   🔢 Or enter this code:  ${userCode.padEnd(30)}│`);
  console.log('│                                                         │');
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');

  if (profile) {
    console.log(`   Profile: ${profile.name} (scope: ${profile.scope || 'full'})`);
  }
  console.log(`   Waiting for approval (expires in ${Math.floor(expiresIn / 60)} minutes)...`);
  console.log('');

  // --- Step 3: Poll for token ---
  const pollInterval = (interval || 5) * 1000;
  const deadline = Date.now() + MAX_POLL_TIME_MS;
  let attempts = 0;

  while (Date.now() < deadline) {
    await sleep(pollInterval);
    attempts++;

    try {
      const pollRes = await fetch(`${baseUrl}/api/cli/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode }),
      });

      const pollBody = await pollRes.json();

      if (pollBody.status === 'approved' && pollBody.success) {
        console.log(`✅ Login approved! Welcome, ${pollBody.username}.`);
        console.log(`   Token prefix: ${pollBody.tokenPrefix}...`);
        return {
          token: pollBody.token,
          tokenPrefix: pollBody.tokenPrefix,
          username: pollBody.username,
          profile: profile || null,
        };
      }

      if (pollBody.status === 'denied') {
        throw new Error('Login request was denied.');
      }

      if (pollBody.status === 'expired') {
        throw new Error('Login request expired. Please try again.');
      }

      if (pollBody.status === 'completed') {
        throw new Error('This login session has already been completed.');
      }

      // Still pending — show a dot every 5 polls
      if (attempts % 5 === 0) {
        process.stdout.write('.');
      }
    } catch (err) {
      if (err.message.includes('denied') || err.message.includes('expired') || err.message.includes('completed')) {
        throw err;
      }
      // Network errors during poll — retry
      debugCli('Poll error (will retry): %s', err.message);
    }
  }

  throw new Error('Login timed out. Please try again.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
