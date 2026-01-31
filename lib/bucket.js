import express from "express";
import { validateSessionAndRole, renderPage, mbkautheVar } from "mbkauthe";
import { listfiles, uploadFile, deleteFile, deleteFiles, deleteFolder, downloadFile, getFileMetadata, fileExists, ensureKeyHasAppPrefix, ensurePrefix, getAppName, getBucketConfig } from "./s3.js";
import multer from "multer";
import path from "path";
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Temp folder for chunked uploads
const CHUNKS_DIR = path.join(os.tmpdir(), 'mbkbucket-chunks');
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

// Key/prefix helpers are provided by `s3.js`: `ensurePrefix`, `ensureKeyHasAppPrefix`, `getAppName`.

router.get('/mbkbucket', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  renderPage(req, res, "bucket.handlebars", false, { page: "Admin Bucket", bucketvar: mbkautheVar?.bucket, message: req.query.message, error: req.query.error });
});

// API endpoint for fetching files
router.get('/mbkbucket/api/files', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  //mock response for testing
  //return res.json({success: true,files: [],prefix: getAppName(),search: '',bucket: '',currentPage: 1,totalPages: 1,hasNextPage: false,hasPrevPage: false,nextPage: 2,prevPage: 1,totalFiles: 1});
  const { prefix = '', page = '1', search = '' } = req.query;
  const pageSize = 100;
  let effectivePrefix;
  try {
    effectivePrefix = ensurePrefix(prefix);
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message });
  }

  try {
    const result = await listfiles(effectivePrefix);
    let files = result.Contents || [];
    let usedPrefix = effectivePrefix;
    let legacyFallback = false;

    // If no files found under the app prefixed path, try root as a legacy fallback
    if (!files.length) {
      try {
        const rootResult = await listfiles('');
        if ((rootResult.Contents || []).length) {
          files = rootResult.Contents || [];
          usedPrefix = '';
          legacyFallback = true;
        }
      } catch (fallbackErr) {
        // ignore fallback errors and continue with empty files
        console.warn('Fallback root listing failed:', fallbackErr.message);
      }
    }

    // Apply search filter if provided
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      files = files.filter(file => {
        const fileName = file.Key.split('/').pop();
        return fileName.toLowerCase().includes(searchLower);
      });
    }

    // Pagination logic
    const totalFiles = files.length;
    const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedFiles = files.slice(startIndex, startIndex + pageSize);

    res.json({
      success: true,
      files: paginatedFiles,
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
router.post('/mbkbucket/upload', validateSessionAndRole('SuperAdmin'), upload.single('file'), async (req, res) => {
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

    const key = `${effectivePrefix}/${req.file.originalname}`;

    // Check if file already exists
    const exists = await fileExists(key);
    if (exists) {
      return res.status(409).json({ success: false, error: `File already exists: ${req.file.originalname}` });
    }

    const uploadOptions = {
      metadata: {
        'original-name': req.file.originalname,
        'upload-source': 'web-portal',
        'user-agent': req.headers['user-agent'] || 'unknown'
      }
    };

    await uploadFile(key, req.file.buffer, req.file.mimetype, uploadOptions);
    res.json({ success: true, message: 'File uploaded successfully', key: key });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
  }
});

// Chunk upload receiver - accepts a single chunk (FormData: chunk file under field 'chunk')
router.post('/mbkbucket/upload-chunk', validateSessionAndRole('SuperAdmin'), upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, fileName, chunkIndex, totalChunks } = req.body;
    if (!req.file || !fileName || typeof chunkIndex === 'undefined' || typeof totalChunks === 'undefined') {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    const id = uploadId || crypto.randomBytes(12).toString('hex');
    const dir = path.join(CHUNKS_DIR, id);
    await fs.promises.mkdir(dir, { recursive: true });

    const partName = path.join(dir, `part-${String(chunkIndex).padStart(6, '0')}`);
    await fs.promises.writeFile(partName, req.file.buffer);

    return res.json({ success: true, uploadId: id, chunkIndex: Number(chunkIndex) });
  } catch (err) {
    console.error('Chunk upload failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Upload complete - assemble chunks and upload final file
router.post('/mbkbucket/upload-complete', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { uploadId, fileName, prefix = '', contentType = 'application/octet-stream' } = req.body;
    if (!uploadId || !fileName) return res.status(400).json({ success: false, error: 'uploadId and fileName are required' });

    const dir = path.join(CHUNKS_DIR, uploadId);
    const files = await fs.promises.readdir(dir);
    // Sort by part name
    files.sort();

    const buffers = [];
    for (const f of files) {
      const b = await fs.promises.readFile(path.join(dir, f));
      buffers.push(b);
    }

    const assembled = Buffer.concat(buffers);

    // Upload to bucket
    let effectivePrefix;
    try { effectivePrefix = ensurePrefix(prefix); } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
    const key = `${effectivePrefix}/${fileName}`;

    // Check existence
    const exists = await fileExists(key);
    if (exists) return res.status(409).json({ success: false, error: 'File already exists' });

    await uploadFile(key, assembled, contentType, { metadata: { 'chunked-upload': 'true', 'upload-id': uploadId } });

    // Cleanup chunks
    for (const f of files) {
      await fs.promises.unlink(path.join(dir, f)).catch(() => {});
    }
    await fs.promises.rmdir(dir).catch(() => {});

    return res.json({ success: true, message: 'File uploaded successfully (assembled)', key });
  } catch (err) {
    console.error('Assemble/upload failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Create folder (zero-byte object with trailing slash)
router.post('/mbkbucket/create-folder', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const { prefix = '', folderName } = req.body;
    if (!folderName) return res.status(400).json({ success: false, error: 'folderName is required' });

    let effectivePrefix;
    try { effectivePrefix = ensurePrefix(prefix); } catch (e) { return res.status(400).json({ success: false, error: e.message }); }

    const folderKey = `${effectivePrefix}/${folderName}/`;

    // Check if exists
    const exists = await fileExists(folderKey);
    if (exists) return res.status(409).json({ success: false, error: 'Folder already exists' });

    // Create zero-byte object to represent folder
    await uploadFile(folderKey, Buffer.alloc(0), 'application/x-empty', { metadata: { 'folder': 'true' } });

    return res.json({ success: true, message: 'Folder created', key: folderKey });
  } catch (err) {
    console.error('Create folder failed:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/mbkbucket/delete', validateSessionAndRole('SuperAdmin'), async (req, res) => {
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

router.get('/mbkbucket/download/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const key = req.params.key;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ success: false, error: e.message });
    }
    const result = await downloadFile(keyToUse);

    res.setHeader('Content-Disposition', `attachment; filename="${keyToUse.split('/').pop()}"`);
    res.setHeader('Content-Type', result.ContentType || 'application/octet-stream');

    // Set Content-Length header for proper download progress indication
    if (result.ContentLength) {
      res.setHeader('Content-Length', result.ContentLength);
    }

    // Add cache headers for downloads
    res.setHeader('Cache-Control', 'private, max-age=3600');

    result.Body.pipe(res);
  } catch (error) {
    console.error("Error downloading file:", error);

    if (error.message.includes('File not found')) {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.message.includes('Access denied')) {
      res.status(403).json({ message: "Access denied" });
    } else {
      res.status(500).json({ message: "Download failed", error: error.message });
    }
  }
});

// New: lightweight player page for robust playback in browsers
router.get('/mbkbucket/player/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const key = req.params.key;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).send(e.message);
    }
    const encoded = encodeURIComponent(keyToUse);
    const fileName = keyToUse.split('/').pop();

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview: ${fileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .player-container { width: 100%; max-width: 100vw; max-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    video { width: 100%; height: auto; max-width: 100%; max-height: calc(100vh - 40px); object-fit: contain; background: #000; }
    .file-name { position: fixed; top: 10px; left: 10px; background: rgba(0, 0, 0, 0.8); padding: 8px 16px; border-radius: 4px; font-size: 14px; z-index: 10; }
  </style>
</head>
<body>
  <div class="file-name">${fileName}</div>
  <div class="player-container">
    <video controls preload="metadata" src="/mbkbucket/view/${encoded}">
      Your browser does not support the video tag.
    </video>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error rendering player page:', err);
    return res.status(500).send('Failed to render player');
  }
});

router.get('/mbkbucket/view/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    const key = req.params.key;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    const fileName = keyToUse.split('/').pop();
    const fileExtension = keyToUse.split('.').pop().toLowerCase();

    // Check if file type is viewable before downloading
    const viewableTypes = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
      'mp4', 'webm', 'ogg', 'avi', 'mov',
      'mp3', 'wav', 'flac', 'aac', 'm4a',
      'txt', 'md', 'json', 'xml', 'csv', 'log',
      'js', 'ts', 'html', 'htm', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h',
      'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml',
      'toml', 'ini', 'conf', 'pdf'
    ]);

    if (!viewableTypes.has(fileExtension)) {
      return res.status(415).json({
        message: "File type not supported for viewing",
        supportedTypes: Array.from(viewableTypes).sort()
      });
    }

    // Set conditional request headers check
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    const range = req.headers.range;

    // Resolve configured bucket name if possible
    let bucket;
    try {
      bucket = getBucketConfig()?.BUCKET_NAME;
    } catch (err) {
      console.warn('Could not resolve bucket config for view route:', err.message);
      bucket = undefined;
    }

    // Download file with conditional headers
    const downloadOptions = {
      ...(ifNoneMatch && { ifNoneMatch }),
      ...(ifModifiedSince && { ifModifiedSince: new Date(ifModifiedSince) }),
      ...(bucket && { bucketName: bucket })
    };

    let result = await downloadFile(keyToUse, downloadOptions);

    // If the underlying storage reported Not Modified, forward 304 to the client
    if (result && result.notModified) {
      return res.status(304).end();
    }

    // Generate ETag based on file metadata
    const etag = `"${result.LastModified?.getTime() || Date.now()}-${result.ContentLength || 0}"`;

    // Check if client has cached version
    if (ifNoneMatch === etag) {
      return res.status(304).end();
    }

    // Optimized MIME type mapping
    const mimeTypes = {
      // Images
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
      'bmp': 'image/bmp', 'ico': 'image/x-icon',

      // Videos
      'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
      'avi': 'video/x-msvideo', 'mov': 'video/quicktime',

      // Audio
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
      'aac': 'audio/aac', 'm4a': 'audio/mp4',

      // Text/Code files
      'txt': 'text/plain; charset=utf-8', 'md': 'text/markdown; charset=utf-8',
      'json': 'application/json; charset=utf-8', 'xml': 'application/xml; charset=utf-8',
      'csv': 'text/csv; charset=utf-8', 'log': 'text/plain; charset=utf-8',
      'js': 'text/javascript; charset=utf-8', 'ts': 'text/typescript; charset=utf-8',
      'html': 'text/html; charset=utf-8', 'htm': 'text/html; charset=utf-8',
      'css': 'text/css; charset=utf-8', 'php': 'text/x-php; charset=utf-8',
      'py': 'text/x-python; charset=utf-8', 'java': 'text/x-java-source; charset=utf-8',
      'cpp': 'text/x-c++src; charset=utf-8', 'c': 'text/x-csrc; charset=utf-8',
      'h': 'text/x-chdr; charset=utf-8', 'cs': 'text/x-csharp; charset=utf-8',
      'rb': 'text/x-ruby; charset=utf-8', 'go': 'text/x-go; charset=utf-8',
      'rs': 'text/x-rust; charset=utf-8', 'sql': 'text/x-sql; charset=utf-8',
      'sh': 'text/x-shellscript; charset=utf-8', 'bat': 'text/x-msdos-batch; charset=utf-8',
      'ps1': 'text/x-powershell; charset=utf-8', 'yaml': 'text/x-yaml; charset=utf-8',
      'yml': 'text/x-yaml; charset=utf-8', 'toml': 'text/x-toml; charset=utf-8',
      'ini': 'text/x-ini; charset=utf-8', 'conf': 'text/x-conf; charset=utf-8',

      // Documents
      'pdf': 'application/pdf'
    };

    const contentType = mimeTypes[fileExtension] || result.ContentType || 'application/octet-stream';

    // Set optimized headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    // Performance and caching headers
    if (result.ContentLength) {
      res.setHeader('Content-Length', result.ContentLength);
    }

    // Cache control based on file type
    const isStaticAsset = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'css', 'js'].includes(fileExtension);
    const isVideo = ['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(fileExtension);
    const isAudio = ['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(fileExtension);

    if (isStaticAsset) {
      // Cache static assets for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    } else if (isVideo || isAudio) {
      // Cache media files for 24 hours but allow revalidation
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    } else {
      // Cache dynamic content for 5 minutes
      res.setHeader('Cache-Control', 'public, max-age=300');
    }

    res.setHeader('ETag', etag);

    // Set last modified if available
    if (result.LastModified) {
      res.setHeader('Last-Modified', result.LastModified.toUTCString());
    }

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Content Security Policy for better security
    if (fileExtension === 'html' || fileExtension === 'htm') {
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none';");
    }

    // Enable range requests for video/audio files
    const supportsRanges = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mp3', 'wav', 'flac', 'aac', 'm4a'].includes(fileExtension);
    if (supportsRanges) {
      res.setHeader('Accept-Ranges', 'bytes');

      // Handle range requests for video streaming
      const rangeHeader = req.headers.range;
      if (rangeHeader && result.ContentLength) {
        // Support a larger default chunk for better streaming performance
        const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

        // Parse range: support forms 'bytes=start-end', 'bytes=start-', and 'bytes=-suffix'
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${result.ContentLength}`);
          return res.end();
        }

        let startStr = match[1];
        let endStr = match[2];
        let start, end;
        const total = Number(result.ContentLength);

        if (startStr === '') {
          // Suffix bytes: '-500' means the last 500 bytes
          const suffix = parseInt(endStr, 10);
          if (isNaN(suffix) || suffix <= 0) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`);
            return res.end();
          }
          start = Math.max(0, total - suffix);
          end = total - 1;
        } else {
          start = parseInt(startStr, 10);
          if (isNaN(start) || start < 0) {
            res.status(416).setHeader('Content-Range', `bytes */${total}`);
            return res.end();
          }
          if (endStr === '') {
            end = Math.min(start + CHUNK_SIZE - 1, total - 1);
          } else {
            end = parseInt(endStr, 10);
            if (isNaN(end) || end < start) {
              res.status(416).setHeader('Content-Range', `bytes */${total}`);
              return res.end();
            }
          }
        }

        // Validate range bounds
        if (start >= total || start > end || end >= total) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`);
          return res.end();
        }

        const chunksize = (end - start) + 1;

        try {
          console.log(`[mbkbucket] Handling range request for ${keyToUse}: ${start}-${end} (total ${total})`);

          // Get the specific byte range from S3
          const rangeResult = await downloadFile(keyToUse, { range: `bytes=${start}-${end}`, ...(bucket && { bucketName: bucket }) });

          // Diagnostics: log returned content length and available result keys
          console.log(`[mbkbucket] Range downloaded: ${start}-${end} for ${keyToUse}. rangeResult.ContentLength=${rangeResult.ContentLength}, keys=${Object.keys(rangeResult).join(',')}`);

          // Check for mismatches between expected chunk size and returned ContentLength
          if (typeof rangeResult.ContentLength === 'number') {
            if (rangeResult.ContentLength !== chunksize) {
              console.warn(`Range size mismatch for ${keyToUse}: expected=${chunksize} got=${rangeResult.ContentLength} for ${start}-${end}`);
            }
          } else {
            console.warn(`Missing range ContentLength for ${keyToUse} ${start}-${end}`);
          }

          res.status(206);
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', chunksize);
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('ETag', etag);

          // Handle stream errors for range requests
          rangeResult.Body.on('error', (error) => {
            console.error("Range stream error:", error);
            if (!res.headersSent) {
              res.status(500).end('Stream error');
            }
          });

          // Log stream end/close
          rangeResult.Body.on('end', () => {
            console.log(`[mbkbucket] Range stream ended for ${keyToUse}: ${start}-${end}`);
          });
          rangeResult.Body.on('close', () => {
            console.log(`[mbkbucket] Range stream closed for ${keyToUse}: ${start}-${end}`);
          });

          // Handle client disconnect
          req.on('close', () => {
            console.log('[mbkbucket] Client closed connection during range request for', keyToUse, start, end);
            if (rangeResult.Body && typeof rangeResult.Body.destroy === 'function') {
              rangeResult.Body.destroy();
            }
          });

          // Set timeout for range requests (longer timeout to allow streaming)
          req.setTimeout(120000, () => {
            console.error("Range request timeout for file:", keyToUse);
            if (rangeResult.Body && typeof rangeResult.Body.destroy === 'function') {
              rangeResult.Body.destroy();
            }
          });

          return rangeResult.Body.pipe(res);

        } catch (rangeError) {
          console.error("Range request failed:", rangeError);
          // Fallback to full file if range request fails
          res.setHeader('Accept-Ranges', 'none');
        }
      }
    }

    // Set appropriate status code
    res.status(200);

    // Pipe the response with error handling
    result.Body.on('error', (error) => {
      console.error("Stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error streaming file", error: error.message });
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      if (result.Body && typeof result.Body.destroy === 'function') {
        result.Body.destroy();
      }
    });

    // Set timeout for large files based on file size
    const timeoutDuration = result.ContentLength > 50 * 1024 * 1024 ? 300000 : 120000; // 5 minutes for files > 50MB, 2 minutes otherwise
    req.setTimeout(timeoutDuration, () => {
      console.error(`Request timeout (${timeoutDuration}ms) for file:`, key, `Size: ${result.ContentLength} bytes`);
      if (!res.headersSent) {
        res.status(408).json({ message: "Request timeout" });
      }
      if (result.Body && typeof result.Body.destroy === 'function') {
        result.Body.destroy();
      }
    });

    result.Body.pipe(res);

  } catch (error) {
    console.error("Error viewing file:", error);

    // Return appropriate error based on error type
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.name === 'AccessDenied') {
      res.status(403).json({ message: "Access denied" });
    } else {
      res.status(500).json({ message: "View failed", error: error.message });
    }
  }
});

export default router;