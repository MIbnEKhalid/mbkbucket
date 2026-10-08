import { test, describe } from 'vitest';
import assert from 'node:assert/strict';
import { StorageProvider, StorageCapabilities, StorageItem, StorageFile, StorageFolder, StorageListResult, StorageManager, PathStrategy, StorageUnsupportedOperationError, StorageValidationError } from '../lib/src/core/storage/index.js';

describe('1. Provider-Independent Storage Object Model', () => {
  test('StorageItem creates standard item with normalized properties', () => {
    const fileItem = new StorageItem({
      path: 'documents/2026/invoice.pdf',
      type: 'file',
      size: 1024,
      mimeType: 'application/pdf',
      lastModified: new Date('2026-10-01T10:00:00Z'),
      createdAt: new Date('2026-09-01T10:00:00Z'),
      etag: '"hash123"',
      provider: 'r2',
      id: 'doc-uuid-1',
      nativeId: 's3-key-invoice',
      metadata: { author: 'MBK' }
    });

    assert.equal(fileItem.type, 'file');
    assert.equal(fileItem.name, 'invoice.pdf');
    assert.equal(fileItem.path, 'documents/2026/invoice.pdf');
    assert.equal(fileItem.parentPath, 'documents/2026');
    assert.equal(fileItem.size, 1024);
    assert.equal(fileItem.mimeType, 'application/pdf');
    assert.equal(fileItem.etag, '"hash123"');
    assert.equal(fileItem.provider, 'r2');
    assert.equal(fileItem.id, 'doc-uuid-1');
    assert.equal(fileItem.nativeId, 's3-key-invoice');
    assert.equal(fileItem.metadata.author, 'MBK');
    assert.equal(fileItem.isFile, true);
    assert.equal(fileItem.isFolder, false);
  });

  test('StorageFolder normalizes trailing slashes and folder properties', () => {
    const folder = new StorageFolder('assets/images', 'folder-gdrive-id-99');

    assert.equal(folder.type, 'folder');
    assert.equal(folder.path, 'assets/images/');
    assert.equal(folder.Prefix, 'assets/images/');
    assert.equal(folder.name, 'images');
    assert.equal(folder.parentPath, 'assets');
    assert.equal(folder.id, 'folder-gdrive-id-99');
    assert.equal(folder.size, 0);
    assert.equal(folder.isFolder, true);
    assert.equal(folder.isFile, false);
  });

  test('StorageFile preserves backward-compatible S3 properties while exposing provider-independent model', () => {
    const file = new StorageFile({
      key: 'reports/annual.xlsx',
      size: 45000,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      lastModified: '2026-10-02T15:30:00Z',
      etag: '"etag456"',
      storageClass: 'STANDARD',
      id: 'gdrive-file-id-777',
      webViewLink: 'https://preview.link',
      webContentLink: 'https://download.link'
    });

    // Backward compatible getters/properties
    assert.equal(file.Key, 'reports/annual.xlsx');
    assert.equal(file.Size, 45000);
    assert.equal(file.ContentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(file.ETag, '"etag456"');
    assert.equal(file.StorageClass, 'STANDARD');
    assert.equal(file.id, 'gdrive-file-id-777');
    assert.equal(file.webViewLink, 'https://preview.link');
    assert.equal(file.webContentLink, 'https://download.link');

    // Provider-independent properties
    assert.equal(file.path, 'reports/annual.xlsx');
    assert.equal(file.name, 'annual.xlsx');
    assert.equal(file.parentPath, 'reports');
    assert.equal(file.size, 45000);
    assert.equal(file.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.ok(file.lastModified instanceof Date);
    assert.equal(file.isFile, true);
  });

  test('StorageListResult aggregates items, files, and folders cleanly', () => {
    const file1 = new StorageFile({ key: 'docs/a.txt', size: 10 });
    const file2 = new StorageFile({ key: 'docs/b.txt', size: 20 });
    const folder1 = new StorageFolder('docs/archive/');

    const listResult = new StorageListResult({
      contents: [file1, file2],
      commonPrefixes: [folder1],
      nextToken: 'token-abc',
      isTruncated: true,
      totalFiles: 2
    });

    assert.equal(listResult.Contents.length, 2);
    assert.equal(listResult.CommonPrefixes.length, 1);
    assert.equal(listResult.files.length, 2);
    assert.equal(listResult.folders.length, 1);
    assert.equal(listResult.items.length, 3);
    assert.equal(listResult.hasMore, true);
    assert.equal(listResult.nextToken, 'token-abc');
    assert.equal(listResult.NextContinuationToken, 'token-abc');
  });
});

describe('2. Capability-Driven Provider System', () => {
  test('StorageCapabilities correctly queries flags and throws typed errors on assert', () => {
    const caps = new StorageCapabilities({
      multipart: true,
      nativeFolders: false,
      ranges: true,
      copy: true,
      move: true,
      search: false
    });

    assert.equal(caps.has('multipart'), true);
    assert.equal(caps.has('nativeFolders'), false);
    assert.equal(caps.has('search'), false);

    assert.doesNotThrow(() => caps.assert('multipart', 'createMultipartUpload', 'S3'));
    assert.throws(
      () => caps.assert('search', 'searchFiles', 'S3'),
      StorageUnsupportedOperationError
    );
  });

  test('StorageProvider base class enforces capability checks on optional methods', async () => {
    class MinimalTestProvider extends StorageProvider {
      get type() {
        return 'minimal';
      }
      get capabilities() {
        return new StorageCapabilities({
          multipart: false,
          copy: false,
          move: false
        });
      }
    }

    const provider = new MinimalTestProvider('test-conn', {});

    assert.equal(provider.supports('multipart'), false);
    assert.equal(provider.supports('copy'), false);

    await assert.rejects(
      () => provider.copyFile('a.txt', 'b.txt'),
      StorageUnsupportedOperationError
    );
    await assert.rejects(
      () => provider.moveFile('a.txt', 'b.txt'),
      StorageUnsupportedOperationError
    );
  });
});

describe('3. Driver, Connection, and Storage Root Separation', () => {
  test('StorageManager supports multiple independent connections to the same provider', () => {
    const manager = new StorageManager();

    // Multiple R2 / S3 connections
    manager.registerConnection('r2-primary', {
      type: 's3',
      BUCKET_NAME: 'prod-bucket',
      ACCESS_KEY_ID: 'key1',
      SECRET_ACCESS_KEY: 'sec1',
      ENDPOINT: 'https://r2-prod.example.com',
      rootPrefix: 'apps/main/'
    });

    manager.registerConnection('r2-backups', {
      type: 's3',
      BUCKET_NAME: 'backup-bucket',
      ACCESS_KEY_ID: 'key2',
      SECRET_ACCESS_KEY: 'sec2',
      ENDPOINT: 'https://r2-backup.example.com',
      rootPrefix: 'backups/archive/'
    });

    // Multiple Google Drive connections
    manager.registerConnection('gdrive-team', {
      type: 'gdrive',
      client_id: 'cid-team',
      client_secret: 'csec-team',
      refresh_token: 'ref-team',
      folder_id: 'folder-team-1'
    });

    manager.registerConnection('gdrive-personal', {
      type: 'gdrive',
      client_id: 'cid-personal',
      client_secret: 'csec-personal',
      refresh_token: 'ref-personal',
      folder_id: 'folder-personal-2'
    });

    assert.equal(manager.hasConnection('r2-primary'), true);
    assert.equal(manager.hasConnection('r2-backups'), true);
    assert.equal(manager.hasConnection('gdrive-team'), true);
    assert.equal(manager.hasConnection('gdrive-personal'), true);

    const r2Primary = manager.getProvider('r2-primary');
    const r2Backup = manager.getProvider('r2-backups');
    const gdriveTeam = manager.getProvider('gdrive-team');
    const gdrivePersonal = manager.getProvider('gdrive-personal');

    assert.equal(r2Primary.name, 'r2-primary');
    assert.equal(r2Primary.bucket, 'prod-bucket');
    assert.equal(r2Primary.rootPrefix, 'apps/main/');

    assert.equal(r2Backup.name, 'r2-backups');
    assert.equal(r2Backup.bucket, 'backup-bucket');
    assert.equal(r2Backup.rootPrefix, 'backups/archive/');

    assert.equal(gdriveTeam.name, 'gdrive-team');
    assert.equal(gdriveTeam.rootFolderId, 'folder-team-1');

    assert.equal(gdrivePersonal.name, 'gdrive-personal');
    assert.equal(gdrivePersonal.rootFolderId, 'folder-personal-2');
  });

  test('StorageManager allows unregistering connections and clearing provider cache', () => {
    const manager = new StorageManager();
    manager.registerConnection('temp-conn', {
      type: 's3',
      BUCKET_NAME: 'temp-b',
      ACCESS_KEY_ID: 'k',
      SECRET_ACCESS_KEY: 's',
      ENDPOINT: 'https://s3.example.com'
    });

    const p1 = manager.getProvider('temp-conn');
    assert.ok(p1);

    manager.clearCache();
    const p2 = manager.getProvider('temp-conn');
    assert.notEqual(p1, p2, 'Cache clear results in fresh instantiation');

    manager.unregisterConnection('temp-conn');
    assert.equal(manager.hasConnection('temp-conn'), false);
    assert.throws(() => manager.getProvider('temp-conn'), StorageValidationError);
  });
});

describe('4. Custom Driver Architecture', () => {
  test('Third-party / custom storage driver can be registered and used without core modifications', async () => {
    class InMemoryStorageDriver extends StorageProvider {
      constructor(name, config = {}) {
        super(name, config);
        this.store = new Map();
      }

      get type() {
        return 'in-memory-custom';
      }

      get capabilities() {
        return new StorageCapabilities({
          multipart: false,
          nativeFolders: false,
          ranges: true,
          copy: true,
          move: true,
          search: true,
          directDownloadUrl: false,
          versioning: false,
          publicUrls: false,
          metadata: true
        });
      }

      async uploadFile(key, fileBuffer, contentType = 'application/octet-stream', options = {}) {
        const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        const item = new StorageFile({
          key,
          size: buf.length,
          contentType,
          lastModified: new Date(),
          etag: `"mem-${buf.length}"`,
          provider: this.type,
          metadata: options.metadata || {}
        });
        this.store.set(key, { buffer: buf, item });
        return {
          key,
          fileSize: buf.length,
          contentType,
          uploadedAt: new Date().toISOString()
        };
      }

      async downloadFile(key) {
        if (!this.store.has(key)) throw new Error(`File not found: ${key}`);
        const entry = this.store.get(key);
        const { Readable } = await import('node:stream');
        return {
          Body: Readable.from([entry.buffer]),
          ContentType: entry.item.ContentType,
          ContentLength: entry.item.Size,
          ETag: entry.item.ETag,
          LastModified: entry.item.LastModified,
          key
        };
      }

      async deleteFile(key) {
        this.store.delete(key);
        return { key, deletedAt: new Date().toISOString() };
      }

      async listFiles(prefix = '') {
        const matching = [];
        for (const [k, entry] of this.store.entries()) {
          if (!prefix || k.startsWith(prefix)) {
            matching.push(entry.item);
          }
        }
        return new StorageListResult({ contents: matching, totalFiles: matching.length });
      }

      async getFileMetadata(key) {
        if (!this.store.has(key)) return { key, exists: false };
        const entry = this.store.get(key);
        return {
          key,
          exists: true,
          ContentLength: entry.item.Size,
          ContentType: entry.item.ContentType,
          LastModified: entry.item.LastModified,
          ETag: entry.item.ETag
        };
      }

      async checkHealth() {
        return { status: 'healthy', providerType: this.type, totalKeys: this.store.size };
      }
    }

    const manager = new StorageManager();

    // Register custom driver
    manager.registerDriver('memory', (name, cfg) => new InMemoryStorageDriver(name, cfg));
    assert.ok(manager.hasDriver('memory'));
    assert.ok(manager.getDriverTypes().includes('memory'));

    // Register connection using custom driver
    manager.registerConnection('mem-primary', {
      type: 'memory',
      customOpt: 'test'
    });

    const memProvider = manager.getProvider('mem-primary');
    assert.equal(memProvider.type, 'in-memory-custom');
    assert.equal(memProvider.supports('search'), true);
    assert.equal(memProvider.supports('multipart'), false);

    // Perform storage operations
    await memProvider.uploadFile('documents/hello.txt', Buffer.from('hello world'), 'text/plain');
    const exists = await memProvider.fileExists('documents/hello.txt');
    assert.equal(exists, true);

    const list = await memProvider.listFiles('documents/');
    assert.equal(list.Contents.length, 1);
    assert.equal(list.Contents[0].Key, 'documents/hello.txt');
    assert.equal(list.Contents[0].name, 'hello.txt');
    assert.equal(list.Contents[0].parentPath, 'documents');

    const health = await memProvider.checkHealth();
    assert.equal(health.status, 'healthy');
    assert.equal(health.totalKeys, 1);
  });
});

describe('5. Path Strategy & Decoupled Configuration', () => {
  test('PathStrategy supports explicit programmatic configuration and reset', () => {
    PathStrategy.setAppName('custom-app');
    assert.equal(PathStrategy.getAppName(), 'custom-app');

    const prefixedKey = PathStrategy.applyKeyPrefix('reports/2026.pdf');
    assert.equal(prefixedKey, 'custom-app/reports/2026.pdf');

    PathStrategy.resetAppName();
  });
});

describe('6. Performance & Concurrency Optimizations', () => {
  test('StorageProvider.deleteFiles deletes in bounded parallel batches', async () => {
    const deletedOrder = [];
    class BatchTestProvider extends StorageProvider {
      async deleteFile(key) {
        deletedOrder.push(key);
        return { key, deleted: true };
      }
    }

    const provider = new BatchTestProvider('batch-test');
    const keys = Array.from({ length: 12 }, (_, i) => `file-${i}.txt`);

    const res = await provider.deleteFiles(keys, { concurrency: 4 });
    assert.equal(res.deletedCount, 12);
    assert.equal(res.errors.length, 0);
    assert.equal(deletedOrder.length, 12);
  });
});

describe('7. Reliability & Exponential Backoff', () => {
  test('GoogleDriveStorageProvider retries on rate limit (429) with exponential backoff', async () => {
    const { GoogleDriveStorageProvider } = await import('../lib/src/core/storage/gdrive-provider.js');

    const gdrive = new GoogleDriveStorageProvider('retry-drive', {
      access_token: 'valid-test-token',
      folder_id: 'root-id'
    });

    let attempts = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      attempts++;
      if (attempts < 3) {
        return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    try {
      const res = await gdrive._fetch('https://www.googleapis.com/drive/v3/files', { maxRetries: 3 });
      assert.equal(res.status, 200);
      assert.equal(attempts, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('GoogleDriveStorageProvider respects bounded folder cache and TTL', async () => {
    const { GoogleDriveStorageProvider } = await import('../lib/src/core/storage/gdrive-provider.js');
    const gdrive = new GoogleDriveStorageProvider('cache-drive', {
      access_token: 'valid-token',
      folder_id: 'root-id'
    });

    gdrive._setFolderCache('docs/2026', 'folder-id-2026');
    assert.equal(gdrive._getFolderCache('docs/2026'), 'folder-id-2026');

    gdrive._invalidateFolderCache('docs');
    assert.equal(gdrive._getFolderCache('docs/2026'), null);
  });
});

describe('8. Frontend Capabilities & Storage Quota Health', () => {
  test('StorageCapabilities serializes toJSON with all expected flags', () => {
    const caps = new StorageCapabilities({
      multipart: true,
      copy: true,
      move: true,
      search: true,
      storageQuota: true,
      hierarchicalFolders: true,
      deleteBatch: true,
      publicUrls: false
    });

    const json = caps.toJSON();
    assert.equal(json.multipart, true);
    assert.equal(json.copy, true);
    assert.equal(json.move, true);
    assert.equal(json.storageQuota, true);
    assert.equal(json.publicUrls, false);
  });

  test('GoogleDrive checkHealth reports storageQuota and responseTime', async () => {
    const { GoogleDriveStorageProvider } = await import('../lib/src/core/storage/gdrive-provider.js');
    const gdrive = new GoogleDriveStorageProvider('quota-drive', {
      access_token: 'valid-token',
      folder_id: 'root-id'
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      return new Response(JSON.stringify({
        user: { emailAddress: 'admin@mbktech.org' },
        storageQuota: {
          limit: '15000000000',
          usage: '4500000000',
          usageInDrive: '4000000000'
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const health = await gdrive.checkHealth();
      assert.equal(health.status, 'healthy');
      assert.equal(health.providerType, 'gdrive');
      assert.equal(health.storageQuota.limit, '15000000000');
      assert.equal(health.storageQuota.usage, '4500000000');
      assert.ok(typeof health.responseTime === 'number');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
