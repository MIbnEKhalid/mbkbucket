import { downloadFile, getFileMetadata, ensureKeyHasAppPrefix, resolveStorageName, getStorageProvider } from "../services/storage.service.js";
import { mbkbucketVar } from "../config/index.js";
import { escapeHtml, getBaseName, getFileExt } from "mbkutils";
import { getMimeType, normalizeKeyParam, destroyStream, VIEWABLE_TYPES, VIEWABLE_TYPES_SORTED, STATIC_ASSET_TYPES, VIDEO_TYPES, AUDIO_TYPES, buildCacheControl, parseRangeHeader, renderPlayerPage } from "../utils/helpers.js";
import { createLogger } from "#logger";

const debugView = createLogger('view');

function attachStreamCleanup(req, res, stream, timeoutMs = 120000) {
  if (!stream || typeof stream.on !== 'function') return;
  const cleanup = () => destroyStream(stream);

  stream.on('error', (err) => {
    const isAbort = err.name === 'AbortError' || err.code === 'ERR_STREAM_PREMATURE_CLOSE' || err.message?.includes('premature close');
    if (!isAbort) {
      console.error('Stream error:', err);
    }
    cleanup();
    if (!res.headersSent) res.status(500).end('Stream error');
  });

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  req.setTimeout(timeoutMs, () => {
    cleanup();
    if (!res.headersSent) res.status(408).end('Request timeout');
  });
  res.on('finish', cleanup);
  res.on('close', cleanup);
}

function isIfRangeValid(validator, etag, lastModified) {
  if (!validator) return true;
  const cleanValidator = validator.trim();
  if (cleanValidator.startsWith('"') || cleanValidator.startsWith('W/"')) {
    return cleanValidator === etag || cleanValidator === `W/${etag}`;
  }
  if (lastModified) {
    const validatorDate = new Date(cleanValidator).getTime();
    const modDate = new Date(lastModified).getTime();
    return !isNaN(validatorDate) && modDate <= validatorDate;
  }
  return false;
}

async function serveFileInline(req, res, keyToUse, { noindex = true, bucketName, publicCache = false } = {}) {
  const fileName = getBaseName(keyToUse);
  const fileExtension = getFileExt(fileName);
  const isDownload = req.query?.download === 'true' || req.query?.download === '1' || req.query?.dl === '1' || req.query?.dl === 'true';

  debugView('Request for %s (type: %s, range: %s, download: %s)', fileName, fileExtension, req.headers.range || 'none', isDownload);

  if (!isDownload && !VIEWABLE_TYPES.has(fileExtension)) {
    return res.status(415).json({
      message: 'File type not supported for viewing',
      supportedTypes: VIEWABLE_TYPES_SORTED
    });
  }

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  const ifRange = req.headers['if-range'];
  const rangeHeader = req.headers.range;

  const isStaticAsset = STATIC_ASSET_TYPES.has(fileExtension);
  const isVideo = VIDEO_TYPES.has(fileExtension);
  const isAudio = AUDIO_TYPES.has(fileExtension);
  const isPdf = fileExtension === 'pdf';
  const supportsRanges = isVideo || isAudio || isPdf;
  const contentType = getMimeType(fileName);
  const safeAsciiName = fileName.replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '_');
  const encodedName = encodeURIComponent(fileName);
  const dispositionType = isDownload ? 'attachment' : 'inline';

  // Fast path for HEAD requests (Vercel & CDN friendly: 0 bytes downloaded)
  if (req.method === 'HEAD') {
    debugView('Processing HEAD request for %s', fileName);
    let meta;
    try {
      meta = await getFileMetadata(keyToUse, bucketName);
    } catch (err) {
      console.error('[mbkbucket] serveFileInline HEAD metadata error:', err);
      return res.status(500).end();
    }

    if (!meta?.exists) return res.status(404).end();

    const etag = meta.ETag || `"${new Date(meta.LastModified || Date.now()).getTime()}-${meta.ContentLength || 0}"`;
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) return res.status(304).end();
    if (ifModifiedSince && meta.LastModified && new Date(meta.LastModified) <= new Date(ifModifiedSince)) {
      return res.status(304).end();
    }

    res.status(200);
    res.setHeader('Content-Type', contentType);
    if (meta.ContentLength) res.setHeader('Content-Length', meta.ContentLength);
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('ETag', etag);
    if (meta.LastModified) res.setHeader('Last-Modified', new Date(meta.LastModified).toUTCString());
    if (supportsRanges) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Vary', 'Accept-Encoding, Range');
    }
    res.setHeader('Cache-Control', buildCacheControl(contentType, { isStaticAsset, supportsRanges, publicCache }));
    if (publicCache) {
      res.setHeader('CDN-Cache-Control', supportsRanges ? 'public, s-maxage=31536000, stale-while-revalidate=86400' : 'public, s-maxage=86400, stale-while-revalidate=3600');
      res.setHeader('Vercel-CDN-Cache-Control', supportsRanges ? 'public, s-maxage=31536000, stale-while-revalidate=86400' : 'public, s-maxage=86400, stale-while-revalidate=3600');
    }
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end();
  }

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

    if (!meta?.exists) return res.status(404).json({ message: 'File not found', key: keyToUse });

    const etag = meta.ETag || `"${new Date(meta.LastModified || Date.now()).getTime()}-${meta.ContentLength || 0}"`;
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) return res.status(304).end();

    const ifRangeSatisfied = !ifRange || isIfRangeValid(ifRange, etag, meta.LastModified);

    if (ifRangeSatisfied) {
      const total = Number(meta.ContentLength);
      if (total) {
        const range = parseRangeHeader(rangeHeader, total);
        if (!range) {
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
          res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
          res.setHeader('Cache-Control', buildCacheControl(contentType, { supportsRanges: true, publicCache }));
          if (publicCache) {
            res.setHeader('CDN-Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=86400');
            res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=86400');
          }
          res.setHeader('ETag', etag);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Vary', 'Accept-Encoding, Range');
          res.setHeader('X-Frame-Options', 'SAMEORIGIN');
          if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          const stream = rangeResult.Body || rangeResult.stream;
          attachStreamCleanup(req, res, stream);
          return stream.pipe(res);
        } catch (rangeError) {
          console.error('[mbkbucket] Range request failed for %s:', keyToUse, rangeError);
          if (!res.headersSent) {
            return res.status(500).json({ message: 'Range stream failed', error: rangeError.message });
          }
          return;
        }
      }
    }
  }


  // Standard path: full-file download/view
  const downloadOptions = {
    ...(ifNoneMatch && { ifNoneMatch }),
    ...(ifModifiedSince && { ifModifiedSince: new Date(ifModifiedSince) }),
    bucketName
  };

  if (isPdf) debugView('Serving full PDF (no range header) for %s', fileName);

  let result;
  try {
    result = await downloadFile(keyToUse, downloadOptions);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.message?.includes('File not found')) {
      return res.status(404).json({ message: 'File not found', key: keyToUse });
    }
    if (err.name === 'AccessDenied' || err.message?.includes('Access denied')) {
      return res.status(403).json({ message: 'Access denied' });
    }
    console.error('[mbkbucket] serveFileInline download error:', err);
    return res.status(500).json({ message: 'Failed to fetch file', error: err.message });
  }

  if (result?.notModified) return res.status(304).end();

  const etag = result.ETag || `"${new Date(result.LastModified || Date.now()).getTime()}-${result.ContentLength || 0}"`;
  if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === '*')) return res.status(304).end();

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `${dispositionType}; filename="${safeAsciiName}"; filename*=UTF-8''${encodedName}`);
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (result.ContentLength) res.setHeader('Content-Length', result.ContentLength);
  if (result.LastModified) res.setHeader('Last-Modified', new Date(result.LastModified).toUTCString());

  if (fileExtension === 'html' || fileExtension === 'htm') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'none'; object-src 'none';");
  }
  if (supportsRanges) {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Vary', 'Accept-Encoding, Range');
  }
  res.setHeader('Cache-Control', buildCacheControl(contentType, { isStaticAsset, supportsRanges, publicCache }));
  if (publicCache) {
    res.setHeader('CDN-Cache-Control', supportsRanges ? 'public, s-maxage=31536000, stale-while-revalidate=86400' : 'public, s-maxage=86400, stale-while-revalidate=3600');
    res.setHeader('Vercel-CDN-Cache-Control', supportsRanges ? 'public, s-maxage=31536000, stale-while-revalidate=86400' : 'public, s-maxage=86400, stale-while-revalidate=3600');
  }
  res.status(200);

  const stream = result.Body || result.stream;
  const timeoutDuration = result.ContentLength > 50 * 1024 * 1024 ? 300000 : 120000;
  attachStreamCleanup(req, res, stream, timeoutDuration);
  stream.pipe(res);
}


export async function viewFile(req, res) {
  try {
    const key = normalizeKeyParam(req.params.key);
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    await serveFileInline(req, res, keyToUse, { noindex: true, bucketName: req.activeBucket, publicCache: false });
  } catch (error) {
    console.error("Error viewing file:", error);
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.message?.includes('File not found')) {
      res.status(404).json({ message: "File not found", key: req.params.key });
    } else if (error.name === 'AccessDenied' || error.message?.includes('Access denied')) {
      res.status(403).json({ message: "Access denied" });
    } else {
      res.status(500).json({ message: "View failed", error: error.message });
    }
  }
}

export async function playerPage(req, res) {
  try {
    const key = normalizeKeyParam(req.params.key);
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).send(e.message);
    }

    const html = renderPlayerPage(
      escapeHtml(getBaseName(keyToUse)),
      encodeURIComponent(keyToUse),
      `?bucket=${encodeURIComponent(req.activeBucket)}`
    );

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
    const bucketName = req.query?.bucket ? resolveStorageName(req.query.bucket) : resolveStorageName();
    const key = normalizeKeyParam(req.params.key);

    if (!key || key.endsWith('/')) {
      return res.status(403).json({ message: 'Directory indexing is not allowed' });
    }

    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    await serveFileInline(req, res, keyToUse, { noindex: true, bucketName, publicCache: true });
  } catch (error) {
    console.error('[mbkbucket] p_view error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}
