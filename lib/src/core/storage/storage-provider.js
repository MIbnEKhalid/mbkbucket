/**
 * MBKBucket - Core Storage Provider Interface
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { StorageUnsupportedOperationError } from "./errors.js";

/**
 * Abstract base class for storage providers (S3, Cloudflare R2, Google Drive, Azure, etc.)
 */
export class StorageProvider {
  /**
   * @param {string} name - Connection/Bucket name identifier
   * @param {object} config - Provider-specific configuration
   */
  constructor(name, config = {}) {
    if (new.target === StorageProvider) {
      throw new TypeError("Cannot construct StorageProvider instances directly");
    }
    this.name = name;
    this.config = Object.freeze({ ...config });
  }

  /**
   * Provider type identifier (e.g. 's3', 'gdrive', 'r2')
   * @returns {string}
   */
  get type() {
    return 'generic';
  }

  /**
   * Explicit provider capabilities.
   * @returns {object}
   */
  get capabilities() {
    return {
      multipart: false,
      presignedUrls: false,
      nativeFolders: false,
      ranges: true,
      copy: false,
      move: false,
      search: false,
      directDownloadUrl: false
    };
  }

  /**
   * List files and folders at the given prefix/path.
   * @param {string} [prefix='']
   * @param {object} [options={}]
   * @returns {Promise<import('./models.js').StorageListResult>}
   */
  async listFiles(prefix = '', options = {}) {
    throw new StorageUnsupportedOperationError(`listFiles() not implemented by ${this.constructor.name}`);
  }

  /**
   * Upload a file.
   * @param {string} key
   * @param {Buffer|Uint8Array|import('node:stream').Readable} fileBuffer
   * @param {string} contentType
   * @param {object} [options={}]
   * @returns {Promise<{ key: string, fileSize: number, contentType: string, uploadedAt: string, [key: string]: any }>}
   */
  async uploadFile(key, fileBuffer, contentType, options = {}) {
    throw new StorageUnsupportedOperationError(`uploadFile() not implemented by ${this.constructor.name}`);
  }

  /**
   * Download a file.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<{ Body: import('node:stream').Readable, ContentType?: string, ContentLength?: number, ETag?: string, LastModified?: Date, notModified?: boolean, key: string }>}
   */
  async downloadFile(key, options = {}) {
    throw new StorageUnsupportedOperationError(`downloadFile() not implemented by ${this.constructor.name}`);
  }

  /**
   * Delete a single file.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<{ key: string, deletedAt: string, [key: string]: any }>}
   */
  async deleteFile(key, options = {}) {
    throw new StorageUnsupportedOperationError(`deleteFile() not implemented by ${this.constructor.name}`);
  }

  /**
   * Delete multiple files.
   * @param {string[]} keys
   * @param {object} [options={}]
   * @returns {Promise<{ results: any[], deletedCount: number, errors: any[], deletedAt: string }>}
   */
  async deleteFiles(keys, options = {}) {
    let deletedCount = 0;
    const errors = [];
    const results = [];
    for (const key of keys) {
      try {
        const res = await this.deleteFile(key, options);
        results.push(res);
        deletedCount++;
      } catch (err) {
        errors.push({ key, error: err.message });
      }
    }
    return { results, deletedCount, errors, deletedAt: new Date().toISOString() };
  }

  /**
   * Delete a folder and its contents.
   * @param {string} prefix
   * @param {object} [options={}]
   * @returns {Promise<{ deletedCount: number, prefix: string, deletedAt: string }>}
   */
  async deleteFolder(prefix, options = {}) {
    throw new StorageUnsupportedOperationError(`deleteFolder() not implemented by ${this.constructor.name}`);
  }

  /**
   * Create a folder.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<{ key: string, success: boolean, [key: string]: any }>}
   */
  async createFolder(key, options = {}) {
    throw new StorageUnsupportedOperationError(`createFolder() not implemented by ${this.constructor.name}`);
  }

  /**
   * Get file metadata.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<{ key: string, exists: boolean, ContentLength?: number, ContentType?: string, LastModified?: Date, ETag?: string, Metadata?: object, queriedAt: string }>}
   */
  async getFileMetadata(key, options = {}) {
    throw new StorageUnsupportedOperationError(`getFileMetadata() not implemented by ${this.constructor.name}`);
  }

  /**
   * Check if a file exists.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<boolean>}
   */
  async fileExists(key, options = {}) {
    try {
      const meta = await this.getFileMetadata(key, options);
      return Boolean(meta?.exists);
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes.
   * @param {string} key
   * @param {object} [options={}]
   * @returns {Promise<number|null>}
   */
  async getFileSize(key, options = {}) {
    try {
      const meta = await this.getFileMetadata(key, options);
      return meta?.exists ? (meta.ContentLength ?? null) : null;
    } catch {
      return null;
    }
  }

  /**
   * Generate a signed or temporary access URL if supported.
   * @param {string} key
   * @param {'getObject'|'putObject'} [operation='getObject']
   * @param {number} [expiresIn=3600]
   * @param {object} [options={}]
   * @returns {Promise<{ url: string, key: string, operation: string, expiresIn: number, expiresAt: string, generatedAt: string }>}
   */
  async generateSignedUrl(key, operation = 'getObject', expiresIn = 3600, options = {}) {
    throw new StorageUnsupportedOperationError(`generateSignedUrl() is not supported by provider ${this.type}`);
  }

  /**
   * Copy a file.
   * @param {string} sourceKey
   * @param {string} destKey
   * @param {object} [options={}]
   * @returns {Promise<{ sourceKey: string, destKey: string, copiedAt: string }>}
   */
  async copyFile(sourceKey, destKey, options = {}) {
    throw new StorageUnsupportedOperationError(`copyFile() is not supported by provider ${this.type}`);
  }

  /**
   * Move a file.
   * @param {string} sourceKey
   * @param {string} destKey
   * @param {object} [options={}]
   * @returns {Promise<{ sourceKey: string, destKey: string, movedAt: string }>}
   */
  async moveFile(sourceKey, destKey, options = {}) {
    await this.copyFile(sourceKey, destKey, options);
    await this.deleteFile(sourceKey, options);
    return { sourceKey, destKey, movedAt: new Date().toISOString() };
  }

  /**
   * Run health check.
   * @returns {Promise<{ status: 'healthy'|'unhealthy', responseTime?: number, error?: string, [key: string]: any }>}
   */
  async checkHealth() {
    throw new StorageUnsupportedOperationError(`checkHealth() not implemented by ${this.constructor.name}`);
  }
}
