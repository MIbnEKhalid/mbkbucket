/**
 * MBKBucket - Provider-Independent Storage Service
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import dotenv from "dotenv";
import { storageManager } from "../core/storage/storage-manager.js";
import { PathStrategy } from "../core/storage/path-strategy.js";
import { StorageValidationError } from "../core/storage/errors.js";
import { metricsRegistry } from "../core/metrics.js";
import { createLogger } from "#logger";
import { trimSlashes } from "#helpers";

dotenv.config();
const debugStorage = createLogger('storage-service');

export const getAvailableStorageNames = () => storageManager.getAvailableConnectionNames();
export const getAvailableBucketNames = getAvailableStorageNames;

export function resolveStorageName(name) {
  return storageManager.resolveConnectionName(name);
}
export const resolveBucketName = resolveStorageName;

export const getAppName = () => PathStrategy.getAppName();
export const validateKeySafety = (str, isKey = false) => PathStrategy.validateSafety(str, isKey);
export const ensureKeyHasAppPrefix = (key = '') => PathStrategy.applyKeyPrefix(key);
export const ensurePrefix = (prefix = '') => PathStrategy.applyPrefix(prefix);

export function getStorageProvider(connectionName) {
  return storageManager.getProvider(connectionName);
}

export function getStorageConfig(connectionName) {
  return storageManager.getConnectionConfig(connectionName);
}

// ---------------------------------------------------------------------------
// Health Checks
// ---------------------------------------------------------------------------

export async function checkHealth(connectionName) {
  return storageManager.checkHealth(connectionName);
}

export async function runHealthCheck(connectionName) {
  try {
    const health = await checkHealth(connectionName);
    if (health.status === 'healthy') {
      debugStorage('Connected to storage: %s (%sms)', health.bucket || health.name || 'default', health.responseTime);
    } else {
      console.error('[mbkbucket] Storage connection failed:', health.error);
    }
    return health;
  } catch (err) {
    console.error("[mbkbucket] Storage connection test error:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Unified Storage Operations
// ---------------------------------------------------------------------------

export async function uploadFile(key, fileBuffer, contentType, options = {}) {
  if (!key || !fileBuffer) throw new StorageValidationError('Key and file buffer are required');
  const keyToUpload = ensureKeyHasAppPrefix(key);
  const connName = options.bucketName || options.connectionName;
  const provider = getStorageProvider(connName);
  const start = Date.now();
  try {
    const result = await provider.uploadFile(keyToUpload, fileBuffer, contentType, options);
    const duration = Date.now() - start;
    const size = Buffer.isBuffer(fileBuffer) ? fileBuffer.length : (result.size || 0);
    metricsRegistry.recordOperation('upload', { provider: provider.type, status: 'success', durationMs: duration, bytes: size });
    storageManager.emit('file:uploaded', { key: keyToUpload, provider: provider.type, connectionName: connName, size, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('upload', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('upload', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function downloadFile(key, options = {}) {
  if (!key) throw new StorageValidationError('Key is required');
  const keyToDownload = ensureKeyHasAppPrefix(key);
  const connName = options.bucketName || options.connectionName;
  const provider = getStorageProvider(connName);
  const start = Date.now();
  try {
    const result = await provider.downloadFile(keyToDownload, options);
    metricsRegistry.recordOperation('download', { provider: provider.type, status: 'success', durationMs: Date.now() - start, bytes: result.ContentLength || 0 });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('download', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('download', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function deleteFile(key, connectionName) {
  if (!key) throw new StorageValidationError('Key is required');
  const keyToDelete = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.deleteFile(keyToDelete);
    metricsRegistry.recordOperation('delete', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('file:deleted', { key: keyToDelete, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('delete', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('delete', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function deleteFiles(keys, connectionName) {
  if (!keys || !Array.isArray(keys) || !keys.length) {
    throw new StorageValidationError('Keys array is required and must not be empty');
  }
  const keysToDelete = keys.map(k => ensureKeyHasAppPrefix(k));
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.deleteFiles(keysToDelete);
    metricsRegistry.recordOperation('deleteBatch', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('files:deleted', { keys: keysToDelete, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('deleteBatch', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('deleteBatch', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function deleteFolder(prefix, connectionName) {
  if (!prefix) throw new StorageValidationError('Prefix is required');
  const effectivePrefix = `${ensurePrefix(trimSlashes(prefix))}/`;
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.deleteFolder(effectivePrefix);
    metricsRegistry.recordOperation('deleteFolder', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('folder:deleted', { prefix: effectivePrefix, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('deleteFolder', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('deleteFolder', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function createFolder(prefix, connectionName, options = {}) {
  const effectivePrefix = ensurePrefix(prefix);
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.createFolder(effectivePrefix, options);
    metricsRegistry.recordOperation('createFolder', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('folder:created', { prefix: effectivePrefix, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('createFolder', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('createFolder', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function listfiles(prefix = '', options = {}) {
  const effectivePrefix = ensurePrefix(prefix);
  const connName = options.bucketName || options.connectionName;
  const provider = getStorageProvider(connName);
  const start = Date.now();
  try {
    const result = await provider.listFiles(effectivePrefix, options);
    metricsRegistry.recordOperation('list', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('list', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('list', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function getFileMetadata(key, connectionName) {
  if (!key) throw new StorageValidationError('Key is required');
  const keyToCheck = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.getFileMetadata(keyToCheck);
    metricsRegistry.recordOperation('metadata', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('metadata', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('metadata', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function fileExists(key, connectionName) {
  try {
    const meta = await getFileMetadata(key, connectionName);
    return Boolean(meta?.exists);
  } catch {
    return false;
  }
}

export async function getFileSize(key, connectionName) {
  try {
    const meta = await getFileMetadata(key, connectionName);
    return meta?.exists ? (meta.ContentLength ?? null) : null;
  } catch {
    return null;
  }
}

export async function copyFile(sourceKey, destKey, options = {}, connectionName) {
  const src = ensureKeyHasAppPrefix(sourceKey);
  const dst = ensureKeyHasAppPrefix(destKey);
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.copyFile(src, dst, options);
    metricsRegistry.recordOperation('copy', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('file:copied', { sourceKey: src, destKey: dst, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('copy', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('copy', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}

export async function moveFile(sourceKey, destKey, options = {}, connectionName) {
  const src = ensureKeyHasAppPrefix(sourceKey);
  const dst = ensureKeyHasAppPrefix(destKey);
  const provider = getStorageProvider(connectionName);
  const start = Date.now();
  try {
    const result = await provider.moveFile(src, dst, options);
    metricsRegistry.recordOperation('move', { provider: provider.type, status: 'success', durationMs: Date.now() - start });
    storageManager.emit('file:moved', { sourceKey: src, destKey: dst, provider: provider.type, connectionName, timestamp: new Date().toISOString() });
    return result;
  } catch (err) {
    metricsRegistry.recordOperation('move', { provider: provider?.type || 'unknown', status: 'error', durationMs: Date.now() - start });
    metricsRegistry.recordError('move', provider?.type || 'unknown', err.constructor?.name || 'Error');
    throw err;
  }
}


// ---------------------------------------------------------------------------
// Multipart Upload Helpers (For S3 / compatible providers)
// ---------------------------------------------------------------------------

export async function createMultipartUpload(key, contentType = 'application/octet-stream', metadata = {}, connectionName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  if (typeof provider.createMultipartUpload !== 'function') {
    throw new Error(`Multipart upload is not supported by provider ${provider.type}`);
  }
  return provider.createMultipartUpload(keyToUse, contentType, metadata);
}

export async function uploadPart(key, uploadId, partNumber, buffer, connectionName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  if (typeof provider.uploadPart !== 'function') {
    throw new Error(`Multipart upload is not supported by provider ${provider.type}`);
  }
  return provider.uploadPart(keyToUse, uploadId, partNumber, buffer);
}

export async function completeMultipartUpload(key, uploadId, parts, connectionName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  if (typeof provider.completeMultipartUpload !== 'function') {
    throw new Error(`Multipart upload is not supported by provider ${provider.type}`);
  }
  return provider.completeMultipartUpload(keyToUse, uploadId, parts);
}

export async function abortMultipartUpload(key, uploadId, connectionName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const provider = getStorageProvider(connectionName);
  if (typeof provider.abortMultipartUpload !== 'function') {
    throw new Error(`Multipart upload is not supported by provider ${provider.type}`);
  }
  return provider.abortMultipartUpload(keyToUse, uploadId);
}

export async function listIncompleteMultipartUploads(prefix = '', connectionName) {
  const effectivePrefix = ensurePrefix(prefix || '');
  const provider = getStorageProvider(connectionName);
  if (typeof provider.listIncompleteMultipartUploads !== 'function') {
    return [];
  }
  return provider.listIncompleteMultipartUploads(effectivePrefix);
}

export async function cleanupIncompleteMultipartUploads(olderThanDays = 7, prefix = '', connectionName) {
  const provider = getStorageProvider(connectionName);
  if (typeof provider.cleanupIncompleteMultipartUploads !== 'function') {
    return { abortedCount: 0, uploads: [] };
  }
  return provider.cleanupIncompleteMultipartUploads(olderThanDays, prefix);
}
