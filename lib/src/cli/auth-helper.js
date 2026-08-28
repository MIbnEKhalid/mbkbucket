/**
 * CLI Authentication Helper
 * Handles mbkauthe device-flow login for the mbkbucket CLI.
 * Stores credentials in ~/.mbkbucket/config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLogger } from '#logger';

const debugCli = createLogger('cli:auth');

export const CONFIG_DIR = path.join(os.homedir(), '.mbkbucket');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const MAX_POLL_TIME_MS = 15 * 60 * 1000; // 15 minutes
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function readConfig() {
  try {
    return fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) : {};
  } catch (err) {
    debugCli('Failed to read config: %s', err.message);
    return {};
  }
}

export function writeConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error(`❌ Failed to write config: ${err.message}`);
    throw err;
  }
}

export function clearConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
    return true;
  } catch (err) {
    debugCli('Failed to clear config: %s', err.message);
    return false;
  }
}

export function updateConfig(partial) {
  const updated = { ...readConfig(), ...partial };
  writeConfig(updated);
  return updated;
}

export function isLoggedIn() {
  const { token, serverUrl } = readConfig();
  return Boolean(token && serverUrl);
}

export function getStoredToken() {
  return readConfig().token || null;
}

export function getStoredServerUrl() {
  return readConfig().serverUrl || null;
}

export async function deviceFlowLogin({ serverUrl, profileKey }) {
  const baseUrl = String(serverUrl).replace(/\/+$/, '');
  console.log(`🔑 Requesting device login from ${baseUrl} ...`);

  let deviceResp;
  try {
    const res = await fetch(`${baseUrl}/api/cli/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: `mbkbucket-cli-${os.hostname()}`,
        ...(profileKey && { profileKey }),
      }),
    });
    deviceResp = await res.json();
    if (!deviceResp.success) throw new Error(deviceResp.message || 'Failed to initiate device login');
  } catch (err) {
    if (err.message.includes('Failed to initiate') || err.message.includes('fetch')) {
      throw new Error(`Could not reach mbkauthe server at ${baseUrl}/api/cli/device.\nVerify the server URL and that CLI_AUTH_ENABLED=true on the server.`);
    }
    throw err;
  }

  const { verificationUrl, userCode, deviceCode, expiresIn, interval, profile } = deviceResp;

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log('│                                                         │');
  console.log('│   🌐 Open this URL in your browser to approve:           │');
  console.log(`│   ${verificationUrl.padEnd(53)}│`);
  console.log('│                                                         │');
  console.log(`│   🔢 Or enter this code:  ${userCode.padEnd(30)}│`);
  console.log('│                                                         │');
  console.log('└─────────────────────────────────────────────────────────┘\n');

  if (profile) console.log(`   Profile: ${profile.name} (scope: ${profile.scope || 'full'})`);
  console.log(`   Waiting for approval (expires in ${Math.floor(expiresIn / 60)} minutes)...\n`);

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

      if (pollBody.status === 'denied') throw new Error('Login request was denied.');
      if (pollBody.status === 'expired') throw new Error('Login request expired. Please try again.');
      if (pollBody.status === 'completed') throw new Error('This login session has already been completed.');

      if (attempts % 5 === 0) process.stdout.write('.');
    } catch (err) {
      if (['denied', 'expired', 'completed'].some(k => err.message.includes(k))) throw err;
      debugCli('Poll error (will retry): %s', err.message);
    }
  }

  throw new Error('Login timed out. Please try again.');
}
