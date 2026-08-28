import test from 'node:test';
import assert from 'node:assert/strict';

// Set up env vars required by mbkauthe before importing s3.service
process.env.mbkautheVar = JSON.stringify({
  APP_NAME: 'testapp',
  bucket: 'testbucket',
  Main_SECRET_TOKEN: 'dummy-token',
  SESSION_SECRET_KEY: 'dummy-secret',
  DOMAIN: 'localhost',
  LOGIN_DB: 'postgres://dummy',
  DB_TYPE: 'sqlite'
});

process.env.BucketConnection = JSON.stringify({
  testbucket: {
    BUCKET_NAME: 'test-bucket',
    ACCESS_KEY_ID: 'key',
    SECRET_ACCESS_KEY: 'secret',
    ENDPOINT: 'https://example.com'
  }
});

const {
  ensureKeyHasAppPrefix,
  ensurePrefix,
  getAppName,
  resolveBucketName
} = await import('../lib/src/services/s3.service.js');

test('ensureKeyHasAppPrefix rejects path traversal and control characters', () => {
  assert.throws(() => ensureKeyHasAppPrefix('../evil.txt'), /Path traversal detected/);
  assert.throws(() => ensureKeyHasAppPrefix('folder/../evil.txt'), /Path traversal detected/);
  assert.throws(() => ensureKeyHasAppPrefix('folder/..\\evil.txt'), /Path traversal detected/);
  assert.throws(() => ensureKeyHasAppPrefix('bad\x00key.txt'), /Invalid characters in key/);
  assert.throws(() => ensureKeyHasAppPrefix(''), /Key is required/);
});

test('ensurePrefix rejects path traversal and control characters', () => {
  assert.throws(() => ensurePrefix('../folder'), /Path traversal detected/);
  assert.throws(() => ensurePrefix('folder/../evil'), /Path traversal detected/);
  assert.throws(() => ensurePrefix('bad\x00prefix'), /Invalid characters in prefix/);
});

test('ensureKeyHasAppPrefix handles array keys and prefixes with APP_NAME', () => {
  const result = ensureKeyHasAppPrefix(['sub', 'file.txt']);
  assert.equal(result, 'testapp/sub/file.txt');
});

test('resolveBucketName resolves configured default bucket', () => {
  assert.equal(resolveBucketName('testbucket'), 'testbucket');
  assert.equal(resolveBucketName(undefined), 'testbucket');
  assert.throws(() => resolveBucketName('nonexistent'), /not found in BucketConnection/);
});
