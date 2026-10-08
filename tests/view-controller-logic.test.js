import { test, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { StorageProvider, storageManager } from '../lib/src/core/storage/index.js';
import { createBucketRouter } from '../lib/src/routes/index.js';

class ViewMockProvider extends StorageProvider {
  constructor(name, config = {}) {
    super(name, config);
    this.files = new Map();
  }

  get type() {
    return 'view-mock';
  }

  get capabilities() {
    return {
      multipart: false,
      nativeFolders: false,
      ranges: true,
      copy: false,
      move: false,
      search: false,
      directDownloadUrl: false
    };
  }

  async checkHealth() {
    return { status: 'healthy', providerType: this.type };
  }

  async uploadFile(key, buffer, contentType) {
    this.files.set(key, {
      buffer: Buffer.from(buffer),
      contentType: contentType || 'application/octet-stream',
      modifiedTime: new Date()
    });
    return { key };
  }

  async downloadFile(key, options = {}) {
    const file = this.files.get(key);
    if (!file) {
      const err = new Error(`File not found: ${key}`);
      err.name = 'NoSuchKey';
      throw err;
    }

    const { Readable } = await import('node:stream');
    let data = file.buffer;

    if (options.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(options.range);
      if (match) {
        const start = parseInt(match[1], 10) || 0;
        const end = match[2] ? parseInt(match[2], 10) : data.length - 1;
        data = data.subarray(start, end + 1);
      }
    }

    return {
      Body: Readable.from(data),
      ContentType: file.contentType,
      ContentLength: data.length,
      ETag: `"${file.buffer.length}"`,
      LastModified: file.modifiedTime,
      key
    };
  }

  async getFileMetadata(key) {
    const file = this.files.get(key);
    if (!file) return { key, exists: false, queriedAt: new Date().toISOString() };
    return {
      key,
      exists: true,
      ContentLength: file.buffer.length,
      ContentType: file.contentType,
      LastModified: file.modifiedTime,
      ETag: `"${file.buffer.length}"`,
      queriedAt: new Date().toISOString()
    };
  }
}

let app;
const provider = new ViewMockProvider('view-bucket', {});

beforeAll(async () => {
  storageManager.registerDriver('view-mock-driver', () => provider);
  storageManager.registerConnection('view-bucket', { type: 'view-mock-driver' });

  process.env.mbkautheVar = JSON.stringify({
    APP_NAME: 'portal',
    bucket: 'view-bucket'
  });

  process.env.mbkbucketVar = JSON.stringify({
    publiView_enabled: true,
    p_view_inline: true
  });

  // Seed files
  await provider.uploadFile('sample.txt', Buffer.from('Text preview content'), 'text/plain');
  await provider.uploadFile('video.mp4', Buffer.from('Fake MP4 video binary content with bytes for range test'), 'video/mp4');
  await provider.uploadFile('document.pdf', Buffer.from('%PDF-1.4 Mock PDF content'), 'application/pdf');
  await provider.uploadFile('unsupported.exe', Buffer.from('Binary executable'), 'application/x-msdownload');

  app = express();
  app.use(createBucketRouter({ authorization: (_req, _res, next) => next(), publiViewEnabled: true }));
});

test('View GET /mbkbucket/view/:key serves text inline', async () => {
  const res = await request(app)
    .get('/mbkbucket/view/sample.txt?bucket=view-bucket')
    .expect(200);

  assert.ok(res.headers['content-type'].includes('text/plain'));
  assert.ok(res.headers['content-disposition'].includes('inline'));
  assert.equal(res.text, 'Text preview content');
});

test('View GET /mbkbucket/view/:key serves range requests for video streaming with 206 Partial Content', async () => {
  const res = await request(app)
    .get('/mbkbucket/view/video.mp4?bucket=view-bucket')
    .set('Range', 'bytes=0-10')
    .expect(206);

  assert.ok(res.headers['content-range'].startsWith('bytes 0-10/'));
  assert.equal(res.headers['content-length'], '11');
});

test('View GET /mbkbucket/view/:key serves open-ended range request (bytes=0-) for PDF preview with 206 and full stream', async () => {
  const res = await request(app)
    .get('/mbkbucket/view/document.pdf?bucket=view-bucket')
    .set('Range', 'bytes=0-')
    .expect(206);

  assert.ok(res.headers['content-range'].includes('/'));
  assert.ok(res.headers['content-disposition'].includes('inline'));
  assert.ok(res.headers['x-frame-options'].includes('SAMEORIGIN'));
  assert.equal(res.headers['content-type'], 'application/pdf');
  const bodyContent = res.text || res.body?.toString?.('utf-8') || '';
  assert.ok(bodyContent.includes('%PDF-1.4 Mock PDF content'));
});

test('View GET /mbkbucket/view/:key rejects non-viewable file types with 415', async () => {
  const res = await request(app)
    .get('/mbkbucket/view/unsupported.exe?bucket=view-bucket')
    .expect(415);

  assert.ok(res.body.message.includes('not supported'));
});

test('View GET /mbkbucket/player/:key renders video player HTML page', async () => {
  const res = await request(app)
    .get('/mbkbucket/player/video.mp4?bucket=view-bucket')
    .expect(200);

  assert.ok(res.headers['content-type'].includes('text/html'));
  assert.ok(res.text.includes('<video controls'));
  assert.ok(res.text.includes('video.mp4'));
});

test('View GET /mbkbucket/p_view/:key serves public view when enabled', async () => {
  const res = await request(app)
    .get('/mbkbucket/p_view/sample.txt?bucket=view-bucket')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    .expect(200);

  assert.equal(res.text, 'Text preview content');
});

test('Info GET /mbkbucket/info.json returns safe public metadata without credentials', async () => {
  const res = await request(app)
    .get('/mbkbucket/info.json')
    .expect(200);

  assert.ok(res.body.CurrentVersion);
  assert.ok(res.body.mbkbucketVar);
  assert.equal(typeof res.body.mbkbucketVar.publiView_enabled, 'boolean');
  assert.equal(typeof res.body.mbkbucketVar.p_view_inline, 'boolean');
  // Confirm credentials / database URLs / secret tokens are not leaked
  assert.equal(res.body.LOGIN_DB, undefined);
  assert.equal(res.body.MAIN_SECRET_TOKEN, undefined);
  assert.equal(res.body.mbkautheVar?.LOGIN_DB, undefined);
  assert.equal(res.body.mbkautheVar?.MAIN_SECRET_TOKEN, undefined);
  assert.equal(res.body.mbkautheVar?.OAUTH_PROVIDERS, undefined);
});
