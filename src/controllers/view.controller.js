import {
  downloadFile, getFileMetadata, ensureKeyHasAppPrefix,
  generateSignedUrl, resolveBucketName
} from "../services/s3.service.js";
import { mbkbucketVar } from "../config/index.js";
import {
  escapeHtml, getBaseName, VIEWABLE_TYPES, VIEWABLE_TYPES_SORTED,
  STATIC_ASSET_TYPES, VIDEO_TYPES, AUDIO_TYPES, MIME_TYPES,
  buildCacheControl, parseRangeHeader, renderPlayerPage
} from "../utils/helpers.js";
import { createLogger } from "../utils/logger.js";

const debugView = createLogger('view');

// ---------------------------------------------------------------------------
// Stream helpers
// ---------------------------------------------------------------------------

function attachStreamCleanup(req, res, stream, timeoutMs = 120000) {
  const cleanup = () => {
    if (stream && typeof stream.destroy === 'function') {
      stream.removeAllListeners();
      stream.destroy();
    }
  };

  stream.on('error', (err) => {
    console.error('Stream error:', err);
    cleanup();
    if (!res.headersSent) res.status(500).end('Stream error');
  });

  req.on('close', cleanup);
  req.on('aborted', cleanup);

  req.setTimeout(timeoutMs, () => {
    console.error('Request timeout for stream');
    cleanup();
    if (!res.headersSent) res.status(408).end('Request timeout');
  });

  res.on('finish', cleanup);
  res.on('close', cleanup);
}

// ---------------------------------------------------------------------------
// Inline file serving (used by /view/:key and /p_view/:key)
// ---------------------------------------------------------------------------

async function serveFileInline(req, res, keyToUse, { noindex = true, bucketName, publicCache = false } = {}) {
  const fileName = getBaseName(keyToUse);
  const dotIndex = fileName.lastIndexOf('.');
  const fileExtension = dotIndex === -1 ? '' : fileName.substring(dotIndex + 1).toLowerCase();

  debugView('Request for %s (type: %s, range: %s)', fileName, fileExtension, req.headers.range || 'none');

  if (!VIEWABLE_TYPES.has(fileExtension)) {
    return res.status(415).json({
      message: 'File type not supported for viewing',
      supportedTypes: VIEWABLE_TYPES_SORTED
    });
  }

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  const rangeHeader = req.headers.range;

  const isStaticAsset = STATIC_ASSET_TYPES.has(fileExtension);
  const isVideo = VIDEO_TYPES.has(fileExtension);
  const isAudio = AUDIO_TYPES.has(fileExtension);
  const isPdf = fileExtension === 'pdf';
  const supportsRanges = isVideo || isAudio || isPdf;
  const contentType = MIME_TYPES[fileExtension] || 'application/octet-stream';

  // Fast path for range requests (video / audio / PDF streaming)
  if (supportsRanges && rangeHeader) {
    debugView('Processing range request: %s for %s', rangeHeader, fileName);
    let meta;
    try {
      meta = await getFileMetadata(keyToUse, bucketName);
    } catch (err) {
      console.error('[mbkbucket] serveFileInline metadata error:', err);
      return res.status(500).json({ message: 'Failed to fetch file metadata', error: err.message });
    }

    if (!meta || !meta.exists) {
      return res.status(404).json({ message: 'File not found', key: keyToUse });
    }

    const etag = `"${meta.LastModified?.getTime() || Date.now()}-${meta.ContentLength || 0}"`;
    if (ifNoneMatch === etag) return res.status(304).end();

    const total = Number(meta.ContentLength);
    if (!total) {
      // No content-length — fall through to full-file path
    } else {
      const range = parseRangeHeader(rangeHeader, total);
      if (!range) {
        // Invalid or unsatisfiable range
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }

      const { start, end, size: chunksize } = range;

      try {
        const rangeResult = await downloadFile(keyToUse, { range: `bytes=${start}-${end}`, bucketName });

        if (typeof rangeResult.ContentLength === 'number' && rangeResult.ContentLength !== chunksize) {
          debugView('Range size mismatch for %s: expected=%s got=%s', keyToUse, chunksize, rangeResult.ContentLength);
        }

        debugView('Serving range bytes %s-%s/%s (%s bytes) for %s', start, end, total, chunksize, fileName);

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', chunksize);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', buildCacheControl(contentType, { supportsRanges: true, publicCache }));
        res.setHeader('ETag', etag);
        res.setHeader('Accept-Ranges', 'bytes');
        if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (meta.LastModified) res.setHeader('Last-Modified', meta.LastModified.toUTCString());

        attachStreamCleanup(req, res, rangeResult.Body);
        return rangeResult.Body.pipe(res);

      } catch (rangeError) {
        console.error('Range request failed:', rangeError);
        // fall through to full-file path
      }
    }
  }

  // Standard path: full-file download
  const downloadOptions = {
    ...(ifNoneMatch && { ifNoneMatch }),
    ...(ifModifiedSince && { ifModifiedSince: new Date(ifModifiedSince) }),
    bucketName
  };

  if (isPdf) {
    debugView('Serving full PDF (no range header) for %s', fileName);
  }

  let result;
  try {
    result = await downloadFile(keyToUse, downloadOptions);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
      return res.status(404).json({ message: 'File not found', key: keyToUse });
    } else if (err.name === 'AccessDenied') {
      return res.status(403).json({ message: 'Access denied' });
    }
    console.error('[mbkbucket] serveFileInline download error:', err);
    return res.status(500).json({ message: 'Failed to fetch file', error: err.message });
  }

  if (result && result.notModified) return res.status(304).end();

  const etag = `"${result.LastModified?.getTime() || Date.now()}-${result.ContentLength || 0}"`;
  if (ifNoneMatch === etag) return res.status(304).end();

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (result.ContentLength) res.setHeader('Content-Length', result.ContentLength);
  if (result.LastModified) res.setHeader('Last-Modified', result.LastModified.toUTCString());
  if (fileExtension === 'html' || fileExtension === 'htm') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none';");
  }
  if (supportsRanges) res.setHeader('Accept-Ranges', 'bytes');

  res.setHeader('Cache-Control', buildCacheControl(contentType, { isStaticAsset, supportsRanges, publicCache }));

  res.status(200);

  const timeoutDuration = result.ContentLength > 50 * 1024 * 1024 ? 300000 : 120000;
  attachStreamCleanup(req, res, result.Body, timeoutDuration);

  result.Body.pipe(res);
}

// ---------------------------------------------------------------------------
// Controller handlers
// ---------------------------------------------------------------------------

export async function viewFile(req, res) {
  try {
    const bucketName = req.activeBucket;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(req.params.key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    await serveFileInline(req, res, keyToUse, { noindex: true, bucketName, publicCache: false });

  } catch (error) {
    console.error("Error viewing file:", error);
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.name === 'AccessDenied') {
      res.status(403).json({ message: "Access denied" });
    } else {
      res.status(500).json({ message: "View failed", error: error.message });
    }
  }
}

export async function playerPage(req, res) {
  try {
    const bucketName = req.activeBucket;
    const key = req.params.key;
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).send(e.message);
    }
    const encoded = encodeURIComponent(keyToUse);
    const safeFileName = escapeHtml(getBaseName(keyToUse));
    const bucketQuery = `?bucket=${encodeURIComponent(bucketName)}`;
    const html = renderPlayerPage(safeFileName, encoded, bucketQuery);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error rendering player page:', err);
    return res.status(500).send('Failed to render player');
  }
}

export async function publicView(req, res) {
  try {
    const bucketName = resolveBucketName();
    const key = req.params.key;

    // No directory indexing
    if (!key || key.endsWith('/')) {
      return res.status(403).json({ message: 'Directory indexing is not allowed' });
    }

    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    let p_view_inline = !!mbkbucketVar?.p_view_inline;

    if (!p_view_inline) {
      // Signed URL mode
      try {
        const signed = await generateSignedUrl(keyToUse, 'getObject', 3600, bucketName);
        return res.redirect(302, signed.url);
      } catch (err) {
        console.error('[mbkbucket] p_view signed URL error:', err);
        return res.status(500).json({ message: 'Failed to generate access URL' });
      }
    }

    // Direct serve mode
    await serveFileInline(req, res, keyToUse, { noindex: true, bucketName, publicCache: true });
  } catch (error) {
    console.error('[mbkbucket] p_view error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
