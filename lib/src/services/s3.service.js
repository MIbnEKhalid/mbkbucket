/**
 * MBKBucket - S3 Service Compatibility Layer
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * 
 * Provides backwards-compatible S3 APIs delegating to the unified storage layer.
 */

import { storageManager } from "../core/storage/storage-manager.js";
import { getAvailableBucketNames, resolveBucketName, getAppName, ensureKeyHasAppPrefix, ensurePrefix, uploadFile, downloadFile, deleteFile, deleteFiles, deleteFolder, listfiles, getFileMetadata, fileExists, getFileSize, createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload, listIncompleteMultipartUploads, cleanupIncompleteMultipartUploads, checkHealth, runHealthCheck } from "./storage.service.js";

export { getAvailableBucketNames, resolveBucketName, getAppName, ensureKeyHasAppPrefix, ensurePrefix, uploadFile, downloadFile, deleteFile, deleteFiles, deleteFolder, listfiles, getFileMetadata, fileExists, getFileSize, createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload, listIncompleteMultipartUploads, cleanupIncompleteMultipartUploads, checkHealth, runHealthCheck };

export function getBucketConfig(bucketName) {
  return storageManager.getConnectionConfig(bucketName);
}

export function getBucketClient(bucketName) {
  const provider = storageManager.getProvider(bucketName);
  if (provider.client) {
    return provider.client;
  }
  throw new Error(`Connection '${provider.name}' is of type '${provider.type}' and does not use an S3Client.`);
}

export function getBucketClientAndConfig(bucketName) {
  const resolved = resolveBucketName(bucketName);
  return {
    client: getBucketClient(resolved),
    config: getBucketConfig(resolved),
    bucketName: resolved
  };
}

let _defaultClient = null;
export const bucketClient = new Proxy({}, {
  get(_, prop) {
    _defaultClient ??= getBucketClient();
    const val = _defaultClient[prop];
    return typeof val === 'function' ? val.bind(_defaultClient) : val;
  }
});
