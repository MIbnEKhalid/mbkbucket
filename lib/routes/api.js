import express from "express";
import { validateSessionAndRole,  } from "mbkauthe";
import { listfiles, uploadFile, deleteFile, deleteFiles, deleteFolder, downloadFile, getFileMetadata, fileExists, ensureKeyHasAppPrefix, ensurePrefix, getAppName, createMultipartUpload, uploadPart, completeMultipartUpload, abortMultipartUpload, listIncompleteMultipartUploads, cleanupIncompleteMultipartUploads } from "../s3.js";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// API endpoint for multipart upload cleanup
router.post('/api/cleanup-uploads', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { olderThanDays = 7, prefix = '' } = req.body;

    // Validate olderThanDays
    const days = parseInt(olderThanDays, 10);
    if (isNaN(days) || days < 1) {
      return res.status(400).json({ success: false, error: 'olderThanDays must be a positive integer' });
    }

    console.log(`[mbkbucket] Starting cleanup of incomplete uploads older than ${days} days`);
    const result = await cleanupIncompleteMultipartUploads(days, prefix);

    res.json({
      success: true,
      message: `Cleaned up ${result.abortedCount} incomplete multipart upload(s)`,
      ...result
    });
  } catch (error) {
    console.error('[mbkbucket] Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to list incomplete multipart uploads
router.get('/api/incomplete-uploads', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { prefix = '' } = req.query;
    const uploads = await listIncompleteMultipartUploads(prefix);

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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint for fetching files
router.get('/api/files', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  const { prefix = '', page = '1', search = '', recursive = 'true', token = '' } = req.query;
  const pageSize = 100;
  let effectivePrefix;
  try {
    effectivePrefix = ensurePrefix(prefix);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }

  // Determine mode: Optimized (Folder View, No Search) vs Legacy/Deep (Flat View or Search)
  const isSearch = search && search.trim().length > 0;
  // If recursive is explicitly 'false', we respect it. Default to true if missing (though frontend should send it)
  // Logic: Optimization works only if NOT recursive and NOT searching.
  const isRecursive = recursive === 'true';
  const useOptimizedListing = !isSearch && !isRecursive;

  try {
    let files = [];
    let folders = []; // For CommonPrefixes (subfolders)
    let nextContinuationToken = null;
    let usedPrefix = effectivePrefix;
    let legacyFallback = false;

    if (useOptimizedListing) {
      // --- OPTIMIZED PATH: S3 Delimiter (Folder View) ---
      // We process only one page from S3. This reduces API calls significantly.

      // FIX: Ensure root listing uses trailing slash to prevent "app-name" matching "app-name-backup"
      // and ensure directory browsing works correctly if ensurePrefix didn't append slash (which it now does if present in input).
      // But for root, input is empty, ensurePrefix returns "app", so we force "app/" here.
      let listPrefix = effectivePrefix;
      if (listPrefix === getAppName() && !listPrefix.endsWith('/')) {
        listPrefix += '/';
      }

      const result = await listfiles(listPrefix, {
        continuationToken: token || undefined, // Use token from query if provided
        delimiter: '/',
        maxKeys: 1000 // Fetch a healthy batch.
      });

      files = result.Contents || [];
      // Filter out folder marker objects (zero-byte files ending with /)
      files = files.filter(f => !f.Key.endsWith('/'));
      // S3 returns CommonPrefixes for folders when delimiter is used
      folders = (result.CommonPrefixes || []).map(p => p.Prefix).filter(p => p !== effectivePrefix);
      nextContinuationToken = result.NextContinuationToken;

      // Note: In optimized mode, totalFiles is unknown without scanning everything.
    } else {
      // --- LEGACY PATH: Recursive Scan (Search or Flat View) ---
      let continuationToken = undefined;

      // Fetch all files recursively (handling S3 pagination)
      do {
        const result = await listfiles(effectivePrefix, { continuationToken });
        if (result.Contents) {
          // Filter out folder marker objects (zero-byte files ending with /)
          const actualFiles = result.Contents.filter(f => !f.Key.endsWith('/'));
          files = files.concat(actualFiles);
        }
        continuationToken = result.nextToken;
      } while (continuationToken);

      // If no files found under the app prefixed path, try root as a legacy fallback
      if (!files.length && !search) {
        try {
          const rootResult = await listfiles('');
          if ((rootResult.Contents || []).length) {
            files = rootResult.Contents || [];
            usedPrefix = '';
            legacyFallback = true;
          }
        } catch (fallbackErr) {
          console.warn('Fallback root listing failed:', fallbackErr.message);
        }
      }

      // Apply search filter if provided
      if (isSearch) {
        const searchLower = search.toLowerCase();
        files = files.filter(file => {
          return file.Key.toLowerCase().includes(searchLower);
        });
      }
    }

    // Response Construction
    if (useOptimizedListing) {
      res.json({
        success: true,
        files: files,
        folders: folders,
        prefix: effectivePrefix,
        search: search,
        // In optimized mode, we use token-based pagination, not page numbers
        currentPage: 1,
        totalPages: 1, // Always 1 since we use continuation tokens instead
        hasNextPage: !!nextContinuationToken,
        hasPrevPage: false, // Token-based pagination doesn't support backwards navigation
        nextContinuationToken: nextContinuationToken,
        mode: 'optimized',
        totalFiles: -1, // Unknown in optimized mode without full scan
        paginationType: 'continuation-token' // Indicate the type of pagination
      });

    } else {
      // Legacy Pagination Logic (In-Memory)
      const totalFiles = files.length;
      const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
      const currentPage = Math.max(1, parseInt(page, 10) || 1);
      const startIndex = (currentPage - 1) * pageSize;
      const paginatedFiles = files.slice(startIndex, startIndex + pageSize);

      res.json({
        success: true,
        files: paginatedFiles,
        folders: [], // In recursive mode, frontend calculates folders from file paths
        prefix: effectivePrefix,
        search: search,
        currentPage: currentPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        nextPage: currentPage + 1,
        prevPage: Math.max(1, currentPage - 1),
        totalFiles
      });
    }

  } catch (error) {
    console.error("Error listing files:", error);
    res.status(500).json({
      success: false,
      error: "Error listing files: " + error.message,
      files: [],
      totalFiles: 0
    });
  }
});

// Standard single-file upload
router.post('/upload', validateSessionAndRole('SuperAdmin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file selected' });
    }

    const { prefix = '' } = req.body;
    let effectivePrefix;
    try {
      effectivePrefix = ensurePrefix(prefix);
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }

    const key = `${effectivePrefix.replace(/\/+$/, '')}/${req.file.originalname}`;

    const uploadOptions = {
      metadata: {
        'original-name': req.file.originalname,
        'upload-source': 'web-portal',
        'user-agent': req.headers['user-agent'] || 'unknown'
      },
      preventOverwrite: true // Use atomic operation to prevent race conditions
    };

    try {
      await uploadFile(key, req.file.buffer, req.file.mimetype, uploadOptions);

      // Clean up folder marker if it exists in the parent directory
      // This happens when a file is uploaded to a folder that was previously empty
      const folderPath = key.substring(0, key.lastIndexOf('/') + 1);
      if (folderPath) {
        const folderMarkerKey = folderPath; // Already ends with /
        try {
          const markerExists = await fileExists(folderMarkerKey);
          if (markerExists) {
            // Check if this is actually a folder marker (zero-byte file)
            const metadata = await getFileMetadata(folderMarkerKey);
            if (metadata.ContentLength === 0 || metadata.Metadata?.marker === 'true') {
              await deleteFile(folderMarkerKey);
              console.log(`[mbkbucket] Cleaned up folder marker: ${folderMarkerKey}`);
            }
          }
        } catch (cleanupErr) {
          // Non-critical error, just log it
          console.warn('[mbkbucket] Failed to clean up folder marker:', cleanupErr.message);
        }
      }

      res.json({ success: true, message: 'File uploaded successfully', key: key });
    } catch (uploadError) {
      // Handle file already exists error from atomic operation
      if (uploadError.message.includes('already exists')) {
        return res.status(409).json({ success: false, error: `File already exists: ${req.file.originalname}` });
      }
      throw uploadError;
    }
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
  }
});

// S3 Multipart Upload — Step 1: Initiate
// Body: { fileName, prefix?, contentType? }
// Returns: { uploadId, key }
router.post('/upload-init', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { fileName, prefix = '', contentType = 'application/octet-stream' } = req.body;
    if (!fileName) return res.status(400).json({ success: false, error: 'fileName is required' });

    let effectivePrefix;
    try { effectivePrefix = ensurePrefix(prefix); } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
    const key = `${effectivePrefix.replace(/\/+$/, '')}/${fileName}`;

    // Check if file exists before initiating multipart upload
    // Note: This is still slightly racy, but multipart uploads take time so collision risk is lower
    // A complete solution would require server-side locking or unique upload IDs
    const exists = await fileExists(key);
    if (exists) return res.status(409).json({ success: false, error: `File already exists: ${fileName}` });

    const result = await createMultipartUpload(key, contentType);
    return res.json({ success: true, uploadId: result.uploadId, key: result.key });
  } catch (err) {
    console.error('[mbkbucket] upload-init failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// S3 Multipart Upload — Step 2: Upload a part
// FormData: chunk (file), partNumber (1-based integer), uploadId, key
// Returns: { partNumber, ETag }
router.post('/upload-chunk', validateSessionAndRole('SuperAdmin'), upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, key, partNumber } = req.body;
    if (!req.file || !uploadId || !key || !partNumber) {
      return res.status(400).json({ success: false, error: 'chunk file, uploadId, key, and partNumber are required' });
    }
    const part = parseInt(partNumber, 10);
    if (isNaN(part) || part < 1 || part > 10000) {
      return res.status(400).json({ success: false, error: 'partNumber must be an integer between 1 and 10000' });
    }

    const result = await uploadPart(key, uploadId, part, req.file.buffer);
    return res.json({ success: true, partNumber: result.partNumber, ETag: result.ETag });
  } catch (err) {
    console.error('[mbkbucket] upload-chunk failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// S3 Multipart Upload — Step 3: Complete
// Body: { uploadId, key, parts: [{ partNumber, ETag }] }
// Returns: { key }
router.post('/upload-complete', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { uploadId, key, parts } = req.body;
    if (!uploadId || !key || !Array.isArray(parts) || !parts.length) {
      return res.status(400).json({ success: false, error: 'uploadId, key, and parts array are required' });
    }

    const result = await completeMultipartUpload(key, uploadId, parts);

    // Clean up folder marker if it exists in the parent directory
    const folderPath = result.key.substring(0, result.key.lastIndexOf('/') + 1);
    if (folderPath) {
      const folderMarkerKey = folderPath;
      try {
        const markerExists = await fileExists(folderMarkerKey);
        if (markerExists) {
          const metadata = await getFileMetadata(folderMarkerKey);
          if (metadata.ContentLength === 0 || metadata.Metadata?.marker === 'true') {
            await deleteFile(folderMarkerKey);
            console.log(`[mbkbucket] Cleaned up folder marker: ${folderMarkerKey}`);
          }
        }
      } catch (cleanupErr) {
        console.warn('[mbkbucket] Failed to clean up folder marker:', cleanupErr.message);
      }
    }

    return res.json({ success: true, message: 'File uploaded successfully', key: result.key });
  } catch (err) {
    console.error('[mbkbucket] upload-complete failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// S3 Multipart Upload — Abort (cleanup on client cancel/error)
// Body: { uploadId, key }
router.post('/upload-abort', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { uploadId, key } = req.body;
    if (!uploadId || !key) return res.status(400).json({ success: false, error: 'uploadId and key are required' });

    await abortMultipartUpload(key, uploadId);
    return res.json({ success: true, message: 'Multipart upload aborted' });
  } catch (err) {
    console.error('[mbkbucket] upload-abort failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create folder (zero-byte object with trailing slash)
router.post('/create-folder', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { prefix = '', folderName } = req.body;
    if (!folderName) return res.status(400).json({ success: false, error: 'folderName is required' });

    let effectivePrefix;
    try { effectivePrefix = ensurePrefix(prefix); } catch (e) { return res.status(400).json({ success: false, error: e.message }); }

    const folderKey = `${effectivePrefix.replace(/\/+$/, '')}/${folderName}/`;

    // Check if folder marker already exists
    const markerExists = await fileExists(folderKey);
    if (markerExists) return res.status(409).json({ success: false, error: 'Folder already exists' });

    // Check if any files already exist under this prefix (folder already has content)
    const existingFiles = await listfiles(folderKey, { maxKeys: 1 });
    const hasContent = existingFiles.Contents && existingFiles.Contents.length > 0;

    if (hasContent) {
      // Folder already exists with content, no need to create marker
      return res.json({
        success: true,
        message: 'Folder already exists with content',
        key: folderKey,
        skipMarker: true
      });
    }

    // Create zero-byte object to represent empty folder
    await uploadFile(folderKey, Buffer.alloc(0), 'application/x-empty', {
      metadata: { 'folder': 'true', 'marker': 'true' }
    });

    return res.json({ success: true, message: 'Folder created', key: folderKey });
  } catch (err) {
    console.error('Create folder failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/delete', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { key, keys, folder } = req.body;

    if (keys && Array.isArray(keys) && keys.length) {
      // Bulk delete
      await deleteFiles(keys);
      return res.json({ success: true, message: 'Files deleted successfully' });
    }

    if (!key) return res.status(400).json({ success: false, error: 'Key is required' });

    let keyToDelete;
    try { keyToDelete = ensureKeyHasAppPrefix(key); } catch (e) { return res.status(400).json({ success: false, error: e.message }); }

    // If caller indicates it's a folder (or key ends with '/'), delete all objects under the prefix
    if (folder === true || String(keyToDelete).endsWith('/')) {
      await deleteFolder(keyToDelete);
      return res.json({ success: true, message: 'Folder deleted successfully' });
    }

    await deleteFile(keyToDelete);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ success: false, error: `Delete failed: ${error.message}` });
  }
});

router.get('/download/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  let stream = null;
  try {
    const key = req.params.key;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }
    const result = await downloadFile(keyToUse);
    stream = result.Body;

    res.setHeader('Content-Disposition', `attachment; filename="${keyToUse.split('/').pop()}"`);
    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');

    // Set Content-Length header for proper download progress indication
    if (result.ContentLength) {
      res.setHeader('Content-Length', result.ContentLength);
    }

    // Add cache headers for downloads
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Proper stream error handling
    stream.on('error', (err) => {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file', error: err.message });
      }
      if (stream && typeof stream.destroy === 'function') stream.destroy();
    });

    // Clean up on client disconnect
    req.on('close', () => {
      if (stream && typeof stream.destroy === 'function') stream.destroy();
    });

    // Handle request timeout
    const timeoutDuration = result.ContentLength > 50 * 1024 * 1024 ? 300000 : 120000;
    req.setTimeout(timeoutDuration, () => {
      console.error(`Download timeout (${timeoutDuration}ms) for: ${keyToUse}`);
      if (stream && typeof stream.destroy === 'function') stream.destroy();
    });

    stream.pipe(res);
  }
  catch (error) {
    console.error("Error downloading file:", error);

    // Clean up stream on error
    if (stream && typeof stream.destroy === 'function') stream.destroy();
    if (error.message.includes('File not found')) {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: "Access denied" });
    } else {
      res.status(500).json({ message: "Download failed", error: error.message });
    }
  }
});

export default router;