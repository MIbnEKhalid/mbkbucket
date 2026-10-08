/**
 * MBKBucket - Storage Manager & Multi-Provider Connection Registry
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import dotenv from "dotenv";
import { mbkautheVar } from "mbkauthe";
import { S3StorageProvider } from "./s3-provider.js";
import { GoogleDriveStorageProvider } from "./gdrive-provider.js";
import { LocalStorageProvider } from "./local-provider.js";
import { StorageConfigError, StorageValidationError } from "./errors.js";
import { createLogger } from "#logger";

dotenv.config();
const debugStorage = createLogger('storage-manager');

function parseJsonEnv(envVar, fallback = {}) {
  if (!envVar) return fallback;
  try {
    return JSON.parse(envVar);
  } catch (e) {
    console.error(`❌ Error parsing JSON for envVar: ${String(envVar).slice(0, 200)} - ${e.message}`);
    return fallback;
  }
}

export class StorageManager extends EventEmitter {
  constructor() {
    super();
    this._providers = new Map();
    this._factories = new Map();
    this._configs = new Map();
    this._defaultConnectionName = null;

    this.registerDriver('s3', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('r2', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('minio', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('idrive', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('gdrive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));
    this.registerDriver('google-drive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));
    this.registerDriver('googledrive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));
    this.registerDriver('local', (name, cfg) => new LocalStorageProvider(name, cfg));
    this.registerDriver('fs', (name, cfg) => new LocalStorageProvider(name, cfg));
    this.registerDriver('filesystem', (name, cfg) => new LocalStorageProvider(name, cfg));

    this.reloadFromEnv();
  }


  registerDriver(type, factory) {
    if (!type || typeof type !== 'string') {
      throw new StorageValidationError("Driver type must be a non-empty string");
    }
    if (typeof factory !== 'function') {
      throw new StorageValidationError("Driver factory must be a function");
    }
    this._factories.set(String(type).toLowerCase(), factory);
  }

  registerProviderFactory(type, factory) {
    this.registerDriver(type, factory);
  }

  hasDriver(type) {
    return this._factories.has(String(type).toLowerCase());
  }

  getDriverTypes() {
    return Array.from(this._factories.keys());
  }

  reloadFromEnv() {
    this._providers.clear();
    this._configs.clear();

    const envSource = process.env.StorageConnection || process.env.BucketConnection;
    const rawConfigs = parseJsonEnv(envSource, {});

    for (const [name, config] of Object.entries(rawConfigs)) {
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        this.registerConnection(name, config);
      }
    }
  }

  registerConnection(name, config) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new StorageValidationError("Connection name cannot be empty");
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new StorageValidationError(`Connection configuration for '${cleanName}' must be an object`);
    }

    this._configs.set(cleanName, Object.freeze({ ...config }));
    this._providers.delete(cleanName);
  }

  unregisterConnection(name) {
    const cleanName = String(name || '').trim();
    this._configs.delete(cleanName);
    this._providers.delete(cleanName);
  }

  hasConnection(name) {
    return this._configs.has(String(name || '').trim());
  }

  getAvailableConnectionNames() {
    return Array.from(this._configs.keys());
  }

  setDefaultConnectionName(name) {
    this._defaultConnectionName = name ? String(name).trim() : null;
  }

  getDefaultConnectionName() {
    if (this._defaultConnectionName && this._configs.has(this._defaultConnectionName)) {
      return this._defaultConnectionName;
    }
    const configuredDefault = mbkautheVar?.bucket;
    if (configuredDefault && this._configs.has(configuredDefault)) {
      return configuredDefault;
    }
    const available = this.getAvailableConnectionNames();
    return available.length > 0 ? available[0] : null;
  }

  resolveConnectionName(name) {
    const raw = typeof name === 'string' ? name.trim() : name;
    const candidate = !raw ? this.getDefaultConnectionName() : String(raw);

    const available = this.getAvailableConnectionNames();
    if (!candidate) {
      throw new StorageValidationError('No storage connection selected. Provide ?bucket=<name> or configure a default bucket in mbkautheVar.bucket.');
    }
    if (available.length === 0) {
      throw new StorageConfigError('BucketConnection environment variable is not set or empty. Please configure it with your storage connections.');
    }
    if (!this._configs.has(candidate)) {
      throw new StorageValidationError(`Storage connection '${candidate}' not found in BucketConnection. Available connections: ${available.join(', ')}`);
    }
    return candidate;
  }

  getConnectionConfig(name) {
    const resolved = this.resolveConnectionName(name);
    return this._configs.get(resolved);
  }

  inferProviderType(config = {}) {
    if (config?.type) return String(config.type).toLowerCase();
    if (config?.provider) return String(config.provider).toLowerCase();
    if (config?.basePath || config?.rootPath || config?.directory) {
      return 'local';
    }
    if (config?.client_id || config?.refresh_token || config?.service_account_key || config?.folder_id || config?.service_account_email) {
      return 'gdrive';
    }
    return 's3';
  }

  clearCache() {
    this._providers.clear();
  }

  async dispose() {
    for (const [name, provider] of this._providers.entries()) {
      try {
        if (typeof provider.dispose === 'function') {
          await provider.dispose();
        }
      } catch (err) {
        debugStorage('Error disposing provider "%s": %s', name, err.message);
      }
    }
    this._providers.clear();
    this.removeAllListeners();
  }

  getProvider(name) {
    const resolved = this.resolveConnectionName(name);
    if (this._providers.has(resolved)) {
      return this._providers.get(resolved);
    }

    const config = this.getConnectionConfig(resolved);
    const providerType = this.inferProviderType(config);
    const factory = this._factories.get(providerType);

    if (!factory) {
      throw new StorageConfigError(`Unsupported storage provider type '${providerType}' for connection '${resolved}'. Registered drivers: ${Array.from(this._factories.keys()).join(', ')}`);
    }

    debugStorage('Instantiating provider "%s" (type: %s)', resolved, providerType);
    const provider = factory(resolved, config);
    this._providers.set(resolved, provider);
    this.emit('provider:instantiated', { name: resolved, type: providerType });
    return provider;
  }

  async checkHealth(name) {
    try {
      const provider = this.getProvider(name);
      return await provider.checkHealth();
    } catch (error) {
      let bucket = 'unknown';
      try {
        const resolved = this.resolveConnectionName(name);
        bucket = this.getConnectionConfig(resolved)?.BUCKET_NAME || resolved;
      } catch {}
      return {
        status: 'unhealthy',
        error: error.message,
        bucket,
        checkedAt: new Date().toISOString()
      };
    }
  }
}

export const storageManager = new StorageManager();

