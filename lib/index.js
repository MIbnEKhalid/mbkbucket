// Barrel file: re-export all public items from the restructured src/ directory
export * from '../src/services/s3.service.js';
export * from '../src/config/index.js';
export { default as bucket } from '../src/routes/index.js';

import * as s3 from '../src/services/s3.service.js';
import * as config from '../src/config/index.js';
import bucket from '../src/routes/index.js';

// Default aggregate export for convenience
const defaultExport = {
  ...s3,
  ...config,
  bucket,
};

export default defaultExport;
