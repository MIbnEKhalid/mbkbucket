# mbkbucket

> Flexible S3/R2 bucket management — library, Express router, and CLI for mbktech.org applications.

[![Version](https://img.shields.io/npm/v/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![Downloads](https://img.shields.io/npm/dm/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![License](https://img.shields.io/badge/License-LGPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Publish Status](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml/badge.svg)](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml)

---

## Table of Contents

- [Installation](#installation-)
- [Quick Start](#quick-start-)
- [CLI Usage](#cli-usage-)
- [Library API](#library-api-)
- [Express Router](#express-router-)
- [Environment Configuration](#environment-configuration-)
- [Supported Storage Providers](#supported-storage-providers-)
- [Tests](#automated-tests-)
- [Support](#contact--support)

---

## Installation 📦

```bash
npm install mbkbucket
```

---

## Quick Start 🚀

### As a Library

```js
import {
  uploadFile,
  downloadFile,
  listfiles,
  deleteFile,
  deleteFolder,
  getFileMetadata,
  generateSignedUrl,
  bucket,          // Express router
  packageJson       // Package metadata
} from 'mbkbucket';

// Upload a file
const result = await uploadFile(
  'photos/sunset.jpg',
  fileBuffer,
  'image/jpeg',
  { bucketName: 'R2_Bucket' }
);

// List files
const { Contents, hasMore } = await listfiles('photos/', {
  delimiter: '/',
  maxKeys: 100
});

// Download a file
const { Body, ContentType } = await downloadFile('photos/sunset.jpg');

// Generate a pre-signed URL (valid for 1 hour)
const { url } = await generateSignedUrl('photos/sunset.jpg', 'getObject', 3600);
```

### As Express Middleware

```js
import mbkbucket from 'mbkbucket';

// mbkbucket is a fully configured Express app with auth, sessions, and bucket routes
mbkbucket.listen(3004, () => {
  console.log('mbkbucket server running on http://localhost:3004');
});
```

The Express app includes:
- **`/mbkbucket`** — Admin dashboard (SuperAdmin only)
- **`/mbkbucket/api/*`** — REST API for file operations
- **`/mbkbucket/p_view/:key(*)`** — Public file view
- **`/mbkbucket/info`** — Health & config info

---

## CLI Usage 💻

> **⚠️ Under active development.** The CLI is functional but some features may change.

mbkbucket ships with a command-line interface for managing buckets directly from the terminal.

### Setup

```bash
# Set your mbkauthe server URL (one-time)
mbkbucket config set serverUrl https://your-server.example.com

# Set your API token profile key (one-time, optional)
mbkbucket config set profileKey your-profile-key

# Authenticate via device flow
mbkbucket login
```

### Commands

| Command | Alias | Description |
|---|---|---|
| `mbkbucket login` | — | Authenticate via mbkauthe device flow |
| `mbkbucket logout` | — | Clear stored credentials |
| `mbkbucket whoami` | — | Show login status |
| | | |
| `mbkbucket list [prefix]` | `ls` | List files and folders |
| `mbkbucket upload <file> [key]` | `up` | Upload a file or folder |
| `mbkbucket download <key> [dest]` | `dl` | Download a file or folder |
| `mbkbucket delete <key>` | `rm` | Delete a file |
| `mbkbucket delete-folder <prefix>` | `rmdir` | Recursively delete a folder |
| `mbkbucket info <key>` | `stat` | Show file metadata (size, type, etc.) |
| `mbkbucket signed-url <key>` | `sign` | Generate a pre-signed download URL |
| | | |
| `mbkbucket config` | `cfg` | Show all config values |
| `mbkbucket config get <key>` | — | Get a specific config value |
| `mbkbucket config set <k> <v>` | — | Set a config value |
| `mbkbucket config unset <key>` | — | Remove a config value |
| `mbkbucket config path` | — | Show config file location |
| `mbkbucket config reset` | — | Reset to demo values |
| `mbkbucket config edit` | — | Open config file in editor |

### Global Options

| Flag | Description |
|---|---|
| `--app`, `-a <name>` | Override `APP_NAME` for key prefix isolation |
| `--bucket`, `-b <name>` | Override default bucket name |
| `--help`, `-h` | Show help |

### Login Options

| Flag | Description |
|---|---|
| `--server <url>` | mbkauthe server URL |
| `--profile-key <k>` | API token profile key |

### Config File

CLI configuration is stored at `~/.mbkbucket/config.json`. A demo config is created automatically on first use.

---

## Library API 📚

All functions are exported from the package root. Full TypeScript declarations in [index.d.ts](index.d.ts).

### File Operations

| Function | Description |
|---|---|
| `uploadFile(key, buffer, contentType, options?)` | Upload a file |
| `downloadFile(key, options?)` | Download a file |
| `deleteFile(key, bucketName?)` | Delete a single file |
| `deleteFiles(keys, bucketName?)` | Batch delete up to 1000 files |
| `deleteFolder(prefix, bucketName?)` | Recursively delete all files under a prefix |
| `listfiles(prefix?, options?)` | List files with pagination and filtering |
| `getFileMetadata(key, bucketName?)` | Get file metadata without downloading |
| `fileExists(key, bucketName?)` | Check if a file exists |
| `getFileSize(key, bucketName?)` | Get file size in bytes |
| `generateSignedUrl(key, operation?, expiresIn?, bucketName?)` | Generate a pre-signed URL |

### Multipart Upload

| Function | Description |
|---|---|
| `createMultipartUpload(key, contentType?, metadata?, bucketName?)` | Start a multipart upload |
| `uploadPart(key, uploadId, partNumber, buffer, bucketName?)` | Upload a single part |
| `completeMultipartUpload(key, uploadId, parts, bucketName?)` | Complete a multipart upload |
| `abortMultipartUpload(key, uploadId, bucketName?)` | Abort a multipart upload |
| `listIncompleteMultipartUploads(prefix?, bucketName?)` | List incomplete uploads |
| `cleanupIncompleteMultipartUploads(olderThanDays?, prefix?, bucketName?)` | Clean up stale uploads |

### Bucket Management

| Function | Description |
|---|---|
| `getAvailableBucketNames()` | List configured bucket names |
| `resolveBucketName(bucketName?)` | Resolve and validate a bucket name |
| `getBucketConfig(bucketName?)` | Get bucket credentials/config |
| `getBucketClient(bucketName?)` | Get an S3 client instance |
| `checkHealth()` | Check S3 connectivity |

### Key Prefixing

| Function | Description |
|---|---|
| `ensureKeyHasAppPrefix(key?)` | Prefix a key with the app name |
| `ensurePrefix(prefix?)` | Prefix a folder path with the app name |
| `getAppName()` | Get the current app name |

### Config

| Export | Description |
|---|---|
| `packageJson` | Package metadata (version, etc.) |
| `appVersion` | Parent project version |
| `mbkbucketVar` | Parsed mbkbucketVar config |
| `checkVersion()` | Check for newer package versions |

### Express

| Export | Description |
|---|---|
| `bucket` (named) | Express Router with all bucket routes |
| `default` | Fully configured Express application |

---

## Express Router 🖥️

### Routes

| Route | Auth | Description |
|---|---|---|
| `GET /mbkbucket` | SuperAdmin | Admin dashboard |
| `GET /mbkbucket/info` | Any | Health check & config info |
| `GET /mbkbucket/p_view/:key(*)` | Public | Public file viewer |
| `POST /mbkbucket/api/list` | SuperAdmin | List files (JSON) |
| `POST /mbkbucket/api/upload` | SuperAdmin | Upload file(s) |
| `POST /mbkbucket/api/delete` | SuperAdmin | Delete file(s) |
| `POST /mbkbucket/api/delete-folder` | SuperAdmin | Delete folder |
| `POST /mbkbucket/api/create-folder` | SuperAdmin | Create folder marker |
| `POST /mbkbucket/api/rename` | SuperAdmin | Rename/move a file |
| `GET /mbkbucket/api/download/:key(*)` | SuperAdmin | Download a file |
| `GET /mbkbucket/api/metadata/:key(*)` | SuperAdmin | Get file metadata |
| `POST /mbkbucket/api/multipart/init` | SuperAdmin | Init multipart upload |
| `POST /mbkbucket/api/multipart/part` | SuperAdmin | Upload multipart chunk |
| `POST /mbkbucket/api/multipart/complete` | SuperAdmin | Complete multipart |
| `POST /mbkbucket/api/multipart/abort` | SuperAdmin | Abort multipart |
| `GET /mbkbucket/api/multipart/list` | SuperAdmin | List incomplete uploads |
| `POST /mbkbucket/api/multipart/cleanup` | SuperAdmin | Clean up stale uploads |

### Views

| Template | Description |
|---|---|
| `bucketportal.handlebars` | Admin dashboard shell |
| `bucketadmincontent.handlebars` | File listing & management UI |
| `bucketadmin_alerts.handlebars` | Alert/notification partial |
| `bucketadmin_delete_modal.handlebars` | Delete confirmation modal |
| `bucketadmin_preview_modal.handlebars` | File preview modal |
| `bucketadmin_filelist_skeleton.handlebars` | Loading skeleton |
| `bucket.handlebars` | Public file viewer |
| `mbkbucket_info.handlebars` | Info/health page |

---

## Environment Configuration ⚙️

### `BucketConnection` (required)

JSON mapping of bucket names to S3-compatible credentials:

```env
BucketConnection={"R2_Bucket":{"BUCKET_NAME":"my-bucket","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://<id>.r2.cloudflarestorage.com"}}
```

| Field | Required | Description |
|---|---|---|
| `BUCKET_NAME` | Yes | Target bucket name |
| `ACCESS_KEY_ID` | Yes | Access key |
| `SECRET_ACCESS_KEY` | Yes | Secret key |
| `ENDPOINT` | Yes | S3-compatible endpoint URL |
| `region` | No | AWS region (default: `auto`) |

### `mbkautheVar` (required)

Standard mbkauthe configuration. Key fields for mbkbucket:

| Field | Description |
|---|---|
| `APP_NAME` | App name used for key prefix isolation |
| `bucket` | Default bucket name (falls back to first in `BucketConnection`) |
| `CLI_AUTH_ENABLED` | Enable CLI device-flow login (`"true"` / `"false"`) |

### `mbkbucketVar` (optional)

| Field | Default | Description |
|---|---|---|
| `publiView_enabled` | `"false"` | Enable public file viewer |
| `p_view_inline` | `"false"` | Show files inline vs download |

### Common Mistakes

```env
# ❌ Wrong — inner object quoted as string
BucketConnection={"R2_Bucket":"{\"BUCKET_NAME\":\"...\"}"}

# ✅ Correct — proper JSON nesting
BucketConnection={"R2_Bucket":{"BUCKET_NAME":"...","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://..."}}
```

---

## Supported Storage Providers 🗄️

Any S3-compatible object storage:

- **AWS S3**
- **Cloudflare R2**
- **IDrive e2**
- **MinIO**
- **Backblaze B2** (via S3-compatible API)
- **DigitalOcean Spaces**

---

## Automated Tests 🧪

```bash
npm test
```

Covers:
- `mbkbucketVar` parsing, defaults, and boolean normalization
- `BucketConnection` shape validation and required fields

---

## Contact & Support

- **Website**: [mbktech.org/Support](https://mbktech.org/Support/?Project=MIbnEKhalidWeb)
- **Email**: [support@mbktech.org](mailto:support@mbktech.org)
- **GitHub**: [MIbnEKhalid/mbkbucket](https://github.com/MIbnEKhalid/mbkbucket)

---

## About

Developed by [Muhammad Bin Khalid](https://github.com/MIbnEKhalid)  
Part of [MBK Tech](https://mbktech.org/)

---

## License

Licensed under the LGPL-3.0-only License. See [LICENSE](LICENSE) for details.
