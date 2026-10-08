/**
 * MBKBucket - Google Drive Storage Provider
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { Readable } from "node:stream";
import { StorageProvider } from "./storage-provider.js";
import { StorageCapabilities } from "./capabilities.js";
import { StorageFile, StorageFolder, StorageListResult } from "./models.js";
import { StorageNotFoundError, StorageConflictError, StorageAccessDeniedError, StorageValidationError, StorageConfigError, StorageError } from "./errors.js";
import { refreshGoogleAccessToken, getServiceAccountAccessToken } from "./gdrive-auth.js";
import { createLogger } from "#logger";
import { nowIso, trimSlashes, trimLeadingSlashes, getBaseName, getFolderPath } from "#helpers";

const debugGDrive = createLogger('gdrive-provider');

function escapeGdriveQuery(str = '') {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export class GoogleDriveStorageProvider extends StorageProvider {
  constructor(name, config = {}) {
    super(name, config);
    this.rootFolderId = config.folder_id || config.root_folder_id || 'root';
    this._accessToken = config.access_token || null;
    this._tokenExpiry = config.expiry_date || 0;
    this._folderCache = new Map();
    this._setFolderCache('', this.rootFolderId);
    this._setFolderCache('.', this.rootFolderId);
    this._setFolderCache('/', this.rootFolderId);
  }

  _setFolderCache(path, id) {
    if (this._folderCache.size >= 500) {
      const oldestKey = this._folderCache.keys().next().value;
      this._folderCache.delete(oldestKey);
    }
    this._folderCache.set(path, { id, expires: Date.now() + 300000 });
  }

  _getFolderCache(path) {
    const entry = this._folderCache.get(path);
    if (!entry) return null;
    if (typeof entry === 'object' && entry.expires && entry.expires < Date.now()) {
      this._folderCache.delete(path);
      return null;
    }
    return typeof entry === 'object' && entry.id ? entry.id : entry;
  }

  _invalidateFolderCache(prefix = '') {
    if (!prefix) {
      this._folderCache.clear();
      this._setFolderCache('', this.rootFolderId);
      this._setFolderCache('.', this.rootFolderId);
      this._setFolderCache('/', this.rootFolderId);
      return;
    }
    this._folderCache.delete(prefix);
    for (const k of this._folderCache.keys()) {
      if (k.startsWith(`${prefix}/`)) {
        this._folderCache.delete(k);
      }
    }
  }

  get type() {
    return 'gdrive';
  }

  get capabilities() {
    return new StorageCapabilities({
      multipart: false,
      resumable: false,
      nativeFolders: true,
      ranges: true,
      copy: true,
      move: true,
      search: true,
      directDownloadUrl: true,
      versioning: false,
      publicUrls: true,
      metadata: true
    });
  }

  async getAccessToken() {
    const now = Date.now();
    if (this._accessToken && this._tokenExpiry > now + 60000) {
      return this._accessToken;
    }

    const {
      client_id,
      client_secret,
      refresh_token,
      client_email,
      service_account_email,
      private_key,
      service_account_key
    } = this.config;

    // Refresh token flow
    if (client_id && client_secret && refresh_token) {
      debugGDrive('Refreshing OAuth access token for connection "%s"', this.name);
      const res = await refreshGoogleAccessToken({
        clientId: client_id,
        clientSecret: client_secret,
        refreshToken: refresh_token
      });
      this._accessToken = res.access_token;
      this._tokenExpiry = res.expiry_date;
      return this._accessToken;
    }

    // Service Account flow
    const email = client_email || service_account_email;
    const key = private_key || service_account_key;
    if (email && key) {
      debugGDrive('Fetching Service Account access token for "%s"', email);
      const res = await getServiceAccountAccessToken({
        clientEmail: email,
        privateKey: key
      });
      this._accessToken = res.access_token;
      this._tokenExpiry = res.expiry_date;
      return this._accessToken;
    }

    if (this._accessToken) {
      return this._accessToken;
    }

    throw new StorageConfigError(`Google Drive provider '${this.name}' has no valid credentials configured (missing refresh_token or service_account).`);
  }

  async _fetch(url, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const token = await this.getAccessToken();
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', `Bearer ${token}`);

      let response = await fetch(url, { ...options, headers });

      // Handle 401 token expiration retry once
      if (response.status === 401 && attempt === 0 && (this.config.refresh_token || this.config.client_email)) {
        debugGDrive('Received 401 from Google Drive API, retrying with refreshed token...');
        this._accessToken = null;
        this._tokenExpiry = 0;
        const newToken = await this.getAccessToken();
        headers.set('Authorization', `Bearer ${newToken}`);
        response = await fetch(url, { ...options, headers });
      }

      // Handle 429 Too Many Requests or 503/500 temporary service errors with exponential backoff
      if ((response.status === 429 || response.status === 503 || response.status === 500) && attempt < maxRetries) {
        attempt++;
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(300 * (2 ** (attempt - 1)) + Math.random() * 150, 4000);
        debugGDrive('Google Drive API rate limit/error (%s). Retrying attempt %s in %sms...', response.status, attempt, Math.round(delayMs));
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      return response;
    }
  }

  async _resolvePathToFolderId(path = '') {
    const cleanPath = trimSlashes(path);
    if (!cleanPath) return this.rootFolderId;
    const cached = this._getFolderCache(cleanPath);
    if (cached) return cached;

    const segments = cleanPath.split('/').filter(Boolean);
    let currentParentId = this.rootFolderId;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const segCached = this._getFolderCache(currentPath);
      if (segCached) {
        currentParentId = segCached;
        continue;
      }

      const q = `'${currentParentId}' in parents and name = '${escapeGdriveQuery(segment)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
      const res = await this._fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new StorageError(`Google Drive API error resolving folder '${segment}': ${data.error?.message || res.statusText}`);
      }

      if (!data.files || !data.files.length) {
        return null;
      }

      currentParentId = data.files[0].id;
      this._setFolderCache(currentPath, currentParentId);
    }

    return currentParentId;
  }

  async _ensureFolderPath(path = '') {
    const cleanPath = trimSlashes(path);
    if (!cleanPath) return this.rootFolderId;
    const cached = this._getFolderCache(cleanPath);
    if (cached) return cached;

    const segments = cleanPath.split('/').filter(Boolean);
    let currentParentId = this.rootFolderId;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const segCached = this._getFolderCache(currentPath);
      if (segCached) {
        currentParentId = segCached;
        continue;
      }

      const q = `'${currentParentId}' in parents and name = '${escapeGdriveQuery(segment)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
      const res = await this._fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new StorageError(`Google Drive API error checking folder '${segment}': ${data.error?.message || res.statusText}`);
      }

      if (data.files && data.files.length) {
        currentParentId = data.files[0].id;
      } else {
        debugGDrive('Creating Google Drive folder "%s" under parent "%s"', segment, currentParentId);
        const createRes = await this._fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: segment,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [currentParentId]
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          throw new StorageError(`Failed to create Google Drive folder '${segment}': ${createData.error?.message || createRes.statusText}`);
        }
        currentParentId = createData.id;
      }

      this._setFolderCache(currentPath, currentParentId);
    }

    return currentParentId;
  }

  async _resolveKeyToFile(key) {
    const cleanKey = trimLeadingSlashes(key);
    const folderPath = getFolderPath(cleanKey);
    const fileName = getBaseName(cleanKey);

    const folderId = await this._resolvePathToFolderId(folderPath);
    if (!folderId) return null;

    const q = `'${folderId}' in parents and name = '${escapeGdriveQuery(fileName)}' and trashed = false`;
    const fields = 'files(id,name,mimeType,size,modifiedTime,createdTime,md5Checksum,webViewLink,webContentLink,properties,parents)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1`;

    const res = await this._fetch(url);
    const data = await res.json();
    if (!res.ok || !data.files?.length) return null;

    return data.files[0];
  }

  // ---------------------------------------------------------------------------
  // Core Storage Operations
  // ---------------------------------------------------------------------------

  async checkHealth() {
    const startTime = Date.now();
    try {
      const url = 'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota';
      const res = await this._fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new StorageError(data.error?.message || res.statusText);
      }

      return {
        status: 'healthy',
        providerType: 'gdrive',
        responseTime: Date.now() - startTime,
        bucket: this.name,
        user: data.user?.emailAddress || data.user?.displayName || 'Google Account',
        storageQuota: data.storageQuota,
        checkedAt: nowIso()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        providerType: 'gdrive',
        error: error.message,
        bucket: this.name,
        checkedAt: nowIso()
      };
    }
  }

  async listFiles(prefix = '', options = {}) {
    try {
      const {
        maxKeys = 1000,
        continuationToken = null
      } = options;

      const cleanPrefix = trimSlashes(prefix);
      const parentId = await this._resolvePathToFolderId(cleanPrefix);

      if (!parentId) {
        return new StorageListResult({
          contents: [],
          commonPrefixes: [],
          totalFiles: 0,
          isTruncated: false,
          nextToken: null
        });
      }

      const q = `'${parentId}' in parents and trashed = false`;
      const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,md5Checksum,webViewLink,webContentLink,properties)';
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=${Math.min(maxKeys, 1000)}&orderBy=folder,name`;

      if (continuationToken) {
        url += `&pageToken=${encodeURIComponent(continuationToken)}`;
      }

      const res = await this._fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new StorageError(`Google Drive list files failed: ${data.error?.message || res.statusText}`);
      }

      const contents = [];
      const commonPrefixes = [];
      const prefixPath = cleanPrefix ? `${cleanPrefix}/` : '';

      for (const item of (data.files || [])) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          const folderPrefix = `${prefixPath}${item.name}/`;
          commonPrefixes.push(new StorageFolder({
            prefix: folderPrefix,
            id: item.id,
            provider: 'gdrive'
          }));
          this._folderCache.set(trimSlashes(folderPrefix), item.id);
        } else {
          const itemKey = `${prefixPath}${item.name}`;
          contents.push(new StorageFile({
            key: itemKey,
            size: parseInt(item.size || 0, 10),
            lastModified: item.modifiedTime || item.createdTime || Date.now(),
            createdAt: item.createdTime,
            etag: item.md5Checksum ? `"${item.md5Checksum}"` : `"${item.id}"`,
            storageClass: 'GOOGLE_DRIVE',
            provider: 'gdrive',
            id: item.id,
            nativeId: item.id,
            mimeType: item.mimeType,
            webViewLink: item.webViewLink,
            webContentLink: item.webContentLink,
            metadata: item.properties || {}
          }));
        }
      }

      return new StorageListResult({
        contents,
        commonPrefixes,
        nextToken: data.nextPageToken || null,
        isTruncated: Boolean(data.nextPageToken),
        totalFiles: contents.length
      });
    } catch (error) {
      debugGDrive('List files failed for prefix "%s": %s', prefix, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`List files failed: ${error.message}`);
    }
  }

  async uploadFile(key, fileBuffer, contentType = 'application/octet-stream', options = {}) {
    try {
      if (!key || !fileBuffer) throw new StorageValidationError('Key and file buffer are required');

      const cleanKey = trimLeadingSlashes(key);
      const folderPath = getFolderPath(cleanKey);
      const fileName = getBaseName(cleanKey);
      const { metadata = {}, preventOverwrite = false } = options;

      const parentFolderId = await this._ensureFolderPath(folderPath);

      // Check if file already exists
      const existing = await this._resolveKeyToFile(cleanKey);
      if (existing) {
        if (preventOverwrite) {
          throw new StorageConflictError('File already exists');
        }
      }

      debugGDrive('Uploading to Google Drive: name="%s", folder="%s", size=%s', fileName, parentFolderId, fileBuffer.length);

      const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
      const uploadedAt = nowIso();

      const boundary = `-------mbkbucket_gdrive_${Date.now()}`;
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadataPart = {
        name: fileName,
        description: metadata.description || 'Uploaded via MBKBucket',
        properties: {
          'uploaded-at': uploadedAt,
          'upload-source': 'web-portal',
          ...metadata
        },
        ...(!existing && { parents: [parentFolderId] })
      };

      const metaHeader = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataPart)}`;
      const mediaHeader = `Content-Type: ${contentType}\r\n\r\n`;

      const bodyPayload = Buffer.concat([
        Buffer.from(delimiter + metaHeader + delimiter + mediaHeader),
        buffer,
        Buffer.from(closeDelimiter)
      ]);

      const uploadUrl = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink`;

      const method = existing ? 'PATCH' : 'POST';
      const res = await this._fetch(uploadUrl, {
        method,
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(bodyPayload.length)
        },
        body: bodyPayload
      });

      const data = await res.json();
      if (!res.ok) {
        throw new StorageError(`Google Drive upload failed: ${data.error?.message || res.statusText}`);
      }

      return {
        key: cleanKey,
        fileSize: buffer.length,
        contentType,
        uploadedAt,
        id: data.id,
        webViewLink: data.webViewLink,
        webContentLink: data.webContentLink
      };
    } catch (error) {
      debugGDrive('Upload failed for key "%s": %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Upload failed: ${error.message}`);
    }
  }

  async downloadFile(key, options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');
      const cleanKey = trimLeadingSlashes(key);

      const file = await this._resolveKeyToFile(cleanKey);
      if (!file) {
        throw new StorageNotFoundError(`File not found: ${cleanKey}`);
      }

      const { range, ifNoneMatch, ifModifiedSince } = options;
      const headers = {};

      if (range) headers['Range'] = range;
      if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;
      if (ifModifiedSince) headers['If-Modified-Since'] = new Date(ifModifiedSince).toUTCString();

      let downloadUrl;
      const isGoogleDoc = file.mimeType?.startsWith('application/vnd.google-apps.');

      if (isGoogleDoc) {
        const exportMime = file.mimeType.includes('spreadsheet')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : file.mimeType.includes('presentation')
            ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            : 'application/pdf';
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`;
      } else {
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      }

      const res = await this._fetch(downloadUrl, { headers });

      if (res.status === 304) {
        return { notModified: true, key: cleanKey };
      }

      if (!res.ok) {
        if (res.status === 404) throw new StorageNotFoundError(`File not found: ${cleanKey}`);
        if (res.status === 403) throw new StorageAccessDeniedError(`Access denied for file: ${cleanKey}`);
        const errText = await res.text().catch(() => '');
        throw new StorageError(`Download failed with status ${res.status}: ${errText}`);
      }

      const bodyStream = Readable.fromWeb(res.body);
      const contentLength = res.headers.get('content-length')
        ? parseInt(res.headers.get('content-length'), 10)
        : file.size ? parseInt(file.size, 10) : undefined;

      return {
        Body: bodyStream,
        ContentType: res.headers.get('content-type') || file.mimeType || 'application/octet-stream',
        ContentLength: contentLength,
        ETag: res.headers.get('etag') || (file.md5Checksum ? `"${file.md5Checksum}"` : `"${file.id}"`),
        LastModified: new Date(file.modifiedTime || Date.now()),
        key: cleanKey,
        id: file.id
      };
    } catch (error) {
      debugGDrive('Download failed for key "%s": %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Download failed: ${error.message}`);
    }
  }

  async deleteFile(key, _options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');
      const cleanKey = trimLeadingSlashes(key);

      const file = await this._resolveKeyToFile(cleanKey);
      if (!file) {
        return { key: cleanKey, deletedAt: nowIso(), notFound: true };
      }

      const url = `https://www.googleapis.com/drive/v3/files/${file.id}`;
      const res = await this._fetch(url, { method: 'DELETE' });

      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new StorageError(`Failed to delete Google Drive file: ${data.error?.message || res.statusText}`);
      }

      return { key: cleanKey, id: file.id, deletedAt: nowIso() };
    } catch (error) {
      debugGDrive('Delete file failed for key "%s": %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Delete failed: ${error.message}`);
    }
  }

  async deleteFolder(prefix, _options = {}) {
    try {
      if (!prefix) throw new StorageValidationError('Prefix is required');
      const cleanPrefix = trimSlashes(prefix);

      const folderId = await this._resolvePathToFolderId(cleanPrefix);
      if (!folderId || folderId === this.rootFolderId) {
        return { deletedCount: 0, prefix: cleanPrefix, deletedAt: nowIso() };
      }

      const url = `https://www.googleapis.com/drive/v3/files/${folderId}`;
      const res = await this._fetch(url, { method: 'DELETE' });

      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        throw new StorageError(`Failed to delete Google Drive folder: ${data.error?.message || res.statusText}`);
      }

      this._invalidateFolderCache(cleanPrefix);

      return { deletedCount: 1, prefix: cleanPrefix, deletedAt: nowIso() };
    } catch (error) {
      debugGDrive('Delete folder failed for "%s": %s', prefix, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Delete folder failed: ${error.message}`);
    }
  }

  async createFolder(key, _options = {}) {
    try {
      const cleanKey = trimSlashes(key);
      const folderId = await this._ensureFolderPath(cleanKey);
      return { key: `${cleanKey}/`, id: folderId, success: true, message: 'Folder created' };
    } catch (error) {
      debugGDrive('Create folder failed for "%s": %s', key, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Create folder failed: ${error.message}`);
    }
  }

  async getFileMetadata(key, _options = {}) {
    try {
      if (!key) throw new StorageValidationError('Key is required');
      const cleanKey = trimLeadingSlashes(key);

      const file = await this._resolveKeyToFile(cleanKey);
      const queriedAt = nowIso();

      if (!file) {
        return { key: cleanKey, exists: false, queriedAt };
      }

      return {
        key: cleanKey,
        exists: true,
        id: file.id,
        ContentLength: file.size ? parseInt(file.size, 10) : 0,
        ContentType: file.mimeType || 'application/octet-stream',
        LastModified: new Date(file.modifiedTime || file.createdTime || Date.now()),
        ETag: file.md5Checksum ? `"${file.md5Checksum}"` : `"${file.id}"`,
        Metadata: file.properties || {},
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        queriedAt
      };
    } catch (error) {
      debugGDrive('Get file metadata failed for "%s": %s', key, error.message);
      return { key, exists: false, queriedAt: nowIso(), error: error.message };
    }
  }

  async copyFile(sourceKey, destKey, _options = {}) {
    this.assertCapability('copy', 'copyFile');
    try {
      const srcClean = trimLeadingSlashes(sourceKey);
      const dstClean = trimLeadingSlashes(destKey);

      const file = await this._resolveKeyToFile(srcClean);
      if (!file) throw new StorageNotFoundError(`Source file not found: ${srcClean}`);

      const dstFolder = getFolderPath(dstClean);
      const dstName = getBaseName(dstClean);
      const targetFolderId = await this._ensureFolderPath(dstFolder);

      const copyUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/copy`;
      const res = await this._fetch(copyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dstName,
          parents: [targetFolderId]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new StorageError(`Failed to copy Google Drive file: ${data.error?.message || res.statusText}`);
      }

      return { sourceKey: srcClean, destKey: dstClean, id: data.id, copiedAt: nowIso() };
    } catch (error) {
      debugGDrive('Copy failed from "%s" to "%s": %s', sourceKey, destKey, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Copy failed: ${error.message}`);
    }
  }

  async moveFile(sourceKey, destKey, _options = {}) {
    this.assertCapability('move', 'moveFile');
    try {
      const srcClean = trimLeadingSlashes(sourceKey);
      const dstClean = trimLeadingSlashes(destKey);

      const file = await this._resolveKeyToFile(srcClean);
      if (!file) throw new StorageNotFoundError(`Source file not found: ${srcClean}`);

      const dstFolder = getFolderPath(dstClean);
      const dstName = getBaseName(dstClean);
      const targetFolderId = await this._ensureFolderPath(dstFolder);
      const currentParentId = file.parents?.[0] || this.rootFolderId;

      const updateUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?addParents=${targetFolderId}&removeParents=${currentParentId}&fields=id,name,parents`;
      const res = await this._fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dstName })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new StorageError(`Failed to move Google Drive file: ${data.error?.message || res.statusText}`);
      }

      return { sourceKey: srcClean, destKey: dstClean, id: data.id, movedAt: nowIso() };
    } catch (error) {
      debugGDrive('Move failed from "%s" to "%s": %s', sourceKey, destKey, error.message);
      if (error instanceof StorageError) throw error;
      throw new StorageError(`Move failed: ${error.message}`);
    }
  }
}
