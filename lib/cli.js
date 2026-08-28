#!/usr/bin/env node

/**
 * mbkbucket CLI — Manage S3/R2 buckets from the command line.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { formatBytes, formatDate, streamToBuffer, getMimeType, trimSlashes, nowIso } from './src/utils/helpers.js';
import { readConfig, clearConfig, updateConfig, writeConfig, isLoggedIn, deviceFlowLogin, CONFIG_FILE, CONFIG_DIR } from '#helpers';

dotenv.config();

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(['server', 'app', 'bucket', 'profile-key', 'expires']);

function findFlag(name) {
  const long = `--${name}`;
  const short = `-${name[0]}`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === long || args[i] === short) {
      return args[i + 1] !== undefined && !args[i + 1].startsWith('-') ? args[i + 1] : true;
    }
  }
  return undefined;
}

const hasFlag = name => args.includes(`--${name}`) || args.includes(`-${name[0]}`);

function getPositionalArgs() {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('-')) {
      const flagName = args[i].replace(/^-+/, '');
      if (VALUE_FLAGS.has(flagName) && i + 1 < args.length && !args[i + 1].startsWith('-')) {
        i++;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return positional;
}

const command = getPositionalArgs()[0] || 'help';
const cmdArgs = getPositionalArgs().slice(1);

// ---------------------------------------------------------------------------
// Help text & S3 helper
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(`
  mbkbucket — S3/R2 bucket CLI

  USAGE:
    mbkbucket <command> [options] [arguments]

  COMMANDS:
    login              Authenticate with mbkauthe device flow
    logout             Clear stored credentials
    whoami             Show current login status

    config             Show all config values
    config get <key>   Get a specific config value
    config set <k> <v> Set a config value
    config unset <key> Remove a config value
    config path        Show config file path
    config reset       Reset to demo values
    config edit        Open config file in editor

    list [prefix]      List files and folders
    upload <file> [key]   Upload a file or folder
    download <key> [dest] Download a file or folder
    delete <key>          Delete a file
    delete-folder <prefix>  Recursively delete a folder
    info <key>            Show file metadata
    signed-url <key>      Generate a pre-signed download URL

  GLOBAL OPTIONS:
    --app, -a <name>   Override APP_NAME for key prefixing
    --bucket, -b <name> Override default bucket name
    --help, -h         Show this help

  LOGIN OPTIONS:
    --server <url>     mbkauthe server URL (required for login)
    --profile-key <k>  API token profile key

  SIGNED-URL OPTIONS:
    --expires <sec>    Expiration in seconds (default: 3600)

  ENVIRONMENT:
    BucketConnection   JSON mapping of bucket name → S3 credentials
    APP_NAME           Application name for key prefix isolation
    PORT               Server port (default: 3004)
`);
}

let _s3Module = null;
async function getS3() {
  if (_s3Module) return _s3Module;
  const appFlag = findFlag('app');
  if (appFlag && typeof appFlag === 'string') process.env.APP_NAME = appFlag;
  _s3Module = await import('./src/services/s3.service.js');
  return _s3Module;
}

function walkDir(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
    const fullPath = path.join(dir, dirent.name);
    return dirent.isDirectory() ? walkDir(fullPath) : [fullPath];
  });
}

function promptLine() {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdin.resume();
    stdout.write('> ');
    stdin.once('data', (data) => {
      stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Command Implementations
// ---------------------------------------------------------------------------

async function cmdLogin() {
  const storedCfg = readConfig();
  let serverUrl = findFlag('server') || storedCfg.serverUrl;

  if (!serverUrl || typeof serverUrl !== 'string') {
    console.error('❌ --server <url> is required for login.\n   Example: mbkbucket login --server https://myapp.example.com\n\n💡 Tip: Set it once with:\n   mbkbucket config set serverUrl https://your-server.com\n   Then just run: mbkbucket login');
    process.exit(1);
  }

  const profileKey = findFlag('profile-key') || storedCfg.profileKey;
  updateConfig({ serverUrl });

  try {
    const result = await deviceFlowLogin({
      serverUrl,
      profileKey: typeof profileKey === 'string' ? profileKey : undefined,
    });

    updateConfig({
      token: result.token,
      tokenPrefix: result.tokenPrefix,
      username: result.username,
      serverUrl,
      profile: result.profile || null,
      loggedInAt: nowIso(),
    });

    console.log('\n✅ Credentials saved. You are now logged in.\n   Run "mbkbucket whoami" to verify.');
  } catch (err) {
    const msg = err.message || '';
    console.error(`❌ Login failed: ${msg}`);
    if (msg.includes('profileKey') || msg.includes('profileId')) {
      console.error('\n💡 An API token profile is required. Create one in mbkauthe admin panel and pass --profile-key.');
    } else if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      console.error(`\n💡 Could not reach server "${serverUrl}". Verify it is running and CLI_AUTH_ENABLED=true.`);
    }
    process.exit(1);
  }
}

function cmdLogout() {
  if (!isLoggedIn()) return console.log('ℹ️  Not logged in.');
  const { username = 'user' } = readConfig();
  clearConfig();
  console.log(`👋 Logged out. Goodbye, ${username}!`);
}

function cmdWhoami() {
  if (!isLoggedIn()) return console.log('ℹ️  Not logged in. Run "mbkbucket login --server <url>" to authenticate.');
  const cfg = readConfig();
  console.log(`✅ Logged in as: ${cfg.username}`);
  console.log(`   Server:      ${cfg.serverUrl}`);
  console.log(`   Token:       ${cfg.tokenPrefix}...`);
  if (cfg.profile) console.log(`   Profile:     ${cfg.profile.name} (scope: ${cfg.profile.scope || 'full'})`);
  console.log(`   Since:       ${formatDate(cfg.loggedInAt)}`);
}

async function cmdList() {
  const prefix = cmdArgs[0] || '';
  const bucketName = findFlag('bucket');

  try {
    const s3 = await getS3();
    const result = await s3.listfiles(prefix, { bucketName, delimiter: '/' });

    if (!result.Contents?.length) {
      return console.log(`📭 No files found${prefix ? ` with prefix "${prefix}"` : ''}.`);
    }

    console.log(`\n📁 Files${prefix ? ` matching "${prefix}"` : ''} (${result.KeyCount || result.Contents.length} items):\n` + '─'.repeat(80));

    if (result.CommonPrefixes?.length) {
      for (const cp of result.CommonPrefixes) {
        const folderName = cp.Prefix.replace(/\/$/, '').split('/').pop() || cp.Prefix;
        console.log(`  📂 ${folderName}/`);
      }
      if (result.Contents.length > 0) console.log('');
    }

    for (const obj of result.Contents) {
      const name = obj.Key || '';
      const displayName = name.length > 60 ? `...${name.slice(-57)}` : name;
      console.log(`  ${displayName.padEnd(62)} ${formatBytes(obj.Size).padStart(10)}  ${formatDate(obj.LastModified)}`);
    }

    console.log('─'.repeat(80));
    if (result.hasMore) console.log('  ... more files available (use --prefix to narrow down)');
    console.log('');
  } catch (err) {
    console.error(`❌ List failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdUpload() {
  const filePath = cmdArgs[0];
  if (!filePath) {
    console.error('❌ Usage: mbkbucket upload <file> [key]\n   Example: mbkbucket upload ./photo.jpg images/photo.jpg');
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  if (fs.statSync(resolved).isDirectory()) {
    await uploadFolder(resolved);
  } else {
    await uploadSingleFile(resolved);
  }
}

async function uploadSingleFile(filePath) {
  const bucketName = findFlag('bucket');
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const key = cmdArgs[1] || fileName;
  const contentType = getMimeType(fileName);

  console.log(`⬆️  Uploading: ${fileName} (${formatBytes(stat.size)}) → ${key}`);
  try {
    const s3 = await getS3();
    const result = await s3.uploadFile(key, fs.readFileSync(filePath), contentType, { bucketName });
    console.log(`✅ Uploaded: ${result.key} (${formatBytes(result.fileSize)})`);
  } catch (err) {
    console.error(`❌ Upload failed: ${err.message}`);
    process.exit(1);
  }
}

async function uploadFolder(folderPath) {
  const bucketName = findFlag('bucket');
  const prefix = cmdArgs[1] || path.basename(folderPath);
  const files = walkDir(folderPath);

  if (!files.length) return console.log('📭 No files found in folder.');

  console.log(`📁 Uploading folder: ${folderPath} (${files.length} files) → ${prefix}/\n`);
  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const rel = path.relative(folderPath, file).replace(/\\/g, '/');
    const key = `${prefix}/${rel}`;
    try {
      const s3 = await getS3();
      await s3.uploadFile(key, fs.readFileSync(file), getMimeType(file), { bucketName });
      console.log(`  ✅ ${rel}`);
      uploaded++;
    } catch (err) {
      console.error(`  ❌ ${rel}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

async function cmdDownload() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket download <key> [destination]');
    process.exit(1);
  }

  const dest = cmdArgs[1] || path.basename(key);
  const bucketName = findFlag('bucket');

  try {
    const s3 = await getS3();
    if (key.endsWith('/')) return downloadFolder(s3, key, dest, bucketName);

    console.log(`⬇️  Downloading: ${key} → ${dest}`);
    const result = await s3.downloadFile(key, { bucketName });
    if (result.notModified) return console.log('ℹ️  File not modified.');

    const body = await streamToBuffer(result.Body);
    const destDir = path.dirname(path.resolve(dest));
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.resolve(dest), body);

    console.log(`✅ Downloaded: ${dest} (${formatBytes(body.length)})`);
  } catch (err) {
    console.error(`❌ Download failed: ${err.message}`);
    process.exit(1);
  }
}

async function downloadFolder(s3, prefix, destDir, bucketName) {
  const allFiles = [];
  let token = null;
  const resolvedDest = path.resolve(destDir);

  do {
    const result = await s3.listfiles(prefix, { bucketName, continuationToken: token });
    (result.Contents || []).forEach(obj => {
      if (obj.Key && obj.Key !== prefix) allFiles.push(obj.Key);
    });
    token = result.IsTruncated ? result.NextContinuationToken : null;
  } while (token);

  if (!allFiles.length) return console.log(`📭 No files found with prefix "${prefix}".`);

  console.log(`📁 Downloading ${allFiles.length} files to ${resolvedDest}/\n`);
  let downloaded = 0;
  let failed = 0;

  for (const fileKey of allFiles) {
    const relativePath = fileKey.startsWith(prefix) ? fileKey.slice(prefix.length) : fileKey;
    const filePath = path.join(resolvedDest, relativePath);
    try {
      const result = await s3.downloadFile(fileKey, { bucketName });
      if (!result.notModified) {
        const body = await streamToBuffer(result.Body);
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
        fs.writeFileSync(filePath, body);
      }
      console.log(`  ✅ ${relativePath}`);
      downloaded++;
    } catch (err) {
      console.error(`  ❌ ${relativePath}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

async function cmdDelete() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket delete <key>');
    process.exit(1);
  }

  try {
    const s3 = await getS3();
    console.log(`🗑️  Deleting: ${key}`);
    const result = await s3.deleteFile(key, findFlag('bucket'));
    console.log(`✅ Deleted: ${result.key}`);
  } catch (err) {
    console.error(`❌ Delete failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdDeleteFolder() {
  const prefix = cmdArgs[0];
  if (!prefix) {
    console.error('❌ Usage: mbkbucket delete-folder <prefix>');
    process.exit(1);
  }

  const cleaned = trimSlashes(prefix);
  console.log(`⚠️  This will delete ALL files under "${cleaned}/".\n   Are you sure? Type "yes" to confirm:`);

  const confirmed = await promptLine();
  if (confirmed.trim().toLowerCase() !== 'yes') return console.log('Cancelled.');

  try {
    const s3 = await getS3();
    console.log(`🗑️  Deleting folder: ${cleaned}/`);
    const result = await s3.deleteFolder(cleaned, findFlag('bucket'));
    console.log(`✅ Deleted ${result.deletedCount} file(s) under "${cleaned}/".`);
  } catch (err) {
    console.error(`❌ Delete folder failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdInfo() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket info <key>');
    process.exit(1);
  }

  try {
    const s3 = await getS3();
    const meta = await s3.getFileMetadata(key, findFlag('bucket'));
    if (!meta.exists) {
      console.log(`❌ File not found: ${key}`);
      process.exit(1);
    }

    console.log(`\n📄 ${meta.key}\n` + '─'.repeat(60));
    console.log(`  Size:          ${formatBytes(meta.ContentLength)}`);
    console.log(`  Type:          ${meta.ContentType || 'unknown'}`);
    console.log(`  Last Modified: ${formatDate(meta.LastModified)}`);
    console.log(`  ETag:          ${meta.ETag || '—'}`);
    console.log(`  Cache-Control: ${meta.CacheControl || '—'}`);
    if (meta.Metadata && Object.keys(meta.Metadata).length > 0) {
      console.log('  Metadata:');
      for (const [k, v] of Object.entries(meta.Metadata)) console.log(`    ${k}: ${v}`);
    }
    console.log('');
  } catch (err) {
    console.error(`❌ Info failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdSignedUrl() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket signed-url <key> [--expires <seconds>]');
    process.exit(1);
  }

  const expires = parseInt(findFlag('expires'), 10) || 3600;
  try {
    const s3 = await getS3();
    console.log(`🔗 Generating signed URL (expires in ${expires}s)...`);
    const result = await s3.generateSignedUrl(key, 'getObject', expires, findFlag('bucket'));
    console.log(`\n${result.url || result}`);
  } catch (err) {
    console.error(`❌ Signed URL failed: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Config Commands
// ---------------------------------------------------------------------------
const DEMO_CONFIG = {
  token: 'mbk_demo_token_replace_with_real_one_from_login',
  tokenPrefix: 'mbk_demo',
  username: 'demo-user',
  serverUrl: 'https://your-app.example.com',
  profile: { name: 'Default CLI Profile', scope: 'read-write', allowedApps: ['mbkbucket'] },
  loggedInAt: nowIso(),
};

const VALID_CONFIG_KEYS = ['token', 'tokenPrefix', 'username', 'serverUrl', 'profile', 'profileKey', 'loggedInAt'];

async function cmdConfig() {
  const [sub, key, value] = cmdArgs;
  switch (sub) {
    case 'get': return cmdConfigGet(key);
    case 'set': return cmdConfigSet(key, value);
    case 'unset':
    case 'del':
    case 'delete': return cmdConfigUnset(key);
    case 'path': return cmdConfigPath();
    case 'reset': return cmdConfigReset();
    case 'edit': return cmdConfigEdit();
    default: return cmdConfigShow();
  }
}

function cmdConfigShow() {
  const cfg = readConfig();
  const entries = Object.keys(cfg).filter(k => !k.startsWith('_'));

  if (!entries.length) {
    console.log(`📭 No config values set.\n   File: ${CONFIG_FILE}\n   Run "mbkbucket config reset" to populate demo values.`);
    return;
  }

  console.log(`\n📋 Config (${CONFIG_FILE}):\n` + '─'.repeat(60));
  for (const k of entries.sort()) {
    const v = cfg[k];
    const display = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
    const masked = (k === 'token' && display.length > 12)
      ? `${display.slice(0, 8)}...${display.slice(-4)}`
      : display.length > 55 ? `${display.slice(0, 52)}...` : display;
    console.log(`  ${k.padEnd(14)} ${masked}`);
  }
  console.log('─'.repeat(60) + '\n  Run "mbkbucket config set <key> <value>" to change a value.\n  Run "mbkbucket config edit" to open in your editor.\n');
}

function cmdConfigGet(key) {
  if (!key || !VALID_CONFIG_KEYS.includes(key)) {
    console.error(`❌ Usage: mbkbucket config get <key>\n   Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`);
    process.exit(1);
  }
  const cfg = readConfig();
  if (!(key in cfg)) {
    console.error(`❌ Key not found: ${key}\n   Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`);
    process.exit(1);
  }
  const v = cfg[key];
  console.log(typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v));
}

function cmdConfigSet(key, value) {
  if (!key || value === undefined || !VALID_CONFIG_KEYS.includes(key)) {
    console.error(`❌ Usage: mbkbucket config set <key> <value>\n   Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`);
    process.exit(1);
  }

  let parsed = value;
  if (/^[{\[].*[}\]]$/.test(value)) {
    try { parsed = JSON.parse(value); } catch {}
  }

  updateConfig({ [key]: parsed });
  console.log(`✅ Set ${key} = ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`);
}

function cmdConfigUnset(key) {
  if (!key) {
    console.error(`❌ Usage: mbkbucket config unset <key>\n   Valid keys: ${VALID_CONFIG_KEYS.join(', ')}`);
    process.exit(1);
  }
  const cfg = readConfig();
  if (!(key in cfg)) {
    console.error(`❌ Key not found: ${key}`);
    process.exit(1);
  }
  delete cfg[key];
  writeConfig(cfg);
  console.log(`🗑️  Removed: ${key}`);
}

function cmdConfigPath() {
  console.log(`📁 Config directory: ${CONFIG_DIR}\n📄 Config file:      ${CONFIG_FILE}`);
  if (fs.existsSync(CONFIG_FILE)) {
    const stat = fs.statSync(CONFIG_FILE);
    console.log(`   Size:             ${formatBytes(stat.size)}\n   Modified:         ${formatDate(stat.mtime.toISOString())}`);
  }
}

async function cmdConfigReset() {
  console.log('⚠️  This will overwrite your current config with demo values.\n   Are you sure? Type "yes" to confirm:');
  const confirmed = await promptLine();
  if (confirmed.trim().toLowerCase() !== 'yes') return console.log('Cancelled.');
  writeConfig({ ...DEMO_CONFIG });
  console.log('✅ Config reset to demo values.\n   Run "mbkbucket config" to view.');
}

async function cmdConfigEdit() {
  const editor = process.env.EDITOR || process.env.VISUAL || 'notepad';
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) writeConfig({ ...DEMO_CONFIG });

  console.log(`✏️  Opening ${CONFIG_FILE} with ${editor}...`);
  const { spawn } = await import('node:child_process');
  const child = spawn(editor, [CONFIG_FILE], { stdio: 'inherit', shell: true });

  return new Promise((resolve) => {
    child.on('exit', (code) => {
      if (code === 0) console.log('✅ Editor closed.');
      else console.error(`⚠️  Editor exited with code ${code}.`);
      resolve();
    });
    child.on('error', (err) => {
      console.error(`❌ Could not open editor (${editor}): ${err.message}`);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Main Router
// ---------------------------------------------------------------------------
const COMMANDS = {
  login: cmdLogin,
  logout: cmdLogout,
  whoami: cmdWhoami,
  list: cmdList,
  ls: cmdList,
  upload: cmdUpload,
  up: cmdUpload,
  download: cmdDownload,
  dl: cmdDownload,
  delete: cmdDelete,
  rm: cmdDelete,
  'delete-folder': cmdDeleteFolder,
  rmdir: cmdDeleteFolder,
  info: cmdInfo,
  stat: cmdInfo,
  'signed-url': cmdSignedUrl,
  sign: cmdSignedUrl,
  config: cmdConfig,
  cfg: cmdConfig,
  help: showHelp,
  '--help': showHelp,
  '-h': showHelp,
};

async function main() {
  if (hasFlag('help')) return showHelp();

  const appFlag = findFlag('app');
  if (appFlag && typeof appFlag === 'string') process.env.APP_NAME = appFlag;

  const bucketFlag = findFlag('bucket');
  if (bucketFlag && typeof bucketFlag === 'string') process.env.MBKAUTHE_BUCKET = bucketFlag;

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`❌ Unknown command: ${command}\n   Run "mbkbucket --help" for usage information.`);
    process.exit(1);
  }

  await handler();
}

main().catch((err) => {
  console.error(`❌ Unexpected error: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
