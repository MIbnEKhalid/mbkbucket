import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand } from '@aws-sdk/client-s3';
import dotenv from "dotenv";
import { mbkautheVar } from "mbkauthe";
import { createLogger } from "#logger";
import { nowIso, trimSlashes, trimLeadingSlashes } from "#helpers";

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

const allBucketConfigs = parseJsonEnv(process.env.BucketConnection, {});
const availableBucketNames = Object.freeze(Object.keys(allBucketConfigs || {}));
const hasBucketConfigs = availableBucketNames.length > 0;

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function getAvailableBucketNames() {
  return availableBucketNames;
}

function getDefaultBucketName() {
  return mbkautheVar?.bucket || (availableBucketNames.length > 0 ? availableBucketNames[0] : null);
}

export function resolveBucketName(bucketName) {
  const raw = typeof bucketName === 'string' ? bucketName.trim() : bucketName;
  const candidate = !raw ? getDefaultBucketName() : String(raw);

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
  const app = mbkautheVar?.APP_NAME;
  return typeof app === 'string' && app.trim() ? app.trim() : '';
}

function isRootModeApp(appName) {
  const app = String(appName || '').toLowerCase();
  return app === 'portal' || app === 'mbkbucket';
}

function validateKeySafety(str, isKey = false) {
  if (isKey && !str) throw new Error('Key is required');
  if (str && (str.includes('../') || str.includes('..\\') || /\.\.[\\/]/.test(str))) {
    throw new Error(`Path traversal detected: invalid ${isKey ? 'key' : 'prefix'}`);
  }
  if (str && /[\x00-\x1f\x7f]/.test(str)) {
    throw new Error(`Invalid characters in ${isKey ? 'key' : 'prefix'}`);
  }
}

export function ensureKeyHasAppPrefix(key = '') {
  if (Array.isArray(key)) key = key.join('/');
  validateKeySafety(key, true);

  const app = getAppName();
  let cleaned = trimLeadingSlashes(key);
  if (isRootModeApp(app)) return cleaned;
  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');

  const appPrefixRegex = new RegExp(`^(?:${escapeRegExp(app)}\/)+`);
  return cleaned.startsWith(`${app}/`) ? cleaned.replace(appPrefixRegex, `${app}/`) : `${app}/${cleaned}`;
}

export function ensurePrefix(prefix = '') {
  if (Array.isArray(prefix)) prefix = prefix.join('/');
  validateKeySafety(prefix, false);

  const app = getAppName();
  let p = trimLeadingSlashes(prefix);
  if (isRootModeApp(app)) return p;
  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');
  if (!p) return app;
  if (p === app || p === `${app}/`) return p;

  if (p.startsWith(`${app}/`)) {
    return p.replace(new RegExp(`^(?:${escapeRegExp(app)}\/)+`), `${app}/`);
  }
  return `${app}/${p}`;
}

// ---------------------------------------------------------------------------
// S3 Client & Config Cache
// ---------------------------------------------------------------------------
const _clientCache = new Map();
const _configCache = new Map();

export function getBucketConfig(bucketName) {
  const resolved = resolveBucketName(bucketName);
  if (_configCache.has(resolved)) return _configCache.get(resolved);

  if (!hasBucketConfigs) {
    console.error('[mbkbucket] ❌ BucketConnection is not configured or failed to parse');
    throw new Error('BucketConnection environment variable is not set or empty. Please configure it with your bucket connections.');
  }

  const cfg = allBucketConfigs[resolved];
  if (!cfg) throw new Error(`Bucket '${resolved}' not found in BucketConnection. Available buckets: ${availableBucketNames.join(', ')}`);

  _configCache.set(resolved, cfg);
  return cfg;
}

export function getBucketClient(bucketName) {
  const resolved = resolveBucketName(bucketName);
  if (_clientCache.has(resolved)) return _clientCache.get(resolved);

  const config = getBucketConfig(resolved);
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

  _clientCache.set(resolved, client);
  return client;
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

// ---------------------------------------------------------------------------
// Health Checks
// ---------------------------------------------------------------------------

export async function checkHealth() {
  try {
    const startTime = Date.now();
    const { client, config } = getBucketClientAndConfig();
    const { BUCKET_NAME: bucket, region = 'auto' } = config;

    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      bucket,
      region,
      checkedAt: nowIso()
    };
  } catch (error) {
    let bucket = 'unknown';
    try { bucket = getBucketConfig().BUCKET_NAME; } catch {}
    return { status: 'unhealthy', error: error.message, bucket, checkedAt: nowIso() };
  }
}

export async function runHealthCheck() {
  try {
    const health = await checkHealth();
    if (health.status === 'healthy') {
      debugS3('Connected to bucket: %s (%sms)', health.bucket, health.responseTime);
    } else {
      console.error('[mbkbucket] S3 connection failed:', health.error);
    }
  } catch (err) {
    console.error("[mbkbucket] S3 connection test error:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Core S3 Operations
// ---------------------------------------------------------------------------

export async function uploadFile(key, fileBuffer, contentType, options = {}) {
  try {
    if (!key || !fileBuffer) throw new Error('Key and file buffer are required');

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
    debugS3('Uploading file to bucket=%s key=%s', config.BUCKET_NAME, keyToUpload);

    const uploadedAt = nowIso();
    const commandParams = {
      Bucket: config.BUCKET_NAME,
      Key: keyToUpload,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: {
        'uploaded-at': uploadedAt,
        'file-size': fileBuffer.length.toString(),
        'upload-source': 'web-portal',
        ...metadata
      },
      ServerSideEncryption: serverSideEncryption,
      StorageClass: storageClass,
      ...(preventOverwrite && { IfNoneMatch: '*' })
    };

    const result = await client.send(new PutObjectCommand(commandParams));
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

export async function downloadFile(key, options = {}) {
  let keyToDownload;
  try {
    if (!key) throw new Error('Key is required');
    keyToDownload = ensureKeyHasAppPrefix(key);

    const { range, ifNoneMatch, ifModifiedSince, responseCacheControl, responseContentType, bucketName } = options;
    const { client, config } = getBucketClientAndConfig(bucketName);

    if (range) debugS3('Range request for %s: %s', keyToDownload, range);

    const result = await client.send(new GetObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: keyToDownload,
      ...(range && { Range: range }),
      ...(ifNoneMatch && { IfNoneMatch: ifNoneMatch }),
      ...(ifModifiedSince && { IfModifiedSince: ifModifiedSince }),
      ...(responseCacheControl && { ResponseCacheControl: responseCacheControl }),
      ...(responseContentType && { ResponseContentType: responseContentType }),
    }));

    return { ...result, key: keyToDownload };
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 304 || error?.name === '304' || error?.name === 'NotModified') {
      debugS3('File not modified (304) for key %s', keyToDownload);
      return { notModified: true, key: keyToDownload };
    }
    console.error(`Download failed for key ${key}:`, error);
    if (error.name === 'NoSuchKey') throw new Error(`File not found: ${key}`);
    if (error.name === 'AccessDenied') throw new Error(`Access denied for file: ${key}`);
    throw new Error(`Download failed: ${error.message}`);
  }
}

export async function deleteFile(key, bucketName) {
  try {
    if (!key) throw new Error('Key is required');
    const keyToDelete = ensureKeyHasAppPrefix(key);
    const { client, config } = getBucketClientAndConfig(bucketName);

    const result = await client.send(new DeleteObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: keyToDelete,
    }));

    return { ...result, key: keyToDelete, deletedAt: nowIso() };
  } catch (error) {
    console.error('Delete failed:', error);
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export async function deleteFiles(keys, bucketName) {
  try {
    if (!keys || !Array.isArray(keys) || !keys.length) {
      throw new Error('Keys array is required and must not be empty');
    }

    const { client, config } = getBucketClientAndConfig(bucketName);
    const maxBatchSize = 1000;
    const results = [];
    let deletedCount = 0;
    const errors = [];

    for (let i = 0; i < keys.length; i += maxBatchSize) {
      const batch = keys.slice(i, i + maxBatchSize).map(k => ({ Key: ensureKeyHasAppPrefix(k) }));
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: config.BUCKET_NAME,
        Delete: { Objects: batch, Quiet: false }
      }));

      results.push(result);
      deletedCount += result.Deleted?.length || 0;
      if (result.Errors?.length) errors.push(...result.Errors);
    }

    return { results, deletedCount, errors, deletedAt: nowIso() };
  } catch (error) {
    console.error('Batch delete failed:', error);
    throw new Error(`Batch delete failed: ${error.message}`);
  }
}

export async function deleteFolder(prefix, bucketName) {
  try {
    if (!prefix) throw new Error('Prefix is required');
    const effectivePrefix = `${ensurePrefix(trimSlashes(prefix))}/`;
    const { client, config } = getBucketClientAndConfig(bucketName);

    const keysToDelete = [];
    let continuationToken = null;

    do {
      const resp = await client.send(new ListObjectsV2Command({
        Bucket: config.BUCKET_NAME,
        Prefix: effectivePrefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      }));
      (resp.Contents || []).forEach(obj => { if (obj.Key) keysToDelete.push(obj.Key); });
      continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
    } while (continuationToken);

    if (!keysToDelete.length) {
      const exists = await fileExists(effectivePrefix, bucketName);
      if (exists) {
        await deleteFile(effectivePrefix, bucketName);
        return { deletedCount: 1, deletedAt: nowIso(), prefix: effectivePrefix };
      }
      return { deletedCount: 0, deletedAt: nowIso(), prefix: effectivePrefix };
    }

    const result = await deleteFiles(keysToDelete, bucketName);
    return { ...result, prefix: effectivePrefix, deletedAt: nowIso() };
  } catch (error) {
    console.error('Delete folder failed:', error);
    throw new Error(`Delete folder failed: ${error.message}`);
  }
}

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

    const result = await client.send(new ListObjectsV2Command({
      Bucket: config.BUCKET_NAME,
      Prefix: effectivePrefix,
      MaxKeys: maxKeys,
      ...(continuationToken && { ContinuationToken: continuationToken }),
      ...(delimiter && { Delimiter: delimiter }),
      ...(fetchOwner && { FetchOwner: fetchOwner }),
      ...(startAfter && { StartAfter: startAfter }),
    }));

    return {
      ...result,
      requestedAt: nowIso(),
      totalFiles: result.KeyCount || 0,
      hasMore: result.IsTruncated || false,
      nextToken: result.NextContinuationToken || null
    };
  } catch (error) {
    console.error('List files failed:', error);
    throw new Error(`List files failed: ${error.message}`);
  }
}

export async function getFileMetadata(key, bucketName) {
  try {
    if (!key) throw new Error('Key is required');
    const keyToCheck = ensureKeyHasAppPrefix(key);
    const { client, config } = getBucketClientAndConfig(bucketName);

    const result = await client.send(new HeadObjectCommand({
      Bucket: config.BUCKET_NAME,
      Key: keyToCheck,
    }));

    return { ...result, key: keyToCheck, exists: true, queriedAt: nowIso() };
  } catch (error) {
    const queriedAt = nowIso();
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return { key, exists: false, queriedAt };
    }
    console.error(`Get metadata failed for key ${key}:`, error);
    throw new Error(`Get metadata failed: ${error.message}`);
  }
}

export async function fileExists(key, bucketName) {
  try {
    const meta = await getFileMetadata(key, bucketName);
    return !!meta.exists;
  } catch {
    return false;
  }
}

export async function getFileSize(key, bucketName) {
  try {
    const meta = await getFileMetadata(key, bucketName);
    return meta.exists ? meta.ContentLength : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Multipart Upload Helpers
// ---------------------------------------------------------------------------

export async function createMultipartUpload(key, contentType = 'application/octet-stream', metadata = {}, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    ContentType: contentType,
    Metadata: {
      'upload-source': 'web-portal',
      'uploaded-at': nowIso(),
      ...metadata
    }
  }));
  return { uploadId: result.UploadId, key: keyToUse };
}

export async function uploadPart(key, uploadId, partNumber, buffer, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const result = await client.send(new UploadPartCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId,
    PartNumber: partNumber,
    Body: buffer,
    ContentLength: buffer.length
  }));
  return { ETag: result.ETag, partNumber };
}

export async function completeMultipartUpload(key, uploadId, parts, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sorted.map(p => ({ PartNumber: p.partNumber, ETag: p.ETag }))
    }
  }));
  return { key: keyToUse };
}

export async function abortMultipartUpload(key, uploadId, bucketName) {
  const keyToUse = ensureKeyHasAppPrefix(key);
  const { client, config } = getBucketClientAndConfig(bucketName);
  await client.send(new AbortMultipartUploadCommand({
    Bucket: config.BUCKET_NAME,
    Key: keyToUse,
    UploadId: uploadId
  }));
  return { key: keyToUse, abortedAt: nowIso() };
}

export async function generateSignedUrl(key, operation = 'getObject', expiresIn = 3600, bucketName) {
  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const keyToUse = ensureKeyHasAppPrefix(key);
    const { client, config } = getBucketClientAndConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const command = operation === 'getObject'
      ? new GetObjectCommand({ Bucket: bucket, Key: keyToUse })
      : operation === 'putObject'
        ? new PutObjectCommand({ Bucket: bucket, Key: keyToUse })
        : null;

    if (!command) throw new Error(`Unsupported operation: ${operation}`);

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    const now = Date.now();
    return {
      url: signedUrl,
      key,
      operation,
      expiresIn,
      expiresAt: new Date(now + expiresIn * 1000).toISOString(),
      generatedAt: new Date(now).toISOString()
    };
  } catch (error) {
    console.error(`Generate signed URL failed for key ${key}:`, error);
    throw new Error(`Generate signed URL failed: ${error.message}`);
  }
}

export async function listIncompleteMultipartUploads(prefix = '', bucketName) {
  try {
    const effectivePrefix = ensurePrefix(prefix || '');
    const { client, config } = getBucketClientAndConfig(bucketName);
    const result = await client.send(new ListMultipartUploadsCommand({
      Bucket: config.BUCKET_NAME,
      Prefix: effectivePrefix
    }));
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

    const uploadsToAbort = uploads.filter(u => u.Initiated && new Date(u.Initiated) < cutoffDate);
    if (!uploadsToAbort.length) {
      debugS3('No incomplete uploads older than %s days', olderThanDays);
      return { abortedCount: 0, uploads: [] };
    }

    debugS3('Found %s incomplete uploads to clean up', uploadsToAbort.length);
    const aborted = [];

    for (const upload of uploadsToAbort) {
      try {
        await abortMultipartUpload(upload.Key, upload.UploadId, bucketName);
        aborted.push({ key: upload.Key, uploadId: upload.UploadId, initiated: upload.Initiated });
        debugS3('Aborted incomplete upload: %s (initiated: %s)', upload.Key, upload.Initiated);
      } catch (err) {
        console.error(`[mbkbucket] Failed to abort upload ${upload.Key}:`, err);
      }
    }

    return { abortedCount: aborted.length, uploads: aborted, cleanedAt: nowIso() };
  } catch (error) {
    console.error('Cleanup of incomplete multipart uploads failed:', error);
    throw new Error(`Cleanup failed: ${error.message}`);
  }
}
