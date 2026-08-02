/**
 * Shared helper utilities used across controllers and routes.
 */

/**
 * HTML-escape a string value to prevent XSS.
 */
export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extract the base filename from a path (everything after the last '/').
 */
export function getBaseName(path = '') {
  const value = String(path || '');
  const lastSlashIndex = value.lastIndexOf('/');
  return lastSlashIndex === -1 ? value : value.substring(lastSlashIndex + 1);
}

// ---------------------------------------------------------------------------
// MIME type & file extension constants (used by view controller)
// ---------------------------------------------------------------------------

export const VIEWABLE_TYPES = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
  'mp4', 'webm', 'ogg', 'avi', 'mov',
  'mp3', 'wav', 'flac', 'aac', 'm4a',
  'txt', 'md', 'json', 'xml', 'csv', 'log',
  'js', 'ts', 'html', 'htm', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h',
  'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml',
  'toml', 'ini', 'conf', 'pdf'
]);

export const VIEWABLE_TYPES_SORTED = Array.from(VIEWABLE_TYPES).sort();

export const STATIC_ASSET_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'css', 'js']);
export const VIDEO_TYPES = new Set(['mp4', 'webm', 'ogg', 'avi', 'mov']);
export const AUDIO_TYPES = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a']);

export const MIME_TYPES = {
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

/**
 * Check if a content type is sensitive (text-based) and should not be cached.
 */
export function isSensitiveTextType(contentType = '') {
  const type = String(contentType || '').toLowerCase();
  return type.startsWith('text/')
    || type.includes('json')
    || type.includes('xml')
    || type.includes('javascript')
    || type.includes('typescript');
}

/**
 * Build a Cache-Control header value based on content type and flags.
 */
export function buildCacheControl(contentType, { isStaticAsset = false, supportsRanges = false, publicCache = false } = {}) {
  if (publicCache) {
    if (isStaticAsset) return 'public, max-age=3600, immutable';
    if (supportsRanges) return 'public, max-age=86400, must-revalidate';
    return 'public, max-age=300, must-revalidate';
  }

  if (isSensitiveTextType(contentType)) return 'private, no-store';
  if (supportsRanges) return 'private, max-age=1800, must-revalidate';
  return 'private, max-age=300, must-revalidate';
}

// ---------------------------------------------------------------------------
// Range header parsing (used by view controller for media streaming)
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

/**
 * Parse an HTTP Range header (`bytes=start-end`) and compute validated byte offsets.
 * Returns `null` if the range is invalid or unsatisfiable (caller should send 416).
 */
export function parseRangeHeader(rangeHeader, totalSize) {
  if (!totalSize || totalSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || '').trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  let start, end;

  if (startStr === '') {
    // suffix range: bytes=-N (last N bytes)
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0) return null;
    if (endStr === '') {
      end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, totalSize - 1);
    } else {
      end = parseInt(endStr, 10);
      if (isNaN(end) || end < start) return null;
    }
  }

  if (start >= totalSize || start > end || end >= totalSize) return null;

  return { start, end, total: totalSize, size: end - start + 1 };
}

// ---------------------------------------------------------------------------
// Player page HTML template (used by view controller)
// ---------------------------------------------------------------------------

export function renderPlayerPage(safeFileName, encodedKey, bucketQuery) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preview: ${safeFileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .player-container { width: 100%; max-width: 100vw; max-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    video { width: 100%; height: auto; max-width: 100%; max-height: calc(100vh - 40px); object-fit: contain; background: #000; }
    .file-name { position: fixed; top: 10px; left: 10px; background: rgba(0, 0, 0, 0.8); padding: 8px 16px; border-radius: 4px; font-size: 14px; z-index: 10; }
  </style>
</head>
<body>
  <div class="file-name">${safeFileName}</div>
  <div class="player-container">
    <video controls preload="metadata" src="/mbkbucket/view/${encodedKey}${bucketQuery}">
      Your browser does not support the video tag.
    </video>
  </div>
</body>
</html>`;
}
