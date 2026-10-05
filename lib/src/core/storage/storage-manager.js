/**
 * MBKBucket - Storage Manager & Provider Registry
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import dotenv from "dotenv";
import { mbkautheVar } from "mbkauthe";
import { S3StorageProvider } from "./s3-provider.js";
import { GoogleDriveStorageProvider } from "./gdrive-provider.js";
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

export class StorageManager {
  constructor() {
    this._providers = new Map();
    this._factories = new Map();
    this._configs = new Map();

    // Register built-in provider drivers
    this.registerDriver('s3', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('r2', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('minio', (name, cfg) => new S3StorageProvider(name, cfg));
    this.registerDriver('gdrive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));
    this.registerDriver('google-drive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));
    this.registerDriver('googledrive', (name, cfg) => new GoogleDriveStorageProvider(name, cfg));

    this.reloadFromEnv();
  }

  /**
   * Register a custom provider driver.
   * @param {string} type
   * @param {(name: string, config: object) => import('./storage-provider.js').StorageProvider} factory
   */
  registerDriver(type, factory) {
    this._factories.set(String(type).toLowerCase(), factory);
  }

  registerProviderFactory(type, factory) {
    this.registerDriver(type, factory);
  }

  /**
   * Reload all connections from environment variables.
   */
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

  /**
   * Register a named storage connection.
   * @param {string} name
   * @param {object} config
   */
  registerConnection(name, config) {
    const cleanName = String(name).trim();
    if (!cleanName) throw new StorageValidationError("Connection name cannot be empty");
    this._configs.set(cleanName, Object.freeze({ ...config }));
    this._providers.delete(cleanName);
  }

  /**
   * Get all registered connection names.
   * @returns {string[]}
   */
  getAvailableConnectionNames() {
    return Array.from(this._configs.keys());
  }

  /**
   * Get the default connection name.
   * @returns {string|null}
   */
  getDefaultConnectionName() {
    const configuredDefault = mbkautheVar?.bucket;
    if (configuredDefault && this._configs.has(configuredDefault)) {
      return configuredDefault;
    }
    const available = this.getAvailableConnectionNames();
    return available.length > 0 ? available[0] : null;
  }

  /**
   * Resolve a candidate connection name or fall back to default.
   * @param {string} [name]
   * @returns {string}
   */
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

  /**
   * Get connection configuration object.
   * @param {string} [name]
   * @returns {object}
   */
  getConnectionConfig(name) {
    const resolved = this.resolveConnectionName(name);
    return this._configs.get(resolved);
  }

  /**
   * Determine the provider type from configuration.
   * @param {object} config
   * @returns {string}
   */
  inferProviderType(config = {}) {
    if (config?.type) return String(config.type).toLowerCase();
    if (config?.provider) return String(config.provider).toLowerCase();
    if (config?.client_id || config?.refresh_token || config?.service_account_key || config?.folder_id || config?.service_account_email) {
      return 'gdrive';
    }
    return 's3';
  }

  /**
   * Get or instantiate the StorageProvider for a connection.
   * @param {string} [name]
   * @returns {import('./storage-provider.js').StorageProvider}
   */
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
    return provider;
  }

  /**
   * Check health of the default or specified connection.
   * @param {string} [name]
   * @returns {Promise<object>}
   */
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
