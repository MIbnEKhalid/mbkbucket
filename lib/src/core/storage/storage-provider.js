/**
 * MBKBucket - Core Storage Provider Interface
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { StorageUnsupportedOperationError } from "./errors.js";
import { StorageCapabilities } from "./capabilities.js";

export class StorageProvider {
  constructor(name, config = {}) {
    if (new.target === StorageProvider) {
      throw new TypeError("Cannot construct StorageProvider instances directly");
    }
    this.name = String(name);
    this.config = Object.freeze({ ...config });
    this.rootPrefix = config.rootPrefix || config.basePath || '';
  }

  get type() {
    return 'generic';
  }

  get capabilities() {
    return new StorageCapabilities({
      multipart: false,
      nativeFolders: false,
      ranges: true,
      copy: false,
      move: false,
      search: false,
      directDownloadUrl: false,
      versioning: false,
      publicUrls: false,
      metadata: true
    });
  }

  supports(capabilityName) {
    return this.capabilities.has(capabilityName);
  }

  assertCapability(capabilityName, operationName) {
    this.capabilities.assert(capabilityName, operationName, `provider '${this.type}'`);
  }

  async listFiles(prefix = '', options = {}) {
    throw new StorageUnsupportedOperationError(`listFiles() not implemented by ${this.constructor.name}`);
  }

  async uploadFile(key, fileBuffer, contentType, options = {}) {
    throw new StorageUnsupportedOperationError(`uploadFile() not implemented by ${this.constructor.name}`);
  }

  async downloadFile(key, options = {}) {
    throw new StorageUnsupportedOperationError(`downloadFile() not implemented by ${this.constructor.name}`);
  }

  async deleteFile(key, options = {}) {
    throw new StorageUnsupportedOperationError(`deleteFile() not implemented by ${this.constructor.name}`);
  }

  async deleteFiles(keys, options = {}) {
    const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 8, 32));
    let deletedCount = 0;
    const errors = [];
    const results = [];

    for (let i = 0; i < keys.length; i += concurrency) {
      const batch = keys.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(key => this.deleteFile(key, options))
      );
      batchResults.forEach((outcome, idx) => {
        const key = batch[idx];
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
          deletedCount++;
        } else {
          errors.push({ key, error: outcome.reason?.message || 'Delete failed' });
        }
      });
    }

    return { results, deletedCount, errors, deletedAt: new Date().toISOString() };
  }

  async deleteFolder(prefix, options = {}) {
    throw new StorageUnsupportedOperationError(`deleteFolder() not implemented by ${this.constructor.name}`);
  }

  async createFolder(key, options = {}) {
    throw new StorageUnsupportedOperationError(`createFolder() not implemented by ${this.constructor.name}`);
  }

  async getFileMetadata(key, options = {}) {
    throw new StorageUnsupportedOperationError(`getFileMetadata() not implemented by ${this.constructor.name}`);
  }

  async fileExists(key, options = {}) {
    try {
      const meta = await this.getFileMetadata(key, options);
      return Boolean(meta?.exists);
    } catch {
      return false;
    }
  }

  async getFileSize(key, options = {}) {
    try {
      const meta = await this.getFileMetadata(key, options);
      return meta?.exists ? (meta.ContentLength ?? null) : null;
    } catch {
      return null;
    }
  }

  async copyFile(sourceKey, destKey, options = {}) {
    this.assertCapability('copy', 'copyFile');
    throw new StorageUnsupportedOperationError(`copyFile() is not supported by provider ${this.type}`);
  }

  async moveFile(sourceKey, destKey, options = {}) {
    this.assertCapability('move', 'moveFile');
    await this.copyFile(sourceKey, destKey, options);
    await this.deleteFile(sourceKey, options);
    return { sourceKey, destKey, movedAt: new Date().toISOString() };
  }

  async initialize() {
    return this;
  }

  async dispose() {
    return this;
  }

  async ping() {
    return this.checkHealth();
  }

  async checkHealth() {
    throw new StorageUnsupportedOperationError(`checkHealth() not implemented by ${this.constructor.name}`);
  }
}

