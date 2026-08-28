/**
 * mbkbucket-helper.js  v1.2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in frontend helper utilities for mbkbucket.
 * Include this script (and mbkbucket-helper.css) in any HTML page.
 *
 * Exposes: window.MBKBucket
 *
 * Features:
 *   - Gallery Browser Modal  (MBKBucket.openGallery) with multi-select & in-modal upload
 *   - File Picker Input      (MBKBucket.createPicker / data-mbk-picker) with live preview binding
 *   - Upload Widget          (MBKBucket.createUploader / data-mbk-uploader)
 *   - URL Builders           (MBKBucket.url.*)
 *   - API Helpers            (MBKBucket.api.*)
 *   - Toast Notifications    (MBKBucket.toast.*)
 *
 * Auth: uses existing cookie session (same origin).
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // Config & Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const BASE = '/mbkbucket';
  const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10 MB → multipart upload
  const CHUNK_SIZE          = 8  * 1024 * 1024; // 8 MB chunks

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function baseName(key) {
    const s = String(key || '').replace(/\/+$/, '');
    const i = s.lastIndexOf('/');
    return i === -1 ? s : s.slice(i + 1);
  }

  function ext(fileName) {
    const n = baseName(fileName);
    const d = n.lastIndexOf('.');
    return d > -1 ? n.slice(d + 1).toLowerCase() : '';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '';
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  function buildUrl(path, params) {
    const u = new URL(path, location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          u.searchParams.set(k, v);
        }
      });
    }
    return u.toString();
  }

  function apiFetch(url, options) {
    return fetch(url, { credentials: 'include', ...options })
      .then(async r => {
        const json = await r.json().catch(() => ({ success: false, error: r.statusText }));
        if (!r.ok) throw Object.assign(new Error(json.error || r.statusText), { status: r.status, body: json });
        return json;
      });
  }

  const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif']);
  const VIDEO_EXTS = new Set(['mp4','webm','ogg','mov','avi']);
  const AUDIO_EXTS = new Set(['mp3','wav','flac','aac','m4a','ogg']);
  const DOC_EXTS   = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','rtf']);
  const CODE_EXTS  = new Set(['js','ts','jsx','tsx','html','htm','css','scss','php','py','java','cpp','c','h','cs','rb','go','rs','sql','sh','bat','ps1','yaml','yml','toml','ini','conf','json','xml','log']);

  const TYPE_MAP = {
    pdf:  { label:'PDF',  color:'#dc2626', bg:'rgba(220, 38, 38, 0.1)' },
    doc:  { label:'DOC',  color:'#066fd1', bg:'rgba(6, 111, 209, 0.1)' },
    docx: { label:'DOC',  color:'#066fd1', bg:'rgba(6, 111, 209, 0.1)' },
    xls:  { label:'XLS',  color:'#16a34a', bg:'rgba(22, 163, 74, 0.12)' },
    xlsx: { label:'XLS',  color:'#16a34a', bg:'rgba(22, 163, 74, 0.12)' },
    csv:  { label:'CSV',  color:'#16a34a', bg:'rgba(22, 163, 74, 0.12)' },
    ppt:  { label:'PPT',  color:'#d97706', bg:'rgba(217, 119, 6, 0.12)' },
    pptx: { label:'PPT',  color:'#d97706', bg:'rgba(217, 119, 6, 0.12)' },
    txt:  { label:'TXT',  color:'#667c79', bg:'rgba(102, 124, 121, 0.12)' },
    md:   { label:'MD',   color:'#7c3aed', bg:'rgba(124, 58, 237, 0.1)' },
    js:   { label:'JS',   color:'#0f766e', bg:'rgba(15, 118, 110, 0.12)' },
    ts:   { label:'TS',   color:'#0f766e', bg:'rgba(15, 118, 110, 0.12)' },
    json: { label:'JSON', color:'#0f766e', bg:'rgba(15, 118, 110, 0.12)' },
    html: { label:'HTML', color:'#ea580c', bg:'rgba(234, 88, 12, 0.12)' },
    css:  { label:'CSS',  color:'#066fd1', bg:'rgba(6, 111, 209, 0.1)' },
    py:   { label:'PY',   color:'#0f766e', bg:'rgba(15, 118, 110, 0.12)' },
    zip:  { label:'ZIP',  color:'#667c79', bg:'rgba(102, 124, 121, 0.12)' },
    tar:  { label:'TAR',  color:'#667c79', bg:'rgba(102, 124, 121, 0.12)' },
    gz:   { label:'GZ',   color:'#667c79', bg:'rgba(102, 124, 121, 0.12)' },
  };

  function fileTypeInfo(fileName) {
    const e = ext(fileName);
    if (IMAGE_EXTS.has(e)) return { label: 'IMG', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' };
    if (VIDEO_EXTS.has(e)) return { label: 'VID', color: '#1f8f84', bg: 'rgba(31, 143, 132, 0.12)' };
    if (AUDIO_EXTS.has(e)) return { label: 'AUD', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.1)' };
    return TYPE_MAP[e] || { label: (e.toUpperCase().slice(0,4) || 'FILE'), color: '#667c79', bg: 'rgba(102, 124, 121, 0.12)' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // URL Builders
  // ─────────────────────────────────────────────────────────────────────────

  const url = {
    view(key, bucket) {
      return key ? buildUrl(`${BASE}/view/${encodeURIComponent(key)}`, { bucket: bucket || '' }) : '';
    },
    public(key, bucket) {
      return key ? buildUrl(`${BASE}/p_view/${encodeURIComponent(key)}`, { bucket: bucket || '' }) : '';
    },
    download(key, bucket) {
      return key ? buildUrl(`${BASE}/download/${encodeURIComponent(key)}`, { bucket: bucket || '' }) : '';
    },
    player(key, bucket) {
      return key ? buildUrl(`${BASE}/player/${encodeURIComponent(key)}`, { bucket: bucket || '' }) : '';
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SVG Icons
  // ─────────────────────────────────────────────────────────────────────────

  const ICONS = {
    bucket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3C8 3 4 5 4 8v1c0 3 2 5 8 6 6-1 8-3 8-6V8c0-3-4-5-8-5z"/><path d="M4 9c0 3 2 5 8 6 6-1 8-3 8-6"/><path d="M4 13c0 3 2 5 8 6 6-1 8-3 8-6"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>`,
    file:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`,
    image:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    video:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M22 8l-5 4 5 4V8z"/></svg>`,
    audio:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
    close:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    grid:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    list:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>`,
    plus:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    check:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    warn:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    info:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    trash:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
    browse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  };

  function icon(name, size) {
    const s = size || 16;
    const svg = ICONS[name] || ICONS.file;
    return svg.replace('<svg', `<svg width="${s}" height="${s}"`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Toast Notifications
  // ─────────────────────────────────────────────────────────────────────────

  let _toastContainer = null;

  function getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.className = 'mbkh-toast-container';
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;
    const iconMap = { success: 'check', error: 'warn', warning: 'warn', info: 'info' };
    const colorMap = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#0f766e' };

    const el = document.createElement('div');
    el.className = `mbkh-toast mbkh-toast-${type}`;
    el.innerHTML = `
      <span class="mbkh-toast-icon" style="color:${colorMap[type]}">${icon(iconMap[type] || 'info', 16)}</span>
      <span class="mbkh-toast-msg">${esc(message)}</span>`;

    const container = getToastContainer();
    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('mbkh-toast-out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  const toast = {
    success: (msg, dur) => showToast(msg, 'success', dur),
    error:   (msg, dur) => showToast(msg, 'error',   dur),
    warning: (msg, dur) => showToast(msg, 'warning', dur),
    info:    (msg, dur) => showToast(msg, 'info',    dur),
  };

  // ─────────────────────────────────────────────────────────────────────────
  // API Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const api = {
    listFiles(prefix, opts) {
      opts = opts || {};
      return apiFetch(buildUrl(`${BASE}/api/files`, {
        prefix:    prefix || '',
        bucket:    opts.bucket || '',
        search:    opts.search || '',
        token:     opts.token  || '',
        recursive: opts.recursive ? 'true' : 'false',
      }));
    },

    uploadSingle(prefix, file, opts) {
      opts = opts || {};
      const fd = new FormData();
      fd.append('file', file);
      fd.append('prefix', prefix || '');
      if (opts.bucket) fd.append('bucket', opts.bucket);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/upload`);
        xhr.withCredentials = true;
        if (opts.onProgress) {
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) opts.onProgress(e.loaded / e.total);
          };
        }
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && json.success) resolve(json);
            else reject(new Error(json.error || xhr.statusText));
          } catch(e) { reject(new Error('Upload failed')); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(fd);
      });
    },

    async uploadMultipart(prefix, file, opts) {
      opts = opts || {};
      const bucket = opts.bucket || '';

      const init = await apiFetch(`${BASE}/upload-init`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, prefix, contentType: file.type || 'application/octet-stream', ...(bucket ? { bucket } : {}) }),
      });
      const { uploadId, key } = init;

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const parts = [];
      let uploadedBytes = 0;

      for (let i = 0; i < totalChunks; i++) {
        if (opts.signal && opts.signal.aborted) {
          await apiFetch(`${BASE}/upload-abort`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId, key, ...(bucket ? { bucket } : {}) }),
          }).catch(() => {});
          throw new Error('Upload aborted');
        }

        const start  = i * CHUNK_SIZE;
        const end    = Math.min(start + CHUNK_SIZE, file.size);
        const chunk  = file.slice(start, end);

        const fd = new FormData();
        fd.append('chunk',      chunk, file.name);
        fd.append('uploadId',   uploadId);
        fd.append('key',        key);
        fd.append('partNumber', String(i + 1));
        if (bucket) fd.append('bucket', bucket);

        const result = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${BASE}/upload-chunk`);
          xhr.withCredentials = true;
          xhr.upload.onprogress = e => {
            if (e.lengthComputable && opts.onProgress) {
              opts.onProgress((uploadedBytes + e.loaded) / file.size);
            }
          };
          xhr.onload = () => {
            try {
              const json = JSON.parse(xhr.responseText);
              if (xhr.status >= 200 && xhr.status < 300 && json.success) resolve(json);
              else reject(new Error(json.error || xhr.statusText));
            } catch(e) { reject(new Error('Chunk upload failed')); }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(fd);
        });

        uploadedBytes += (end - start);
        parts.push({ partNumber: i + 1, ETag: result.ETag });
        if (opts.onProgress) opts.onProgress(uploadedBytes / file.size);
      }

      return apiFetch(`${BASE}/upload-complete`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key, parts, ...(bucket ? { bucket } : {}) }),
      });
    },

    uploadFile(prefix, file, opts) {
      if (file.size > MULTIPART_THRESHOLD) {
        return this.uploadMultipart(prefix, file, opts);
      }
      return this.uploadSingle(prefix, file, opts);
    },

    getSignedUrl(key, opts) {
      opts = opts || {};
      return apiFetch(buildUrl(`${BASE}/api/signed-url`, {
        key,
        bucket: opts.bucket || '',
        expiresIn: opts.expiresIn || 3600,
      }));
    },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Gallery Modal (with In-Modal Upload & Multi-Select)
  // ─────────────────────────────────────────────────────────────────────────

  let _galleryOverlay = null;
  let _galleryState   = null;
  let _galleryResolve = null;

  function buildGalleryDom() {
    const overlay = document.createElement('div');
    overlay.className = 'mbkh-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Browse Bucket');

    overlay.innerHTML = `
      <div class="mbkh-modal" id="mbkh-modal">
        <!-- Header -->
        <div class="mbkh-modal-header">
          <div class="mbkh-modal-logo">${icon('bucket', 14)}</div>
          <div class="mbkh-modal-title" id="mbkh-modal-title">Browse Bucket</div>
          <div class="mbkh-header-actions">
            <button class="mbkh-btn-upload-header" id="mbkh-modal-upload-trigger">
              ${icon('plus', 12)} Upload
            </button>
            <input type="file" id="mbkh-modal-file-input" multiple style="display:none" />
            <button class="mbkh-modal-close" id="mbkh-close-btn" aria-label="Close">${icon('close', 14)}</button>
          </div>
        </div>

        <!-- Toolbar & Breadcrumb -->
        <div class="mbkh-toolbar">
          <nav class="mbkh-breadcrumb" id="mbkh-breadcrumb" aria-label="Path"></nav>
          <div class="mbkh-toolbar-actions">
            <div class="mbkh-search-wrap">
              <span class="mbkh-search-icon">${icon('search', 13)}</span>
              <input class="mbkh-search" id="mbkh-search" type="search" placeholder="Search in folder…" autocomplete="off" aria-label="Search files"/>
            </div>
            <div class="mbkh-view-toggle">
              <button class="mbkh-view-btn mbkh-active" id="mbkh-view-grid" title="Grid view" aria-pressed="true">${icon('grid', 13)}</button>
              <button class="mbkh-view-btn" id="mbkh-view-list" title="List view" aria-pressed="false">${icon('list', 13)}</button>
            </div>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="mbkh-filter-bar" id="mbkh-filter-bar">
          <button class="mbkh-filter-btn mbkh-active" data-filter="all">All</button>
          <button class="mbkh-filter-btn" data-filter="images">Images</button>
          <button class="mbkh-filter-btn" data-filter="docs">Documents</button>
          <button class="mbkh-filter-btn" data-filter="media">Media</button>
          <button class="mbkh-filter-btn" data-filter="code">Code</button>
        </div>

        <!-- In-Modal Upload Progress / Drop Banner -->
        <div class="mbkh-modal-upload-banner" id="mbkh-modal-upload-banner" style="display:none">
          <div class="mbkh-upload-banner-text" id="mbkh-upload-banner-text">Uploading…</div>
          <div class="mbkh-upload-banner-bar"><div class="mbkh-upload-banner-fill" id="mbkh-upload-banner-fill"></div></div>
        </div>

        <!-- Body -->
        <div class="mbkh-modal-body" id="mbkh-modal-body">
          <div class="mbkh-file-grid" id="mbkh-grid" role="listbox" aria-multiselectable="false" aria-label="Files"></div>
          <div class="mbkh-state" id="mbkh-state" style="display:none"></div>
          <div class="mbkh-drag-overlay" id="mbkh-drag-overlay" style="display:none">
            <div class="mbkh-drag-box">
              ${icon('upload', 36)}
              <div class="mbkh-drag-text">Drop files here to upload to this folder</div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mbkh-modal-footer">
          <div class="mbkh-selected-wrap" id="mbkh-sel-wrap">
            <span class="mbkh-selected-placeholder">Click a file to select</span>
          </div>
          <div class="mbkh-footer-btns">
            <button class="mbkh-btn mbkh-btn-ghost" id="mbkh-cancel-btn">Cancel</button>
            <button class="mbkh-btn mbkh-btn-primary" id="mbkh-select-btn" disabled>
              ${icon('check', 13)} <span id="mbkh-select-btn-text">Select File</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function getGalleryEl(id) { return _galleryOverlay && _galleryOverlay.querySelector(`#${id}`); }

  function setGalleryState(mode, message) {
    const grid  = getGalleryEl('mbkh-grid');
    const state = getGalleryEl('mbkh-state');
    if (!grid || !state) return;

    if (mode === 'loading') {
      grid.style.display  = 'none';
      state.style.display = '';
      state.innerHTML = `
        <div class="mbkh-spinner"></div>
        <div class="mbkh-state-text">${esc(message || 'Loading bucket files…')}</div>
      `;
    } else if (mode === 'empty') {
      grid.style.display  = 'none';
      state.style.display = '';
      state.innerHTML = `
        <div class="mbkh-state-icon">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="var(--mbkh-primary-lt)" stroke="var(--mbkh-primary)" stroke-width="1.3"><path d="M4 8a2 2 0 012-2h6l3 3h11a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/></svg>
        </div>
        <div class="mbkh-state-title">No files found</div>
        <div class="mbkh-state-sub">${esc(message || 'This folder is empty or no files match the active filter.')}</div>
      `;
    } else if (mode === 'error') {
      grid.style.display  = 'none';
      state.style.display = '';
      state.innerHTML = `
        <div class="mbkh-state-icon" style="color:var(--mbkh-danger);">${icon('warn', 40)}</div>
        <div class="mbkh-state-title" style="color:var(--mbkh-danger);">Failed to load files</div>
        <div class="mbkh-state-sub">${esc(message || 'Please check your connection or permissions.')}</div>
      `;
    } else {
      grid.style.display  = '';
      state.style.display = 'none';
    }
  }

  function renderBreadcrumb(prefix, bucket) {
    const bc    = getGalleryEl('mbkh-breadcrumb');
    const title = getGalleryEl('mbkh-modal-title');
    if (!bc) return;

    const parts = (prefix || '').split('/').filter(Boolean);
    const label = bucket ? `Bucket: ${bucket}` : 'My Drive';
    if (title) title.textContent = parts.length ? baseName(parts[parts.length - 1]) : label;

    let html = `<span class="mbkh-crumb${parts.length === 0 ? ' mbkh-crumb-active' : ''}" data-prefix="">
      ${icon('bucket', 12)} <span class="mbkh-crumb-text">Drive</span>
    </span>`;
    parts.forEach((part, idx) => {
      const seg = parts.slice(0, idx + 1).join('/') + '/';
      const isLast = idx === parts.length - 1;
      html += `<span class="mbkh-crumb-sep">/</span>
               <span class="mbkh-crumb${isLast ? ' mbkh-crumb-active' : ''}" data-prefix="${esc(seg)}" title="${esc(part)}">
                 <span class="mbkh-crumb-text">${esc(part)}</span>
               </span>`;
    });
    bc.innerHTML = html;

    bc.querySelectorAll('[data-prefix]').forEach(el => {
      if (!el.classList.contains('mbkh-crumb-active')) {
        el.addEventListener('click', () => loadGalleryFolder(el.dataset.prefix));
      }
    });
  }

  function filterItems(files, filterKey) {
    if (!filterKey || filterKey === 'all') return files;
    return files.filter(file => {
      const e = ext(file.Key || file.key || '');
      if (filterKey === 'images') return IMAGE_EXTS.has(e);
      if (filterKey === 'docs')   return DOC_EXTS.has(e);
      if (filterKey === 'media')  return VIDEO_EXTS.has(e) || AUDIO_EXTS.has(e);
      if (filterKey === 'code')   return CODE_EXTS.has(e);
      return true;
    });
  }

  function renderGalleryItems(files, folders, viewMode, options) {
    const grid = getGalleryEl('mbkh-grid');
    if (!grid) return;

    grid.innerHTML = '';
    grid.classList.toggle('mbkh-list-mode', viewMode === 'list');
    grid.setAttribute('aria-multiselectable', _galleryState?.multiple ? 'true' : 'false');

    // Render folders first
    folders.forEach(folderPrefix => {
      const name = baseName(folderPrefix) || folderPrefix;
      const div  = document.createElement('div');
      div.className = 'mbkh-item mbkh-card-folder';
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', 'false');
      div.dataset.type   = 'folder';
      div.dataset.prefix = folderPrefix;
      div.title = `Open folder: ${name}`;

      if (viewMode === 'list') {
        div.innerHTML = `
          <div class="mbkh-row-icon mbkh-folder-icon">
            <svg viewBox="0 0 32 32" width="18" height="18" fill="var(--mbkh-primary-lt)" stroke="var(--mbkh-primary)" stroke-width="1.3"><path d="M4 8a2 2 0 012-2h6l3 3h11a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/></svg>
          </div>
          <div class="mbkh-row-name">${esc(name)}</div>
          <div class="mbkh-row-badge">Folder</div>
          <div class="mbkh-row-size">—</div>
        `;
      } else {
        div.innerHTML = `
          <div class="mbkh-card-preview mbkh-folder-preview">
            <svg class="mbkh-folder-svg" viewBox="0 0 32 32" fill="var(--mbkh-primary-lt)" stroke="var(--mbkh-primary)" stroke-width="1.3"><path d="M4 8a2 2 0 012-2h6l3 3h11a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/></svg>
          </div>
          <div class="mbkh-card-details">
            <div class="mbkh-card-name" title="${esc(name)}">${esc(name)}</div>
            <div class="mbkh-card-meta">Folder</div>
          </div>
        `;
      }

      div.addEventListener('click', () => loadGalleryFolder(folderPrefix));
      div.addEventListener('dblclick', () => loadGalleryFolder(folderPrefix));
      grid.appendChild(div);
    });

    // Render files
    files.forEach(fileObj => {
      const key   = fileObj.Key || fileObj.key || '';
      const name  = baseName(key);
      const size  = fileObj.Size || fileObj.ContentLength || 0;
      const e     = ext(key);
      const tinfo = fileTypeInfo(name);
      const isImg = IMAGE_EXTS.has(e);
      const isSelected = _galleryState?.selectedMap?.has(key);

      const div = document.createElement('div');
      div.className = `mbkh-item mbkh-card-file${isSelected ? ' mbkh-selected' : ''}`;
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      div.dataset.type = 'file';
      div.dataset.key  = key;
      div.dataset.name = name;
      div.dataset.size = size;
      div.title = `${name} (${formatBytes(size)})`;

      const thumbSrc = isImg ? url.view(key, _galleryState?.bucket) : null;
      const fileData = { key, name, size, thumbSrc, tinfo, url: thumbSrc || url.download(key, _galleryState?.bucket) };

      if (viewMode === 'list') {
        let iconHtml;
        if (isImg) {
          iconHtml = `<div class="mbkh-row-icon mbkh-thumb"><img src="${esc(thumbSrc)}" alt="${esc(name)}" loading="lazy"/></div>`;
        } else {
          const fileIco = VIDEO_EXTS.has(e) ? 'video' : AUDIO_EXTS.has(e) ? 'audio' : 'file';
          iconHtml = `<div class="mbkh-row-icon" style="background:${tinfo.bg};color:${tinfo.color};">${icon(fileIco, 16)}</div>`;
        }

        div.innerHTML = `
          ${iconHtml}
          <div class="mbkh-row-name">${esc(name)}</div>
          <div class="mbkh-row-badge" style="background:${tinfo.bg};color:${tinfo.color};">${esc(tinfo.label)}</div>
          <div class="mbkh-row-size">${formatBytes(size)}</div>
          <div class="mbkh-check-badge">${icon('check', 11)}</div>
        `;
      } else {
        let previewHtml;
        if (isImg) {
          previewHtml = `
            <div class="mbkh-card-preview mbkh-thumb">
              <img src="${esc(thumbSrc)}" alt="${esc(name)}" loading="lazy"/>
              <span class="mbkh-ext-tag">${esc(e.toUpperCase() || 'IMG')}</span>
            </div>
          `;
        } else {
          const fileIco = VIDEO_EXTS.has(e) ? 'video' : AUDIO_EXTS.has(e) ? 'audio' : 'file';
          previewHtml = `
            <div class="mbkh-card-preview" style="background:${tinfo.bg};color:${tinfo.color};">
              ${icon(fileIco, 32)}
              <span class="mbkh-ext-tag" style="background:${tinfo.color};color:#fff;">${esc(tinfo.label)}</span>
            </div>
          `;
        }

        div.innerHTML = `
          ${previewHtml}
          <div class="mbkh-card-details">
            <div class="mbkh-card-name" title="${esc(name)}">${esc(name)}</div>
            <div class="mbkh-card-meta">${formatBytes(size) || 'File'}</div>
          </div>
          <div class="mbkh-check-badge">${icon('check', 11)}</div>
        `;
      }

      if (isImg) {
        const imgEl = div.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('error', () => {
            const parent = imgEl.parentElement;
            if (parent) {
              parent.classList.remove('mbkh-thumb');
              parent.style.background = tinfo.bg;
              parent.style.color = tinfo.color;
              parent.innerHTML = icon('image', 28);
            }
          });
        }
      }

      div.addEventListener('click', () => toggleGalleryItemSelection(div, fileData));
      div.addEventListener('dblclick', () => {
        if (!_galleryState?.multiple) {
          confirmGallerySelection();
        }
      });
      grid.appendChild(div);
    });

    // Load-more button if there's a next page
    const state = _galleryState;
    if (state && state.nextToken) {
      const wrap = document.createElement('div');
      wrap.className = 'mbkh-load-more-wrap';
      wrap.innerHTML = `<button class="mbkh-btn mbkh-btn-ghost" id="mbkh-load-more">Load more files…</button>`;
      grid.appendChild(wrap);
      wrap.querySelector('#mbkh-load-more').addEventListener('click', () => loadMoreGallery());
    }
  }

  function toggleGalleryItemSelection(div, fileData) {
    if (!_galleryState) return;
    const isMulti = !!_galleryState.multiple;

    if (!isMulti) {
      // Single selection mode
      const grid = getGalleryEl('mbkh-grid');
      if (grid) grid.querySelectorAll('.mbkh-item.mbkh-selected').forEach(el => {
        el.classList.remove('mbkh-selected');
        el.setAttribute('aria-selected', 'false');
      });

      _galleryState.selectedMap.clear();
      _galleryState.selectedMap.set(fileData.key, fileData);
      div.classList.add('mbkh-selected');
      div.setAttribute('aria-selected', 'true');
    } else {
      // Multi-selection mode
      if (_galleryState.selectedMap.has(fileData.key)) {
        _galleryState.selectedMap.delete(fileData.key);
        div.classList.remove('mbkh-selected');
        div.setAttribute('aria-selected', 'false');
      } else {
        const max = _galleryState.options?.maxFiles;
        if (max && _galleryState.selectedMap.size >= max) {
          toast.warning(`Maximum ${max} files allowed`);
          return;
        }
        _galleryState.selectedMap.set(fileData.key, fileData);
        div.classList.add('mbkh-selected');
        div.setAttribute('aria-selected', 'true');
      }
    }

    updateGalleryFooterSelection();
  }

  function updateGalleryFooterSelection() {
    const selWrap   = getGalleryEl('mbkh-sel-wrap');
    const selectBtn = getGalleryEl('mbkh-select-btn');
    const btnText   = getGalleryEl('mbkh-select-btn-text');
    if (!selWrap || !_galleryState) return;

    const count = _galleryState.selectedMap.size;

    if (count === 0) {
      selWrap.innerHTML = `<span class="mbkh-selected-placeholder">Click a file to select</span>`;
      if (selectBtn) selectBtn.disabled = true;
      if (btnText) btnText.textContent = 'Select File';
      return;
    }

    if (selectBtn) selectBtn.disabled = false;

    if (!_galleryState.multiple) {
      const item = _galleryState.selectedMap.values().next().value;
      let iconSnippet;
      if (item.thumbSrc) {
        iconSnippet = `<div class="mbkh-sel-thumb"><img src="${esc(item.thumbSrc)}" alt=""/></div>`;
      } else {
        iconSnippet = `<div class="mbkh-sel-badge" style="background:${item.tinfo?.bg || 'var(--mbkh-primary-lt)'};color:${item.tinfo?.color || 'var(--mbkh-primary)'};">${esc(item.tinfo?.label || 'FILE')}</div>`;
      }
      selWrap.innerHTML = `
        ${iconSnippet}
        <div class="mbkh-sel-info">
          <div class="mbkh-sel-name" title="${esc(item.name)}">${esc(item.name)}</div>
          <div class="mbkh-sel-meta">${formatBytes(item.size)}</div>
        </div>
        <button class="mbkh-sel-clear" id="mbkh-sel-clear-btn" title="Deselect">${icon('close', 11)}</button>
      `;
      if (btnText) btnText.textContent = 'Select File';
    } else {
      // Multi mode tray
      const items = Array.from(_galleryState.selectedMap.values());
      const maxDisplay = 3;
      const visible = items.slice(0, maxDisplay);
      const remaining = items.length - maxDisplay;

      let chipsHtml = visible.map(it => `
        <div class="mbkh-multi-chip" title="${esc(it.name)}">
          <span class="mbkh-multi-chip-name">${esc(it.name)}</span>
          <span class="mbkh-multi-chip-rm" data-rm-key="${esc(it.key)}">${icon('close', 9)}</span>
        </div>
      `).join('');

      if (remaining > 0) {
        chipsHtml += `<div class="mbkh-multi-chip-more">+${remaining} more</div>`;
      }

      selWrap.innerHTML = `
        <div class="mbkh-multi-tray">
          <div class="mbkh-multi-count">${count} selected:</div>
          <div class="mbkh-multi-chips">${chipsHtml}</div>
          <button class="mbkh-sel-clear" id="mbkh-sel-clear-btn" title="Clear all">${icon('close', 11)}</button>
        </div>
      `;

      selWrap.querySelectorAll('[data-rm-key]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const k = btn.dataset.rmKey;
          _galleryState.selectedMap.delete(k);
          const grid = getGalleryEl('mbkh-grid');
          const card = grid?.querySelector(`[data-key="${CSS.escape(k)}"]`);
          if (card) {
            card.classList.remove('mbkh-selected');
            card.setAttribute('aria-selected', 'false');
          }
          updateGalleryFooterSelection();
        });
      });

      if (btnText) btnText.textContent = `Select ${count} File${count !== 1 ? 's' : ''}`;
    }

    selWrap.querySelector('#mbkh-sel-clear-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearGallerySelection();
    });
  }

  function clearGallerySelection() {
    if (_galleryState) {
      _galleryState.selectedMap.clear();
    }
    const grid = getGalleryEl('mbkh-grid');
    if (grid) grid.querySelectorAll('.mbkh-item.mbkh-selected').forEach(el => {
      el.classList.remove('mbkh-selected');
      el.setAttribute('aria-selected', 'false');
    });
    updateGalleryFooterSelection();
  }

  function confirmGallerySelection() {
    if (!_galleryState || !_galleryState.selectedMap.size) return;
    if (_galleryState.multiple) {
      const items = Array.from(_galleryState.selectedMap.values());
      closeGallery(items);
    } else {
      const item = _galleryState.selectedMap.values().next().value;
      closeGallery(item);
    }
  }

  async function loadGalleryFolder(prefix, token, autoSelectKey) {
    if (!_galleryState) return;
    _galleryState.prefix    = prefix || '';
    _galleryState.nextToken = null;

    if (!autoSelectKey) {
      clearGallerySelection();
    }
    renderBreadcrumb(prefix, _galleryState.bucket);
    setGalleryState('loading');

    const searchEl = getGalleryEl('mbkh-search');

    try {
      const result = await api.listFiles(prefix, {
        bucket:    _galleryState.bucket,
        search:    searchEl ? searchEl.value.trim() : '',
        token:     token || '',
        recursive: false,
      });

      _galleryState.nextToken  = result.nextContinuationToken || null;
      _galleryState.rawFiles   = result.files   || [];
      _galleryState.rawFolders = result.folders || [];

      applyGalleryFilter();

      if (autoSelectKey) {
        const grid = getGalleryEl('mbkh-grid');
        const card = grid?.querySelector(`[data-key="${CSS.escape(autoSelectKey)}"]`);
        if (card) {
          const name = baseName(autoSelectKey);
          const tinfo = fileTypeInfo(name);
          const thumbSrc = IMAGE_EXTS.has(ext(name)) ? url.view(autoSelectKey, _galleryState.bucket) : null;
          toggleGalleryItemSelection(card, { key: autoSelectKey, name, size: 0, thumbSrc, tinfo, url: thumbSrc || url.download(autoSelectKey, _galleryState.bucket) });
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    } catch (err) {
      setGalleryState('error', err.message || 'Failed to load files');
    }
  }

  function applyGalleryFilter() {
    if (!_galleryState) return;
    const filterKey = _galleryState.activeFilter || 'all';
    const filteredFiles = filterItems(_galleryState.rawFiles || [], filterKey);
    const folders = (filterKey === 'all') ? (_galleryState.rawFolders || []) : [];

    if (!filteredFiles.length && !folders.length) {
      setGalleryState('empty');
      return;
    }

    setGalleryState('content');
    renderGalleryItems(filteredFiles, folders, _galleryState.viewMode, _galleryState.options);
  }

  async function loadMoreGallery() {
    if (!_galleryState || !_galleryState.nextToken) return;
    const grid = getGalleryEl('mbkh-grid');
    const btn  = grid && grid.querySelector('#mbkh-load-more');
    if (btn) { btn.textContent = 'Loading…'; btn.disabled = true; }

    try {
      const result = await api.listFiles(_galleryState.prefix, {
        bucket:    _galleryState.bucket,
        token:     _galleryState.nextToken,
        recursive: false,
      });

      _galleryState.nextToken = result.nextContinuationToken || null;

      const oldWrap = grid && grid.querySelector('.mbkh-load-more-wrap');
      if (oldWrap) oldWrap.remove();

      const files   = result.files   || [];
      const folders = result.folders || [];

      _galleryState.rawFiles   = [...(_galleryState.rawFiles || []), ...files];
      _galleryState.rawFolders = [...(_galleryState.rawFolders || []), ...folders];

      applyGalleryFilter();
    } catch (err) {
      if (btn) { btn.textContent = 'Retry'; btn.disabled = false; }
      toast.error(err.message || 'Failed to load more');
    }
  }

  // In-Modal Upload Handler
  async function handleInModalUpload(files) {
    if (!files || !files.length || !_galleryState) return;
    const banner = getGalleryEl('mbkh-modal-upload-banner');
    const textEl = getGalleryEl('mbkh-upload-banner-text');
    const fillEl = getGalleryEl('mbkh-upload-banner-fill');
    if (banner) banner.style.display = 'flex';

    let lastUploadedKey = null;
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      if (textEl) textEl.textContent = `Uploading ${file.name} (${i + 1}/${total})…`;
      if (fillEl) fillEl.style.width = '0%';

      try {
        const res = await api.uploadFile(_galleryState.prefix || '', file, {
          bucket: _galleryState.bucket || '',
          onProgress: p => {
            if (fillEl) fillEl.style.width = `${Math.round(p * 100)}%`;
          }
        });
        lastUploadedKey = res.key;
        toast.success(`Uploaded: ${file.name}`);
      } catch (err) {
        toast.error(`Failed ${file.name}: ${err.message}`);
      }
    }

    if (banner) {
      if (fillEl) fillEl.style.width = '100%';
      setTimeout(() => { banner.style.display = 'none'; }, 400);
    }

    // Refresh folder and auto-select
    await loadGalleryFolder(_galleryState.prefix, null, lastUploadedKey);
  }

  function openGallery(options) {
    options = options || {};
    return new Promise(resolve => {
      if (!_galleryOverlay) {
        _galleryOverlay = buildGalleryDom();
        attachGalleryEvents();
      }

      _galleryState = {
        prefix:       options.prefix       || '',
        bucket:       options.bucket       || '',
        multiple:     !!options.multiple,
        viewMode:     options.defaultView  || localStorage.getItem('mbkh_view') || 'grid',
        selectedMap:  new Map(),
        nextToken:    null,
        options,
      };
      _galleryResolve = resolve;

      // Restore view mode
      const gridBtn = getGalleryEl('mbkh-view-grid');
      const listBtn = getGalleryEl('mbkh-view-list');
      if (gridBtn && listBtn) {
        const isGrid = _galleryState.viewMode !== 'list';
        gridBtn.classList.toggle('mbkh-active', isGrid);
        listBtn.classList.toggle('mbkh-active', !isGrid);
        gridBtn.setAttribute('aria-pressed', isGrid ? 'true' : 'false');
        listBtn.setAttribute('aria-pressed', isGrid ? 'false' : 'true');
      }

      const filterBar = getGalleryEl('mbkh-filter-bar');
      if (filterBar) {
        _galleryState.activeFilter = 'all';
        filterBar.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('mbkh-active', b.dataset.filter === 'all'));
      }

      const searchEl = getGalleryEl('mbkh-search');
      if (searchEl) searchEl.value = '';

      _galleryOverlay.style.display = '';
      _galleryOverlay.classList.remove('mbkh-closing');
      document.body.style.overflow = 'hidden';

      loadGalleryFolder(_galleryState.prefix);
    });
  }

  function closeGallery(result) {
    if (!_galleryOverlay) return;
    _galleryOverlay.classList.add('mbkh-closing');
    document.body.style.overflow = '';

    setTimeout(() => {
      if (_galleryOverlay) _galleryOverlay.style.display = 'none';
      if (_galleryResolve) {
        const r = _galleryResolve;
        _galleryResolve = null;
        r(result || null);
      }
    }, 180);
  }

  function attachGalleryEvents() {
    if (!_galleryOverlay) return;

    // Close on overlay click
    _galleryOverlay.addEventListener('click', e => {
      if (e.target === _galleryOverlay) closeGallery(null);
    });

    // Close button
    getGalleryEl('mbkh-close-btn')?.addEventListener('click', () => closeGallery(null));
    getGalleryEl('mbkh-cancel-btn')?.addEventListener('click', () => closeGallery(null));
    getGalleryEl('mbkh-select-btn')?.addEventListener('click', () => confirmGallerySelection());

    // In-modal Upload Trigger
    const fileInput = getGalleryEl('mbkh-modal-file-input');
    const uploadTrigger = getGalleryEl('mbkh-modal-upload-trigger');
    uploadTrigger?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        handleInModalUpload(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    // In-modal Drag and Drop
    const modalBody = getGalleryEl('mbkh-modal-body');
    const dragOverlay = getGalleryEl('mbkh-drag-overlay');
    let dragCounter = 0;

    modalBody?.addEventListener('dragenter', e => {
      e.preventDefault();
      dragCounter++;
      if (dragOverlay) dragOverlay.style.display = 'flex';
    });
    modalBody?.addEventListener('dragleave', e => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && dragOverlay) {
        dragOverlay.style.display = 'none';
        dragCounter = 0;
      }
    });
    modalBody?.addEventListener('dragover', e => { e.preventDefault(); });
    modalBody?.addEventListener('drop', e => {
      e.preventDefault();
      dragCounter = 0;
      if (dragOverlay) dragOverlay.style.display = 'none';
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) {
        handleInModalUpload(Array.from(files));
      }
    });

    // Filter buttons
    const filterBar = getGalleryEl('mbkh-filter-bar');
    filterBar?.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]');
      if (!btn || !_galleryState) return;
      _galleryState.activeFilter = btn.dataset.filter;
      filterBar.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('mbkh-active', b === btn));
      applyGalleryFilter();
    });

    // Search (debounced)
    const searchEl = getGalleryEl('mbkh-search');
    let searchTimer = null;
    searchEl?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        loadGalleryFolder(_galleryState ? _galleryState.prefix : '');
      }, 350);
    });

    // View toggle
    getGalleryEl('mbkh-view-grid')?.addEventListener('click', () => {
      _galleryState.viewMode = 'grid';
      localStorage.setItem('mbkh_view', 'grid');
      getGalleryEl('mbkh-view-grid')?.classList.add('mbkh-active');
      getGalleryEl('mbkh-view-list')?.classList.remove('mbkh-active');
      loadGalleryFolder(_galleryState.prefix);
    });
    getGalleryEl('mbkh-view-list')?.addEventListener('click', () => {
      _galleryState.viewMode = 'list';
      localStorage.setItem('mbkh_view', 'list');
      getGalleryEl('mbkh-view-list')?.classList.add('mbkh-active');
      getGalleryEl('mbkh-view-grid')?.classList.remove('mbkh-active');
      loadGalleryFolder(_galleryState.prefix);
    });

    // Keyboard navigation
    _galleryOverlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeGallery(null);
      if (e.key === 'Enter' && _galleryState && _galleryState.selectedMap.size) confirmGallerySelection();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // File Picker (Input wrapper with Live Preview & Multi-Select support)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Wraps an existing <input> element with a styled picker widget.
   *
   * @param {HTMLInputElement|string} inputEl
   * @param {{ bucket?: string, prefix?: string, placeholder?: string,
   *            preview?: string, multiple?: boolean, onSelect?: Function }} options
   */
  function createPicker(inputEl, options) {
    if (typeof inputEl === 'string') inputEl = document.querySelector(inputEl);
    if (!inputEl) throw new Error('[MBKBucket] createPicker: input element not found');
    options = options || {};

    const isMulti    = options.multiple !== undefined ? options.multiple : (inputEl.dataset.mbkMultiple === 'true');
    const previewSel = options.preview || inputEl.dataset.mbkPreview || '';

    // Build wrapper
    const wrap = document.createElement('div');
    wrap.className = 'mbkh-picker';
    wrap.id = inputEl.id ? `mbkh-picker-${inputEl.id}` : `mbkh-picker-${Date.now()}`;

    // Hidden real input
    const hidden = document.createElement('input');
    hidden.type  = 'hidden';
    hidden.name  = inputEl.name  || '';
    hidden.id    = inputEl.id    || '';
    hidden.value = inputEl.value || '';
    inputEl.removeAttribute('id');

    // Display input
    const display = document.createElement('input');
    display.type        = 'text';
    display.className   = 'mbkh-picker-value';
    display.readOnly    = true;
    display.placeholder = options.placeholder || (isMulti ? 'Select files from bucket…' : 'Select a file from bucket…');
    display.value       = hidden.value;
    display.setAttribute('aria-label', 'Selected file key(s)');

    const actions = document.createElement('div');
    actions.className = 'mbkh-picker-actions';

    const browseBtn = document.createElement('button');
    browseBtn.type      = 'button';
    browseBtn.className = 'mbkh-picker-btn';
    browseBtn.innerHTML = `${icon('browse', 13)} Browse`;

    const clearBtn = document.createElement('button');
    clearBtn.type      = 'button';
    clearBtn.className = 'mbkh-picker-clear';
    clearBtn.title     = 'Clear selection';
    clearBtn.innerHTML = icon('close', 11);
    clearBtn.hidden    = !hidden.value;
    clearBtn.setAttribute('aria-label', 'Clear selection');

    actions.appendChild(browseBtn);
    actions.appendChild(clearBtn);

    wrap.appendChild(display);
    wrap.appendChild(actions);

    inputEl.parentNode.insertBefore(wrap, inputEl);
    inputEl.parentNode.insertBefore(hidden, wrap.nextSibling);
    inputEl.remove();

    // Cache initial preview element state if present
    let previewEl = null;
    let originalPreviewSrc = null;
    if (previewSel) {
      previewEl = document.querySelector(previewSel);
      if (previewEl) {
        if (previewEl.tagName.toLowerCase() === 'img') {
          originalPreviewSrc = previewEl.getAttribute('data-mbk-original-src') || previewEl.getAttribute('src') || '';
          if (!previewEl.hasAttribute('data-mbk-original-src')) previewEl.setAttribute('data-mbk-original-src', originalPreviewSrc);
        }
      }
    }

    function updateLivePreview(keyOrKeys) {
      if (!previewEl) return;
      const key = Array.isArray(keyOrKeys) ? keyOrKeys[0] : keyOrKeys;
      if (key) {
        const viewUrl = url.view(key, options.bucket);
        if (previewEl.tagName.toLowerCase() === 'img') {
          previewEl.src = viewUrl;
        } else {
          previewEl.style.backgroundImage = `url("${viewUrl}")`;
          previewEl.style.backgroundSize = 'cover';
          previewEl.style.backgroundPosition = 'center';
        }
      } else {
        if (previewEl.tagName.toLowerCase() === 'img') {
          previewEl.src = originalPreviewSrc || '';
        } else {
          previewEl.style.backgroundImage = '';
        }
      }
    }

    // Set initial preview if input had pre-filled value
    if (hidden.value) {
      updateLivePreview(hidden.value);
    }

    function setValue(val) {
      let stringVal = '';
      if (Array.isArray(val)) {
        stringVal = val.map(v => typeof v === 'object' ? v.key : v).filter(Boolean).join(',');
      } else if (typeof val === 'object' && val !== null) {
        stringVal = val.key || '';
      } else {
        stringVal = String(val || '');
      }

      hidden.value   = stringVal;
      display.value  = stringVal;
      clearBtn.hidden = !stringVal;
      display.placeholder = stringVal ? '' : (options.placeholder || 'Select a file from bucket…');

      updateLivePreview(stringVal);
    }

    browseBtn.addEventListener('click', async () => {
      const result = await openGallery({
        prefix:   options.prefix || '',
        bucket:   options.bucket || '',
        multiple: isMulti,
      });

      if (result) {
        setValue(result);
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        if (options.onSelect) options.onSelect(result);
      }
    });

    clearBtn.addEventListener('click', () => {
      setValue('');
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
      if (options.onSelect) options.onSelect(null);
    });

    return {
      el:       wrap,
      getValue: () => hidden.value,
      setValue,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upload Widget
  // ─────────────────────────────────────────────────────────────────────────

  function createUploader(containerEl, options) {
    if (typeof containerEl === 'string') containerEl = document.querySelector(containerEl);
    if (!containerEl) throw new Error('[MBKBucket] createUploader: container element not found');
    options = options || {};

    const multiple = options.multiple !== false;
    const accept   = options.accept   || '';

    const root = document.createElement('div');
    root.className = 'mbkh-uploader';

    const dropzone = document.createElement('div');
    dropzone.className    = 'mbkh-dropzone';
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('tabindex', '0');
    dropzone.setAttribute('aria-label', 'Upload files — drag and drop or click to browse');
    dropzone.innerHTML = `
      <div class="mbkh-dropzone-icon">${icon('upload', 24)}</div>
      <div class="mbkh-dropzone-title">Drag &amp; drop files here</div>
      <div class="mbkh-dropzone-sub">or <strong>browse your device</strong></div>
      ${accept ? `<div style="font-size:11px;color:var(--mbkh-text-dim);margin-top:2px;">Accepted: ${esc(accept)}</div>` : ''}`;

    const fileInput = document.createElement('input');
    fileInput.type     = 'file';
    fileInput.multiple = multiple;
    fileInput.accept   = accept;
    fileInput.style.display = 'none';

    const listEl = document.createElement('div');
    listEl.className = 'mbkh-upload-list';

    const actionsEl = document.createElement('div');
    actionsEl.className = 'mbkh-upload-actions';
    actionsEl.style.display = 'none';
    actionsEl.innerHTML = `
      <span class="mbkh-upload-summary" id="mbkh-upl-summary"></span>
      <button type="button" class="mbkh-btn mbkh-btn-ghost" id="mbkh-upl-clear">Clear done</button>
      <button type="button" class="mbkh-btn mbkh-btn-primary" id="mbkh-upl-start">Upload All</button>`;

    root.appendChild(dropzone);
    root.appendChild(fileInput);
    root.appendChild(listEl);
    root.appendChild(actionsEl);
    containerEl.appendChild(root);

    let queue = [];

    function updateSummary() {
      const total    = queue.length;
      const done     = queue.filter(f => f.state === 'done').length;
      const errors   = queue.filter(f => f.state === 'error').length;
      const pending  = queue.filter(f => f.state === 'pending').length;

      const summaryEl = root.querySelector('#mbkh-upl-summary');
      if (summaryEl) {
        summaryEl.textContent = `${done}/${total} uploaded${errors ? ` • ${errors} failed` : ''}${pending ? ` • ${pending} pending` : ''}`;
      }
      actionsEl.style.display = total ? '' : 'none';
    }

    function renderItem(entry) {
      const existing = root.querySelector(`[data-upload-id="${CSS.escape(entry.id)}"]`);
      if (existing) { updateUploadItemEl(existing, entry); return; }

      const e   = ext(entry.file.name);
      const ti  = fileTypeInfo(entry.file.name);

      const div = document.createElement('div');
      div.className = 'mbkh-upload-item';
      div.dataset.uploadId = entry.id;
      div.innerHTML = `
        <div class="mbkh-upload-file-icon" style="background:${ti.bg};color:${ti.color}">${ti.label.slice(0,4)}</div>
        <div class="mbkh-upload-info">
          <div class="mbkh-upload-name" title="${esc(entry.file.name)}">${esc(entry.file.name)}</div>
          <div class="mbkh-upload-progress-row">
            <div class="mbkh-progress-bar-wrap"><div class="mbkh-progress-bar" style="width:0%"></div></div>
            <span class="mbkh-upload-pct">0%</span>
          </div>
          <div class="mbkh-upload-status">${formatBytes(entry.file.size)}</div>
        </div>
        <button class="mbkh-upload-remove" title="Remove" aria-label="Remove file">${icon('trash', 13)}</button>`;

      div.querySelector('.mbkh-upload-remove').addEventListener('click', () => {
        queue = queue.filter(q => q.id !== entry.id);
        div.remove();
        updateSummary();
      });

      listEl.appendChild(div);
    }

    function updateUploadItemEl(el, entry) {
      const bar    = el.querySelector('.mbkh-progress-bar');
      const pct    = el.querySelector('.mbkh-upload-pct');
      const status = el.querySelector('.mbkh-upload-status');
      const p      = Math.round((entry.progress || 0) * 100);

      if (bar) bar.style.width = p + '%';
      if (pct) pct.textContent = p + '%';

      el.classList.remove('mbkh-done', 'mbkh-error');
      if (entry.state === 'done') {
        el.classList.add('mbkh-done');
        if (status) status.textContent = '✓ Uploaded';
        if (pct)    pct.textContent    = '100%';
        if (bar)    bar.style.width    = '100%';
        const rmBtn = el.querySelector('.mbkh-upload-remove');
        if (rmBtn) rmBtn.disabled = false;
      } else if (entry.state === 'error') {
        el.classList.add('mbkh-error');
        if (status) status.textContent = '✕ ' + (entry.error || 'Failed');
      } else if (entry.state === 'uploading') {
        if (status) status.textContent = 'Uploading…';
        const rmBtn = el.querySelector('.mbkh-upload-remove');
        if (rmBtn) rmBtn.disabled = true;
      }
    }

    function addFiles(files) {
      const arr = Array.from(files);
      if (!multiple && arr.length > 0) {
        queue = [];
        listEl.innerHTML = '';
      }
      arr.forEach(file => {
        const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const entry = { file, id, state: 'pending', progress: 0 };
        queue.push(entry);
        renderItem(entry);
      });
      updateSummary();
    }

    async function startUploadAll() {
      const pending = queue.filter(e => e.state === 'pending' || e.state === 'error');
      if (!pending.length) {
        toast.info('No pending files to upload');
        return;
      }

      const startBtn = root.querySelector('#mbkh-upl-start');
      if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Uploading…'; }

      for (const entry of pending) {
        entry.state    = 'uploading';
        entry.progress = 0;
        const el = root.querySelector(`[data-upload-id="${CSS.escape(entry.id)}"]`);
        if (el) updateUploadItemEl(el, entry);

        try {
          const result = await api.uploadFile(options.prefix || '', entry.file, {
            bucket: options.bucket || '',
            onProgress: p => {
              entry.progress = p;
              const el2 = root.querySelector(`[data-upload-id="${CSS.escape(entry.id)}"]`);
              if (el2) updateUploadItemEl(el2, entry);
            },
          });

          entry.state = 'done';
          entry.key   = result.key || '';
          const el2   = root.querySelector(`[data-upload-id="${CSS.escape(entry.id)}"]`);
          if (el2) updateUploadItemEl(el2, entry);

          if (options.onSuccess) options.onSuccess({ file: entry.file, key: entry.key, result });
          toast.success(`Uploaded: ${entry.file.name}`);
        } catch (err) {
          entry.state = 'error';
          entry.error = err.message || 'Upload failed';
          const el2   = root.querySelector(`[data-upload-id="${CSS.escape(entry.id)}"]`);
          if (el2) updateUploadItemEl(el2, entry);

          if (options.onError) options.onError({ file: entry.file, error: err });
          toast.error(`Failed: ${entry.file.name} — ${err.message}`);
        }
        updateSummary();
      }

      if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'Upload All'; }
    }

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
    dropzone.querySelector('strong')?.addEventListener('click', e => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        addFiles(fileInput.files);
        fileInput.value = '';
      }
    });

    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('mbkh-drag-over'); });
    dropzone.addEventListener('dragleave', e => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('mbkh-drag-over'); });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('mbkh-drag-over');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addFiles(files);
    });

    root.querySelector('#mbkh-upl-start')?.addEventListener('click', startUploadAll);
    root.querySelector('#mbkh-upl-clear')?.addEventListener('click', () => {
      queue = queue.filter(e => e.state !== 'done');
      listEl.querySelectorAll('.mbkh-upload-item.mbkh-done').forEach(el => el.remove());
      updateSummary();
    });

    return {
      el:       root,
      addFiles: f => addFiles(f instanceof FileList ? f : [f]),
      clear:    () => { queue = []; listEl.innerHTML = ''; updateSummary(); },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-init via data attributes
  // ─────────────────────────────────────────────────────────────────────────

  function autoInit() {
    document.querySelectorAll('input[data-mbk-picker]').forEach(el => {
      try {
        createPicker(el, {
          bucket:      el.dataset.mbkBucket      || '',
          prefix:      el.dataset.mbkPrefix      || '',
          placeholder: el.dataset.mbkPlaceholder || undefined,
          preview:     el.dataset.mbkPreview     || undefined,
          multiple:    el.dataset.mbkMultiple === 'true',
        });
      } catch(e) { console.warn('[MBKBucket] Picker init error:', e); }
    });

    document.querySelectorAll('[data-mbk-uploader]').forEach(el => {
      try {
        createUploader(el, {
          bucket:   el.dataset.mbkBucket   || '',
          prefix:   el.dataset.mbkPrefix   || '',
          accept:   el.dataset.mbkAccept   || '',
          multiple: el.dataset.mbkMultiple !== 'false',
        });
      } catch(e) { console.warn('[MBKBucket] Uploader init error:', e); }
    });

    document.querySelectorAll('[data-mbk-gallery-trigger]').forEach(btn => {
      const targetSel  = btn.dataset.mbkTarget;
      const previewSel = btn.dataset.mbkPreview;
      const isMulti    = btn.dataset.mbkMultiple === 'true';

      btn.addEventListener('click', async () => {
        const result = await openGallery({
          bucket:   btn.dataset.mbkBucket || '',
          prefix:   btn.dataset.mbkPrefix || '',
          multiple: isMulti,
        });
        if (result) {
          if (targetSel) {
            const target = document.querySelector(targetSel);
            if (target) {
              if (Array.isArray(result)) {
                target.value = result.map(r => r.key).join(',');
              } else {
                target.value = result.key;
              }
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          if (previewSel) {
            const previewEl = document.querySelector(previewSel);
            if (previewEl) {
              const firstKey = Array.isArray(result) ? result[0]?.key : result.key;
              if (firstKey) {
                const viewUrl = url.view(firstKey, btn.dataset.mbkBucket);
                if (previewEl.tagName.toLowerCase() === 'img') {
                  previewEl.src = viewUrl;
                } else {
                  previewEl.style.backgroundImage = `url("${viewUrl}")`;
                }
              }
            }
          }
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  const MBKBucket = {
    version: '1.2.0',
    openGallery,
    createPicker,
    createUploader,
    url,
    api,
    toast,
    init: autoInit,
  };

  global.MBKBucket = MBKBucket;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})(window);
