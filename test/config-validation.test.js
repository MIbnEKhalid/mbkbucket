import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndValidateMbkbucketVar, parseAndValidateBucketConnection, normalizeBooleanLike } from '../src/config/validation.js';

test('parseAndValidateMbkbucketVar applies defaults when empty', () => {
  const cfg = parseAndValidateMbkbucketVar(undefined);
  assert.equal(cfg.p_view_inline, true);
  assert.equal(cfg.publiView_enabled, false);
});

test('parseAndValidateMbkbucketVar normalizes boolean-like strings', () => {
  const cfg = parseAndValidateMbkbucketVar(JSON.stringify({
    p_view_inline: 'false',
    publiView_enabled: 'true'
  }));

  assert.equal(cfg.p_view_inline, false);
  assert.equal(cfg.publiView_enabled, true);
});

test('parseAndValidateMbkbucketVar rejects invalid JSON', () => {
  assert.throws(() => parseAndValidateMbkbucketVar('{oops'), /Invalid JSON/);
});

test('parseAndValidateMbkbucketVar rejects invalid boolean values', () => {
  assert.throws(() => parseAndValidateMbkbucketVar(JSON.stringify({
    p_view_inline: 'not-bool'
  })), /must be a boolean/);
});

test('parseAndValidateMbkbucketVar accepts common boolean aliases', () => {
  const cfg = parseAndValidateMbkbucketVar(JSON.stringify({
    p_view_inline: ' ON ',
    publiView_enabled: '0'
  }));

  assert.equal(cfg.p_view_inline, true);
  assert.equal(cfg.publiView_enabled, false);
});

test('parseAndValidateMbkbucketVar rejects non-object values', () => {
  assert.throws(() => parseAndValidateMbkbucketVar('null'), /must be a valid object/);
  assert.throws(() => parseAndValidateMbkbucketVar('[]'), /must be a valid object/);
});

test('normalizeBooleanLike returns untouched for unsupported values', () => {
  assert.equal(normalizeBooleanLike('maybe'), 'maybe');
  assert.equal(normalizeBooleanLike(123), 123);
});

test('parseAndValidateBucketConnection accepts multi-bucket config', () => {
  const raw = JSON.stringify({
    R2_Bucket: {
      BUCKET_NAME: 'my-r2-bucket',
      ACCESS_KEY_ID: 'abc',
      SECRET_ACCESS_KEY: 'def',
      ENDPOINT: 'https://example.r2.cloudflarestorage.com'
    },
    S3_Bucket: {
      BUCKET_NAME: 'my-s3-bucket',
      ACCESS_KEY_ID: 'ghi',
      SECRET_ACCESS_KEY: 'jkl',
      ENDPOINT: 'https://s3.ap-southeast-1.amazonaws.com'
    }
  });

  const cfg = parseAndValidateBucketConnection(raw);
  assert.deepEqual(Object.keys(cfg), ['R2_Bucket', 'S3_Bucket']);
});

test('parseAndValidateBucketConnection returns null when unset', () => {
  assert.equal(parseAndValidateBucketConnection(undefined), null);
  assert.equal(parseAndValidateBucketConnection(''), null);
});

test('parseAndValidateBucketConnection rejects invalid JSON', () => {
  assert.throws(() => parseAndValidateBucketConnection('{oops'), /not valid JSON/);
});

test('parseAndValidateBucketConnection rejects empty object and array', () => {
  assert.throws(() => parseAndValidateBucketConnection('{}'), /non-empty object/);
  assert.throws(() => parseAndValidateBucketConnection('[]'), /non-empty object/);
});

test('parseAndValidateBucketConnection rejects missing required fields', () => {
  const raw = JSON.stringify({
    bad: {
      BUCKET_NAME: 'x',
      ACCESS_KEY_ID: 'y',
      ENDPOINT: 'https://example.com'
    }
  });

  assert.throws(() => parseAndValidateBucketConnection(raw), /missing required fields/);
});

test('parseAndValidateBucketConnection rejects quoted inner object shape', () => {
  const raw = JSON.stringify({
    bad: '{"BUCKET_NAME":"x"}'
  });

  assert.throws(() => parseAndValidateBucketConnection(raw), /must be an object/);
});

test('parseAndValidateBucketConnection rejects empty required fields', () => {
  const raw = JSON.stringify({
    bad: {
      BUCKET_NAME: '',
      ACCESS_KEY_ID: 'abc',
      SECRET_ACCESS_KEY: 'def',
      ENDPOINT: 'https://example.com'
    }
  });

  assert.throws(() => parseAndValidateBucketConnection(raw), /missing required fields/);
});
