#!/usr/bin/env node

/**
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
 */

/**
 * mbkbucket CLI — Standalone server runner for MBKBucket web application.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import os from 'node:os';
import { createApp } from './src/app.js';
import { packageJson, checkVersion } from './src/config/index.js';
import { checkHealth, getAvailableBucketNames } from './src/services/s3.service.js';

// ---------------------------------------------------------------------------
// ANSI Color helpers
// ---------------------------------------------------------------------------
const c = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function findFlag(name, shortChar) {
  const long = `--${name}`;
  const short = shortChar ? `-${shortChar}` : `-${name[0]}`;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === long || args[i] === short) {
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) {
        return args[i + 1];
      }
      return true;
    }
  }
  return undefined;
}

const hasFlag = (name, shortChar) => {
  const long = `--${name}`;
  const short = shortChar ? `-${shortChar}` : `-${name[0]}`;
  return args.includes(long) || args.includes(short);
};

// ---------------------------------------------------------------------------
// Help & Version
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(`
  ${c.cyan(c.bold('⚡ mbkbucket'))} ${c.dim(`v${packageJson.version}`)}
  Standalone S3/R2 Bucket Management Server

  ${c.bold('USAGE:')}
    mbkbucket [options]
    npx mbkbucket [options]

  ${c.bold('OPTIONS:')}
    -p, --port <number>    Port to listen on (default: 3004 or $PORT)
    -H, --host <host>      Host address to bind (default: 0.0.0.0 or $HOST)
    -a, --app <name>       Override APP_NAME for bucket key prefix isolation
    -b, --bucket <name>    Override default bucket name (MBKAUTHE_BUCKET)
    -e, --env <path>       Load environment variables from a custom .env file
    -d, --dev              Run in development mode (NODE_ENV=dev)
    -o, --open             Automatically open the dashboard in default browser
    -v, --version          Show version number
    -h, --help             Show this help message

  ${c.bold('ENVIRONMENT VARIABLES:')}
    PORT                   Server port (default: 3004)
    HOST                   Server host (default: 0.0.0.0)
    NODE_ENV               Environment mode ('production' | 'dev')
    BucketConnection       JSON mapping of bucket name -> S3 credentials
    mbkautheVar            mbkauthe configuration JSON
    mbkbucketVar           mbkbucket configuration JSON

  ${c.bold('EXAMPLES:')}
    $ mbkbucket
    $ mbkbucket -p 8080 --open
    $ mbkbucket --env ./configs/.env.prod -a myapp
`);
}

function showVersion() {
  console.log(`mbkbucket v${packageJson.version}`);
}

function getNetworkIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch {}
  return undefined;
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd = '';
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  import('node:child_process').then(({ exec }) => {
    exec(cmd, () => {});
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
async function main() {
  if (hasFlag('help', 'h')) {
    showHelp();
    process.exit(0);
  }

  if (hasFlag('version', 'v')) {
    showVersion();
    process.exit(0);
  }

  // Load custom or default .env
  const envPath = findFlag('env', 'e');
  if (typeof envPath === 'string') {
    dotenv.config({ path: path.resolve(process.cwd(), envPath) });
  } else {
    dotenv.config();
  }

  // Handle environment overrides from flags
  const appFlag = findFlag('app', 'a');
  if (typeof appFlag === 'string') {
    process.env.APP_NAME = appFlag;
  }

  const bucketFlag = findFlag('bucket', 'b');
  if (typeof bucketFlag === 'string') {
    process.env.MBKAUTHE_BUCKET = bucketFlag;
  }

  if (hasFlag('dev', 'd')) {
    process.env.NODE_ENV = 'dev';
  }

  const port = parseInt(findFlag('port', 'p') || process.env.PORT || '3004', 10);
  const host = findFlag('host', 'H') || process.env.HOST || '0.0.0.0';
  const shouldOpen = hasFlag('open', 'o');

  // Check version in background
  await checkVersion();

  // Test S3 connectivity
  let healthResult = null;
  try {
    healthResult = await checkHealth();
  } catch (err) {
    healthResult = { status: 'unhealthy', error: err.message };
  }

  // Create express application
  const app = createApp();

  const server = app.listen(port, host, () => {
    const isAnyHost = host === '0.0.0.0' || host === '::' || host === '';
    const displayHost = isAnyHost ? 'localhost' : host;
    const localUrl = `http://${displayHost}:${port}/mbkbucket`;

    console.log();
    console.log(`  ${c.cyan(c.bold('⚡ MBKBucket'))} ${c.dim(`v${packageJson.version}`)}`);
    console.log();
    console.log(`  ${c.green('➜')}  ${c.bold('Local:')}    ${c.cyan(localUrl)}`);

    if (isAnyHost) {
      const netIp = getNetworkIp();
      if (netIp) {
        console.log(`  ${c.green('➜')}  ${c.bold('Network:')}  ${c.cyan(`http://${netIp}:${port}/mbkbucket`)}`);
      }
    }

    const appName = process.env.APP_NAME || 'root';
    console.log(`  ${c.green('➜')}  ${c.bold('App Name:')} ${appName}`);

    let bucketNames = [];
    try {
      bucketNames = getAvailableBucketNames();
    } catch {}

    if (bucketNames.length > 0) {
      console.log(`  ${c.green('➜')}  ${c.bold('Buckets:')}  ${bucketNames.join(', ')}`);
    }

    if (healthResult?.status === 'healthy') {
      console.log(`  ${c.green('➜')}  ${c.bold('Storage:')}  ${c.green('✓ Connected')} (${healthResult.bucket} in ${healthResult.responseTime}ms)`);
    } else if (healthResult?.error) {
      console.log(`  ${c.yellow('➜')}  ${c.bold('Storage:')}  ${c.yellow('⚠ Connection warning')} (${healthResult.error})`);
    }

    console.log();
    console.log(`  ${c.dim('Press Ctrl+C to stop the server')}`);
    console.log();

    if (shouldOpen) {
      openBrowser(localUrl);
    }
  });

  const shutdown = (signal) => {
    console.log(`\n  ${c.dim(`Received ${signal}, shutting down...`)}`);
    server.close(() => {
      console.log(`  ${c.green('✓')} ${c.dim('MBKBucket server stopped.')}\n`);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(`\n${c.red(c.bold('Error starting mbkbucket:'))} ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
