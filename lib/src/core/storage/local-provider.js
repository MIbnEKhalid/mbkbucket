/**
 * MBKBucket - Local Filesystem Storage Provider
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { StorageProvider } from "./storage-provider.js";
import { StorageCapabilities } from "./capabilities.js";
import { StorageValidationError, StorageNotFoundError, StorageError } from "./errors.js";
import { StorageListResult } from "./models.js";
import { nowIso, getFileExt, trimLeadingSlashes, formatBytes } from "#helpers";
import { createLogger } from "#logger";


const debugLocal = createLogger('local-provider');

function sanitizeKey(key = '') {
  return trimLeadingSlashes(String(key || '')).replace(/\\/g, '/');
}

function getMimeType(key = '') {
  const ext = getFileExt(key);
  const mimeMap = {
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    zip: 'application/zip'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export class LocalStorageProvider extends StorageProvider {

  constructor(name, config = {}) {
    super(name, config);
    const rawPath = config.basePath || config.rootPath || config.directory || './mbkbucket_storage';
    this.baseDirectory = path.resolve(process.cwd(), rawPath);

    // Ensure base directory exists on construction
    try {
      if (!fs.existsSync(this.baseDirectory)) {
        fs.mkdirSync(this.baseDirectory, { recursive: true });
      }
    } catch (err) {
      debugLocal('Could not initialize base directory %s: %s', this.baseDirectory, err.message);
    }
  }

  get type() {
    return 'local';
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
      directDownloadUrl: false,
      versioning: false,
      publicUrls: false,
      storageQuota: true,
      deleteBatch: true,
      metadata: true
    });
  }

  resolvePath(key) {
    const raw = String(key || '').trim();
    const cleanKey = sanitizeKey(raw);

    // Guard against Windows drive letters (C:) and root escapes
    if (/^[a-zA-Z]:/.test(cleanKey) || /^[a-zA-Z]:/.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
      if (raw !== cleanKey && !cleanKey) {
        throw new StorageValidationError(`Invalid storage key: path traversal or root escape detected for "${key}"`);
      }
    }

    const resolvedPath = path.resolve(this.baseDirectory, cleanKey);

    // Verify resolved path stays strictly inside base directory across OSes
    const relative = path.relative(this.baseDirectory, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new StorageValidationError(`Invalid storage key: path traversal detected for "${key}"`);
    }

    return { resolvedPath, relativeKey: cleanKey.replace(/\\/g, '/') };
  }


  async listFiles(prefix = '', options = {}) {
    const cleanPrefix = sanitizeKey(prefix || '');
    const { resolvedPath: dirPath } = this.resolvePath(cleanPrefix);
    const isRecursive = options.recursive === true || options.recursive === 'true';
    const delimiter = options.delimiter || (isRecursive ? '' : '/');
    const search = (options.search || '').trim().toLowerCase();
    const maxKeys = Math.max(1, Math.min(Number(options.maxKeys) || 1000, 5000));
    const token = options.continuationToken || options.token || null;

    if (!fs.existsSync(dirPath)) {
      return new StorageListResult({
        contents: [],
        commonPrefixes: [],
        nextToken: null,
        isTruncated: false,
        totalFiles: 0
      });
    }

    const files = [];
    const folders = [];
    const seenFolders = new Set();

    const scanDirectory = (currentDir, currentPrefix) => {
      let entries = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (err) {
        debugLocal('Failed reading directory %s: %s', currentDir, err.message);
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativeKey = path.relative(this.baseDirectory, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          const folderPrefix = relativeKey.endsWith('/') ? relativeKey : `${relativeKey}/`;
          
          if (delimiter === '/') {
            if (!seenFolders.has(folderPrefix)) {
              seenFolders.add(folderPrefix);
              folders.push({
                name: entry.name,
                prefix: folderPrefix,
                path: folderPrefix
              });
            }
          } else {
            if (!seenFolders.has(folderPrefix)) {
              seenFolders.add(folderPrefix);
              folders.push({
                name: entry.name,
                prefix: folderPrefix,
                path: folderPrefix
              });
            }
            if (isRecursive) {
              scanDirectory(fullPath, folderPrefix);
            }
          }
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            const fileName = entry.name;
            const matchesSearch = !search || fileName.toLowerCase().includes(search) || relativeKey.toLowerCase().includes(search);

            if (matchesSearch) {
              files.push({
                Key: relativeKey,
                Size: stat.size,
                LastModified: stat.mtime.toISOString(),
                ETag: `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`,
                ContentType: getMimeType(fileName),
                name: fileName,
                sizeFormatted: formatBytes(stat.size)
              });
            }
          } catch (err) {
            debugLocal('Error reading file stat %s: %s', fullPath, err.message);
          }
        }
      }
    };

    scanDirectory(dirPath, cleanPrefix);

    // Sort alphabetically
    files.sort((a, b) => a.Key.localeCompare(b.Key));
    folders.sort((a, b) => a.prefix.localeCompare(b.prefix));

    // Simple token-based pagination
    let startIndex = 0;
    if (token) {
      const idx = files.findIndex(f => f.Key === token);
      if (idx !== -1) startIndex = idx + 1;
    }

    const paginatedFiles = files.slice(startIndex, startIndex + maxKeys);
    const isTruncated = (startIndex + maxKeys) < files.length;
    const nextContinuationToken = isTruncated && paginatedFiles.length > 0
      ? paginatedFiles[paginatedFiles.length - 1].Key
      : null;

    return new StorageListResult({
      contents: paginatedFiles,
      commonPrefixes: folders.map(f => ({ Prefix: f.prefix || f })),
      nextToken: nextContinuationToken,
      isTruncated,
      totalFiles: files.length
    });
  }


  async uploadFile(key, fileBuffer, contentType, options = {}) {
    if (!key) throw new StorageValidationError("Storage key is required for upload");
    const { resolvedPath, relativeKey } = this.resolvePath(key);
    const dir = path.dirname(resolvedPath);

    try {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      if (fileBuffer instanceof Readable) {
        const outStream = fs.createWriteStream(resolvedPath);
        await new Promise((resolve, reject) => {
          fileBuffer.pipe(outStream);
          outStream.on('finish', resolve);
          outStream.on('error', reject);
          fileBuffer.on('error', reject);
        });
      } else {
        const buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        await fs.promises.writeFile(resolvedPath, buffer);
      }

      const stat = await fs.promises.stat(resolvedPath);
      const mime = contentType || getMimeType(key);
      const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;

      return {
        key: relativeKey,
        Key: relativeKey,
        size: stat.size,
        Size: stat.size,
        etag,
        ETag: etag,
        contentType: mime,
        ContentType: mime,
        uploadedAt: nowIso(),
        storageType: 'local'
      };
    } catch (err) {
      debugLocal('Upload error for key %s: %s', key, err.message);
      throw new StorageError(`Local upload failed: ${err.message}`);
    }
  }

  async downloadFile(key, options = {}) {
    if (!key) throw new StorageValidationError("Storage key is required for download");
    const { resolvedPath, relativeKey } = this.resolvePath(key);

    try {
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) {
        throw new StorageValidationError(`Key "${key}" refers to a directory, not a file`);
      }

      let start = 0;
      let end = stat.size - 1;
      let isRange = false;

      if (options.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(String(options.range).trim());
        if (match) {
          const rawStart = match[1];
          const rawEnd = match[2];
          if (rawStart !== '') start = parseInt(rawStart, 10);
          if (rawEnd !== '') end = parseInt(rawEnd, 10);
          isRange = true;
        }
      } else if (typeof options.start === 'number' || typeof options.end === 'number') {
        if (typeof options.start === 'number') start = options.start;
        if (typeof options.end === 'number') end = options.end;
        isRange = true;
      }

      if (isRange) {
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= stat.size) end = stat.size - 1;
        if (start > end) start = end;
      }

      const stream = fs.createReadStream(resolvedPath, isRange ? { start, end } : undefined);
      const contentType = getMimeType(key);
      const contentLength = isRange ? (end - start + 1) : stat.size;
      const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;

      return {
        Body: stream,
        stream,
        ContentType: contentType,
        ContentLength: contentLength,
        LastModified: stat.mtime,
        ETag: etag,
        isRange,
        contentRange: isRange ? `bytes ${start}-${end}/${stat.size}` : null
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new StorageNotFoundError(`File not found: ${key}`);
      }
      throw new StorageError(`Local download failed: ${err.message}`);
    }

  }

  async deleteFile(key) {
    if (!key) throw new StorageValidationError("Storage key is required for delete");
    const { resolvedPath, relativeKey } = this.resolvePath(key);

    try {
      await fs.promises.unlink(resolvedPath);
      return { key: relativeKey, deleted: true, deletedAt: nowIso() };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { key: relativeKey, deleted: false, reason: 'notFound' };
      }
      throw new StorageError(`Local delete failed: ${err.message}`);
    }
  }

  async deleteFolder(prefix) {
    if (!prefix) throw new StorageValidationError("Prefix is required for deleteFolder");
    const { resolvedPath, relativeKey } = this.resolvePath(prefix);

    try {
      if (fs.existsSync(resolvedPath)) {
        await fs.promises.rm(resolvedPath, { recursive: true, force: true });
      }
      return { prefix: relativeKey, deleted: true, deletedAt: nowIso() };
    } catch (err) {
      throw new StorageError(`Local deleteFolder failed: ${err.message}`);
    }
  }

  async createFolder(prefix) {
    if (!prefix) throw new StorageValidationError("Prefix is required for createFolder");
    const { resolvedPath, relativeKey } = this.resolvePath(prefix);

    try {
      await fs.promises.mkdir(resolvedPath, { recursive: true });
      return { prefix: relativeKey, created: true, createdAt: nowIso() };
    } catch (err) {
      throw new StorageError(`Local createFolder failed: ${err.message}`);
    }
  }

  async getFileMetadata(key) {
    if (!key) throw new StorageValidationError("Storage key is required for metadata");
    const { resolvedPath, relativeKey } = this.resolvePath(key);

    try {
      const stat = await fs.promises.stat(resolvedPath);
      const isDir = stat.isDirectory();
      const contentType = isDir ? 'application/x-directory' : getMimeType(key);
      const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;

      return {
        exists: true,
        Key: relativeKey,
        ContentLength: isDir ? 0 : stat.size,
        LastModified: stat.mtime,
        ContentType: contentType,
        ETag: etag,
        isDirectory: isDir,
        Metadata: {}
      };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { exists: false, Key: relativeKey };
      }
      throw new StorageError(`Local getFileMetadata failed: ${err.message}`);
    }
  }

  async copyFile(sourceKey, destKey) {
    if (!sourceKey || !destKey) throw new StorageValidationError("sourceKey and destKey are required for copy");
    const { resolvedPath: srcPath, relativeKey: srcRel } = this.resolvePath(sourceKey);
    const { resolvedPath: dstPath, relativeKey: dstRel } = this.resolvePath(destKey);

    try {
      const dstDir = path.dirname(dstPath);
      if (!fs.existsSync(dstDir)) {
        await fs.promises.mkdir(dstDir, { recursive: true });
      }

      await fs.promises.copyFile(srcPath, dstPath);
      return { sourceKey: srcRel, destKey: dstRel, copiedAt: nowIso() };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new StorageNotFoundError(`Source file not found: ${sourceKey}`);
      }
      throw new StorageError(`Local copy failed: ${err.message}`);
    }
  }

  async moveFile(sourceKey, destKey) {
    if (!sourceKey || !destKey) throw new StorageValidationError("sourceKey and destKey are required for move");
    const { resolvedPath: srcPath, relativeKey: srcRel } = this.resolvePath(sourceKey);
    const { resolvedPath: dstPath, relativeKey: dstRel } = this.resolvePath(destKey);

    try {
      const dstDir = path.dirname(dstPath);
      if (!fs.existsSync(dstDir)) {
        await fs.promises.mkdir(dstDir, { recursive: true });
      }

      try {
        await fs.promises.rename(srcPath, dstPath);
      } catch (renameErr) {
        // Fallback for cross-device moves
        await fs.promises.copyFile(srcPath, dstPath);
        await fs.promises.unlink(srcPath);
      }

      return { sourceKey: srcRel, destKey: dstRel, movedAt: nowIso() };
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new StorageNotFoundError(`Source file not found: ${sourceKey}`);
      }
      throw new StorageError(`Local move failed: ${err.message}`);
    }
  }

  async getStorageQuota() {
    let totalBytes = 0;
    let fileCount = 0;

    const calculateSize = (dir) => {
      try {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            calculateSize(fullPath);
          } else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            totalBytes += stat.size;
            fileCount++;
          }
        }
      } catch {}
    };

    calculateSize(this.baseDirectory);

    return {
      usedBytes: totalBytes,
      fileCount,
      usedFormatted: formatBytes(totalBytes),
      path: this.baseDirectory
    };
  }

  async checkHealth() {
    const startTime = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const testFile = path.join(this.baseDirectory, `.health_${process.pid}_${Date.now()}_${rand}.tmp`);
    try {
      if (!fs.existsSync(this.baseDirectory)) {
        await fs.promises.mkdir(this.baseDirectory, { recursive: true });
      }
      // Test read/write permission with a temporary marker file
      await fs.promises.writeFile(testFile, 'ok');
      try { await fs.promises.unlink(testFile); } catch {}

      return {
        status: 'healthy',
        type: 'local',
        baseDirectory: this.baseDirectory,
        responseTime: Date.now() - startTime,
        checkedAt: nowIso()
      };
    } catch (err) {
      try { if (fs.existsSync(testFile)) await fs.promises.unlink(testFile); } catch {}
      return {
        status: 'unhealthy',
        type: 'local',
        baseDirectory: this.baseDirectory,
        error: err.message,
        responseTime: Date.now() - startTime,
        checkedAt: nowIso()
      };
    }
  }

}