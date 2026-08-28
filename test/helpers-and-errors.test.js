import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  escapeHtml,
  getBaseName,
  getFileExt,
  getMimeType,
  trimSlashes,
  trimLeadingSlashes,
  getFolderPath,
  normalizeKeyParam,
  buildKey,
  formatBytes,
  formatDate,
  streamToBuffer,
  destroyStream,
  nowIso,
  isSensitiveTextType,
  buildCacheControl,
  parseRangeHeader,
  commonHandlebarsHelpers
} from '../lib/src/utils/helpers.js';
import {
  classifyApiError,
  classifyViewError,
  sendApiError,
  sendViewError
} from '../lib/src/utils/errors.js';
import { compareVersions } from '../lib/src/config/index.js';

test('escapeHtml escapes dangerous HTML characters', () => {
  assert.equal(escapeHtml('<script>alert("xss") & \'foo\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;) &amp; &#39;foo&#39;&lt;/script&gt;');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('getBaseName extracts filename correctly', () => {
  assert.equal(getBaseName('folder/sub/file.txt'), 'file.txt');
  assert.equal(getBaseName('file.txt'), 'file.txt');
  assert.equal(getBaseName('folder/sub/'), '');
  assert.equal(getBaseName(''), '');
  assert.equal(getBaseName(null), '');
});

test('getFileExt extracts file extension correctly', () => {
  assert.equal(getFileExt('image.PNG'), 'png');
  assert.equal(getFileExt('folder/file.tar.gz'), 'gz');
  assert.equal(getFileExt('noext'), '');
  assert.equal(getFileExt(''), '');
});

test('getMimeType returns correct MIME type and fallback', () => {
  assert.equal(getMimeType('photo.jpg'), 'image/jpeg');
  assert.equal(getMimeType('movie.mp4'), 'video/mp4');
  assert.equal(getMimeType('data.json'), 'application/json; charset=utf-8');
  assert.equal(getMimeType('doc.unknown'), 'application/octet-stream');
});

test('trimSlashes and trimLeadingSlashes', () => {
  assert.equal(trimSlashes('//folder/sub//'), 'folder/sub');
  assert.equal(trimSlashes('/file.txt'), 'file.txt');
  assert.equal(trimLeadingSlashes('///folder/file.txt'), 'folder/file.txt');
});

test('getFolderPath extracts parent folder with trailing slash', () => {
  assert.equal(getFolderPath('folder/sub/file.txt'), 'folder/sub/');
  assert.equal(getFolderPath('file.txt'), '');
});

test('normalizeKeyParam and buildKey', () => {
  assert.equal(normalizeKeyParam(['folder', 'sub', 'file.txt']), 'folder/sub/file.txt');
  assert.equal(normalizeKeyParam('folder/file.txt'), 'folder/file.txt');
  assert.equal(buildKey('folder/sub', 'file.txt'), 'folder/sub/file.txt');
  assert.equal(buildKey('', 'file.txt'), 'file.txt');
});

test('formatBytes and formatDate', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.ok(typeof formatDate('2026-08-28T12:00:00.000Z') === 'string');
  assert.ok(typeof nowIso() === 'string');
});

test('streamToBuffer and destroyStream', async () => {
  const stream = Readable.from(['hello', ' ', 'world']);
  const buf = await streamToBuffer(stream);
  assert.equal(buf.toString(), 'hello world');

  const destroyable = Readable.from(['test']);
  destroyStream(destroyable);
  assert.equal(destroyable.destroyed, true);
});

test('isSensitiveTextType detects text and script types', () => {
  assert.equal(isSensitiveTextType('text/plain'), true);
  assert.equal(isSensitiveTextType('text/html'), true);
  assert.equal(isSensitiveTextType('application/json; charset=utf-8'), true);
  assert.equal(isSensitiveTextType('application/xml'), true);
  assert.equal(isSensitiveTextType('application/javascript'), true);
  assert.equal(isSensitiveTextType('image/png'), false);
  assert.equal(isSensitiveTextType('video/mp4'), false);
  assert.equal(isSensitiveTextType(''), false);
});

test('buildCacheControl generates correct headers', () => {
  assert.equal(buildCacheControl('image/png', { publicCache: true, isStaticAsset: true }), 'public, max-age=3600, immutable');
  assert.equal(buildCacheControl('video/mp4', { publicCache: true, supportsRanges: true }), 'public, max-age=86400, must-revalidate');
  assert.equal(buildCacheControl('image/png', { publicCache: true }), 'public, max-age=300, must-revalidate');
  assert.equal(buildCacheControl('text/plain'), 'private, no-store');
  assert.equal(buildCacheControl('video/mp4', { supportsRanges: true }), 'private, max-age=1800, must-revalidate');
  assert.equal(buildCacheControl('application/octet-stream'), 'private, max-age=300, must-revalidate');
});

test('parseRangeHeader parses valid ranges correctly', () => {
  assert.deepEqual(parseRangeHeader('bytes=0-499', 1000), { start: 0, end: 499, total: 1000, size: 500 });
  assert.deepEqual(parseRangeHeader('bytes=500-', 1000), { start: 500, end: 999, total: 1000, size: 500 });
  assert.deepEqual(parseRangeHeader('bytes=-100', 1000), { start: 900, end: 999, total: 1000, size: 100 });
  assert.equal(parseRangeHeader('invalid', 1000), null);
  assert.equal(parseRangeHeader('bytes=1000-2000', 1000), null);
  assert.equal(parseRangeHeader('bytes=500-200', 1000), null);
  assert.equal(parseRangeHeader('bytes=0-499', 0), null);
});

test('commonHandlebarsHelpers perform comparisons and transforms', () => {
  assert.equal(commonHandlebarsHelpers.eq(1, 1), true);
  assert.equal(commonHandlebarsHelpers.eq(1, 2), false);
  assert.equal(commonHandlebarsHelpers.neq(1, 2), true);
  assert.equal(commonHandlebarsHelpers.or(false, true, {}), true);
  assert.equal(commonHandlebarsHelpers.and(true, true, {}), true);
  assert.equal(commonHandlebarsHelpers.and(true, false, {}), false);
  assert.equal(commonHandlebarsHelpers.not(true), false);
  assert.equal(commonHandlebarsHelpers.gt(5, 3), true);
  assert.equal(commonHandlebarsHelpers.gte(5, 5), true);
  assert.equal(commonHandlebarsHelpers.lt(3, 5), true);
  assert.equal(commonHandlebarsHelpers.lte(5, 5), true);
  assert.equal(commonHandlebarsHelpers.includes(['a', 'b'], 'a'), true);
  assert.equal(commonHandlebarsHelpers.includes(['a', 'b'], 'c'), false);
  assert.equal(commonHandlebarsHelpers.getInitials('john.doe'), 'JD');
  assert.equal(commonHandlebarsHelpers.getInitials(''), '?');
});

test('classifyApiError classifies known error types', () => {
  assert.deepEqual(classifyApiError(new Error('BucketConnection environment variable is not set')), {
    status: 503,
    code: 'BUCKET_CONFIG_ERROR',
    message: 'BucketConnection environment variable is not set'
  });
  assert.deepEqual(classifyApiError(new Error('No bucket selected')), {
    status: 400,
    code: 'INVALID_BUCKET',
    message: 'No bucket selected'
  });
  assert.deepEqual(classifyApiError(new Error('File already exists')), {
    status: 409,
    code: 'CONFLICT',
    message: 'File already exists'
  });
  assert.deepEqual(classifyApiError(new Error('File not found')), {
    status: 404,
    code: 'NOT_FOUND',
    message: 'File not found'
  });
  assert.deepEqual(classifyApiError(new Error('Access denied')), {
    status: 403,
    code: 'ACCESS_DENIED',
    message: 'Access denied'
  });
  assert.deepEqual(classifyApiError(new Error('Key is required')), {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Key is required'
  });
  assert.deepEqual(classifyApiError(new Error('Something blew up')), {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Something blew up'
  });
});

test('classifyViewError classifies view errors', () => {
  assert.deepEqual(classifyViewError(new Error('No bucket selected')), {
    status: 400,
    code: 'INVALID_BUCKET',
    message: 'No bucket selected'
  });
  assert.deepEqual(classifyViewError(new Error('Access denied')), {
    status: 403,
    code: 'ACCESS_DENIED',
    message: 'Access denied'
  });
  assert.deepEqual(classifyViewError(new Error('File not found')), {
    status: 404,
    code: 'NOT_FOUND',
    message: 'File not found'
  });
  assert.deepEqual(classifyViewError(new Error('Key is required')), {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Key is required'
  });
});

test('compareVersions correctly compares semver-like version strings', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.1.0', '1.0.0') > 0, true);
  assert.equal(compareVersions('1.0.0', '1.2.0') < 0, true);
  assert.equal(compareVersions('2.0.0', '1.9.9') > 0, true);
});
