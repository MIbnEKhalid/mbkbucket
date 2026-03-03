# mbkbucket

S3 Bucket manager for Node.js applications with Express integration.

[![Version](https://img.shields.io/npm/v/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![Downloads](https://img.shields.io/npm/dm/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![License](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)
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

Licensed under the GPL-2.0 License. See [LICENSE](LICENSE) file for details.
