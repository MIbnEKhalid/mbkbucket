#!/usr/bin/env node

/**
 * mbkbucket CLI — Manage S3/R2 buckets from the command line.
 *
 *   mbkbucket login --server <url>           Authenticate via device flow
 *   mbkbucket logout                         Clear stored credentials
 *   mbkbucket whoami                         Show login status
 *   mbkbucket list [prefix]                  List files and folders
 *   mbkbucket upload <file> [key]            Upload a file
 *   mbkbucket download <key> [dest]          Download a file
 *   mbkbucket delete <key>                   Delete a file
 *   mbkbucket delete-folder <prefix>         Recursively delete a folder
 *   mbkbucket info <key>                     Show file metadata
 *   mbkbucket signed-url <key>               Generate a pre-signed URL
 *
 * Before running, set these env vars (or use a .env file in cwd):
 *   BucketConnection={"bucketname":{...}}
 *   APP_NAME=your-app-name
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Load .env from cwd first so S3 service can pick up BucketConnection etc.
dotenv.config();

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

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

function hasFlag(name) {
  return args.includes(`--${name}`) || args.includes(`-${name[0]}`);
}

function getPositionalArgs() {
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') || args[i].startsWith('-')) {
      // Skip flag and its value
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        const long = args[i].replace(/^-+/, '');
        // Only skip value for flags that take one (not boolean flags like --help)
        if (['server', 'app', 'bucket', 'profile-key', 'expires'].includes(long)) {
          i++;
        }
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
// CLI Auth helpers (lazy-loaded because they don't import S3)
// ---------------------------------------------------------------------------
import {
  readConfig,
  clearConfig,
  updateConfig,
  writeConfig,
  isLoggedIn,
  deviceFlowLogin,
  CONFIG_FILE,
  CONFIG_DIR,
} from './src/cli/auth-helper.js';

// ---------------------------------------------------------------------------
// Help text
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

// ---------------------------------------------------------------------------
// S3 helper — conditionally imports S3 service after env is set up
// ---------------------------------------------------------------------------
let _s3Module = null;
async function getS3() {
  if (_s3Module) return _s3Module;
  // Set APP_NAME from CLI flag before importing
  const appFlag = findFlag('app');
  if (appFlag && typeof appFlag === 'string') {
    process.env.APP_NAME = appFlag;
  }
  _s3Module = await import('./src/services/s3.service.js');
  return _s3Module;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '—';
  }
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

async function cmdLogin() {
  // Use --server flag, or fall back to stored config
  let serverUrl = findFlag('server');
  const storedCfg = readConfig();

  if (!serverUrl || typeof serverUrl !== 'string') {
    if (storedCfg.serverUrl) {
      serverUrl = storedCfg.serverUrl;
      console.log(`ℹ️  Using stored server: ${serverUrl}`);
    } else {
      console.error('❌ --server <url> is required for login.');
      console.error('   Example: mbkbucket login --server https://myapp.example.com');
      console.error('');
      console.error('💡 Tip: Set it once with:');
      console.error('   mbkbucket config set serverUrl https://your-server.com');
      console.error('   Then just run: mbkbucket login');
      process.exit(1);
    }
  }

  // Use --profile-key flag, or fall back to stored config
  let profileKey = findFlag('profile-key');
  if (!profileKey && storedCfg.profileKey) {
    profileKey = storedCfg.profileKey;
  }

  // Always save the server URL so the user doesn't have to retype it
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
      loggedInAt: new Date().toISOString(),
    });

    console.log('');
    console.log('✅ Credentials saved. You are now logged in.');
    console.log(`   Run "mbkbucket whoami" to verify.`);
  } catch (err) {
    const msg = err.message || '';
    console.error(`❌ Login failed: ${msg}`);

    // Give actionable guidance based on the error
    if (msg.includes('profileKey') || msg.includes('profileId')) {
      console.error('');
      console.error('💡 An API token profile is required. You need to:');
      console.error('   1. Create an API token profile in the mbkauthe admin panel');
      console.error('   2. Run: mbkbucket login --profile-key <your-profile-key>');
      console.error('');
      console.error('   Or save it for future use:');
      console.error('   mbkbucket config set profileKey <your-profile-key>');
    } else if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      console.error('');
      console.error('💡 Could not reach the server. Check:');
      console.error('   1. Is the server running?');
      console.error(`   2. Is "${serverUrl}" the correct URL?`);
      console.error('   3. Is CLI_AUTH_ENABLED=true on the server?');
    }

    console.error('');
    console.error(`   Server URL saved. Run "mbkbucket login" to retry.`);
    process.exit(1);
  }
}

function cmdLogout() {
  if (!isLoggedIn()) {
    console.log('ℹ️  Not logged in.');
    return;
  }
  const cfg = readConfig();
  clearConfig();
  console.log(`👋 Logged out. Goodbye, ${cfg.username || 'user'}!`);
}

function cmdWhoami() {
  if (!isLoggedIn()) {
    console.log('ℹ️  Not logged in. Run "mbkbucket login --server <url>" to authenticate.');
    return;
  }
  const cfg = readConfig();
  console.log(`✅ Logged in as: ${cfg.username}`);
  console.log(`   Server:      ${cfg.serverUrl}`);
  console.log(`   Token:       ${cfg.tokenPrefix}...`);
  if (cfg.profile) {
    console.log(`   Profile:     ${cfg.profile.name} (scope: ${cfg.profile.scope || 'full'})`);
  }
  console.log(`   Since:       ${formatDate(cfg.loggedInAt)}`);
}

async function cmdList() {
  const prefix = cmdArgs[0] || '';
  const bucketName = findFlag('bucket');

  try {
    const s3 = await getS3();
    const result = await s3.listfiles(prefix, { bucketName, delimiter: '/' });

    if (!result.Contents || result.Contents.length === 0) {
      console.log(`📭 No files found${prefix ? ` with prefix "${prefix}"` : ''}.`);
      return;
    }

    console.log('');
    console.log(`📁 Files${prefix ? ` matching "${prefix}"` : ''} (${result.KeyCount || result.Contents.length} items):`);
    console.log('─'.repeat(80));

    // Show CommonPrefixes (folders) first
    if (result.CommonPrefixes && result.CommonPrefixes.length > 0) {
      for (const cp of result.CommonPrefixes) {
        const folderName = cp.Prefix.replace(/\/$/, '').split('/').pop() || cp.Prefix;
        console.log(`  📂 ${folderName}/`);
      }
      if (result.Contents.length > 0) console.log('');
    }

    for (const obj of result.Contents) {
      const name = obj.Key || '';
      const size = formatBytes(obj.Size);
      const modified = formatDate(obj.LastModified);
      const displayName = name.length > 60 ? '...' + name.slice(-57) : name;
      console.log(`  ${displayName.padEnd(62)} ${size.padStart(10)}  ${modified}`);
    }

    console.log('─'.repeat(80));
    if (result.hasMore) {
      console.log(`  ... more files available (use --prefix to narrow down)`);
    }
    console.log('');
  } catch (err) {
    console.error(`❌ List failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdUpload() {
  const filePath = cmdArgs[0];
  if (!filePath) {
    console.error('❌ Usage: mbkbucket upload <file> [key]');
    console.error('   Example: mbkbucket upload ./photo.jpg');
    console.error('   Example: mbkbucket upload ./photo.jpg images/photo.jpg');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  const isDir = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();

  if (isDir) {
    await uploadFolder(resolvedPath);
  } else {
    await uploadSingleFile(resolvedPath);
  }
}

async function uploadSingleFile(filePath) {
  const bucketName = findFlag('bucket');
  const customKey = cmdArgs[1] || null;

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const key = customKey || fileName;

  // Determine MIME type from extension
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const mimeMap = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'mp3': 'audio/mpeg',
    'wav': 'audio/wav', 'pdf': 'application/pdf', 'json': 'application/json',
    'js': 'application/javascript', 'css': 'text/css', 'html': 'text/html',
    'txt': 'text/plain', 'md': 'text/markdown', 'csv': 'text/csv',
    'zip': 'application/zip', 'gz': 'application/gzip',
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';

  console.log(`⬆️  Uploading: ${fileName} (${formatBytes(stat.size)}) → ${key}`);

  try {
    const s3 = await getS3();
    const buffer = fs.readFileSync(filePath);
    const result = await s3.uploadFile(key, buffer, contentType, { bucketName });
    console.log(`✅ Uploaded: ${result.key} (${formatBytes(result.fileSize)})`);
  } catch (err) {
    console.error(`❌ Upload failed: ${err.message}`);
    process.exit(1);
  }
}

async function uploadFolder(folderPath) {
  const bucketName = findFlag('bucket');
  const prefix = cmdArgs[1] || path.basename(folderPath);

  // Recursively collect all files
  const files = walkDir(folderPath);

  if (files.length === 0) {
    console.log('📭 No files found in folder.');
    return;
  }

  console.log(`📁 Uploading folder: ${folderPath} (${files.length} files) → ${prefix}/`);
  console.log('');

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const relativePath = path.relative(folderPath, file).replace(/\\/g, '/');
    const key = `${prefix}/${relativePath}`;
    const stat = fs.statSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mimeMap = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    try {
      const s3 = await getS3();
      const buffer = fs.readFileSync(file);
      await s3.uploadFile(key, buffer, contentType, { bucketName });
      console.log(`  ✅ ${relativePath}`);
      uploaded++;
    } catch (err) {
      console.error(`  ❌ ${relativePath}: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log(`Done: ${uploaded} uploaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

function walkDir(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
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

    // Check if it's a folder (key ends with / or has children)
    const isFolderLike = key.endsWith('/');
    if (isFolderLike) {
      await downloadFolder(s3, key, dest, bucketName);
      return;
    }

    // Single file download
    console.log(`⬇️  Downloading: ${key} → ${dest}`);
    const result = await s3.downloadFile(key, { bucketName });

    if (result.notModified) {
      console.log('ℹ️  File not modified.');
      return;
    }

    // Read the body stream
    const body = await streamToBuffer(result.Body);
    const destDir = path.dirname(path.resolve(dest));
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.writeFileSync(path.resolve(dest), body);

    console.log(`✅ Downloaded: ${dest} (${formatBytes(body.length)})`);
  } catch (err) {
    console.error(`❌ Download failed: ${err.message}`);
    process.exit(1);
  }
}

async function downloadFolder(s3, prefix, destDir, bucketName) {
  // List all files under the prefix
  const allFiles = [];
  let token = null;
  const resolvedDest = path.resolve(destDir);

  do {
    const result = await s3.listfiles(prefix, { bucketName, continuationToken: token });
    if (result.Contents) {
      for (const obj of result.Contents) {
        if (obj.Key && obj.Key !== prefix) {
          allFiles.push(obj.Key);
        }
      }
    }
    token = result.IsTruncated ? result.NextContinuationToken : null;
  } while (token);

  if (allFiles.length === 0) {
    console.log(`📭 No files found with prefix "${prefix}".`);
    return;
  }

  console.log(`📁 Downloading ${allFiles.length} files to ${resolvedDest}/`);
  console.log('');

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

  console.log('');
  console.log(`Done: ${downloaded} downloaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  if (stream?.transformToWeb) {
    // AWS SDK v3 sometimes returns Node.js Readable
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  // Web ReadableStream
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function cmdDelete() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket delete <key>');
    process.exit(1);
  }

  const bucketName = findFlag('bucket');

  try {
    const s3 = await getS3();
    console.log(`🗑️  Deleting: ${key}`);
    const result = await s3.deleteFile(key, bucketName);
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

  const bucketName = findFlag('bucket');
  const cleanedPrefix = String(prefix).replace(/^\/+/, '').replace(/\/+$/, '');

  console.log(`⚠️  This will delete ALL files under "${cleanedPrefix}/".`);
  console.log(`   Are you sure? Type "yes" to confirm:`);

  // Simple confirmation
  const confirmed = await promptLine();
  if (confirmed.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  try {
    const s3 = await getS3();
    console.log(`🗑️  Deleting folder: ${cleanedPrefix}/`);
    const result = await s3.deleteFolder(cleanedPrefix, bucketName);
    console.log(`✅ Deleted ${result.deletedCount} file(s) under "${cleanedPrefix}/".`);
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

  const bucketName = findFlag('bucket');

  try {
    const s3 = await getS3();
    const meta = await s3.getFileMetadata(key, bucketName);

    if (!meta.exists) {
      console.log(`❌ File not found: ${key}`);
      process.exit(1);
    }

    console.log('');
    console.log(`📄 ${meta.key}`);
    console.log('─'.repeat(60));
    console.log(`  Size:          ${formatBytes(meta.ContentLength)}`);
    console.log(`  Type:          ${meta.ContentType || 'unknown'}`);
    console.log(`  Last Modified: ${formatDate(meta.LastModified)}`);
    console.log(`  ETag:          ${meta.ETag || '—'}`);
    console.log(`  Cache-Control: ${meta.CacheControl || '—'}`);
    if (meta.Metadata && Object.keys(meta.Metadata).length > 0) {
      console.log('  Metadata:');
      for (const [k, v] of Object.entries(meta.Metadata)) {
        console.log(`    ${k}: ${v}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(`❌ Info failed: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Config command
// ---------------------------------------------------------------------------

const DEMO_CONFIG = {
  token: 'mbk_demo_token_replace_with_real_one_from_login',
  tokenPrefix: 'mbk_demo',
  username: 'demo-user',
  serverUrl: 'https://your-app.example.com',
  profile: {
    name: 'Default CLI Profile',
    scope: 'read-write',
    allowedApps: ['mbkbucket'],
  },
  loggedInAt: new Date().toISOString(),
};

const VALID_CONFIG_KEYS = ['token', 'tokenPrefix', 'username', 'serverUrl', 'profile', 'profileKey', 'loggedInAt'];

async function cmdConfig() {
  const sub = cmdArgs[0];
  const key = cmdArgs[1];
  const value = cmdArgs[2];

  switch (sub) {
    case 'get':
      return cmdConfigGet(key);
    case 'set':
      return cmdConfigSet(key, value);
    case 'unset':
    case 'del':
    case 'delete':
      return cmdConfigUnset(key);
    case 'path':
      return cmdConfigPath();
    case 'reset':
      return cmdConfigReset();
    case 'edit':
      await cmdConfigEdit();
      break;
    default:
      cmdConfigShow();
      break;
  }
}

function cmdConfigShow() {
  const cfg = readConfig();
  const entries = Object.keys(cfg).filter(k => !k.startsWith('_'));

  if (entries.length === 0) {
    console.log('📭 No config values set.');
    console.log(`   File: ${CONFIG_FILE}`);
    console.log('   Run "mbkbucket config reset" to populate demo values.');
    return;
  }

  console.log('');
  console.log(`📋 Config (${CONFIG_FILE}):`);
  console.log('─'.repeat(60));

  for (const k of entries.sort()) {
    const v = cfg[k];
    const display = typeof v === 'object' && v !== null
      ? JSON.stringify(v)
      : String(v);

    // Mask the token for security
    if (k === 'token' && display.length > 12) {
      console.log(`  ${k.padEnd(14)} ${display.slice(0, 8)}...${display.slice(-4)}`);
    } else {
      const truncated = display.length > 55 ? display.slice(0, 52) + '...' : display;
      console.log(`  ${k.padEnd(14)} ${truncated}`);
    }
  }

  console.log('─'.repeat(60));
  console.log('  Run "mbkbucket config set <key> <value>" to change a value.');
  console.log('  Run "mbkbucket config edit" to open in your editor.');
  console.log('');
}

function cmdConfigGet(key) {
  if (!key) {
    console.error('❌ Usage: mbkbucket config get <key>');
    console.error('   Valid keys: ' + VALID_CONFIG_KEYS.join(', '));
    process.exit(1);
  }

  const cfg = readConfig();
  if (!(key in cfg)) {
    console.error(`❌ Key not found: ${key}`);
    console.error('   Valid keys: ' + VALID_CONFIG_KEYS.join(', '));
    process.exit(1);
  }

  const v = cfg[key];
  if (typeof v === 'object' && v !== null) {
    console.log(JSON.stringify(v, null, 2));
  } else {
    console.log(String(v));
  }
}

function cmdConfigSet(key, value) {
  if (!key || value === undefined) {
    console.error('❌ Usage: mbkbucket config set <key> <value>');
    console.error('   Valid keys: ' + VALID_CONFIG_KEYS.join(', '));
    console.error('   Example: mbkbucket config set serverUrl https://myapp.example.com');
    process.exit(1);
  }

  if (!VALID_CONFIG_KEYS.includes(key)) {
    console.error(`❌ Invalid key: ${key}`);
    console.error('   Valid keys: ' + VALID_CONFIG_KEYS.join(', '));
    process.exit(1);
  }

  // Parse JSON if it looks like an object/array
  let parsed = value;
  if ((value.startsWith('{') || value.startsWith('[')) &&
      (value.endsWith('}') || value.endsWith(']'))) {
    try {
      parsed = JSON.parse(value);
    } catch {
      // Keep as string if parse fails
    }
  }

  updateConfig({ [key]: parsed });
  console.log(`✅ Set ${key} = ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`);
}

function cmdConfigUnset(key) {
  if (!key) {
    console.error('❌ Usage: mbkbucket config unset <key>');
    console.error('   Valid keys: ' + VALID_CONFIG_KEYS.join(', '));
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
  console.log(`📁 Config directory: ${CONFIG_DIR}`);
  console.log(`📄 Config file:      ${CONFIG_FILE}`);
  if (fs.existsSync(CONFIG_FILE)) {
    const stat = fs.statSync(CONFIG_FILE);
    console.log(`   Size:             ${formatBytes(stat.size)}`);
    console.log(`   Modified:         ${formatDate(stat.mtime.toISOString())}`);
  }
  if (!isLoggedIn()) {
    console.log('');
    console.log('💡 Tip: Run "mbkbucket login --server <url>" to authenticate.');
  }
}

async function cmdConfigReset() {
  console.log('⚠️  This will overwrite your current config with demo values.');
  console.log('   Are you sure? Type "yes" to confirm:');

  const confirmed = await promptLine();
  if (confirmed.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  writeConfig({ ...DEMO_CONFIG });
  console.log('✅ Config reset to demo values.');
  console.log('   Run "mbkbucket config" to view.');
}

async function cmdConfigEdit() {
  const editor = process.env.EDITOR || process.env.VISUAL || 'notepad';

  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    writeConfig({ ...DEMO_CONFIG });
  }

  console.log(`✏️  Opening ${CONFIG_FILE} with ${editor}...`);

  const { spawn } = await import('node:child_process');
  const child = spawn(editor, [CONFIG_FILE], {
    stdio: 'inherit',
    shell: true,
  });

  return new Promise((resolve) => {
    child.on('exit', (code) => {
      if (code === 0) {
        console.log('✅ Editor closed.');
      } else {
        console.error(`⚠️  Editor exited with code ${code}.`);
      }
      resolve();
    });

    child.on('error', (err) => {
      console.error(`❌ Could not open editor (${editor}): ${err.message}`);
      console.error('   Set the EDITOR environment variable to your preferred editor.');
      console.error(`   Config file location: ${CONFIG_FILE}`);
      resolve();
    });
  });
}

async function cmdSignedUrl() {
  const key = cmdArgs[0];
  if (!key) {
    console.error('❌ Usage: mbkbucket signed-url <key> [--expires <seconds>]');
    process.exit(1);
  }

  const bucketName = findFlag('bucket');
  const expires = parseInt(findFlag('expires'), 10) || 3600;

  try {
    const s3 = await getS3();
    console.log(`🔗 Generating signed URL (expires in ${expires}s)...`);
    const result = await s3.generateSignedUrl(key, 'getObject', expires, bucketName);
    console.log('');
    console.log(result.url || result);
  } catch (err) {
    console.error(`❌ Signed URL failed: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------
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
// Command router
// ---------------------------------------------------------------------------
async function main() {
  // Global flags
  if (hasFlag('help')) {
    showHelp();
    return;
  }

  // Set APP_NAME from flag before any S3 import
  const appFlag = findFlag('app');
  if (appFlag && typeof appFlag === 'string') {
    process.env.APP_NAME = appFlag;
  }

  const bucketFlag = findFlag('bucket');
  if (bucketFlag && typeof bucketFlag === 'string') {
    process.env.MBKAUTHE_BUCKET = bucketFlag;
  }

  switch (command) {
    case 'login':
      await cmdLogin();
      break;
    case 'logout':
      cmdLogout();
      break;
    case 'whoami':
      cmdWhoami();
      break;
    case 'list':
    case 'ls':
      await cmdList();
      break;
    case 'upload':
    case 'up':
      await cmdUpload();
      break;
    case 'download':
    case 'dl':
      await cmdDownload();
      break;
    case 'delete':
    case 'rm':
      await cmdDelete();
      break;
    case 'delete-folder':
    case 'rmdir':
      await cmdDeleteFolder();
      break;
    case 'info':
    case 'stat':
      await cmdInfo();
      break;
    case 'signed-url':
    case 'sign':
      await cmdSignedUrl();
      break;
    case 'config':
    case 'cfg':
      await cmdConfig();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.error('   Run "mbkbucket --help" for usage information.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`❌ Unexpected error: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
