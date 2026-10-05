# mbkbucket

> Flexible S3, Cloudflare R2, and Google Drive cloud storage management — library, Express router, dashboard, and standalone server CLI for mbktech.org applications.

[![Version](https://img.shields.io/npm/v/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![Downloads](https://img.shields.io/npm/dm/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](tests)

---

## Table of Contents

- [What's New in v4.0.0](#whats-new-in-v400-)
- [Installation](#installation-)
- [Quick Start](#quick-start-)
- [Supported Storage Providers](#supported-storage-providers-)
- [CLI Usage](#cli-usage-)
- [Library API](#library-api-)
  - [File Operations](#file-operations)
  - [Folder, Copy & Move Operations](#folder-copy--move-operations)
  - [Multipart Upload](#multipart-upload)
  - [Storage & Connection Management](#storage--connection-management)
  - [Storage Core & Custom Drivers](#storage-core--custom-drivers)
  - [Google Drive Authentication Helpers](#google-drive-authentication-helpers)
  - [Key Prefixing & App Isolation](#key-prefixing--app-isolation)
  - [Config & Diagnostics](#config--diagnostics)
  - [Express Integration](#express-integration)
- [Express Router & HTTP API](#express-router--http-api-)
  - [Endpoints](#endpoints)
  - [Host-Controlled Permissions](#host-controlled-permissions)
  - [Templates & Views](#templates--views)
- [Frontend Helper Client](#frontend-helper-client-)
- [Environment Configuration](#environment-configuration-)
  - [BucketConnection](#bucketconnection-required)
  - [mbkautheVar](#mbkauthevar-required)
  - [mbkbucketVar](#mbkbucketvar-optional)
- [Automated Tests](#automated-tests-)
- [Contact & Support](#contact--support)
- [License](#license)

---

## What's New in v4.0.0 🌟

- **Provider-Independent Storage Architecture**: Unified `StorageProvider` base class and dynamic `StorageManager` registry. Seamlessly switch between or combine multiple storage backends.
- **Native Google Drive Support**: First-class Google Drive provider supporting both OAuth 2.0 (user authorization code / refresh token flow) and Google Cloud Service Account credentials with folder-level targeting (`folder_id`).
- **File Move & Copy Operations**: Built-in `moveFile` and `copyFile` operations across both library functions, REST APIs, and UI modals.
- **Native Folder Creation**: Create directory markers and structure via `createFolder` with automatic folder marker resolution.
- **Redesigned Admin Dashboard**: Clean modern UI with connection health badges, provider tags, storage connection switcher dropdown, dedicated Move/Rename modal, and enhanced media previews (video range streaming, PDF, audio, and code view).
- **Frontend Drop-in Client Library (`mbkbucket-helper.js`)**: Bundled client helper with a modal gallery browser, input file picker, drag-and-drop chunked uploader, URL builders, and toast notifications. Demo page included at `/mbkbucket/helper-demo`.
- **Custom Storage Drivers**: Register custom storage engines via `storageManager.registerDriver('custom', factory)`.
- **Full Backward Compatibility**: All legacy S3 helper methods remain available and map cleanly to the underlying storage provider.

---

## Installation 📦

```bash
npm install mbkbucket
```

---

## Quick Start 🚀

### As a Library

```js
import { uploadFile, downloadFile, listfiles, copyFile, moveFile, createFolder, deleteFile, generateSignedUrl, storageManager } from 'mbkbucket';

// Upload a file to default storage (or specify connectionName / bucketName)
const upload = await uploadFile(
  'documents/invoice.pdf',
  fileBuffer,
  'application/pdf',
  { connectionName: 'R2_Bucket' }
);

// List files and directories
const { Contents, CommonPrefixes } = await listfiles('documents/', {
  delimiter: '/',
  maxKeys: 100
});

// Copy or move files
await copyFile('documents/invoice.pdf', 'backup/invoice.pdf');
await moveFile('documents/invoice.pdf', 'archive/invoice-2026.pdf');

// Create a folder marker
await createFolder('projects/2026');

// Download a file stream
const { Body, ContentType, ContentLength } = await downloadFile('archive/invoice-2026.pdf');

// Generate pre-signed URL (for S3-compatible providers)
const { url } = await generateSignedUrl('archive/invoice-2026.pdf', 'getObject', 3600);

// Check health across active connections
const health = await storageManager.checkHealth('Google_Drive');
console.log('Google Drive status:', health.status);
```

### As Express Middleware

```js
import express from 'express';
import { createBucketRouter } from 'mbkbucket';
import { sessRole, sessPerm } from 'mbkauthe';

const app = express();

// Mount the bucket dashboard and API under /mbkbucket
app.use(createBucketRouter({
  authorization: {
    view: sessRole('admin'),
    upload: sessPerm('storage.upload'),
    delete: sessRole('superadmin'),
  },
  publiViewEnabled: true,
}));

app.listen(3004, () => {
  console.log('Server running on http://localhost:3004');
});
```

### As a Standalone Application

```js
import mbkbucket from 'mbkbucket';

// mbkbucket is a pre-configured Express app with mbkauthe sessions, views, and routes
mbkbucket.listen(3004, () => {
  console.log('mbkbucket running on http://localhost:3004/mbkbucket');
});
```

---

## Supported Storage Providers 🗄️

mbkbucket v4.0.0 supports multiple object and file storage providers simultaneously:

| Provider | Type Identifier | Features / Capabilities |
|---|---|---|
| **AWS S3** | `s3` | Multipart upload, signed URLs, range streaming, server-side copy/move |
| **Cloudflare R2** | `s3` / `r2` | S3-compatible, zero egress fees, signed URLs, multipart upload |
| **Google Drive** | `gdrive` / `google-drive` | OAuth 2.0 & Service Account auth, native folder hierarchy, direct download URLs, range requests |
| **MinIO** | `s3` / `minio` | Self-hosted S3-compatible storage, multipart, signed URLs |
| **IDrive e2** | `s3` | S3-compatible high-performance object storage |
| **Backblaze B2** | `s3` | S3-compatible API endpoints |
| **DigitalOcean Spaces** | `s3` | S3-compatible object storage |
| **Custom Drivers** | Any custom name | Register via `storageManager.registerDriver(type, factory)` |

---

## CLI Usage 💻

mbkbucket includes a standalone CLI server runner with built-in configuration verification, port binding, and browser launching.

### Run Standalone Server

```bash
# Run with npx without installation
npx mbkbucket

# Or after installing globally or in your repository
mbkbucket
```

### CLI Options

| Option | Shorthand | Description |
|---|---|---|
| `--port <number>` | `-p` | Port to listen on (default: `3004` or `$PORT`) |
| `--host <host>` | `-H` | Host address to bind to (default: `0.0.0.0` or `$HOST`) |
| `--app <name>` | `-a` | Override `APP_NAME` for bucket key prefix isolation |
| `--bucket <name>` | `-b` | Override default bucket / storage connection name |
| `--env <path>` | `-e` | Load environment variables from a custom `.env` file |
| `--dev` | `-d` | Run in development mode (`NODE_ENV=dev`) |
| `--open` | `-o` | Automatically open dashboard in default browser |
| `--version` | `-v` | Show version number |
| `--help` | `-h` | Show help text |

### CLI Examples

```bash
# Start server on custom port and open browser
mbkbucket -p 8080 --open

# Start with a specific production .env file and application prefix
mbkbucket --env ./configs/.env.prod -a portalapp
```

---

## Library API 📚

Full TypeScript declarations are available in [index.d.ts](index.d.ts).

### File Operations

| Function | Description |
|---|---|
| `uploadFile(key, buffer, contentType, options?)` | Upload a file buffer/stream with options (`preventOverwrite`, `metadata`, `bucketName`/`connectionName`) |
| `downloadFile(key, options?)` | Download a file as a readable stream with metadata and headers |
| `deleteFile(key, connectionName?)` | Delete a single file |
| `deleteFiles(keys, connectionName?)` | Batch delete an array of files |
| `listfiles(prefix?, options?)` | List files and folders with pagination, search, or delimiter filtering |
| `getFileMetadata(key, connectionName?)` | Retrieve file metadata without downloading content |
| `fileExists(key, connectionName?)` | Check if a file exists |
| `getFileSize(key, connectionName?)` | Get file size in bytes (returns `number` or `null`) |
| `generateSignedUrl(key, operation?, expiresIn?, connectionName?)` | Generate a pre-signed URL (`getObject` or `putObject`) |

### Folder, Copy & Move Operations

| Function | Description |
|---|---|
| `createFolder(prefix, connectionName?, options?)` | Create a folder / directory marker |
| `copyFile(sourceKey, destKey, options?, connectionName?)` | Copy a file within storage |
| `moveFile(sourceKey, destKey, options?, connectionName?)` | Move or rename a file within storage |
| `deleteFolder(prefix, connectionName?)` | Recursively delete all files under a folder prefix |

### Multipart Upload

*(Supported on S3-compatible providers)*

| Function | Description |
|---|---|
| `createMultipartUpload(key, contentType?, metadata?, connectionName?)` | Initialize a multipart upload session |
| `uploadPart(key, uploadId, partNumber, buffer, connectionName?)` | Upload an individual chunk part |
| `completeMultipartUpload(key, uploadId, parts, connectionName?)` | Finalize and assemble multipart upload |
| `abortMultipartUpload(key, uploadId, connectionName?)` | Abort and cancel a multipart upload |
| `listIncompleteMultipartUploads(prefix?, connectionName?)` | List pending / incomplete multipart uploads |
| `cleanupIncompleteMultipartUploads(olderThanDays?, prefix?, connectionName?)` | Clean up abandoned multipart chunks |

### Storage & Connection Management

| Function / Export | Description |
|---|---|
| `getAvailableStorageNames()` / `getAvailableBucketNames()` | List all configured storage connection identifiers |
| `resolveStorageName(name?)` / `resolveBucketName(name?)` | Resolve and validate target connection name (falls back to default) |
| `getStorageProvider(name?)` | Get the initialized `StorageProvider` instance for a connection |
| `getStorageConfig(name?)` / `getBucketConfig(name?)` | Retrieve connection credentials and configuration object |
| `getBucketClient(bucketName?)` | Get the underlying AWS SDK S3Client instance (for S3 connections) |
| `checkHealth(name?)` | Execute health and connectivity check on a storage connection |
| `runHealthCheck(name?)` | Run diagnostic health check with console / debug output |

### Storage Core & Custom Drivers

mbkbucket exposes its core abstraction classes so you can extend or inspect providers programmatically:

```js
import { StorageProvider, StorageManager, storageManager } from 'mbkbucket';

// Register a custom storage driver
storageManager.registerDriver('local-disk', (name, config) => {
  return new MyCustomLocalStorageProvider(name, config);
});

// Register a runtime connection using the driver
storageManager.registerConnection('local_backup', {
  type: 'local-disk',
  basePath: '/var/storage'
});
```

Exported classes:
- `StorageProvider`: Abstract base class with required contracts (`uploadFile`, `downloadFile`, `listFiles`, `deleteFile`, `copyFile`, `moveFile`, `createFolder`, etc.) and `capabilities` flags.
- `S3StorageProvider`: S3, Cloudflare R2, MinIO implementation.
- `GoogleDriveStorageProvider`: Google Drive implementation.
- `StorageManager` / `storageManager`: Connection registry, driver repository, and health orchestrator.
- `StorageFile`, `StorageFolder`, `StorageListResult`: Standardized metadata models.
- Custom Errors: `StorageError`, `StorageNotFoundError`, `StorageAccessDeniedError`, `StorageConflictError`, `StorageValidationError`, `StorageConfigError`, `StorageQuotaExceededError`, `StorageUnsupportedOperationError`.

### Google Drive Authentication Helpers

mbkbucket exports helper functions for handling Google Drive OAuth 2.0 flows:

| Export | Description |
|---|---|
| `getGoogleAuthUrl(options)` | Generate Google OAuth 2.0 consent URL (`clientId`, `redirectUri`, `state`) |
| `exchangeCodeForTokens(options)` | Exchange authorization code for access and refresh tokens |
| `refreshGoogleAccessToken(options)` | Refresh an expired access token using a refresh token |
| `getServiceAccountAccessToken(options)` | Generate access token using Google Cloud Service Account credentials |
| `GOOGLE_DRIVE_SCOPES` | Standard OAuth scope strings for Google Drive (`drive.file`, `drive`, etc.) |

### Key Prefixing & App Isolation

| Function | Description |
|---|---|
| `getAppName()` | Retrieve the active application namespace from `mbkautheVar.APP_NAME` |
| `ensureKeyHasAppPrefix(key?)` | Prefix a file key with the app prefix to enforce tenant isolation |
| `ensurePrefix(prefix?)` | Prefix a folder path with the app prefix |
| `validateKeySafety(str, isKey?)` | Guard against path traversal attacks (`..`, null bytes, illegal characters) |

### Config & Diagnostics

| Export | Description |
|---|---|
| `packageJson` | mbkbucket package metadata (version, license, etc.) |
| `appVersion` | Detected version of the host application |
| `mbkbucketVar` | Parsed and validated `mbkbucketVar` configuration |
| `checkVersion()` | Check GitHub releases for newer versions of mbkbucket |
| `validateConfiguration()` | Validate `mbkbucketVar` settings |
| `validateBucketConnection()` | Validate `BucketConnection` syntax and provider schemas |
| `validateAllConfiguration()` | Run all configuration validations |

### Express Integration

| Export | Description |
|---|---|
| `bucket` (named) | Pre-configured Express router with superadmin protection |
| `createBucketRouter(options)` | Configurable router factory with custom permission middleware |
| `default` | Standalone Express server application ready for `.listen()` |

---

## Express Router & HTTP API 🖥️

### Endpoints

All routes are mounted relative to the router path (typically `/mbkbucket`):

| Endpoint | Method | Default Access | Description |
|---|---|---|---|
| `/mbkbucket` | `GET` | `view` auth | Admin file manager dashboard UI |
| `/mbkbucket/info` | `GET` | Public / Any | Health check, provider capabilities, and runtime config info |
| `/mbkbucket/view/*key` | `GET` | `view` auth | Inline viewer with byte-range streaming for video, audio, PDF, images, text |
| `/mbkbucket/player/*key` | `GET` | `view` auth | Dedicated media player page for video and audio playback |
| `/mbkbucket/p_view/*key` | `GET` | Public | Public file viewer (enabled when `publiView_enabled` is `"true"`) |
| `/mbkbucket/download/*key` | `GET` | `view` auth | Download file with `Content-Disposition: attachment` headers |
| `/mbkbucket/api/files` | `GET` | `view` auth | List files and folders with pagination, search, and continuation tokens |
| `/mbkbucket/api/file-info/*key`| `GET` | `view` auth | Get metadata (Content-Type, size, ETag, last modified) for a key |
| `/mbkbucket/api/health` | `GET` | `view` auth | Check connectivity for active storage connection |
| `/mbkbucket/api/incomplete-uploads` | `GET` | `view` auth | List incomplete multipart uploads |
| `/mbkbucket/api/cleanup-uploads` | `POST` | `delete` auth | Clean up incomplete multipart uploads older than specified days |
| `/mbkbucket/upload` | `POST` | `upload` auth | Upload a single file via `multipart/form-data` with conflict detection |
| `/mbkbucket/upload-init` | `POST` | `upload` auth | Initiate multipart upload session |
| `/mbkbucket/upload-chunk` | `POST` | `upload` auth | Upload individual multipart chunk (up to 50MB) |
| `/mbkbucket/upload-complete` | `POST` | `upload` auth | Assemble and complete multipart upload |
| `/mbkbucket/upload-abort` | `POST` | `delete` auth | Abort pending multipart upload session |
| `/mbkbucket/create-folder` | `POST` | `upload` auth | Create a new directory folder marker |
| `/mbkbucket/delete` | `POST` | `delete` auth | Delete a single file, batch array of keys, or folder |
| `/mbkbucket/move` | `POST` | `upload` auth | Move or rename a file (`sourceKey` to `destKey`) |
| `/mbkbucket/copy` | `POST` | `upload` auth | Copy or duplicate a file (`sourceKey` to `destKey`) |

### Host-Controlled Permissions

You can configure granular authorization per operation using `createBucketRouter`:

```js
import { createBucketRouter } from 'mbkbucket';
import { sessPerm } from 'mbkauthe';
import { Permissions } from './permissions.js';

app.use(createBucketRouter({
  authorization: {
    view: sessPerm(Permissions.storage.view),
    upload: sessPerm(Permissions.storage.upload),
    delete: sessPerm(Permissions.storage.delete),
  },
  publiViewEnabled: false,
}));
```

- When no custom authorization is passed, `sessRole('superadmin')` protects all private endpoints by default.
- Passing a single middleware function to `authorization` applies that guard across all three operations.

### Templates & Views

The Express router renders Handlebars (`.hbs`) views located in `views/`:

| Template / Partial | Description |
|---|---|
| `bucketportal.hbs` | Dashboard shell layout |
| `bucketadmincontent.hbs` | File manager interface with tree sidebar and storage switcher |
| `bucketadmin_alerts.hbs` | UI alerts and toast partial |
| `bucketadmin_delete_modal.hbs` | Item and folder deletion confirmation modal |
| `bucketadmin_move_modal.hbs` | File move and rename modal with destination selection |
| `bucketadmin_newfolder_modal.hbs` | New folder creation modal |
| `bucketadmin_preview_modal.hbs` | Full-screen media preview modal (images, video, audio, code, PDF) |
| `bucketadmin_upload_modal.hbs` | Chunked file upload modal with progress bars |
| `bucketadmin_filelist_skeleton.hbs`| Loading state placeholder skeleton |
| `bucket.hbs` | Public file viewer page |
| `mbkbucket_info.hbs` | Diagnostics, active connections, and environment info page |

---

## Frontend Helper Client 🎨

mbkbucket bundles a lightweight, zero-dependency client library served directly from your app:

- Script: `/mbkbucket/mbkbucket-helper.js`
- Styles: `/mbkbucket/mbkbucket-helper.css`
- Live interactive demo: `/mbkbucket/helper-demo`

### Including the Helper

```html
<link rel="stylesheet" href="/mbkbucket/mbkbucket-helper.css">
<script src="/mbkbucket/mbkbucket-helper.js"></script>
```

### Features

#### 1. Gallery Browser Modal
Open a rich modal browser to allow users to select one or multiple files directly from storage:

```js
MBKBucket.openGallery({
  title: 'Choose Profile Banner',
  filter: 'image', // 'image' | 'video' | 'audio' | 'pdf' | 'all'
  multiple: false,
  onSelect: (selectedFiles) => {
    console.log('Selected:', selectedFiles[0].url, selectedFiles[0].key);
  }
});
```

#### 2. File Picker Inputs
Bind an existing `<input>` element with auto-attached browse buttons and live thumbnail previews:

```html
<input type="text" data-mbk-picker data-filter="image" data-preview="#avatar-preview">
<img id="avatar-preview" src="/placeholder.png" alt="Preview">
```

Or programmatically:
```js
MBKBucket.createPicker(document.getElementById('my-input'), {
  filter: 'image',
  onSelect: (file) => console.log('Picked:', file)
});
```

#### 3. Upload Widget
Add a drag-and-drop uploader with automatic chunking for large files:

```html
<div data-mbk-uploader data-prefix="uploads/users" data-allowed="image/*,video/*"></div>
```

#### 4. Client URL Builders
```js
MBKBucket.url.view('photos/cover.jpg');       // -> /mbkbucket/view/photos/cover.jpg
MBKBucket.url.download('reports/data.xlsx');   // -> /mbkbucket/download/reports/data.xlsx
MBKBucket.url.publicView('public/logo.png');   // -> /mbkbucket/p_view/public/logo.png
MBKBucket.url.player('media/intro.mp4');       // -> /mbkbucket/player/media/intro.mp4
```

---

## Environment Configuration ⚙️

### `BucketConnection` (required)

A JSON string defining one or more storage connections. You can configure **S3/R2** connections and **Google Drive** connections together:

```env
BucketConnection={"R2_Bucket":{"BUCKET_NAME":"my-bucket","ACCESS_KEY_ID":"your-key","SECRET_ACCESS_KEY":"your-secret","ENDPOINT":"https://<account-id>.r2.cloudflarestorage.com"},"Google_Drive":{"type":"gdrive","client_id":"your-client-id.apps.googleusercontent.com","client_secret":"your-client-secret","refresh_token":"your-refresh-token","folder_id":"root"}}
```

#### S3 / Cloudflare R2 Connection Fields

| Field | Required | Description |
|---|---|---|
| `BUCKET_NAME` | Yes | Target bucket name |
| `ACCESS_KEY_ID` | Yes | S3 Access Key ID |
| `SECRET_ACCESS_KEY` | Yes | S3 Secret Access Key |
| `ENDPOINT` | Yes | S3 API endpoint URL (e.g. `https://<id>.r2.cloudflarestorage.com` or `https://s3.us-east-1.amazonaws.com`) |
| `region` | No | Region (defaults to `'auto'` for Cloudflare R2 / custom endpoints) |

#### Google Drive Connection Fields

| Field | Required | Description |
|---|---|---|
| `type` | Yes | Provider tag: `"gdrive"` or `"google-drive"` |
| `client_id` | OAuth | Google OAuth 2.0 Client ID |
| `client_secret` | OAuth | Google OAuth 2.0 Client Secret |
| `refresh_token` | OAuth | Long-lived Google OAuth 2.0 refresh token |
| `folder_id` | No | Target root folder ID in Google Drive (defaults to `"root"`) |
| `client_email` | Service Account | Service Account client email (alternative to OAuth) |
| `private_key` | Service Account | Service Account PEM private key (alternative to OAuth) |

#### Google Drive via Service Account Example

```env
BucketConnection={"Google_Drive_SA":{"type":"gdrive","client_email":"storage-sa@project.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----","folder_id":"1A2B3C4D5E6F"}}
```

### `mbkautheVar` (required)

Standard mbkauthe configuration. Key fields relevant to storage:

| Field | Required | Description |
|---|---|---|
| `APP_NAME` | Yes | Namespace used for automatic key prefix isolation |
| `bucket` | No | Default active connection name (falls back to first key in `BucketConnection`) |
| `loginRedirectURL` | No | URL to redirect upon authentication |

### `mbkbucketVar` (optional)

Optional behavioral toggles for viewers and streaming:

```env
mbkbucketVar={"publiView_enabled":"true","p_view_inline":"true"}
```

| Field | Default | Description |
|---|---|---|
| `publiView_enabled` | `false` | Enable or disable unauthenticated public file access under `/mbkbucket/p_view/*` |
| `p_view_inline` | `true` | Stream files inline in browser response (vs redirecting to external signed URLs) |

---

## Automated Tests 🧪

mbkbucket uses [Vitest](https://vitest.dev/) for unit and integration testing:

```bash
npm test
```

### Test Suites Covered

- **Storage Provider & Core Abstractions**: `StorageProvider` interface contracts, capability inspection, `PathStrategy` traversal security, `StorageError` hierarchy, Google Drive consent URL generation.
- **S3 & Google Drive Drivers**: Health checks, mock provider operations, connection switching, custom driver registration.
- **API Routes Logic**: File listing, single and chunked multipart uploads, conflict detection (409), folder creation, single/batch deletion, move and copy operations, health endpoint, metadata inspection.
- **View Controller & Streaming**: Inline viewer, video byte-range streaming (`206 Partial Content`), unsupported MIME rejection (`415`), public file viewing.
- **Configuration Validation**: S3 and Google Drive connection validation, malformed JSON recovery, boolean normalization, and error messaging.
- **Public API Exports**: Verification of all exported functions, classes, and proxy objects from package root.

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

Licensed under the MIT License. See [LICENSE](LICENSE) for details.

<!--
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
-->