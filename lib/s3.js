import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import dotenv from "dotenv";
import { mbkautheVar } from "mbkauthe";

dotenv.config();

function parseJsonEnv(envVar, fallback = {}) {
    if (!envVar) return fallback;
    try {
        return JSON.parse(envVar);
    } catch (e) {
        // Log a concise message including the error and a short excerpt of the env value when available
        console.error(`❌ Error parsing JSON for envVar: ${envVar ? String(envVar).slice(0, 200) : 'undefined'} - ${e.message}`);
        return fallback;
    }
}

const r2BucketConfig = parseJsonEnv(process.env.R2_Bucket, {});
const e2BucketConfig = parseJsonEnv(process.env.E2_Bucket, {});
const e2_1BucketConfig = parseJsonEnv(process.env.E2_1_Bucket, {});

// Function to get bucket config by name or from single configured env var key via mbkautheVar.bucket
export function getBucketConfig(bucketName = 'r2') {
  // If a single configured bucket is set (the value is the ENV VAR name that contains the JSON config)
  const configuredEnvKey = (mbkautheVar && mbkautheVar.bucket);
  if (configuredEnvKey) {
    const envVal = process.env[configuredEnvKey];
    if (!envVal) throw new Error(`Configured bucket env var '${configuredEnvKey}' is not set`);
    const parsed = parseJsonEnv(envVal, null);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Configured bucket env var '${configuredEnvKey}' contains invalid JSON`);
    }
    return parsed;
  }

  if (bucketName === 'e2') return e2BucketConfig;
  if (bucketName === 'e2_1') return e2_1BucketConfig;
  return r2BucketConfig;
}

// Default client uses getBucketClient() which respects the configured bucket
export const bucketClient = getBucketClient();

// Helper: get configured APP_NAME; prefer mbkautheVar, then env var
export function getAppName() {
  const app = (mbkautheVar && mbkautheVar.APP_NAME);
  return (typeof app === 'string' && app.trim()) ? app.trim() : '';
}

export function ensureKeyHasAppPrefix(key = '') {
  const app = getAppName();
  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');
  if (!key) throw new Error('Key is required');
  let cleaned = String(key).replace(/^\/+/, '');
  // Collapse repeated app prefixes (app/app/... -> app/...)
  const appPrefixRegex = new RegExp(`^(?:${app}\/)+`);
  if (!cleaned.startsWith(`${app}/`)) {
    cleaned = `${app}/${cleaned}`;
  } else {
    cleaned = cleaned.replace(appPrefixRegex, `${app}/`);
  }
  return cleaned;
}


export function ensurePrefix(prefix = '') {
  const app = getAppName();
  if (!app) throw new Error('APP_NAME is not configured; set mbkautheVar.APP_NAME or MBKAUTHE_APP_NAME');
  let p = String(prefix || '').replace(/^\/+/, '').replace(/\/+$/g, '');
  if (!p) return `${app}`;
  // If prefix already equals app or already starts with app/, normalize and return single app prefix
  if (p === app) return app;
  if (p.startsWith(`${app}/`)) {
    // collapse repeated app/ sequences
    const appPrefixRegex = new RegExp(`^(?:${app}\/)+`);
    return p.replace(appPrefixRegex, `${app}/`);
  }
  return `${app}/${p}`;
}  

// Function to get S3 client for specific bucket
export function getBucketClient(bucketName = 'r2') {
  const config = getBucketConfig(bucketName);
  
  return new S3Client({
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
}

// Health check for R2 connection (moved up for startup test)
async function checkR2Health() {
  try {
    const startTime = Date.now();
    
    const config = getBucketConfig();
    const bucketName = config.BUCKET_NAME;

    // Try to list objects with minimal result
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1,
    });
    
    const client = getBucketClient();
    const result = await client.send(command);
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      bucket: bucketName,
      region: config.region || 'auto',
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      bucket: (function(){try{return getBucketConfig().BUCKET_NAME}catch(e){return 'unknown'}})(),
      checkedAt: new Date().toISOString()
    };
  }
}

// Quick diagnostics at startup
(async () => {
  try {
    console.log('[mbkbucket] mbkautheVar snapshot:', { APP_NAME: mbkautheVar?.APP_NAME, bucket: mbkautheVar?.bucket });
    const health = await checkR2Health();
    if (health.status === 'healthy') {
      console.log(`[mbkbucket] Connected to bucket: ${health.bucket} (${health.responseTime}ms)`);
    } else {
      console.error(`[mbkbucket] R2 connection failed:`, health.error);
    }
  } catch (err) {
    console.error("[mbkbucket] R2 connection test error:", err.message);
  }
})();

// Upload file with enhanced features
export async function uploadFile(key, fileBuffer, contentType, options = {}) {
  try {
    // Validate inputs
    if (!key || !fileBuffer) {
      throw new Error('Key and file buffer are required');
    }

    // Enforce app prefix (never allow root keys)
    const keyToUpload = ensureKeyHasAppPrefix(key);

    const {
      metadata = {},
      cacheControl = 'public, max-age=31536000', // 1 year default
      storageClass = 'STANDARD',
      serverSideEncryption = 'AES256',
      bucketName = 'r2'
    } = options;
    
    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    console.log(`[mbkbucket] Uploading file to bucket=${bucket} key=${keyToUpload}`);

    // Add default metadata (R2 supports metadata)
    const defaultMetadata = {
      'uploaded-at': new Date().toISOString(),
      'file-size': fileBuffer.length.toString(),
      'upload-source': 'web-portal',
      ...metadata
    };

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: keyToUpload,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: defaultMetadata,
      ServerSideEncryption: serverSideEncryption,
      StorageClass: storageClass,
      // Note: R2 doesn't support object tagging, so we remove the Tagging parameter
    });
    
    const result = await client.send(command);
    
    return {
      ...result,
      fileSize: fileBuffer.length,
      key: keyToUpload,
      contentType,
      uploadedAt: new Date().toISOString()
    }; 
  } catch (error) {
    console.error(`Upload failed for key ${key}:`, error);
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

    // Ensure key is app-prefixed
    keyToDownload = ensureKeyHasAppPrefix(key);

    const {
      range = null,
      ifNoneMatch = null,
      ifModifiedSince = null,
      responseCacheControl = null,
      responseContentType = null,
      bucketName = 'r2'
    } = options;
    
    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    // Log range requests for debugging
    if (range) {
      console.log(`[mbkbucket] Range request for ${keyToDownload}: ${range}`);
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
    
    const startTime = Date.now();
    const result = await client.send(command);
    const downloadTime = Date.now() - startTime;
    
    // Log performance for large files
    if (result.ContentLength > 10 * 1024 * 1024) {
      console.log(`[mbkbucket] Large file download: ${keyToDownload}, Size: ${result.ContentLength} bytes, Time: ${downloadTime}ms`);
    }
    
    return {
      ...result,
      key: keyToDownload,
      downloadedAt: new Date().toISOString(),
      downloadTime
    }; 
  } catch (error) {
    console.error(`Download failed for key ${key}:`, error);

    // Some S3-compatible endpoints return 304 Not Modified as a response to conditional GETs.
    // The SDK surface may throw an error with metadata httpStatusCode=304 — treat this as a not-modified condition.
    if (error && error.$metadata && error.$metadata.httpStatusCode === 304) {
      return { notModified: true, key: keyToDownload };
    }

    // Handle specific S3 errors
    if (error.name === 'NoSuchKey') {
      throw new Error(`File not found: ${key}`);
    } else if (error.name === 'AccessDenied') {
      throw new Error(`Access denied for file: ${key}`);
    }

    throw new Error(`Download failed: ${error.message}`);
  }
}

// Delete file with enhanced error handling
export async function deleteFile(key, bucketName = 'r2') {
  try {
    if (!key) {
      throw new Error('Key is required');
    }
    const keyToDelete = ensureKeyHasAppPrefix(key);
    
    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
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
export async function deleteFiles(keys, bucketName = 'r2') {
  try {
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      throw new Error('Keys array is required and must not be empty');
    }
    
    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    // S3 allows max 1000 objects per delete request
    const maxBatchSize = 1000;
    const results = [];

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
    }

    return {
      results,
      deletedCount: results.reduce((acc, result) => acc + (result.Deleted?.length || 0), 0),
      errors: results.reduce((acc, result) => acc.concat(result.Errors || []), []),
      deletedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Batch delete failed:', error);
    throw new Error(`Batch delete failed: ${error.message}`);
  }
}

// List files with enhanced pagination and filtering
/**
 * Delete all objects under a folder prefix (recursive).
 * Accepts either a folder key (may include trailing slash) or a relative prefix.
 * Normalizes the prefix to include the configured APP_NAME and ensures trailing slash.
 */
export async function deleteFolder(prefix, bucketName = 'r2') {
  try {
    if (!prefix) {
      throw new Error('Prefix is required');
    }

    const cleaned = String(prefix).replace(/^\/+/, '').replace(/\/+$/g, '');
    const effectivePrefix = ensurePrefix(cleaned) + '/';

    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const keysToDelete = [];
    let continuationToken = null;

    // Paginate through all objects under the prefix
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
      // Nothing found under this prefix; attempt to remove a zero-byte folder marker if present
      const folderMarkerKey = effectivePrefix;
      const exists = await fileExists(folderMarkerKey, bucketName);
      if (exists) {
        await deleteFile(folderMarkerKey, bucketName);
        return { deletedCount: 1, deletedAt: new Date().toISOString(), prefix: effectivePrefix };
      }
      return { deletedCount: 0, deletedAt: new Date().toISOString(), prefix: effectivePrefix };
    }

    // Use the existing deleteFiles helper which handles batching and error aggregation
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
      bucketName = 'r2'
    } = options;
    
    // Enforce non-root prefix: default to APP_NAME and normalize
    const effectivePrefix = ensurePrefix(prefix);

    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    console.log(`[mbkbucket] Listing objects in bucket=${bucket} prefix=${effectivePrefix}`);

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
export async function getFileMetadata(key, bucketName = 'r2') {
  try {
    if (!key) {
      throw new Error('Key is required');
    }
    const keyToCheck = ensureKeyHasAppPrefix(key);
    
    const client = getBucketClient(bucketName);
    const config = getBucketConfig(bucketName);
    const bucket = config.BUCKET_NAME;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: keyToCheck,
    });
    
    const result = await client.send(command);
    
    return {
      ...result,
      key: keyToCheck,
      exists: true,
      queriedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return {
        key,
        exists: false,
        queriedAt: new Date().toISOString()
      };
    }
    
    console.error(`Get metadata failed for key ${key}:`, error);
    throw new Error(`Get metadata failed: ${error.message}`);
  }
} 

// Check if file exists
export async function fileExists(key, bucketName = 'r2') {
  try {
    const metadata = await getFileMetadata(key, bucketName);
    return metadata.exists;
  } catch (error) {
    return false;
  }
}

// Get file size without downloading
export async function getFileSize(key, bucketName = 'r2') {
  try {
    const metadata = await getFileMetadata(key, bucketName);
    return metadata.exists ? metadata.ContentLength : null;
  } catch (error) {
    return null;
  }
}

// Export health check for external use
export { checkR2Health };

// Generate signed URL for temporary access
export async function generateSignedUrl(key, operation = 'getObject', expiresIn = 3600) {
  try {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const keyToUse = ensureKeyHasAppPrefix(key);
    
    let command;
    const cfg = getBucketConfig();
    const bucketName = cfg.BUCKET_NAME;
    switch (operation) {
      case 'getObject':
        command = new GetObjectCommand({ Bucket: bucketName, Key: keyToUse });
        break;
      case 'putObject':
        command = new PutObjectCommand({ Bucket: bucketName, Key: keyToUse });
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
    
    const signedUrl = await getSignedUrl(bucketClient, command, { expiresIn });
    
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
