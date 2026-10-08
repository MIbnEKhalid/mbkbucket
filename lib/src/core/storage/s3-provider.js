/**
 * MBKBucket - S3 / Cloudflare R2 / MinIO / iDrive E2 Storage Provider
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { StorageProvider } from './storage-provider.js';
import { StorageCapabilities } from './capabilities.js';
import { StorageFile, StorageFolder, StorageListResult } from './models.js';
import { StorageNotFoundError, StorageConflictError, StorageAccessDeniedError, StorageValidationError, StorageError } from './errors.js';
import { createLogger } from "#logger";
import { nowIso, trimSlashes } from "#helpers";

const debugS3 = createLogger('s3-provider');

export class S3StorageProvider extends StorageProvider {
  constructor(name, config = {}) {
    super(name, config);
    this.bucket = config.BUCKET_NAME;
    this.region = config.region || 'auto';
    this.client = new S3Client({
      region: this.region,
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

  get type() {
    return 's3';
  }

  get capabilities() {
    return new StorageCapabilities({
      multipart: true,
      resumable: true,
      nativeFolders: false,
      ranges: true,
      copy: true,
      move: true,
      search: false,
      directDownloadUrl: false,
      versioning: false,
      publicUrls: false,
      metadata: true
    });
  }

  async checkHealth() {
    const startTime = Date.now();
    try {
      await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1
      }));
      return {
        status: 'healthy',
        providerType: 's3',
        responseTime: Date.now() - startTime,
        bucket: this.bucket,
        region: this.region,
        checkedAt: nowIso()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        providerType: 's3',
        error: error.message,
        bucket: this.bucket || 'unknown',
        checkedAt: nowIso()
      };
    }
  }

  async uploadFile(key, fileBuffer, contentType, options = {}) {
    try {
      if (!key || !fileBuffer) throw new StorageValidationError('Key and file buffer are required');

      const {
        metadata = {},
        cacheControl = 'public, max-age=31536000',
        storageClass = 'STANDARD',
        serverSideEncryption = 'AES256',
        preventOverwrite = false
      } = options;

      debugS3('Uploading file to bucket=%s key=%s', this.bucket, key);
      const uploadedAt = nowIso();

      const commandParams = {
        Bucket: this.bucket,
        Key: key,
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

      const result = await this.client.send(new PutObjectCommand(commandParams));
      return {
        ...result,
        fileSize: fileBuffer.length,
        key,
        contentType,
        uploadedAt
      };
    } catch (error) {
      debugS3('Upload failed for key %s: %s', key, error.message);
      if (error.name === 'PreconditionFailed' || error.$metadata?.httpStatusCode === 412) {
        throw new StorageConflictError('File already exists');
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Upload failed: ${error.message}`);
    }
  }

  async downloadFile(key, options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');

      const { range, ifNoneMatch, ifModifiedSince, responseCacheControl, responseContentType } = options;
      if (range) debugS3('Range request for %s: %s', key, range);

      const result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range && { Range: range }),
        ...(ifNoneMatch && { IfNoneMatch: ifNoneMatch }),
        ...(ifModifiedSince && { IfModifiedSince: ifModifiedSince }),
        ...(responseCacheControl && { ResponseCacheControl: responseCacheControl }),
        ...(responseContentType && { ResponseContentType: responseContentType }),
      }));

      return { ...result, key };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 304 || error?.name === '304' || error?.name === 'NotModified') {
        debugS3('File not modified (304) for key %s', key);
        return { notModified: true, key };
      }
      debugS3('Download failed for key %s: %s', key, error.message);
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') throw new StorageNotFoundError(`File not found: ${key}`);
      if (error.name === 'AccessDenied') throw new StorageAccessDeniedError(`Access denied for file: ${key}`);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Download failed: ${error.message}`);
    }
  }

  async deleteFile(key, _options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');

      const result = await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return { ...result, key, deletedAt: nowIso() };
    } catch (error) {
      debugS3('Delete failed for %s: %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Delete failed: ${error.message}`);
    }
  }

  async deleteFiles(keys, _options = {}) {
    try {
      if (!keys || !Array.isArray(keys) || !keys.length) {
        throw new StorageValidationError('Keys array is required and must not be empty');
      }

      const maxBatchSize = 1000;
      const results = [];
      let deletedCount = 0;
      const errors = [];

      for (let i = 0; i < keys.length; i += maxBatchSize) {
        const batch = keys.slice(i, i + maxBatchSize).map(k => ({ Key: k }));
        const result = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch, Quiet: false }
        }));

        results.push(result);
        deletedCount += result.Deleted?.length || 0;
        if (result.Errors?.length) errors.push(...result.Errors);
      }

      return { results, deletedCount, errors, deletedAt: nowIso() };
    } catch (error) {
      debugS3('Batch delete failed: %s', error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Batch delete failed: ${error.message}`);
    }
  }

  async deleteFolder(prefix, _options = {}) {
    try {
      if (!prefix) throw new StorageValidationError('Prefix is required');
      const cleanPrefix = trimSlashes(prefix);
      const effectivePrefix = cleanPrefix ? `${cleanPrefix}/` : '';

      const keysToDelete = [];
      let continuationToken = null;

      do {
        const resp = await this.client.send(new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: effectivePrefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000
        }));
        (resp.Contents || []).forEach(obj => { if (obj.Key) keysToDelete.push(obj.Key); });
        continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
      } while (continuationToken);

      if (!keysToDelete.length) {
        const exists = await this.fileExists(effectivePrefix);
        if (exists) {
          await this.deleteFile(effectivePrefix);
          return { deletedCount: 1, deletedAt: nowIso(), prefix: effectivePrefix };
        }
        return { deletedCount: 0, deletedAt: nowIso(), prefix: effectivePrefix };
      }

      const result = await this.deleteFiles(keysToDelete);
      return { ...result, prefix: effectivePrefix, deletedAt: nowIso() };
    } catch (error) {
      debugS3('Delete folder failed for %s: %s', prefix, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Delete folder failed: ${error.message}`);
    }
  }

  async listFiles(prefix = '', options = {}) {
    try {
      const {
        maxKeys = 1000,
        continuationToken = null,
        delimiter = null,
        fetchOwner = false,
        startAfter = null
      } = options;

      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix || '',
        MaxKeys: maxKeys,
        ...(continuationToken && { ContinuationToken: continuationToken }),
        ...(delimiter && { Delimiter: delimiter }),
        ...(fetchOwner && { FetchOwner: fetchOwner }),
        ...(startAfter && { StartAfter: startAfter }),
      }));

      const contents = (result.Contents || []).map(item => new StorageFile({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag,
        storageClass: item.StorageClass || 'STANDARD',
        provider: 's3'
      }));

      const commonPrefixes = (result.CommonPrefixes || []).map(p => new StorageFolder(p.Prefix));

      return new StorageListResult({
        contents,
        commonPrefixes,
        nextToken: result.NextContinuationToken || null,
        isTruncated: Boolean(result.IsTruncated),
        totalFiles: result.KeyCount || contents.length
      });
    } catch (error) {
      debugS3('List files failed for prefix %s: %s', prefix, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`List files failed: ${error.message}`);
    }
  }

  async getFileMetadata(key, _options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');

      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return { ...result, key, exists: true, queriedAt: nowIso() };
    } catch (error) {
      const queriedAt = nowIso();
      if (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return { key, exists: false, queriedAt };
      }
      debugS3('Get metadata failed for key %s: %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Get metadata failed: ${error.message}`);
    }
  }

  async createFolder(key, _options = {}) {
    let folderKey = key;
    if (!folderKey.endsWith('/')) folderKey += '/';

    if (await this.fileExists(folderKey)) {
      return { key: folderKey, success: true, message: 'Folder already exists' };
    }

    const existingFiles = await this.listFiles(folderKey, { maxKeys: 1 });
    if (existingFiles.Contents?.length) {
      return { key: folderKey, success: true, message: 'Folder already exists with content', skipMarker: true };
    }

    await this.uploadFile(folderKey, Buffer.alloc(0), 'application/x-empty', {
      metadata: { folder: 'true', marker: 'true' }
    });

    return { key: folderKey, success: true, message: 'Folder created' };
  }

  async copyFile(sourceKey, destKey, options = {}) {
    this.assertCapability('copy', 'copyFile');
    try {
      const copySource = encodeURIComponent(`${this.bucket}/${sourceKey}`);
      await this.client.send(new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destKey,
        CopySource: copySource,
        MetadataDirective: options.metadata ? 'REPLACE' : 'COPY',
        ...(options.metadata && { Metadata: options.metadata })
      }));
      return { sourceKey, destKey, copiedAt: nowIso() };
    } catch (error) {
      debugS3('Copy failed from %s to %s: %s', sourceKey, destKey, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Copy failed: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // S3 Multipart Upload Operations
  // ---------------------------------------------------------------------------

  async createMultipartUpload(key, contentType = 'application/octet-stream', metadata = {}) {
    this.assertCapability('multipart', 'createMultipartUpload');
    const result = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        'upload-source': 'web-portal',
        'uploaded-at': nowIso(),
        ...metadata
      }
    }));
    return { uploadId: result.UploadId, key };
  }

  async uploadPart(key, uploadId, partNumber, buffer) {
    this.assertCapability('multipart', 'uploadPart');
    const result = await this.client.send(new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: buffer,
      ContentLength: buffer.length
    }));
    return { ETag: result.ETag, partNumber };
  }

  async completeMultipartUpload(key, uploadId, parts) {
    this.assertCapability('multipart', 'completeMultipartUpload');
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map(p => ({ PartNumber: p.partNumber, ETag: p.ETag }))
      }
    }));
    return { key };
  }

  async abortMultipartUpload(key, uploadId) {
    this.assertCapability('multipart', 'abortMultipartUpload');
    await this.client.send(new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId
    }));
    return { key, abortedAt: nowIso() };
  }

  async listIncompleteMultipartUploads(prefix = '') {
    this.assertCapability('multipart', 'listIncompleteMultipartUploads');
    try {
      const result = await this.client.send(new ListMultipartUploadsCommand({
        Bucket: this.bucket,
        Prefix: prefix || ''
      }));
      return result.Uploads || [];
    } catch (error) {
      debugS3('Failed to list incomplete multipart uploads: %s', error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Failed to list incomplete uploads: ${error.message}`);
    }
  }

  async cleanupIncompleteMultipartUploads(olderThanDays = 7, prefix = '') {
    this.assertCapability('multipart', 'cleanupIncompleteMultipartUploads');
    try {
      const uploads = await this.listIncompleteMultipartUploads(prefix);
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
          await this.abortMultipartUpload(upload.Key, upload.UploadId);
          aborted.push({ key: upload.Key, uploadId: upload.UploadId, initiated: upload.Initiated });
          debugS3('Aborted incomplete upload: %s (initiated: %s)', upload.Key, upload.Initiated);
        } catch (err) {
          debugS3('Failed to abort upload %s: %s', upload.Key, err.message);
        }
      }

      return { abortedCount: aborted.length, uploads: aborted, cleanedAt: nowIso() };
    } catch (error) {
      debugS3('Cleanup of incomplete multipart uploads failed: %s', error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Cleanup failed: ${error.message}`);
    }
  }
}
