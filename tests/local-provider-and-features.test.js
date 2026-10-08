import { test, describe, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  LocalStorageProvider,
  StorageManager,
  MetricsRegistry,
  metricsRegistry,
  CleanupScheduler,
  cleanupScheduler,
  uploadFile,
  downloadFile,
  deleteFile,
  listFiles,
  createFolder,
  deleteFolder,
  copyFile,
  moveFile
} from '../index.js';

describe('LocalStorageProvider & Architecture Features', () => {
  let tmpDir;
  let provider;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mbkbucket-local-test-'));
    provider = new LocalStorageProvider('local-test', { basePath: tmpDir });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('LocalStorageProvider capabilities', () => {
    assert.equal(provider.type, 'local');
    assert.equal(provider.capabilities.nativeFolders, true);
    assert.equal(provider.capabilities.copy, true);
    assert.equal(provider.capabilities.move, true);
    assert.equal(provider.capabilities.storageQuota, true);
    assert.equal(provider.capabilities.multipart, false);
  });

  test('uploadFile and downloadFile with Buffer', async () => {
    const content = 'Hello MBKBucket Local Storage!';
    const uploadRes = await provider.uploadFile('documents/hello.txt', Buffer.from(content), 'text/plain');

    assert.equal(uploadRes.key, 'documents/hello.txt');
    assert.equal(uploadRes.size, Buffer.byteLength(content));
    assert.ok(uploadRes.etag);

    const downloadRes = await provider.downloadFile('documents/hello.txt');
    assert.equal(downloadRes.ContentType, 'text/plain');
    assert.equal(downloadRes.ContentLength, Buffer.byteLength(content));

    const chunks = [];
    for await (const chunk of downloadRes.stream) {
      chunks.push(chunk);
    }
    const downloadedStr = Buffer.concat(chunks).toString('utf-8');
    assert.equal(downloadedStr, content);
  });

  test('downloadFile supports byte range requests', async () => {
    const content = '0123456789ABCDEF';
    await provider.uploadFile('data.txt', Buffer.from(content), 'text/plain');

    const downloadRes = await provider.downloadFile('data.txt', { range: 'bytes=4-9' });
    assert.equal(downloadRes.isRange, true);
    assert.equal(downloadRes.ContentLength, 6);

    const chunks = [];
    for await (const chunk of downloadRes.stream) {
      chunks.push(chunk);
    }
    assert.equal(Buffer.concat(chunks).toString('utf-8'), '456789');
  });

  test('listFiles supports delimiter, shallow subfolders, and search', async () => {
    await provider.uploadFile('root.txt', Buffer.from('root'), 'text/plain');
    await provider.uploadFile('folderA/file1.txt', Buffer.from('1'), 'text/plain');
    await provider.uploadFile('folderA/file2.txt', Buffer.from('2'), 'text/plain');
    await provider.uploadFile('folderB/sub/deep.txt', Buffer.from('deep'), 'text/plain');

    // Shallow root list
    const shallow = await provider.listFiles('', { delimiter: '/' });
    assert.equal(shallow.files.length, 1);
    assert.equal(shallow.Contents.length, 1);
    assert.equal(shallow.files[0].Key, 'root.txt');
    assert.equal(shallow.folders.length, 2);
    assert.equal(shallow.CommonPrefixes.length, 2);

    // List folderA
    const folderAList = await provider.listFiles('folderA/', { delimiter: '/' });
    assert.equal(folderAList.files.length, 2);
    assert.equal(folderAList.Contents.length, 2);


    // Search
    const searchRes = await provider.listFiles('', { recursive: true, search: 'deep' });
    assert.equal(searchRes.files.length, 1);
    assert.equal(searchRes.files[0].Key, 'folderB/sub/deep.txt');
  });

  test('copyFile and moveFile work properly', async () => {
    await provider.uploadFile('orig.txt', Buffer.from('move-me'), 'text/plain');

    await provider.copyFile('orig.txt', 'copied.txt');
    const metaCopied = await provider.getFileMetadata('copied.txt');
    assert.equal(metaCopied.exists, true);

    await provider.moveFile('copied.txt', 'moved.txt');
    const metaOld = await provider.getFileMetadata('copied.txt');
    const metaMoved = await provider.getFileMetadata('moved.txt');
    assert.equal(metaOld.exists, false);
    assert.equal(metaMoved.exists, true);
  });

  test('deleteFile and deleteFolder', async () => {
    await provider.uploadFile('dir/sub1.txt', Buffer.from('1'), 'text/plain');
    await provider.uploadFile('dir/sub2.txt', Buffer.from('2'), 'text/plain');

    await provider.deleteFile('dir/sub1.txt');
    const meta1 = await provider.getFileMetadata('dir/sub1.txt');
    assert.equal(meta1.exists, false);

    await provider.deleteFolder('dir');
    const meta2 = await provider.getFileMetadata('dir/sub2.txt');
    assert.equal(meta2.exists, false);
  });

  test('getStorageQuota and checkHealth', async () => {
    await provider.uploadFile('q1.txt', Buffer.from('12345'), 'text/plain');
    await provider.uploadFile('q2.txt', Buffer.from('67890'), 'text/plain');

    const quota = await provider.getStorageQuota();
    assert.equal(quota.fileCount, 2);
    assert.equal(quota.usedBytes, 10);

    const health = await provider.checkHealth();
    assert.equal(health.status, 'healthy');
    assert.equal(health.type, 'local');
  });

  test('prevents path traversal attacks', () => {
    assert.throws(() => {
      provider.resolvePath('../../etc/passwd');
    }, /Invalid storage key|path traversal/);
  });
});

describe('StorageManager Events & Local Inference', () => {
  test('StorageManager infers local provider from basePath/rootPath', () => {
    const mgr = new StorageManager();
    mgr.registerConnection('localdisk', { basePath: './temp_disk' });
    const p = mgr.getProvider('localdisk');
    assert.equal(p.type, 'local');
  });

  test('StorageManager emits events on provider instantiation and disposal', async () => {
    const mgr = new StorageManager();
    let instantiated = false;

    mgr.on('provider:instantiated', (evt) => {
      if (evt.name === 'memdisk') instantiated = true;
    });

    mgr.registerConnection('memdisk', { type: 'local', basePath: './tmp' });
    mgr.getProvider('memdisk');

    assert.equal(instantiated, true);
    await mgr.dispose();
  });
});

describe('MetricsRegistry', () => {
  test('records operations and formats Prometheus text', () => {
    const reg = new MetricsRegistry();
    reg.recordOperation('upload', { provider: 's3', status: 'success', durationMs: 150, bytes: 2048 });
    reg.recordOperation('download', { provider: 'local', status: 'success', durationMs: 50, bytes: 1024 });
    reg.recordError('upload', 'gdrive', 'RateLimitError');
    reg.incrementActiveMultipart(2);

    const stats = reg.getStats();
    assert.equal(stats.activeMultipartUploads, 2);
    assert.equal(stats.operations['upload:s3:success'], 1);
    assert.equal(stats.operations['download:local:success'], 1);
    assert.equal(stats.bytesTransferred['inbound:s3'], 2048);
    assert.equal(stats.bytesTransferred['outbound:local'], 1024);
    assert.equal(stats.errors['upload:gdrive:RateLimitError'], 1);

    const prom = reg.toPrometheusText();
    assert.ok(prom.includes('mbkbucket_operations_total{operation="upload",provider="s3",status="success"} 1'));
    assert.ok(prom.includes('mbkbucket_active_multipart_uploads 2'));
  });
});

describe('CleanupScheduler', () => {
  test('starts, provides status, and stops without error', () => {
    const scheduler = new CleanupScheduler();
    assert.equal(scheduler.getStatus().running, false);

    scheduler.start({ intervalHours: 12, olderThanDays: 5 });
    assert.equal(scheduler.getStatus().running, true);

    scheduler.stop();
    assert.equal(scheduler.getStatus().running, false);
  });
});
