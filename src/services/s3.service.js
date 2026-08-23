import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
import dotenv from "dotenv";
import { mbkautheVar } from "mbkauthe";
import { createLogger } from "../utils/logger.js";

dotenv.config();
const debugS3 = createLogger('s3');

function parseJsonEnv(envVar, fallback = {}) {
    if (!envVar) return fallback;
    try {
        return JSON.parse(envVar);
    } catch (e) {
        console.error(`❌ Error parsing JSON for envVar: ${envVar ? String(envVar).slice(0, 200) : 'undefined'} - ${e.message}`);
        console.error(`💡 Tip: Check that inner objects are NOT quoted as strings. Use {"key":{"field":"value"}} not {"key":"{"field":"value"}"}`);
        return fallback;
    }
}

// Parse BucketConnection JSON that contains all bucket configurations
const allBucketConfigs = parseJsonEnv(process.env.BucketConnection, {});
const availableBucketNames = Object.freeze(Object.keys(allBucketConfigs || {}));
const hasBucketConfigs = availableBucketNames.length > 0;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getAvailableBucketNames() {
  return availableBucketNames;
}

// Helper to get default bucket name
function getDefaultBucketName() {
  if (mbkautheVar && mbkautheVar.bucket) {
    return mbkautheVar.bucket;
  }

  if (availableBucketNames.length > 0) {
    return availableBucketNames[0];
  }

  return null;
}

export function resolveBucketName(bucketName) {
  const candidate = (bucketName === undefined || bucketName === null)
    ? getDefaultBucketName()
    : String(bucketName).trim();

  if (!candidate) {
    throw new Error('No bucket selected. Provide ?bucket=<name> or configure a default bucket in mbkautheVar.bucket.');
  }

  if (!hasBucketConfigs) {
    throw new Error('BucketConnection environment variable is not set or empty. Please configure it with your bucket connections.');
  }

  if (!allBucketConfigs[candidate]) {
    throw new Error(`Bucket '${candidate}' not found in BucketConnection. Available buckets: ${availableBucketNames.join(', ')}`);
  }

  return candidate;
}

export function getAppName() {
  const app = (mbkautheVar && mbkautheVar.APP_NAME);
  return (typeof app === 'string' && app.trim()) ? app.trim() : '';
}

function isRootModeApp(appName) {
  const app = String(appName || '').toLowerCase();
  return app === 'portal' || app === 'mbkbucket';
}

export function ensureKeyHasAppPrefix(key = '') {
  if (Array.isArray(key)) {
    key = key.join('/');
  }
  const app = getAppName();
  if (!key) throw new Error('Key is required');

  if (key.includes('../') || key.includes('..\\') || /\.\.[\\/]/.test(key)) {
    throw new Error('Path traversal detected: invalid key');
  }

  if (/[\x00-\x1f\x7f]/.test(key)) {
    throw new Error('Invalid characters in key');
  }

  let cleaned = String(key).replace(/^\/+/, '');

  if (isRootModeApp(app)) {
    return cleaned;
  }

  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');

  const appPrefixRegex = new RegExp(`^(?:${escapeRegExp(app)}\/)+`);
  if (!cleaned.startsWith(`${app}/`)) {
    cleaned = `${app}/${cleaned}`;
  } else {
    cleaned = cleaned.replace(appPrefixRegex, `${app}/`);
  }
  return cleaned;
}

export function ensurePrefix(prefix = '') {
  if (Array.isArray(prefix)) {
    prefix = prefix.join('/');
  }
  const app = getAppName();

  if (prefix && (prefix.includes('../') || prefix.includes('..\\') || /\.\.[\\/]/.test(prefix))) {
    throw new Error('Path traversal detected: invalid prefix');
  }

  if (prefix && /[\x00-\x1f\x7f]/.test(prefix)) {
    throw new Error('Invalid characters in prefix');
  }

  let p = String(prefix || '').replace(/^\/+/, '');

  if (isRootModeApp(app)) {
    return p;
  }

  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');

  if (!p) return `${app}`;

  if (p === app) return app;
  if (p === `${app}/`) return `${app}/`;

  if (p.startsWith(`${app}/`)) {
    const appPrefixRegex = new RegExp(`^(?:${escapeRegExp(app)}\/)+`);
    return p.replace(appPrefixRegex, `${app}/`);
  }
  return `${app}/${p}`;
}

// ---------------------------------------------------------------------------
// Singleton S3 client cache
// ---------------------------------------------------------------------------
const _clientCache = new Map();
const _configCache = new Map();

export function getBucketConfig(bucketName) {
  bucketName = resolveBucketName(bucketName);

  const cacheKey = bucketName;
  if (_configCache.has(cacheKey)) return _configCache.get(cacheKey);

  if (!hasBucketConfigs) {
    console.error(`[mbkbucket] ❌ BucketConnection is not configured or failed to parse`);
    console.error(`[mbkbucket] Please set BucketConnection in your .env file with this format:`);
    console.error(`[mbkbucket] BucketConnection={"r2":{"BUCKET_NAME":"...","ACCESS_KEY_ID":"...","SECRET_ACCESS_KEY":"...","ENDPOINT":"https://..."}}`);
    console.error(`[mbkbucket] ⚠️  Important: Inner objects must NOT be quoted as strings!`);
    console.error(`[mbkbucket] Wrong: {"r2":"{\\"BUCKET_NAME\\":\\"...\\"}"}  ❌`);
    console.error(`[mbkbucket] Right: {"r2":{"BUCKET_NAME":"..."}}  ✓`);
    throw new Error(`BucketConnection environment variable is not set or empty. Please configure it with your bucket connections.`);
  }

  const cfg = allBucketConfigs[bucketName];

  if (!cfg) {
    throw new Error(`Bucket '${bucketName}' not found in BucketConnection. Available buckets: ${availableBucketNames.join(', ')}`);
  }

  _configCache.set(cacheKey, cfg);
  return cfg;
}

export function getBucketClient(bucketName) {
  bucketName = resolveBucketName(bucketName);

  if (_clientCache.has(bucketName)) return _clientCache.get(bucketName);

  const config = getBucketConfig(bucketName);
  const client = new S3Client({
    region: config.region || 'auto',
    endpoint: config.ENDPOINT,
    credentials: {
      accessKeyId: config.ACCESS_KEY_ID,
      secretAccessKey: config.SECRET_ACCESS_KEY,
    },
    maxAttempts: 3,
    retryMode: 'adaptive',
    requestTimeout: 120000,
    requestHandler: {
      connectionTimeout: 5000,
      socketTimeout: 120000,
      maxSockets: 50,
      keepAlive: true,
      keepAliveMsecs: 1000,
    },
    useAccelerateEndpoint: false,
    forcePathStyle: true,
  });

  _clientCache.set(bucketName, client);
  return client;
}

/**
 * Resolve both client and config in a single call — avoids redundant
 * resolveBucketName + cache lookups in every S3 operation.
 */
export function getBucketClientAndConfig(bucketName) {
  const resolved = resolveBucketName(bucketName);
  return {
    client: getBucketClient(resolved),
    config: getBucketConfig(resolved),
    bucketName: resolved
  };
}

// Default client singleton (lazily created on first access, not at import time)
let _defaultClient = null;
export const bucketClient = new Proxy({}, {
  get(_, prop) {
    if (!_defaultClient) _defaultClient = getBucketClient();
    const val = _defaultClient[prop];
    return typeof val === 'function' ? val.bind(_defaultClient) : val;
  }
});

// Health check for connection (lazy — only runs when called explicitly)
export async function checkHealth() {
  try {
    const startTime = Date.now();
    const { client, config } = getBucketClientAndConfig();
    const bucketName = config.BUCKET_NAME;

    await client.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      bucket: bucketName,
      region: config.region || 'auto',
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    let bucket = 'unknown';
    try { bucket = getBucketConfig().BUCKET_NAME; } catch {}
    return { status: 'unhealthy', error: error.message, bucket, checkedAt: new Date().toISOString() };
  }
}

/**
 * Run S3 health check and log results. Should be called explicitly at app startup.
 */
export async function runHealthCheck() {
  try {
    debugS3('mbkautheVar snapshot: %O', { APP_NAME: mbkautheVar?.APP_NAME, bucket: mbkautheVar?.bucket });
    const health = await checkHealth();
    if (health.status === 'healthy') {
      debugS3('Connected to bucket: %s (%sms)', health.bucket, health.responseTime);
    } else {
      console.error(`[mbkbucket] S3 connection failed:`, health.error);
    }
  } catch (err) {
    console.error("[mbkbucket] S3 connection test error:", err.message);
  }
}

// Upload file with enhanced features
export async function uploadFile(key, fileBuffer, contentType, options = {}) {
  try {
    if (!key || !fileBuffer) {
      throw new Error('Key and file buffer are required');
    }

    const keyToUpload = ensureKeyHasAppPrefix(key);

    const {
      metadata = {},
      cacheControl = 'public, max-age=31536000',
      storageClass = 'STANDARD',
      serverSideEncryption = 'AES256',
      bucketName,
      preventOverwrite = false
    } = options;

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    debugS3('Uploading file to bucket=%s key=%s', bucket, keyToUpload);

    const uploadedAt = new Date().toISOString();
    const defaultMetadata = {
      'uploaded-at': uploadedAt,
      'file-size': fileBuffer.length.toString(),
      'upload-source': 'web-portal',
      ...metadata
    };

    const commandParams = {
      Bucket: bucket,
      Key: keyToUpload,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: defaultMetadata,
      ServerSideEncryption: serverSideEncryption,
      StorageClass: storageClass,
    };

    if (preventOverwrite) {
      commandParams.IfNoneMatch = '*';
    }

    const command = new PutObjectCommand(commandParams);

    const result = await client.send(command);

    return {
      ...result,
      fileSize: fileBuffer.length,
      key: keyToUpload,
      contentType,
      uploadedAt
    };
  } catch (error) {
    console.error(`Upload failed for key ${key}:`, error);

    if (error.name === 'PreconditionFailed' || error.$metadata?.httpStatusCode === 412) {
      throw new Error('File already exists');
    }

    throw new Error(`Upload failed: ${error.message}`);
  }
}

// Download file with enhanced features
export async function downloadFile(key, options = {}) {
  let keyToDownload;
  try {
    if (!key) {
      throw new Error('Key is required');
    }

    keyToDownload = ensureKeyHasAppPrefix(key);

    const {
      range = null,
      ifNoneMatch = null,
      ifModifiedSince = null,
      responseCacheControl = null,
      responseContentType = null,
      bucketName
    } = options;

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    if (range) {
      debugS3('Range request for %s: %s', keyToDownload, range);
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: keyToDownload,
      ...(range && { Range: range }),
      ...(ifNoneMatch && { IfNoneMatch: ifNoneMatch }),
      ...(ifModifiedSince && { IfModifiedSince: ifModifiedSince }),
      ...(responseCacheControl && { ResponseCacheControl: responseCacheControl }),
      ...(responseContentType && { ResponseContentType: responseContentType }),
    });

    const result = await client.send(command);

    return {
      ...result,
      key: keyToDownload,
    };
  } catch (error) {
    if (error && (error.$metadata?.httpStatusCode === 304 || error.name === '304' || error.name === 'NotModified')) {
      debugS3('File not modified (304) for key %s', keyToDownload);
      return { notModified: true, key: keyToDownload };
    }

    console.error(`Download failed for key ${key}:`, error);

    if (error.name === 'NoSuchKey') {
      throw new Error(`File not found: ${key}`);
    } else if (error.name === 'AccessDenied') {
      throw new Error(`Access denied for file: ${key}`);
    }

    throw new Error(`Download failed: ${error.message}`);
  }
}

// Delete file with enhanced error handling
export async function deleteFile(key, bucketName) {
  try {
    if (!key) {
      throw new Error('Key is required');
    }
    const keyToDelete = ensureKeyHasAppPrefix(key);

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: keyToDelete,
    });

    const result = await client.send(command);

    return {
      ...result,
      key: keyToDelete,
      deletedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Delete failed:`, error);
    throw new Error(`Delete failed: ${error.message}`);
  }
}

// Batch delete multiple files
export async function deleteFiles(keys, bucketName) {
  try {
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      throw new Error('Keys array is required and must not be empty');
    }

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const maxBatchSize = 1000;
    const results = [];
    let deletedCount = 0;
    const errors = [];

    for (let i = 0; i < keys.length; i += maxBatchSize) {
      const batch = keys.slice(i, i + maxBatchSize).map(k => ({ Key: ensureKeyHasAppPrefix(k) }));

      const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch,
          Quiet: false
        }
      });

      const result = await client.send(command);
      results.push(result);
      deletedCount += result.Deleted?.length || 0;
      if (result.Errors?.length) errors.push(...result.Errors);
    }

    return {
      results,
      deletedCount,
      errors,
      deletedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Batch delete failed:', error);
    throw new Error(`Batch delete failed: ${error.message}`);
  }
}

// Delete all objects under a folder prefix (recursive)
export async function deleteFolder(prefix, bucketName) {
  try {
    if (!prefix) {
      throw new Error('Prefix is required');
    }

    const cleaned = String(prefix).replace(/^\/+/, '').replace(/\/+$/g, '');
    const effectivePrefix = ensurePrefix(cleaned) + '/';

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const keysToDelete = [];
    let continuationToken = null;

    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: effectivePrefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      });
      const resp = await client.send(listCmd);
      const contents = resp.Contents || [];
      for (const obj of contents) {
        if (obj.Key) keysToDelete.push(obj.Key);
      }
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
    } while (continuationToken);

    if (!keysToDelete.length) {
      const folderMarkerKey = effectivePrefix;
      const exists = await fileExists(folderMarkerKey, bucketName);
      if (exists) {
        await deleteFile(folderMarkerKey, bucketName);
        return { deletedCount: 1, deletedAt: new Date().toISOString(), prefix: effectivePrefix };
      }
      return { deletedCount: 0, deletedAt: new Date().toISOString(), prefix: effectivePrefix };
    }

    const result = await deleteFiles(keysToDelete, bucketName);

    return {
      ...result,
      prefix: effectivePrefix,
      deletedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Delete folder failed:', error);
    throw new Error(`Delete folder failed: ${error.message}`);
  }
}

// List files with enhanced pagination and filtering
export async function listfiles(prefix = '', options = {}) {
  try {
    const {
      maxKeys = 1000,
      continuationToken = null,
      delimiter = null,
      fetchOwner = false,
      startAfter = null,
      bucketName
    } = options;

    const effectivePrefix = ensurePrefix(prefix);

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: effectivePrefix,
      MaxKeys: maxKeys,
      ...(continuationToken && { ContinuationToken: continuationToken }),
      ...(delimiter && { Delimiter: delimiter }),
      ...(fetchOwner && { FetchOwner: fetchOwner }),
      ...(startAfter && { StartAfter: startAfter }),
    });

    const result = await client.send(command);

    return {
      ...result,
      requestedAt: new Date().toISOString(),
      totalFiles: result.KeyCount || 0,
      hasMore: result.IsTruncated || false,
      nextToken: result.NextContinuationToken || null
    };
  } catch (error) {
    console.error('List files failed:', error);
    throw new Error(`List files failed: ${error.message}`);
  }
}

// Get file metadata without downloading
export async function getFileMetadata(key, bucketName) {
  try {
    if (!key) {
      throw new Error('Key is required');
    }
    const keyToCheck = ensureKeyHasAppPrefix(key);

    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: keyToCheck,
    });

    const result = await client.send(command);
    const queriedAt = new Date().toISOString();

    return {
      ...result,
      key: keyToCheck,
      exists: true,
      queriedAt
    };
  } catch (error) {
    const queriedAt = new Date().toISOString();
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return {
        key,
        exists: false,
        queriedAt
      };
    }

    console.error(`Get metadata failed for key ${key}:`, error);
    throw new Error(`Get metadata failed: ${error.message}`);
  }
}

// Check if file exists
export async function fileExists(key, bucketName) {
  try {
    const metadata = await getFileMetadata(key, bucketName);
    return metadata.exists;
  } catch (error) {
    return false;
  }
}

// Get file size without downloading
export async function getFileSize(key, bucketName) {
  try {
    const metadata = await getFileMetadata(key, bucketName);
    return metadata.exists ? metadata.ContentLength : null;
  } catch (error) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// S3 Multipart Upload helpers
// ---------------------------------------------------------------------------

export async function createMultipartUpload(key, contentType = 'application/octet-stream', metadata = {}, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const uploadedAt = new Date().toISOString();
  const command = new CreateMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    ContentType: contentType,
    Metadata: {
      'upload-source': 'web-portal',
      'uploaded-at': uploadedAt,
      ...metadata
    }
  });
  const result = await client.send(command);
  return { uploadId: result.UploadId, key: keyToUse };
}

export async function uploadPart(key, uploadId, partNumber, buffer, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const command = new UploadPartCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: buffer,
    ContentLength: buffer.length
  });
  const result = await client.send(command);
  return { ETag: result.ETag, partNumber };
}

export async function completeMultipartUpload(key, uploadId, parts, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const command = new CompleteMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sorted.map(p => ({ PartNumber: p.partNumber, ETag: p.ETag }))
    }
  });
  await client.send(command);
  return { key: keyToUse };
}

export async function abortMultipartUpload(key, uploadId, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const command = new AbortMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId
  });
  await client.send(command);
  return { key: keyToUse, abortedAt: new Date().toISOString() };
}

// Generate signed URL for temporary access
export async function generateSignedUrl(key, operation = 'getObject', expiresIn = 3600, bucketName) {
  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const keyToUse = ensureKeyHasAppPrefix(key);

    let command;
    const { client, config } = getBucketClientAndConfig(bucketName);
    const resolvedBucketName = config.BUCKET_NAME;
    switch (operation) {
      case 'getObject':
        command = new GetObjectCommand({ Bucket: resolvedBucketName, Key: keyToUse });
        break;
      case 'putObject':
        command = new PutObjectCommand({ Bucket: resolvedBucketName, Key: keyToUse });
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    const signedUrl = await getSignedUrl(client, command, { expiresIn });

    return {
      url: signedUrl,
      key,
      operation,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Generate signed URL failed for key ${key}:`, error);
    throw new Error(`Generate signed URL failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Multipart Upload Cleanup
// ---------------------------------------------------------------------------

export async function listIncompleteMultipartUploads(prefix = '', bucketName) {
  try {
    const effectivePrefix = ensurePrefix(prefix || '');
    const { client, config } = getBucketClientAndConfig(bucketName);

    const command = new ListMultipartUploadsCommand({
      Bucket: config.BUCKET_NAME,
      Prefix: effectivePrefix
    });

    const result = await client.send(command);
    return result.Uploads || [];
  } catch (error) {
    console.error('Failed to list incomplete multipart uploads:', error);
    throw new Error(`Failed to list incomplete uploads: ${error.message}`);
  }
}

export async function cleanupIncompleteMultipartUploads(olderThanDays = 7, prefix = '', bucketName) {
  try {
    const uploads = await listIncompleteMultipartUploads(prefix, bucketName);

    if (!uploads.length) {
      debugS3('No incomplete multipart uploads found');
      return { abortedCount: 0, uploads: [] };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const uploadsToAbort = uploads.filter(upload => {
      return upload.Initiated && new Date(upload.Initiated) < cutoffDate;
    });

    if (!uploadsToAbort.length) {
      debugS3('No incomplete uploads older than %s days', olderThanDays);
      return { abortedCount: 0, uploads: [] };
    }

    debugS3('Found %s incomplete uploads to clean up', uploadsToAbort.length);

    const aborted = [];
    for (const upload of uploadsToAbort) {
      try {
        await abortMultipartUpload(upload.Key, upload.UploadId, bucketName);
        aborted.push({
          key: upload.Key,
          uploadId: upload.UploadId,
          initiated: upload.Initiated
        });
        debugS3('Aborted incomplete upload: %s (initiated: %s)', upload.Key, upload.Initiated);
      } catch (err) {
        console.error(`[mbkbucket] Failed to abort upload ${upload.Key}:`, err);
      }
    }

    return {
      abortedCount: aborted.length,
      uploads: aborted,
      cleanedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Cleanup of incomplete multipart uploads failed:', error);
    throw new Error(`Cleanup failed: ${error.message}`);
  }
}
