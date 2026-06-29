# mbkbucket

S3 Bucket manager for Node.js applications with Express integration.

[![Version](https://img.shields.io/npm/v/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![Downloads](https://img.shields.io/npm/dm/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![License](https://img.shields.io/badge/License-LGPL--3.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Publish Status](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml/badge.svg)](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml)


## Usage 📖

### Installation

Install the package via npm:

```bash
npm install mbkbucket
```

### Getting Started

#### Named imports from package root

```js
import { uploadFile, downloadFile, listfiles, getBucketConfig, packageJson, bucket } from 'mbkbucket';
```

#### Default aggregate import

This imports the configured Express server instance:

```js
import mbkbucket from 'mbkbucket';
// Access bucket router via: mbkbucket.bucket
```

#### Direct subpath imports (optional)

For more granular control, import directly from submodules:

```js
import { uploadFile } from 'mbkbucket/lib/s3';
import { packageJson } from 'mbkbucket/lib/config/index';
import bucketRouter from 'mbkbucket/lib/bucket';
```

### Additional Information

- All functions, objects, and variables exported from `lib/` are re-exported at the package root for convenience.
- TypeScript support with full type declarations (`index.d.ts`) for IDE intellisense and type safety.
- The default export is the configured Express `server` instance; access the `bucket` router as a named export.
- Supports Node.js 14.0.0 and higher with ES Modules.

---

## API Overview

- **uploadFile()** - Upload files to S3 bucket
- **downloadFile()** - Retrieve files from S3 bucket
- **listfiles()** - List contents of S3 bucket
- **getBucketConfig()** - Get current bucket configuration
- **bucket** - Express router with bucket management endpoints

For complete API documentation, refer to the TypeScript declarations in [index.d.ts](index.d.ts).

---

## Requirements

- Node.js >= 14.0.0
- AWS S3 credentials configured
- AWS SDK v3 compatible environment
- mbkauthe package for authentication and authorization

---

## Environment Configuration

The package validates both `mbkbucketVar` and `BucketConnection` at startup.

### 1 `mbkautheVar`

`mbkautheVar.bucket` is used as the default bucket.

Example:

```env
mbkautheVar={"APP_NAME":"mbkbucket","loginRedirectURL":"/dashboard","bucket":"R2_Bucket"}
```

Notes:

- If `APP_NAME` is `portal` or `mbkbucket`, mbkbucket works from bucket root (no `portal/` folder prefix).
- If `bucket` is missing, mbkbucket falls back to the first bucket key in `BucketConnection`.

### 2 `BucketConnection`

Use a JSON object where each key is a selectable connection name.

Example:

```env
BucketConnection={"R2_Bucket":{"BUCKET_NAME":"my-r2-bucket","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://<account-id>.r2.cloudflarestorage.com"},"S3_Bucket":{"BUCKET_NAME":"my-s3-bucket","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://s3.ap-southeast-1.amazonaws.com"}}
```

Required fields per bucket:

- `BUCKET_NAME`
- `ACCESS_KEY_ID`
- `SECRET_ACCESS_KEY`
- `ENDPOINT`

### Common Configuration Mistakes

1. Quoted inner object (invalid)

```env
BucketConnection={"R2_Bucket":"{\"BUCKET_NAME\":\"...\"}"}
```

2. Correct inner object (valid)

```env
BucketConnection={"R2_Bucket":{"BUCKET_NAME":"...","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://..."}}
```

### Runtime Selection

- Admin page bucket selection: `/mbkbucket?bucket=R2_Bucket`
- Public view route `/mbkbucket/p_view/:key(*)` always uses the default bucket from `mbkautheVar.bucket`.

---

## Automated Tests

Run tests:

```bash
npm test
```

Current tests cover:

- `mbkbucketVar` parsing/defaults/boolean normalization
- `BucketConnection` shape validation and required fields

---

## Contact & Support

For questions, issues, or contributions, please reach out:

- **Website**: [mbktech.org/Support](https://mbktech.org/Support/?Project=MIbnEKhalidWeb)
- **Email**: [support@mbktech.org](mailto:support@mbktech.org) or [chmuhammadbinkhalid28@gmail.com](mailto:chmuhammadbinkhalid28@gmail.com)
- **GitHub**: [MIbnEKhalid](https://github.com/MIbnEKhalid)

---

## About

Developed by [Muhammad Bin Khalid](https://github.com/MIbnEKhalid)  
Part of [MBK Tech Studio](https://mbktech.org/)

---

## License

Licensed under the LGPL-3.0-only License. See [LICENSE](LICENSE) file for details.
