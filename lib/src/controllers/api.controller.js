import { pipeline } from "stream/promises";
import { listfiles, uploadFile, deleteFile, deleteFiles, deleteFolder, downloadFile, getFileMetadata, fileExists, ensureKeyHasAppPrefix, ensurePrefix, createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload, listIncompleteMultipartUploads, cleanupIncompleteMultipartUploads } from "../services/s3.service.js";
import { sendApiError, classifyApiError } from "../utils/errors.js";
import { getBaseName, isSensitiveTextType, buildKey, normalizeKeyParam, getFolderPath, destroyStream } from "../utils/helpers.js";
import { createLogger } from "#logger";

const debugApi = createLogger('api');

function resolvePrefix(req, res, prefix) {
  try {
    return ensurePrefix(prefix);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
    return null;
  }
}

async function cleanupFolderMarker(folderPath, bucketName) {
  if (!folderPath) return;
  try {
    const meta = await getFileMetadata(folderPath, bucketName);
    if (meta.exists && (meta.ContentLength === 0 || meta.Metadata?.marker === 'true')) {
      await deleteFile(folderPath, bucketName);
      debugApi('Cleaned up folder marker: %s', folderPath);
    }
  } catch (err) {
    debugApi('Failed to clean up folder marker: %s', err.message);
  }
}

export async function cleanupUploads(req, res) {
  try {
    const { olderThanDays = 7, prefix = '' } = req.body;
    const days = parseInt(olderThanDays, 10);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({ success: false, error: 'olderThanDays must be a positive integer' });
    }

    debugApi('Starting cleanup of incomplete uploads older than %s days', days);
    const result = await cleanupIncompleteMultipartUploads(days, prefix, req.activeBucket);

    res.json({
      success: true,
      message: `Cleaned up ${result.abortedCount} incomplete multipart upload(s)`,
      ...result
    });
  } catch (error) {
    console.error('[mbkbucket] Cleanup failed:', error);
    return sendApiError(res, error, 'Cleanup failed');
  }
}

export async function listIncompleteUploads(req, res) {
  try {
    const { prefix = '' } = req.query;
    const uploads = await listIncompleteMultipartUploads(prefix, req.activeBucket);
    res.json({
      success: true,
      count: uploads.length,
      uploads: uploads.map(u => ({
        key: u.Key,
        uploadId: u.UploadId,
        initiated: u.Initiated,
        initiator: u.Initiator?.DisplayName
      }))
    });
  } catch (error) {
    console.error('[mbkbucket] Failed to list incomplete uploads:', error);
    return sendApiError(res, error, 'Failed to list incomplete uploads');
  }
}

export async function listFiles(req, res) {
  const { prefix = '', page = '1', search = '', recursive = 'true', token = '' } = req.query;
  const pageSize = 100;
  const bucketName = req.activeBucket;

  const effectivePrefix = resolvePrefix(req, res, prefix);
  if (effectivePrefix === null) return;

  const isSearch = Boolean(search && search.trim());
  const isRecursive = recursive === 'true';
  const useOptimizedListing = !isSearch && !isRecursive;

  try {
    let files = [];
    let folders = [];
    let nextContinuationToken = null;

    if (useOptimizedListing) {
      let listPrefix = effectivePrefix ? String(effectivePrefix).replace(/^\/+/, '') : '';
      if (listPrefix && !listPrefix.endsWith('/')) listPrefix += '/';

      const result = await listfiles(listPrefix, {
        continuationToken: token || undefined,
        delimiter: '/',
        maxKeys: 1000,
        bucketName
      });

      files = (result.Contents || []).filter(f => !f.Key.endsWith('/'));
      folders = (result.CommonPrefixes || [])
        .filter(p => p.Prefix !== listPrefix && p.Prefix !== effectivePrefix)
        .map(p => p.Prefix);
      nextContinuationToken = result.NextContinuationToken;

      return res.json({
        success: true,
        files,
        folders,
        prefix: effectivePrefix,
        search,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: !!nextContinuationToken,
        hasPrevPage: false,
        nextContinuationToken,
        mode: 'optimized',
        totalFiles: -1,
        paginationType: 'continuation-token'
      });
    }

    let continuationToken;
    do {
      const result = await listfiles(effectivePrefix, { continuationToken, bucketName });
      (result.Contents || []).forEach(file => {
        if (!file.Key.endsWith('/')) files.push(file);
      });
      continuationToken = result.nextToken;
    } while (continuationToken);

    if (!files.length && !search) {
      try {
        const rootResult = await listfiles('', { bucketName });
        if (rootResult.Contents?.length) files = rootResult.Contents;
      } catch (fallbackErr) {
        debugApi('Fallback root listing failed: %s', fallbackErr.message);
      }
    }

    if (isSearch) {
      const searchLower = search.trim().toLowerCase();
      files = files.filter(file => file.Key.toLowerCase().includes(searchLower));
    }

    const totalFiles = files.length;
    const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const paginatedFiles = files.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    res.json({
      success: true,
      files: paginatedFiles,
      folders: [],
      prefix: effectivePrefix,
      search,
      currentPage,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      nextPage: currentPage + 1,
      prevPage: Math.max(1, currentPage - 1),
      totalFiles
    });
  } catch (error) {
    console.error("Error listing files:", error);
    const mapped = classifyApiError(error, 'Error listing files');
    return res.status(mapped.status).json({
      success: false,
      code: mapped.code,
      error: mapped.message,
      files: [],
      totalFiles: 0
    });
  }
}

export async function uploadSingleFile(req, res) {
  try {
    const bucketName = req.activeBucket;
    if (!req.file) return res.status(400).json({ success: false, error: 'No file selected' });

    const effectivePrefix = resolvePrefix(req, res, req.body.prefix || '');
    if (effectivePrefix === null) return;

    const key = buildKey(effectivePrefix, req.file.originalname);
    const uploadOptions = {
      metadata: {
        'original-name': req.file.originalname,
        'upload-source': 'web-portal',
        'user-agent': req.headers['user-agent'] || 'unknown'
      },
      bucketName,
      preventOverwrite: true
    };

    try {
      await uploadFile(key, req.file.buffer, req.file.mimetype, uploadOptions);
      await cleanupFolderMarker(getFolderPath(key), bucketName);
      res.json({ success: true, message: 'File uploaded successfully', key });
    } catch (uploadError) {
      if (uploadError.message.includes('already exists')) {
        return res.status(409).json({ success: false, error: `File already exists: ${req.file.originalname}` });
      }
      throw uploadError;
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    return sendApiError(res, error, 'Upload failed');
  }
}

export async function initiateMultipartUpload(req, res) {
  try {
    const bucketName = req.activeBucket;
    const { fileName, prefix = '', contentType = 'application/octet-stream' } = req.body;
    if (!fileName) return res.status(400).json({ success: false, error: 'fileName is required' });

    const effectivePrefix = resolvePrefix(req, res, prefix);
    if (effectivePrefix === null) return;

    const key = buildKey(effectivePrefix, fileName);
    if (await fileExists(key, bucketName)) {
      return res.status(409).json({ success: false, error: `File already exists: ${fileName}` });
    }

    const result = await createMultipartUpload(key, contentType, {}, bucketName);
    return res.json({ success: true, uploadId: result.uploadId, key: result.key });
  } catch (err) {
    console.error('[mbkbucket] upload-init failed:', err);
    return sendApiError(res, err, 'upload-init failed');
  }
}

export async function uploadChunk(req, res) {
  try {
    const { uploadId, key, partNumber } = req.body;
    if (!req.file || !uploadId || !key || !partNumber) {
      return res.status(400).json({ success: false, error: 'chunk file, uploadId, key, and partNumber are required' });
    }
    const part = parseInt(partNumber, 10);
    if (isNaN(part) || part < 1 || part > 10000) {
      return res.status(400).json({ success: false, error: 'partNumber must be an integer between 1 and 10000' });
    }

    const result = await uploadPart(key, uploadId, part, req.file.buffer, req.activeBucket);
    return res.json({ success: true, partNumber: result.partNumber, ETag: result.ETag });
  } catch (err) {
    console.error('[mbkbucket] upload-chunk failed:', err);
    return sendApiError(res, err, 'upload-chunk failed');
  }
}

export async function completeUpload(req, res) {
  try {
    const bucketName = req.activeBucket;
    const { uploadId, key, parts } = req.body;
    if (!uploadId || !key || !Array.isArray(parts) || !parts.length) {
      return res.status(400).json({ success: false, error: 'uploadId, key, and parts array are required' });
    }

    const result = await completeMultipartUpload(key, uploadId, parts, bucketName);
    await cleanupFolderMarker(getFolderPath(result.key), bucketName);

    return res.json({ success: true, message: 'File uploaded successfully', key: result.key });
  } catch (err) {
    console.error('[mbkbucket] upload-complete failed:', err);
    return sendApiError(res, err, 'upload-complete failed');
  }
}

export async function abortUpload(req, res) {
  try {
    const { uploadId, key } = req.body;
    if (!uploadId || !key) return res.status(400).json({ success: false, error: 'uploadId and key are required' });

    await abortMultipartUpload(key, uploadId, req.activeBucket);
    return res.json({ success: true, message: 'Multipart upload aborted' });
  } catch (err) {
    console.error('[mbkbucket] upload-abort failed:', err);
    return sendApiError(res, err, 'upload-abort failed');
  }
}

export async function createFolder(req, res) {
  try {
    const bucketName = req.activeBucket;
    const { prefix = '', folderName } = req.body;
    if (!folderName) return res.status(400).json({ success: false, error: 'folderName is required' });

    const effectivePrefix = resolvePrefix(req, res, prefix);
    if (effectivePrefix === null) return;

    const cleanName = String(folderName).replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanPrefix = effectivePrefix.replace(/\/+$/, '');
    const folderKey = (effectivePrefix && !cleanName.startsWith(effectivePrefix))
      ? `${cleanPrefix}/${cleanName}/`
      : `${cleanName}/`;

    if (await fileExists(folderKey, bucketName)) {
      return res.status(409).json({ success: false, error: 'Folder already exists' });
    }

    const existingFiles = await listfiles(folderKey, { maxKeys: 1, bucketName });
    if (existingFiles.Contents?.length) {
      return res.json({ success: true, message: 'Folder already exists with content', key: folderKey, skipMarker: true });
    }

    await uploadFile(folderKey, Buffer.alloc(0), 'application/x-empty', {
      metadata: { folder: 'true', marker: 'true' },
      bucketName
    });

    return res.json({ success: true, message: 'Folder created', key: folderKey });
  } catch (err) {
    console.error('Create folder failed:', err);
    return sendApiError(res, err, 'Create folder failed');
  }
}

export async function deleteItems(req, res) {
  try {
    const bucketName = req.activeBucket;
    const { key, keys, folder } = req.body;

    if (keys && Array.isArray(keys) && keys.length) {
      await deleteFiles(keys, bucketName);
      return res.json({ success: true, message: 'Files deleted successfully' });
    }

    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });

    let keyToDelete;
    try {
      keyToDelete = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }

    if (folder === true || String(keyToDelete).endsWith('/')) {
      await deleteFolder(keyToDelete, bucketName);
      return res.json({ success: true, message: 'Folder deleted successfully' });
    }

    await deleteFile(keyToDelete, bucketName);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error("Error deleting file:", error);
    return sendApiError(res, error, 'Delete failed');
  }
}

export async function downloadFileHandler(req, res) {
  let aborted = false;
  req.once('aborted', () => { aborted = true; });
  req.once('close', () => { aborted = true; });

  try {
    const key = normalizeKeyParam(req.params.key);
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }

    if (aborted) return;

    const result = await downloadFile(keyToUse, { bucketName: req.activeBucket });
    if (aborted) {
      destroyStream(result.Body);
      return;
    }

    const fileName = getBaseName(keyToUse).replace(/"/g, '\\"');
    const contentType = result.ContentType || 'application/octet-stream';
    const contentLength = result.ContentLength;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (result.ETag) res.setHeader('ETag', result.ETag);
    if (result.LastModified) res.setHeader('Last-Modified', result.LastModified.toUTCString());

    const isSensitive = isSensitiveTextType(contentType);
    const isLargeFile = Number(contentLength || 0) > 50 * 1024 * 1024;
    res.setHeader('Cache-Control', isSensitive ? 'private, no-store' : isLargeFile ? 'private, max-age=600, must-revalidate' : 'private, max-age=1800, must-revalidate');

    try {
      await pipeline(result.Body, res);
    } catch (pipeErr) {
      if (aborted) {
        destroyStream(result.Body);
        return;
      }
      throw pipeErr;
    }
  } catch (error) {
    if (aborted) return;
    console.error("Error downloading file:", error);
    if (error.message?.includes('File not found')) {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.message?.includes('Access denied')) {
      res.status(403).json({ message: "Access denied" });
    } else if (!res.headersSent) {
      res.status(500).json({ message: "Download failed", error: error.message });
    }
  }
}
