import { test } from 'vitest';
import assert from 'node:assert/strict';

// Set up env for module load
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

const index = await import('../index.js');

test('index.js exports all expected public APIs', () => {
  assert.ok(index.default, 'Default export exists');
  assert.ok(index.bucket, 'bucket route export exists');
  assert.ok(typeof index.createBucketRouter === 'function', 'configurable bucket router factory is exported');
  assert.ok(typeof index.uploadFile === 'function', 'uploadFile is exported');
  assert.ok(typeof index.downloadFile === 'function', 'downloadFile is exported');
  assert.ok(typeof index.deleteFile === 'function', 'deleteFile is exported');
  assert.ok(typeof index.deleteFiles === 'function', 'deleteFiles is exported');
  assert.ok(typeof index.deleteFolder === 'function', 'deleteFolder is exported');
  assert.ok(typeof index.listfiles === 'function', 'listfiles is exported');
  assert.ok(typeof index.getFileMetadata === 'function', 'getFileMetadata is exported');
  assert.ok(typeof index.fileExists === 'function', 'fileExists is exported');
  assert.ok(typeof index.getFileSize === 'function', 'getFileSize is exported');
  assert.ok(typeof index.createMultipartUpload === 'function', 'createMultipartUpload is exported');
  assert.ok(typeof index.uploadPart === 'function', 'uploadPart is exported');
  assert.ok(typeof index.completeMultipartUpload === 'function', 'completeMultipartUpload is exported');
  assert.ok(typeof index.abortMultipartUpload === 'function', 'abortMultipartUpload is exported');
  assert.ok(typeof index.getAvailableBucketNames === 'function', 'getAvailableBucketNames is exported');
  assert.ok(typeof index.resolveBucketName === 'function', 'resolveBucketName is exported');
  assert.ok(typeof index.getBucketClient === 'function', 'getBucketClient is exported');
  assert.ok(typeof index.getBucketConfig === 'function', 'getBucketConfig is exported');
  assert.ok(typeof index.getBucketClientAndConfig === 'function', 'getBucketClientAndConfig is exported');
  assert.ok(index.bucketClient, 'bucketClient proxy is exported');
  assert.ok(typeof index.checkHealth === 'function', 'checkHealth is exported');
  assert.ok(typeof index.runHealthCheck === 'function', 'runHealthCheck is exported');
  assert.ok(typeof index.checkVersion === 'function', 'checkVersion is exported');
  assert.ok(typeof index.validateConfiguration === 'function', 'validateConfiguration is exported');
  assert.ok(typeof index.validateBucketConnection === 'function', 'validateBucketConnection is exported');
  assert.ok(typeof index.validateAllConfiguration === 'function', 'validateAllConfiguration is exported');
  assert.ok(index.mbkbucketVar, 'mbkbucketVar is exported');

  // New provider-independent storage exports
  assert.ok(typeof index.StorageProvider === 'function', 'StorageProvider base class is exported');
  assert.ok(typeof index.StorageCapabilities === 'function', 'StorageCapabilities class is exported');
  assert.ok(typeof index.StorageItem === 'function', 'StorageItem class is exported');
  assert.ok(typeof index.StorageFile === 'function', 'StorageFile class is exported');
  assert.ok(typeof index.StorageFolder === 'function', 'StorageFolder class is exported');
  assert.ok(typeof index.StorageListResult === 'function', 'StorageListResult class is exported');
  assert.ok(typeof index.S3StorageProvider === 'function', 'S3StorageProvider is exported');
  assert.ok(typeof index.GoogleDriveStorageProvider === 'function', 'GoogleDriveStorageProvider is exported');
  assert.ok(typeof index.LocalStorageProvider === 'function', 'LocalStorageProvider is exported');
  assert.ok(typeof index.StorageManager === 'function', 'StorageManager class is exported');
  assert.ok(index.storageManager, 'storageManager instance is exported');
  assert.ok(typeof index.MetricsRegistry === 'function', 'MetricsRegistry class is exported');
  assert.ok(index.metricsRegistry, 'metricsRegistry instance is exported');
  assert.ok(typeof index.CleanupScheduler === 'function', 'CleanupScheduler class is exported');
  assert.ok(index.cleanupScheduler, 'cleanupScheduler instance is exported');
  assert.ok(typeof index.getGoogleAuthUrl === 'function', 'getGoogleAuthUrl is exported');
  assert.ok(typeof index.exchangeCodeForTokens === 'function', 'exchangeCodeForTokens is exported');
  assert.ok(typeof index.refreshGoogleAccessToken === 'function', 'refreshGoogleAccessToken is exported');
  assert.ok(typeof index.getServiceAccountAccessToken === 'function', 'getServiceAccountAccessToken is exported');
});

