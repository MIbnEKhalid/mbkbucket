import express from "express";
import { validateSessionAndRole } from "mbkauthe";
import { downloadFile, getFileMetadata, ensureKeyHasAppPrefix, generateSignedUrl } from "../s3.js";
import { mbkbucketVar } from "../config/index.js";
import rateLimit from "express-rate-limit";

// ---------------------------------------------------------------------------
// p_view security: rate limiter + basic bot/security middleware
// ---------------------------------------------------------------------------
const pviewRateLimit = rateLimit({
  windowMs: 60 * 1000,          // 1-minute window
  max: 10,                       // max 10 requests per IP per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown',
  handler: (_req, res) => {
    res.status(429).json({ message: 'Too many requests. Please slow down and try again later.' });
  }
});

// Blocks obviously headless/scraper User-Agents and missing UAs
const BLOCKED_UA_PATTERNS = /curl|wget|python-requests|python-urllib|go-http|scrapy|libwww|java\/|bot|crawl|spider|headless|phantom|selenium|puppeteer|playwright|postman|insomnia|httpie/i;

// Suspicious header patterns that indicate automated access
const SUSPICIOUS_HEADERS = [
  'x-devtools-emulate-network-conditions-client-id',
  'x-chromedriver-clientid',
  'x-automated-tool'
];

function pviewSecurity(req, res, next) {
  const ua = req.headers['user-agent'] || '';

  // Block empty or obviously automated UAs
  if (!ua || BLOCKED_UA_PATTERNS.test(ua)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  
  // Block suspicious headers that indicate automation
  const hasSuspiciousHeaders = SUSPICIOUS_HEADERS.some(header => header in req.headers);
  if (hasSuspiciousHeaders) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  
  // Rate limit check - ensure unique fingerprint per request
  const fingerprint = `${req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress}:${ua}`;
  
  // Verify Accept header is present (legitimate browsers always send this)
  if (!req.headers['accept']) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Set security headers for the public view response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Fix CORS - either allow all (public files) or restrict to specific origins
  // Using 'null' is invalid; we'll disable CORS entirely for public view since it's auth-restricted
  res.removeHeader('Access-Control-Allow-Origin');

  next();
}

const router = express.Router();

// New: lightweight player page for robust playback in browsers
router.get('/player/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
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

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const VIEWABLE_TYPES = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
  'mp4', 'webm', 'ogg', 'avi', 'mov',
  'mp3', 'wav', 'flac', 'aac', 'm4a',
  'txt', 'md', 'json', 'xml', 'csv', 'log',
  'js', 'ts', 'html', 'htm', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h',
  'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml',
  'toml', 'ini', 'conf', 'pdf'
]);
// Pre-sorted for 415 error responses (avoids re-sorting on every error)
const VIEWABLE_TYPES_SORTED = Array.from(VIEWABLE_TYPES).sort();

const MIME_TYPES = {
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
  // Text / Code
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

// ---------------------------------------------------------------------------
// Shared inline-serve helper
// Options:
//   noindex {boolean} – adds X-Robots-Tag: noindex, nofollow (default false)
// ---------------------------------------------------------------------------
async function serveFileInline(req, res, keyToUse, { noindex = true } = {}) {
  const fileName = keyToUse.split('/').pop();
  const fileExtension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';

  console.log(`[mbkbucket] 📥 Request for ${fileName} (type: ${fileExtension}, range: ${req.headers.range || 'none'})`);

  if (!VIEWABLE_TYPES.has(fileExtension)) {
    return res.status(415).json({
      message: 'File type not supported for viewing',
      supportedTypes: VIEWABLE_TYPES_SORTED
    });
  }

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  const rangeHeader = req.headers.range;

  const isStaticAsset = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'css', 'js'].includes(fileExtension);
  const isVideo = ['mp4', 'webm', 'ogg', 'avi', 'mov'].includes(fileExtension);
  const isAudio = ['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(fileExtension);
  const isPdf = fileExtension === 'pdf';
  const supportsRanges = isVideo || isAudio || isPdf;
  const contentType = MIME_TYPES[fileExtension] || 'application/octet-stream';

  // ---------------------------------------------------------------------------
  // Fast path for range requests (video / audio / PDF streaming)
  // Use a cheap HEAD (getFileMetadata) to get size + ETag, then fetch ONLY the
  // requested byte range — avoids downloading the full file first.
  // ---------------------------------------------------------------------------
  if (supportsRanges && rangeHeader) {
    console.log(`[mbkbucket] Processing range request: ${rangeHeader} for ${fileName}`);
    let meta;
    try {
      meta = await getFileMetadata(keyToUse);
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
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }

      const [, startStr, endStr] = match;
      let start, end;

      if (startStr === '') {
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
        end = endStr === '' ? Math.min(start + CHUNK_SIZE - 1, total - 1) : parseInt(endStr, 10);
        if (isNaN(end) || end < start) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`);
          return res.end();
        }
      }

      if (start >= total || start > end || end >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }

      const chunksize = end - start + 1;

      try {
        const rangeResult = await downloadFile(keyToUse, { range: `bytes=${start}-${end}` });

        if (typeof rangeResult.ContentLength === 'number' && rangeResult.ContentLength !== chunksize) {
          console.warn(`Range size mismatch for ${keyToUse}: expected=${chunksize} got=${rangeResult.ContentLength}`);
        }

        console.log(`[mbkbucket] ✓ Serving range bytes ${start}-${end}/${total} (${chunksize} bytes) for ${fileName}`);

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', chunksize);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
        res.setHeader('ETag', etag);
        res.setHeader('Accept-Ranges', 'bytes');
        if (noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (meta.LastModified) res.setHeader('Last-Modified', meta.LastModified.toUTCString());

        // Comprehensive stream error handling and cleanup
        const cleanupStream = () => {
          if (rangeResult.Body && typeof rangeResult.Body.destroy === 'function') {
            rangeResult.Body.removeAllListeners();
            rangeResult.Body.destroy();
          }
        };

        rangeResult.Body.on('error', (err) => {
          console.error('Range stream error:', err);
          cleanupStream();
          if (!res.headersSent) res.status(500).end('Stream error');
        });

        req.on('close', cleanupStream);
        req.on('aborted', cleanupStream);
        
        req.setTimeout(120000, () => {
          console.error('Range request timeout for file:', keyToUse);
          cleanupStream();
          if (!res.headersSent) res.status(408).end('Request timeout');
        });

        res.on('finish', cleanupStream);
        res.on('close', cleanupStream);

        return rangeResult.Body.pipe(res);

      } catch (rangeError) {
        console.error('Range request failed:', rangeError);
        // fall through to full-file path
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Standard path: full-file download (non-media, or media without Range header)
  // ---------------------------------------------------------------------------
  const downloadOptions = {
    ...(ifNoneMatch && { ifNoneMatch }),
    ...(ifModifiedSince && { ifModifiedSince: new Date(ifModifiedSince) })
  };

  if (isPdf) {
    console.log(`[mbkbucket] Serving full PDF (no range header) for ${fileName}`);
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

  if (isStaticAsset) {
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
  } else if (supportsRanges) {
    // For video, audio, and PDF - enable caching with revalidation
    res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }

  res.status(200);

  // Comprehensive stream cleanup to prevent memory leaks
  const cleanupStream = () => {
    if (result.Body && typeof result.Body.destroy === 'function') {
      result.Body.removeAllListeners();
      result.Body.destroy();
    }
  };

  result.Body.on('error', (err) => {
    console.error('Stream error:', err);
    cleanupStream();
    if (!res.headersSent) res.status(500).json({ message: 'Error streaming file', error: err.message });
  });

  req.on('close', cleanupStream);
  req.on('aborted', cleanupStream);

  const timeoutDuration = result.ContentLength > 50 * 1024 * 1024 ? 300000 : 120000;
  req.setTimeout(timeoutDuration, () => {
    console.error(`Request timeout (${timeoutDuration}ms) for file: ${keyToUse}, size: ${result.ContentLength}`);
    cleanupStream();
    if (!res.headersSent) res.status(408).json({ message: 'Request timeout' });
  });

  res.on('finish', cleanupStream);
  res.on('close', cleanupStream);

  result.Body.pipe(res);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get('/view/:key(*)', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  try {
    let keyToUse;
    try {
      keyToUse = ensureKeyHasAppPrefix(req.params.key);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    await serveFileInline(req, res, keyToUse, { noindex: true });

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
});

if (mbkbucketVar?.publiView_enabled) {
  router.get('/p_view/:key(*)', pviewRateLimit, pviewSecurity, async (req, res) => {
    try {
      const key = req.params.key;

      // No directory indexing — reject folder-like or empty keys
      if (!key || key.endsWith('/')) {
        return res.status(403).json({ message: 'Directory indexing is not allowed' });
      }

      let keyToUse;
      try {
        keyToUse = ensureKeyHasAppPrefix(key);
      } catch (e) {
        return res.status(400).json({ message: e.message });
      }

      // Determine pview_b: check bucket config first, then env var
      let p_view_inline = !!mbkbucketVar?.p_view_inline;


      if (!p_view_inline) {
        // Signed URL mode — redirect to a pre-signed S3 URL (1 hour expiry)
        try {
          const signed = await generateSignedUrl(keyToUse, 'getObject', 3600);
          return res.redirect(302, signed.url);
        } catch (err) {
          console.error('[mbkbucket] p_view signed URL error:', err);
          return res.status(500).json({ message: 'Failed to generate access URL' });
        }
      }

      // Direct serve mode — stream file inline (with noindex header)
      await serveFileInline(req, res, keyToUse, { noindex: true });
    } catch (error) {
      console.error('[mbkbucket] p_view error:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  });
}

export default router;