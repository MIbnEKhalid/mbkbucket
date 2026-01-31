# mbkbucket

[![Version](https://img.shields.io/npm/v/mbkbucket.svg)](https://www.npmjs.com/package/mbkbucket)
[![License](https://img.shields.io/badge/License-GPL--2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![Publish to npm and GitHub Packages](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml/badge.svg)](https://github.com/MIbnEKhalid/mbkbucket/actions/workflows/publish.yml)

## Usage ✅

Install:

```bash
npm install mbkbucket
```

### Quick examples

- Named imports from package root:

```js
import { uploadFile, downloadFile, listfiles, getBucketConfig, packageJson, bucket } from 'mbkbucket';
```

- Default aggregate import:

```js
import mbkbucket from 'mbkbucket';
// mbkbucket.uploadFile(...)
```

- Direct subpath imports (optional):

```js
import { uploadFile } from 'mbkbucket/lib/s3';
import { packageJson } from 'mbkbucket/lib/config/index';
import bucketRouter from 'mbkbucket/lib/bucket';
```

### Notes

- All functions, objects, and variables exported from `lib/` are re-exported at the package root for convenience.
- The package includes TypeScript declarations (`index.d.ts`) so IDEs and TypeScript projects get proper typings.
- The default export of the package is the configured Express `server` instance; the `bucket` router is available as `bucket` (named export).

---


## Contact

For questions or contributions, please contact Muhammad Bin Khalid at [mbktechstudio.com/Support](https://mbktechstudio.com/Support/?Project=MIbnEKhalidWeb), [support@mbktechstudio.com](mailto:support@mbktechstudio.com) or [chmuhammadbinkhalid28@gmail.com](mailto:chmuhammadbinkhalid28@gmail.com). 

Developed by [Muhammad Bin Khalid](https://github.com/MIbnEKhalid) at [MBK Tech Studio](https://mbktech.org/).
