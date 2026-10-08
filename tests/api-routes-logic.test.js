import { test, beforeAll } from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { StorageProvider, storageManager } from '../lib/src/core/storage/index.js';
import { createBucketRouter } from '../lib/src/routes/index.js';

// In-memory Mock Storage Provider for deep logic testing
class InMemoryMockProvider extends StorageProvider {
  constructor(name, config = {}) {
    super(name, config);
    this.files = new Map(); // key -> { buffer, contentType, metadata, modifiedTime }
    this.folders = new Set();
  }

  get type() {
    return 'in-memory-mock';
  }

  get capabilities() {
    return {
      multipart: true,
      nativeFolders: false,
      ranges: true,
      copy: true,
      move: true,
      search: true,
      directDownloadUrl: false
    };
  }

  async checkHealth() {
    return { status: 'healthy', providerType: this.type, bucket: this.name, checkedAt: new Date().toISOString() };
  }

  async listFiles(prefix = '', options = {}) {
    const cleanPrefix = String(prefix || '').replace(/^\/+/, '');
    const contents = [];
    const commonPrefixes = [];
    const seenFolders = new Set();

    for (const [key, item] of this.files.entries()) {
      if (!cleanPrefix || key.startsWith(cleanPrefix)) {
        const rest = key.slice(cleanPrefix.length);
        if (options.delimiter === '/' && rest.includes('/')) {
          const folderName = rest.split('/')[0];
          const folderPrefix = cleanPrefix ? `${cleanPrefix}${folderName}/` : `${folderName}/`;
          if (!seenFolders.has(folderPrefix)) {
            seenFolders.add(folderPrefix);
            commonPrefixes.push({ Prefix: folderPrefix });
          }
        } else {
          contents.push({
            Key: key,
            Size: item.buffer.length,
            LastModified: item.modifiedTime,
            ETag: `"${item.buffer.length}"`,
            StorageClass: 'MOCK'
          });
        }
      }
    }

    return {
      Contents: contents,
      CommonPrefixes: commonPrefixes,
      NextContinuationToken: null,
      IsTruncated: false,
      KeyCount: contents.length
    };
  }

  async uploadFile(key, buffer, contentType, options = {}) {
    if (options.preventOverwrite && this.files.has(key)) {
      throw new Error('File already exists');
    }
    this.files.set(key, {
      buffer: Buffer.from(buffer),
      contentType: contentType || 'application/octet-stream',
      metadata: options.metadata || {},
      modifiedTime: new Date()
    });
    return { key, fileSize: buffer.length, contentType, uploadedAt: new Date().toISOString() };
  }

  async downloadFile(key) {
    const file = this.files.get(key);
    if (!file) {
      const err = new Error(`File not found: ${key}`);
      err.name = 'NoSuchKey';
      throw err;
    }
    const { Readable } = await import('node:stream');
    return {
      Body: Readable.from(file.buffer),
      ContentType: file.contentType,
      ContentLength: file.buffer.length,
      ETag: `"${file.buffer.length}"`,
      LastModified: file.modifiedTime,
      key
    };
  }

  async deleteFile(key) {
    this.files.delete(key);
    return { key, deletedAt: new Date().toISOString() };
  }

  async deleteFiles(keys) {
    let deletedCount = 0;
    for (const k of keys) {
      if (this.files.delete(k)) deletedCount++;
    }
    return { deletedCount, deletedAt: new Date().toISOString() };
  }

  async deleteFolder(prefix) {
    let deletedCount = 0;
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) {
        this.files.delete(k);
        deletedCount++;
      }
    }
    return { deletedCount, prefix, deletedAt: new Date().toISOString() };
  }

  async createFolder(key) {
    this.folders.add(key);
    this.files.set(key.endsWith('/') ? key : `${key}/`, {
      buffer: Buffer.alloc(0),
      contentType: 'application/x-empty',
      metadata: { folder: 'true', marker: 'true' },
      modifiedTime: new Date()
    });
    return { key, success: true, message: 'Folder created' };
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
      Metadata: file.metadata,
      queriedAt: new Date().toISOString()
    };
  }

  async createMultipartUpload(key) {
    return { uploadId: 'mock-upload-123', key };
  }

  async uploadPart(key, uploadId, partNumber, buffer) {
    return { ETag: `"${partNumber}"`, partNumber };
  }

  async completeMultipartUpload(key) {
    this.files.set(key, {
      buffer: Buffer.from('multipart-content'),
      contentType: 'application/octet-stream',
      metadata: {},
      modifiedTime: new Date()
    });
    return { key };
  }

  async abortMultipartUpload(key) {
    return { key, abortedAt: new Date().toISOString() };
  }

  async copyFile(sourceKey, destKey) {
    const src = this.files.get(sourceKey);
    if (!src) throw new Error(`Source not found: ${sourceKey}`);
    this.files.set(destKey, { ...src, modifiedTime: new Date() });
    return { sourceKey, destKey, copiedAt: new Date().toISOString() };
  }

  async moveFile(sourceKey, destKey) {
    const result = await this.copyFile(sourceKey, destKey);
    this.files.delete(sourceKey);
    return { sourceKey, destKey, movedAt: new Date().toISOString() };
  }
}

// App setup
let app;
const mockProvider = new InMemoryMockProvider('mock-bucket', {});

beforeAll(() => {
  storageManager.registerDriver('mock-driver', () => mockProvider);
  storageManager.registerConnection('mock-bucket', { type: 'mock-driver' });

  process.env.mbkautheVar = JSON.stringify({
    APP_NAME: 'portal',
    bucket: 'mock-bucket'
  });

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const openAuth = (_req, _res, next) => next();
  app.use(createBucketRouter({ authorization: openAuth }));
});

test('API GET /mbkbucket/api/files returns empty file list initially', async () => {
  const res = await request(app)
    .get('/mbkbucket/api/files?bucket=mock-bucket')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.files, []);
});

test('API POST /mbkbucket/upload uploads a single file', async () => {
  const res = await request(app)
    .post('/mbkbucket/upload?bucket=mock-bucket')
    .field('prefix', 'documents')
    .attach('file', Buffer.from('Hello MBKBucket Test'), 'test-doc.txt')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.key, 'documents/test-doc.txt');
});

test('API POST /mbkbucket/upload returns 409 conflict when duplicate file is uploaded', async () => {
  const res = await request(app)
    .post('/mbkbucket/upload?bucket=mock-bucket')
    .field('prefix', 'documents')
    .attach('file', Buffer.from('Duplicate'), 'test-doc.txt')
    .expect(409);

  assert.equal(res.body.success, false);
  assert.ok(res.body.error.includes('already exists'));
});

test('API POST /mbkbucket/upload returns 400 when no file is attached', async () => {
  const res = await request(app)
    .post('/mbkbucket/upload?bucket=mock-bucket')
    .expect(400);

  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'No file selected');
});

test('API GET /mbkbucket/api/files lists uploaded files and parses folders', async () => {
  const res = await request(app)
    .get('/mbkbucket/api/files?bucket=mock-bucket&prefix=&recursive=false')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.ok(res.body.folders.includes('documents/'));
});

test('API GET /mbkbucket/download/:key streams file with attachment headers', async () => {
  const res = await request(app)
    .get('/mbkbucket/download/documents/test-doc.txt?bucket=mock-bucket')
    .expect(200);

  assert.ok(res.headers['content-disposition'].includes('test-doc.txt'));
  assert.equal(res.text, 'Hello MBKBucket Test');
});

test('API GET /mbkbucket/download/:key returns 404 for nonexistent key', async () => {
  const res = await request(app)
    .get('/mbkbucket/download/nonexistent.txt?bucket=mock-bucket')
    .expect(404);

  assert.equal(res.body.message, 'File not found');
});

test('API POST /mbkbucket/create-folder creates folder marker', async () => {
  const res = await request(app)
    .post('/mbkbucket/create-folder?bucket=mock-bucket')
    .send({ folderName: 'archive', prefix: '' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.key, 'archive/');
});

test('API POST /mbkbucket/delete deletes single file', async () => {
  const res = await request(app)
    .post('/mbkbucket/delete?bucket=mock-bucket')
    .send({ key: 'documents/test-doc.txt' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'File deleted successfully');

  // Verify deletion
  const verifyRes = await request(app)
    .get('/mbkbucket/download/documents/test-doc.txt?bucket=mock-bucket')
    .expect(404);
  assert.equal(verifyRes.body.message, 'File not found');
});

test('API POST /mbkbucket/delete batch deletes multiple files', async () => {
  await mockProvider.uploadFile('file1.txt', Buffer.from('f1'), 'text/plain');
  await mockProvider.uploadFile('file2.txt', Buffer.from('f2'), 'text/plain');

  const res = await request(app)
    .post('/mbkbucket/delete?bucket=mock-bucket')
    .send({ keys: ['file1.txt', 'file2.txt'] })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Files deleted successfully');
});

test('API POST /mbkbucket/delete deletes folder recursively', async () => {
  await mockProvider.uploadFile('nested/sub/file.txt', Buffer.from('sub'), 'text/plain');

  const res = await request(app)
    .post('/mbkbucket/delete?bucket=mock-bucket')
    .send({ key: 'nested', folder: true })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Folder deleted successfully');
});

test('API Multipart upload flow (init, chunk, complete)', async () => {
  const initRes = await request(app)
    .post('/mbkbucket/upload-init?bucket=mock-bucket')
    .send({ fileName: 'large-video.mp4', prefix: '' })
    .expect(200);

  assert.equal(initRes.body.success, true);
  assert.ok(initRes.body.uploadId);

  const chunkRes = await request(app)
    .post('/mbkbucket/upload-chunk?bucket=mock-bucket')
    .field('uploadId', initRes.body.uploadId)
    .field('key', initRes.body.key)
    .field('partNumber', 1)
    .attach('chunk', Buffer.from('chunk data'), 'chunk.bin')
    .expect(200);

  assert.equal(chunkRes.body.success, true);
  assert.equal(chunkRes.body.partNumber, 1);

  const completeRes = await request(app)
    .post('/mbkbucket/upload-complete?bucket=mock-bucket')
    .send({
      uploadId: initRes.body.uploadId,
      key: initRes.body.key,
      parts: [{ partNumber: 1, ETag: chunkRes.body.ETag }]
    })
    .expect(200);

  assert.equal(completeRes.body.success, true);
});

test('API POST /mbkbucket/upload-abort aborts upload', async () => {
  const res = await request(app)
    .post('/mbkbucket/upload-abort?bucket=mock-bucket')
    .send({ uploadId: 'mock-123', key: 'abandoned.mp4' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Multipart upload aborted');
});

test('API GET /mbkbucket/api/health returns healthy status for active connection', async () => {
  const res = await request(app)
    .get('/mbkbucket/api/health?bucket=mock-bucket')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.status, 'healthy');
  assert.equal(res.body.providerType, 'in-memory-mock');
});

test('API GET /mbkbucket/api/file-info/:key returns metadata for key', async () => {
  await mockProvider.uploadFile('info-test.txt', Buffer.from('Testing file info endpoint'), 'text/plain');

  const res = await request(app)
    .get('/mbkbucket/api/file-info/info-test.txt?bucket=mock-bucket')
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.exists, true);
  assert.equal(res.body.ContentType, 'text/plain');
});

test('API POST /mbkbucket/copy duplicates a file to destKey', async () => {
  await mockProvider.uploadFile('original.txt', Buffer.from('Original content'), 'text/plain');

  const res = await request(app)
    .post('/mbkbucket/copy?bucket=mock-bucket')
    .send({ sourceKey: 'original.txt', destKey: 'copied.txt' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.destKey, 'copied.txt');
});

test('API POST /mbkbucket/move renames or moves a file', async () => {
  await mockProvider.uploadFile('to-move.txt', Buffer.from('Move content'), 'text/plain');

  const res = await request(app)
    .post('/mbkbucket/move?bucket=mock-bucket')
    .send({ sourceKey: 'to-move.txt', destKey: 'moved/to-move.txt' })
    .expect(200);

  assert.equal(res.body.success, true);
  assert.equal(res.body.destKey, 'moved/to-move.txt');
});

