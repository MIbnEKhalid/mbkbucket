/**
 * MBKBucket - Normalized Storage Data Models
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import { nowIso } from "#helpers";

/**
 * Standardized file item representation across all providers.
 */
export class StorageFile {
  /**
   * @param {object} props
   * @param {string} props.key - Normalized virtual key / path
   * @param {number} [props.size=0] - File size in bytes
   * @param {Date|string} [props.lastModified] - Last modified timestamp
   * @param {string} [props.etag] - Entity tag / checksum
   * @param {string} [props.contentType] - MIME content type
   * @param {string} [props.storageClass] - Storage tier / provider type
   * @param {string} [props.id] - Native provider ID (e.g. Google Drive file ID)
   * @param {string} [props.webViewLink] - Web preview link
   * @param {string} [props.webContentLink] - Direct download link
   * @param {object} [props.metadata={}] - Custom user metadata
   */
  constructor(props) {
    this.Key = props.key || props.Key || '';
    this.Size = Number(props.size ?? props.Size ?? 0);
    this.LastModified = props.lastModified instanceof Date
      ? props.lastModified
      : new Date(props.lastModified || props.LastModified || Date.now());
    this.ETag = props.etag || props.ETag || '';
    this.ContentType = props.contentType || props.ContentType || 'application/octet-stream';
    this.StorageClass = props.storageClass || props.StorageClass || 'STANDARD';
    if (props.id) this.id = props.id;
    if (props.mimeType) this.mimeType = props.mimeType;
    if (props.webViewLink) this.webViewLink = props.webViewLink;
    if (props.webContentLink) this.webContentLink = props.webContentLink;
    if (props.metadata) this.metadata = props.metadata;
  }
}

/**
 * Standardized folder representation.
 */
export class StorageFolder {
  /**
   * @param {string} prefix - Folder prefix with trailing slash
   * @param {string} [id] - Native provider folder ID
   */
  constructor(prefix, id) {
    this.Prefix = String(prefix || '').endsWith('/') ? String(prefix) : `${prefix}/`;
    if (id) this.id = id;
  }
}

/**
 * Standardized paginated listing result.
 */
export class StorageListResult {
  /**
   * @param {object} props
   * @param {StorageFile[]} [props.contents=[]]
   * @param {StorageFolder[]} [props.commonPrefixes=[]]
   * @param {string|null} [props.nextToken=null]
   * @param {boolean} [props.isTruncated=false]
   * @param {number} [props.totalFiles]
   */
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
  }
}
