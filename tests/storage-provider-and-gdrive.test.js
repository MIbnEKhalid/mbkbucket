import { test } from 'vitest';
import assert from 'node:assert/strict';
import { StorageProvider, S3StorageProvider, GoogleDriveStorageProvider, StorageManager, PathStrategy, StorageNotFoundError, StorageConflictError, StorageValidationError, getGoogleAuthUrl } from '../lib/src/core/storage/index.js';

test('StorageProvider base class cannot be directly instantiated', () => {
  assert.throws(() => new StorageProvider('test', {}), /Cannot construct StorageProvider instances directly/);
});

test('PathStrategy validates path safety and prevents path traversal', () => {
  assert.throws(() => PathStrategy.validateSafety('../evil.txt', true), StorageValidationError);
  assert.throws(() => PathStrategy.validateSafety('dir/..\\evil.txt', true), StorageValidationError);
  assert.throws(() => PathStrategy.validateSafety('dir/\x00evil.txt', true), StorageValidationError);
  assert.throws(() => PathStrategy.validateSafety('', true), StorageValidationError);
  assert.doesNotThrow(() => PathStrategy.validateSafety('safe/path.txt', true));
});

test('Typed StorageErrors have correct properties and status codes', () => {
  const notFound = new StorageNotFoundError('file missing');
  assert.equal(notFound.status, 404);
  assert.equal(notFound.code, 'NOT_FOUND');

  const conflict = new StorageConflictError('file exists');
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, 'CONFLICT');

  const validation = new StorageValidationError('invalid param');
  assert.equal(validation.status, 400);
  assert.equal(validation.code, 'VALIDATION_ERROR');
});

test('S3StorageProvider exposes correct type and capabilities', () => {
  const s3 = new S3StorageProvider('my-s3', {
    BUCKET_NAME: 'test-bucket',
    ACCESS_KEY_ID: 'key',
    SECRET_ACCESS_KEY: 'secret',
    ENDPOINT: 'https://s3.amazonaws.com'
  });

  assert.equal(s3.type, 's3');
  assert.equal(s3.capabilities.multipart, true);
  assert.equal(s3.capabilities.ranges, true);
  assert.equal(s3.capabilities.copy, true);
  assert.equal(s3.capabilities.move, true);
  assert.equal(s3.capabilities.nativeFolders, false);
});

test('GoogleDriveStorageProvider exposes correct type and capabilities', () => {
  const gdrive = new GoogleDriveStorageProvider('my-drive', {
    client_id: 'client.apps.googleusercontent.com',
    client_secret: 'sec',
    refresh_token: 'ref',
    folder_id: 'root'
  });

  assert.equal(gdrive.type, 'gdrive');
  assert.equal(gdrive.capabilities.multipart, false);
  assert.equal(gdrive.capabilities.nativeFolders, true);
  assert.equal(gdrive.capabilities.ranges, true);
  assert.equal(gdrive.capabilities.copy, true);
  assert.equal(gdrive.capabilities.move, true);
  assert.equal(gdrive.capabilities.directDownloadUrl, true);
});

test('getGoogleAuthUrl generates valid consent URL with parameters', () => {
  const url = getGoogleAuthUrl({
    clientId: 'test-client-id.apps.googleusercontent.com',
    redirectUri: 'http://localhost:3004/oauth2callback',
    state: 'auth-state-123'
  });

  assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
  assert.ok(url.includes('client_id=test-client-id.apps.googleusercontent.com'));
  assert.ok(url.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3004%2Foauth2callback'));
  assert.ok(url.includes('state=auth-state-123'));
  assert.ok(url.includes('access_type=offline'));
});

test('StorageManager handles mixed S3 and Google Drive connections and custom drivers', () => {
  const manager = new StorageManager();

  manager.registerConnection('s3-conn', {
    type: 's3',
    BUCKET_NAME: 's3-bucket',
    ACCESS_KEY_ID: 'k',
    SECRET_ACCESS_KEY: 's',
    ENDPOINT: 'https://s3.example.com'
  });

  manager.registerConnection('gdrive-conn', {
    type: 'gdrive',
    client_id: 'cid',
    client_secret: 'csec',
    refresh_token: 'reftok',
    folder_id: 'root'
  });

  const available = manager.getAvailableConnectionNames();
  assert.ok(available.includes('s3-conn'));
  assert.ok(available.includes('gdrive-conn'));

  const s3Provider = manager.getProvider('s3-conn');
  assert.equal(s3Provider.type, 's3');

  const gdriveProvider = manager.getProvider('gdrive-conn');
  assert.equal(gdriveProvider.type, 'gdrive');
});

test('GoogleDriveStorageProvider mock operations test', async () => {
  const gdrive = new GoogleDriveStorageProvider('mock-drive', {
    access_token: 'mock-valid-token',
    expiry_date: Date.now() + 3600000,
    folder_id: 'root-123'
  });

  gdrive._fetch = async (url, options = {}) => {
    const urlStr = String(url);

    if (urlStr.includes('/about')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { emailAddress: 'user@example.com', displayName: 'Test User' },
          storageQuota: { limit: '1000000000', usage: '500000000' }
        })
      };
    }

    if (urlStr.includes('/files?') && (!options.method || options.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            {
              id: 'folder-abc',
              name: 'documents',
              mimeType: 'application/vnd.google-apps.folder',
              modifiedTime: '2026-10-01T00:00:00Z'
            },
            {
              id: 'file-123',
              name: 'notes.txt',
              mimeType: 'text/plain',
              size: '42',
              modifiedTime: '2026-10-02T12:00:00Z',
              md5Checksum: 'abc123md5'
            }
          ]
        })
      };
    }

    if (urlStr.includes('/upload/drive/v3/files')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'file-uploaded-999',
          name: 'uploaded.txt',
          mimeType: 'text/plain',
          size: '12',
          modifiedTime: new Date().toISOString()
        })
      };
    }

    if (options.method === 'DELETE') {
      return {
        ok: true,
        status: 204,
        json: async () => ({})
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'default-id', name: 'default' })
    };
  };

  const health = await gdrive.checkHealth();
  assert.equal(health.status, 'healthy');
  assert.equal(health.providerType, 'gdrive');
  assert.equal(health.user, 'user@example.com');

  const listing = await gdrive.listFiles('');
  assert.equal(listing.Contents.length, 1);
  assert.equal(listing.Contents[0].Key, 'notes.txt');
  assert.equal(listing.Contents[0].Size, 42);
  assert.equal(listing.CommonPrefixes.length, 1);
  assert.equal(listing.CommonPrefixes[0].Prefix, 'documents/');

  const uploadRes = await gdrive.uploadFile('test.txt', Buffer.from('hello world'), 'text/plain');
  assert.equal(uploadRes.key, 'test.txt');
  assert.equal(uploadRes.id, 'file-uploaded-999');
});
