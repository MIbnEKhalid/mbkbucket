/**
 * MBKBucket - Normalized Storage Data Models
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { nowIso, getBaseName, getFolderPath, trimLeadingSlashes, trimSlashes } from "#helpers";

export class StorageItem {
  constructor(props = {}) {
    const rawPath = String(props.path || props.key || props.Key || props.prefix || props.Prefix || '');
    this.path = props.type === 'folder'
      ? (rawPath ? (rawPath.endsWith('/') ? rawPath : `${rawPath}/`) : '')
      : trimLeadingSlashes(rawPath);

    this.type = props.type || (this.path.endsWith('/') ? 'folder' : 'file');
    this.name = props.name || (this.type === 'folder' ? trimSlashes(getBaseName(this.path.replace(/\/+$/, ''))) : getBaseName(this.path));
    this.parentPath = props.parentPath ?? (this.type === 'folder'
      ? trimSlashes(getFolderPath(this.path.replace(/\/+$/, '')))
      : trimSlashes(getFolderPath(this.path)));

    this.id = props.id || props.nativeId || this.path;
    this.nativeId = props.nativeId || props.id || null;
    this.provider = props.provider || props.storageClass || props.StorageClass || 'generic';

    this.size = this.type === 'folder' ? 0 : Number(props.size ?? props.Size ?? 0);
    this.mimeType = props.mimeType || props.contentType || props.ContentType || (this.type === 'folder' ? 'application/x-directory' : 'application/octet-stream');
    this.etag = props.etag || props.ETag || '';

    const modDate = props.lastModified || props.LastModified || props.updatedAt;
    this.lastModified = modDate instanceof Date ? modDate : new Date(modDate || Date.now());

    if (props.createdAt || props.createdTime) {
      const createDate = props.createdAt || props.createdTime;
      this.createdAt = createDate instanceof Date ? createDate : new Date(createDate);
    }

    this.metadata = Object.freeze({ ...(props.metadata || {}) });
  }

  get isFolder() {
    return this.type === 'folder';
  }

  get isFile() {
    return this.type === 'file';
  }
}

export class StorageFile extends StorageItem {
  constructor(props = {}) {
    const key = props.key || props.Key || props.path || '';
    super({
      ...props,
      type: 'file',
      path: key,
      size: props.size ?? props.Size ?? 0,
      mimeType: props.mimeType || props.contentType || props.ContentType,
      lastModified: props.lastModified || props.LastModified,
      etag: props.etag || props.ETag,
      provider: props.storageClass || props.StorageClass || props.provider || 'STANDARD',
      id: props.id,
      nativeId: props.id || props.nativeId
    });

    // Backward-compatible properties for S3 consumers
    this.Key = this.path;
    this.Size = this.size;
    this.LastModified = this.lastModified;
    this.ETag = this.etag;
    this.ContentType = this.mimeType;
    this.StorageClass = this.provider;

    if (props.id) this.id = props.id;
    if (props.mimeType) this.mimeType = props.mimeType;
    if (props.webViewLink) this.webViewLink = props.webViewLink;
    if (props.webContentLink) this.webContentLink = props.webContentLink;
  }
}

export class StorageFolder extends StorageItem {
  constructor(prefixOrProps, id) {
    const props = typeof prefixOrProps === 'object' && prefixOrProps !== null
      ? prefixOrProps
      : { prefix: prefixOrProps, id };

    const rawPrefix = String(props.prefix || props.Prefix || props.path || '');
    const cleanPrefix = rawPrefix ? (rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}/`) : '';

    super({
      ...props,
      type: 'folder',
      path: cleanPrefix,
      id: props.id || id,
      nativeId: props.id || id
    });

    // Backward-compatible property for S3 consumers
    this.Prefix = this.path;
    if (this.id) this.id = this.id;
  }
}

export class StorageListResult {
  constructor(props = {}) {
    this.Contents = props.contents || props.Contents || [];
    this.CommonPrefixes = props.commonPrefixes || props.CommonPrefixes || [];
    this.NextContinuationToken = props.nextToken ?? props.NextContinuationToken ?? null;
    this.nextToken = this.NextContinuationToken;
    this.IsTruncated = Boolean(props.isTruncated ?? props.IsTruncated ?? Boolean(this.NextContinuationToken));
    this.hasMore = this.IsTruncated;
    this.KeyCount = this.Contents.length;
    this.totalFiles = props.totalFiles ?? this.Contents.length;
    this.requestedAt = nowIso();

    this.files = this.Contents;
    this.folders = this.CommonPrefixes;
    this.items = [...this.CommonPrefixes, ...this.Contents];
  }
}
