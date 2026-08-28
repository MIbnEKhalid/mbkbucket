/**
 * Shared helper utilities used across controllers, services, and CLI.
 */

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]);
}

export function getBaseName(path = '') {
  const value = String(path ?? '');
  const lastSlashIndex = value.lastIndexOf('/');
  return lastSlashIndex === -1 ? value : value.slice(lastSlashIndex + 1);
}

export function getFileExt(fileName = '') {
  const name = getBaseName(fileName);
  const dotIndex = name.lastIndexOf('.');
  return dotIndex === -1 ? '' : name.slice(dotIndex + 1).toLowerCase();
}

export function trimSlashes(str = '') {
  return String(str ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function trimLeadingSlashes(str = '') {
  return String(str ?? '').replace(/^\/+/, '');
}

export function getFolderPath(key = '') {
  const s = String(key ?? '');
  const lastSlash = s.lastIndexOf('/');
  return lastSlash === -1 ? '' : s.slice(0, lastSlash + 1);
}

export function normalizeKeyParam(rawKey) {
  return Array.isArray(rawKey) ? rawKey.join('/') : String(rawKey || '');
}

export function buildKey(prefix, fileName) {
  const cleanPrefix = trimSlashes(prefix);
  const cleanName = trimLeadingSlashes(fileName);
  return cleanPrefix ? `${cleanPrefix}/${cleanName}` : cleanName;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '—';
  }
}

export async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks = [];
  if (stream?.[Symbol.asyncIterator] || stream?.transformToWeb) {
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (stream?.getReader) {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.concat(chunks);
}

export function destroyStream(stream) {
  if (stream && typeof stream.destroy === 'function') {
    stream.removeAllListeners?.();
    stream.destroy();
  }
}

// ---------------------------------------------------------------------------
// MIME type & file extension constants
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

export const VIEWABLE_TYPES_SORTED = [...VIEWABLE_TYPES].sort();
export const STATIC_ASSET_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'css', 'js']);
export const VIDEO_TYPES = new Set(['mp4', 'webm', 'ogg', 'avi', 'mov']);
export const AUDIO_TYPES = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a']);

export const MIME_TYPES = {
  // Images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon',
  // Videos
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
  avi: 'video/x-msvideo', mov: 'video/quicktime',
  // Audio
  mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4',
  // Text / Code
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8', xml: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8', log: 'text/plain; charset=utf-8',
  js: 'text/javascript; charset=utf-8', ts: 'text/typescript; charset=utf-8',
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', php: 'text/x-php; charset=utf-8',
  py: 'text/x-python; charset=utf-8', java: 'text/x-java-source; charset=utf-8',
  cpp: 'text/x-c++src; charset=utf-8', c: 'text/x-csrc; charset=utf-8',
  h: 'text/x-chdr; charset=utf-8', cs: 'text/x-csharp; charset=utf-8',
  rb: 'text/x-ruby; charset=utf-8', go: 'text/x-go; charset=utf-8',
  rs: 'text/x-rust; charset=utf-8', sql: 'text/x-sql; charset=utf-8',
  sh: 'text/x-shellscript; charset=utf-8', bat: 'text/x-msdos-batch; charset=utf-8',
  ps1: 'text/x-powershell; charset=utf-8', yaml: 'text/x-yaml; charset=utf-8',
  yml: 'text/x-yaml; charset=utf-8', toml: 'text/x-toml; charset=utf-8',
  ini: 'text/x-ini; charset=utf-8', conf: 'text/x-conf; charset=utf-8',
  // Archives & Documents
  zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
  pdf: 'application/pdf'
};

export function getMimeType(fileName, fallback = 'application/octet-stream') {
  return MIME_TYPES[getFileExt(fileName)] || fallback;
}

export function isSensitiveTextType(contentType = '') {
  const type = String(contentType ?? '').toLowerCase();
  return type.startsWith('text/') || /json|xml|javascript|typescript/.test(type);
}

export function buildCacheControl(contentType, { isStaticAsset = false, supportsRanges = false, publicCache = false } = {}) {
  if (publicCache) {
    if (isStaticAsset) return 'public, max-age=3600, immutable';
    if (supportsRanges) return 'public, max-age=86400, must-revalidate';
    return 'public, max-age=300, must-revalidate';
  }
  if (isSensitiveTextType(contentType)) return 'private, no-store';
  return supportsRanges ? 'private, max-age=1800, must-revalidate' : 'private, max-age=300, must-revalidate';
}

// ---------------------------------------------------------------------------
// Range header parsing
// ---------------------------------------------------------------------------

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

export function parseRangeHeader(rangeHeader, totalSize) {
  if (!totalSize || totalSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader ?? '').trim());
  if (!match) return null;

  const [, startStr, endStr] = match;
  let start;
  let end;

  if (startStr === '') {
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
// Player page HTML template
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

// ---------------------------------------------------------------------------
// Common Handlebars helpers
// ---------------------------------------------------------------------------

export const commonHandlebarsHelpers = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  or: (...args) => args.slice(0, -1).some(Boolean),
  and: (...args) => args.slice(0, -1).every(Boolean),
  not: (val) => !val,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  includes: (arr, val) => Array.isArray(arr) && arr.includes(val),
  json: (obj) => JSON.stringify(obj, null, 2),
  jsonStringify: (obj) => JSON.stringify(obj),
  getInitials: (username) => {
    if (!username) return '?';
    return username.split(/[._]/).map(p => p.charAt(0)).join('').toUpperCase().slice(0, 2);
  },
};
