// Barrel file: re-export all public items from lib
export * from './s3.js';
export * from './config/index.js';
export { default as bucket } from './bucket.js';

import * as s3 from './s3.js';
import * as config from './config/index.js';
import bucket from './bucket.js';

// Default aggregate export for convenience
const defaultExport = {
  ...s3,
  ...config,
  bucket,
};

export default defaultExport;
