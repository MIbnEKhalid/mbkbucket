/**
 * MBKBucket File Manager - UI & Client Logic
 */

(function () {
  'use strict';

  // Global State
  let currentPage = 1;
  let currentPrefix = '';
  let currentSearch = '';
  let currentSort = 'name';
  let currentOrder = 'asc';
  let currentViewMode = localStorage.getItem('mbk_view_mode') || 'grid'; // 'grid' or 'list'
  let currentQuickFilter = 'all'; // 'all', 'media', 'docs', 'code', 'starred'
  let pageFiles = [];
  let pageFolders = [];
  let currentApiPrefix = '';
  let currentNextToken = null;
  let selectedFiles = new Set();
  let starredFiles = new Set(JSON.parse(localStorage.getItem('mbk_starred_keys') || '[]'));

  // Upload State
  let uploadQueue = [];
  let isUploading = false;

  // DOM Elements & Config
  const bucketAppData = document.getElementById('bucketAppData');
  const bucketAppName = bucketAppData?.dataset.appName || '';
  const urlParams = new URLSearchParams(window.location.search);
  const selectedBucket = urlParams.get('bucket') || '';
  let activeBucket = selectedBucket;
  const app = String(bucketAppName || '').toLowerCase();
  const isRootApp = app === 'portal' || app === 'mbkbucket';
  const rootLabel = isRootApp ? 'My Drive' : (bucketAppName || 'Bucket Drive');

  // File categories & extensions
  const MEDIA_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'ogg', 'avi', 'mov', 'mp3', 'wav', 'flac', 'aac', 'm4a']);
  const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf']);
  const CODE_EXTS = new Set(['js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'php', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf', 'json', 'xml', 'log']);

  const FILE_TYPES = {
    pdf:   { color: 'var(--red)',     bg: 'var(--red-lt)',    label: 'PDF' },
    doc:   { color: 'var(--blue)',    bg: 'var(--blue-lt)',   label: 'DOC' },
    docx:  { color: 'var(--blue)',    bg: 'var(--blue-lt)',   label: 'DOC' },
    xls:   { color: 'var(--green)',   bg: 'var(--green-lt)',  label: 'XLS' },
    xlsx:  { color: 'var(--green)',   bg: 'var(--green-lt)',  label: 'XLS' },
    csv:   { color: 'var(--green)',   bg: 'var(--green-lt)',  label: 'CSV' },
    ppt:   { color: 'var(--orange)',  bg: 'rgba(247, 103, 7, 0.1)', label: 'PPT' },
    pptx:  { color: 'var(--orange)',  bg: 'rgba(247, 103, 7, 0.1)', label: 'PPT' },
    txt:   { color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)', label: 'TXT' },
    md:    { color: 'var(--purple)',  bg: 'var(--purple-lt)', label: 'MD' },
    jpg:   { color: 'var(--yellow)',  bg: 'var(--yellow-lt)', label: 'IMG' },
    jpeg:  { color: 'var(--yellow)',  bg: 'var(--yellow-lt)', label: 'IMG' },
    png:   { color: 'var(--yellow)',  bg: 'var(--yellow-lt)', label: 'IMG' },
    gif:   { color: 'var(--yellow)',  bg: 'var(--yellow-lt)', label: 'GIF' },
    webp:  { color: 'var(--yellow)',  bg: 'var(--yellow-lt)', label: 'IMG' },
    svg:   { color: 'var(--orange)',  bg: 'rgba(247, 103, 7, 0.1)', label: 'SVG' },
    mp4:   { color: 'var(--azure)',   bg: 'var(--azure-lt)',  label: 'VID' },
    webm:  { color: 'var(--azure)',   bg: 'var(--azure-lt)',  label: 'VID' },
    mov:   { color: 'var(--azure)',   bg: 'var(--azure-lt)',  label: 'VID' },
    mp3:   { color: 'var(--purple)',  bg: 'var(--purple-lt)', label: 'AUD' },
    wav:   { color: 'var(--purple)',  bg: 'var(--purple-lt)', label: 'AUD' },
    zip:   { color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)', label: 'ZIP' },
    tar:   { color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)', label: 'TAR' },
    gz:    { color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)', label: 'GZ' },
    code:  { color: 'var(--cyan)',    bg: 'var(--cyan-lt)',   label: 'CODE' }
  };

  // SVGs
  const ICONS = {
    folder: '<svg class="folder-svg" viewBox="0 0 32 32" fill="var(--primary-lt)" stroke="var(--primary)" stroke-width="1.3"><path d="M4 8a2 2 0 012-2h6l3 3h11a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/></svg>',
    folderSm: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>',
    drive: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6l4-4h4l4 4v8H2V6z"/></svg>',
    starred: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1l2 5 5 .5-4 3.5 1 5-4-2.5-4 2.5 1-5-4-3.5 5-.5z"/></svg>',
    media: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="5.5" r="1.5"/><path d="M14 10l-4-4-6 6"/></svg>',
    docs: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v4h4"/></svg>',
    code: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 5L2 8l3 3M11 5l3 3-3 3M9 3L7 13"/></svg>',
    more: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="8" cy="13" r="1.2"/></svg>'
  };

  // Helper Functions
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function getBaseName(path) {
    const val = String(path || '').replace(/\/+$/, '');
    const lastSlash = val.lastIndexOf('/');
    return lastSlash === -1 ? val : val.substring(lastSlash + 1);
  }

  function getFileExt(fileName) {
    const name = getBaseName(fileName);
    const dot = name.lastIndexOf('.');
    return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function withBucketUrl(url) {
    if (!activeBucket) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}bucket=${encodeURIComponent(activeBucket)}`;
  }

  function getViewUrl(key) {
    return withBucketUrl(`/mbkbucket/view/${encodeURIComponent(key)}`);
  }

  function getDownloadUrl(key) {
    return withBucketUrl(`/mbkbucket/download/${encodeURIComponent(key)}`);
  }

  function isImage(fileName) {
    const ext = getFileExt(fileName);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  }

  function isVideo(fileName) {
    const ext = getFileExt(fileName);
    return ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext);
  }

  function isAudio(fileName) {
    const ext = getFileExt(fileName);
    return ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext);
  }

  function isTextOrCode(fileName) {
    const ext = getFileExt(fileName);
    return CODE_EXTS.has(ext) || ['txt', 'md', 'csv', 'log', 'json', 'xml', 'env'].includes(ext);
  }

  function isPdf(fileName) {
    return getFileExt(fileName) === 'pdf';
  }

  function getFileTypeConfig(fileName) {
    const ext = getFileExt(fileName);
    if (FILE_TYPES[ext]) return FILE_TYPES[ext];
    if (CODE_EXTS.has(ext)) return FILE_TYPES.code;
    return { color: 'var(--text-secondary)', bg: 'var(--bg-surface-secondary)', label: ext.toUpperCase().slice(0, 4) || 'FILE' };
  }

  function stripApiPrefixFromPath(path, apiPrefix = '') {
    const normalizedPath = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const normalizedApiPrefix = String(apiPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalizedApiPrefix) return normalizedPath;
    if (normalizedPath === normalizedApiPrefix || normalizedPath === `${normalizedApiPrefix}/`) return '';
    if (normalizedPath.startsWith(`${normalizedApiPrefix}/`)) {
      return normalizedPath.slice(normalizedApiPrefix.length + 1);
    }
    return normalizedPath;
  }

  function toApiFolderPath(prefix = '', apiPrefix = '') {
    const uiPrefix = String(prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const normalizedApiPrefix = String(apiPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!uiPrefix) return '';
    if (!normalizedApiPrefix) return uiPrefix;
    if (uiPrefix === normalizedApiPrefix || uiPrefix.startsWith(`${normalizedApiPrefix}/`)) return uiPrefix;
    return `${normalizedApiPrefix}/${uiPrefix}`;
  }

  function extractFoldersAtCurrentLevel(files, prefix = '') {
    const folderSet = new Set();
    const cleanPrefix = String(prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const prefixOffset = cleanPrefix ? cleanPrefix.length + 1 : 0;

    (files || []).forEach(file => {
      const key = String(file.Key || '').replace(/^\/+/, '');
      if (cleanPrefix && !key.startsWith(cleanPrefix + '/')) return;
      const relPath = cleanPrefix ? key.substring(prefixOffset) : key;
      const slashIdx = relPath.indexOf('/');
      if (slashIdx !== -1) {
        const folder = relPath.substring(0, slashIdx);
        folderSet.add(cleanPrefix ? `${cleanPrefix}/${folder}` : folder);
      }
    });

    return Array.from(folderSet).sort();
  }

  function syncStateUrl() {
    try {
      const parts = [];
      if (activeBucket) parts.push(`bucket=${encodeURIComponent(activeBucket)}`);
      if (currentPrefix) {
        const folderPath = toApiFolderPath(currentPrefix, currentApiPrefix);
        parts.push(`folder=${encodeURIComponent(folderPath).replace(/%2F/g, '/')}`);
      }
      if (currentPage > 1) parts.push(`page=${currentPage}`);
      if (currentSearch) parts.push(`search=${encodeURIComponent(currentSearch)}`);
      if (currentSort !== 'name') parts.push(`sort=${encodeURIComponent(currentSort)}`);
      if (currentOrder !== 'asc') parts.push(`order=${encodeURIComponent(currentOrder)}`);
      if (currentViewMode !== 'grid') parts.push(`view=${encodeURIComponent(currentViewMode)}`);
      if (currentQuickFilter !== 'all') parts.push(`filter=${encodeURIComponent(currentQuickFilter)}`);

      const newUrl = '/mbkbucket' + (parts.length ? '?' + parts.join('&') : '');
      window.history.replaceState(null, '', newUrl);
    } catch (e) {
      console.warn('History update failed', e);
    }
  }

  // Toast System
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" class="toast-close-btn">&times;</button>
    `;

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  // Tree Renderer
  function renderTree() {
    const treeEl = document.getElementById('fm-tree');
    if (!treeEl) return;

    const allFolders = pageFolders || [];
    const isStarredActive = currentQuickFilter === 'starred';
    const isRootActive = !currentPrefix && currentQuickFilter === 'all';

    let treeHtml = `
      <div class="tree-group">
        <button type="button" class="tree-link ${isRootActive ? 'active' : ''}" data-tree-prefix="" data-tree-filter="all">
          ${ICONS.drive}
          <span>${escapeHtml(rootLabel)}</span>
        </button>
      </div>
    `;

    // Folder hierarchy
    if (allFolders.length > 0) {
      treeHtml += `
        <div class="tree-group">
          <div class="tree-subs">
            ${allFolders.map(folder => {
              const cleanFolder = String(folder || '').replace(/\/+$/, '');
              const folderName = getBaseName(cleanFolder);
              const folderPathForAction = currentPrefix && !cleanFolder.startsWith(currentPrefix + '/') && cleanFolder !== currentPrefix
                ? `${currentPrefix}/${cleanFolder}`
                : cleanFolder;
              const isFolderActive = currentPrefix === folderPathForAction;
              return `
                <button type="button" class="tree-link tree-sub ${isFolderActive ? 'active' : ''}" data-tree-prefix="${escapeAttr(folderPathForAction)}" data-tree-filter="all">
                  ${ICONS.folderSm}
                  <span>${escapeHtml(folderName)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Quick navigation filters
    treeHtml += `
      <div class="tree-group" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border-color-light);">
        <button type="button" class="tree-link ${isStarredActive ? 'active' : ''}" data-tree-filter="starred">
          ${ICONS.starred}
          <span>Starred</span>
          ${starredFiles.size > 0 ? `<span class="tree-badge">${starredFiles.size}</span>` : ''}
        </button>
        <button type="button" class="tree-link ${currentQuickFilter === 'media' ? 'active' : ''}" data-tree-filter="media">
          ${ICONS.media}
          <span>Media</span>
        </button>
        <button type="button" class="tree-link ${currentQuickFilter === 'docs' ? 'active' : ''}" data-tree-filter="docs">
          ${ICONS.docs}
          <span>Documents</span>
        </button>
        <button type="button" class="tree-link ${currentQuickFilter === 'code' ? 'active' : ''}" data-tree-filter="code">
          ${ICONS.code}
          <span>Code</span>
        </button>
      </div>
    `;

    treeEl.innerHTML = treeHtml;
  }

  // Breadcrumbs Renderer
  function renderBreadcrumbs() {
    const bcEl = document.getElementById('fm-breadcrumb');
    if (!bcEl) return;

    if (!currentPrefix && currentQuickFilter === 'all') {
      bcEl.innerHTML = `<button type="button" class="bc-link current">${escapeHtml(rootLabel)}</button>`;
      return;
    }

    if (currentQuickFilter !== 'all') {
      bcEl.innerHTML = `
        <button type="button" class="bc-link" data-nav-prefix="">${escapeHtml(rootLabel)}</button>
        <span class="sep">›</span>
        <button type="button" class="bc-link current">${escapeHtml(currentQuickFilter.charAt(0).toUpperCase() + currentQuickFilter.slice(1))}</button>
      `;
      return;
    }

    const parts = currentPrefix.split('/').filter(Boolean);
    let accum = '';
    const breadcrumbHtml = [
      `<button type="button" class="bc-link" data-nav-prefix="">${escapeHtml(rootLabel)}</button>`
    ];

    parts.forEach((part, index) => {
      accum += (accum ? '/' : '') + part;
      const isLast = index === parts.length - 1;
      breadcrumbHtml.push('<span class="sep">›</span>');
      if (isLast) {
        breadcrumbHtml.push(`<button type="button" class="bc-link current">${escapeHtml(part)}</button>`);
      } else {
        breadcrumbHtml.push(`<button type="button" class="bc-link" data-nav-prefix="${escapeAttr(accum)}">${escapeHtml(part)}</button>`);
      }
    });

    bcEl.innerHTML = breadcrumbHtml.join('');
  }

  // File Filtering Logic
  function getFilteredFiles() {
    let list = (pageFiles || []).filter(f => !String(f.Key || '').endsWith('/'));

    // Search filter
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      list = list.filter(f => getBaseName(f.Key).toLowerCase().includes(q));
    }

    // Quick filter
    if (currentQuickFilter === 'media') {
      list = list.filter(f => MEDIA_EXTS.has(getFileExt(f.Key)));
    } else if (currentQuickFilter === 'docs') {
      list = list.filter(f => DOC_EXTS.has(getFileExt(f.Key)));
    } else if (currentQuickFilter === 'code') {
      list = list.filter(f => CODE_EXTS.has(getFileExt(f.Key)));
    } else if (currentQuickFilter === 'starred') {
      list = list.filter(f => starredFiles.has(f.Key));
    }

    return list;
  }

  function getFilteredFolders() {
    if (currentQuickFilter !== 'all') return [];
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      return (pageFolders || []).filter(f => getBaseName(f).toLowerCase().includes(q));
    }
    return pageFolders || [];
  }

  // Main Files & Grid Renderer
  function renderFiles() {
    const gridEl = document.getElementById('fm-grid');
    const emptyEl = document.getElementById('fm-empty');
    if (!gridEl) return;

    const files = getFilteredFiles();
    const folders = getFilteredFolders();

    // Update stats
    const totalCountEl = document.getElementById('totalFilesCount');
    const filterInfoEl = document.getElementById('filterInfo');
    const totalItems = files.length + folders.length;

    if (totalCountEl) {
      totalCountEl.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    }
    if (filterInfoEl) {
      filterInfoEl.textContent = activeBucket ? `Bucket: ${activeBucket}` : 'Default bucket';
    }

    if (totalItems === 0) {
      gridEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.style.display = 'flex';
      }
      return;
    }

    if (emptyEl) {
      emptyEl.hidden = true;
      emptyEl.style.display = 'none';
    }
    gridEl.className = `fm-grid view-${currentViewMode}`;

    let html = '';

    // If List view, add header row
    if (currentViewMode === 'list') {
      html += `
        <div class="fm-list-header">
          <div></div>
          <div></div>
          <div>Name</div>
          <div>Size</div>
          <div>Modified</div>
          <div></div>
          <div></div>
        </div>
      `;
    }

    // Render Folders
    folders.forEach(folder => {
      const cleanFolder = String(folder || '').replace(/\/+$/, '');
      const folderName = getBaseName(cleanFolder);
      const folderPathForAction = currentPrefix && !cleanFolder.startsWith(currentPrefix + '/') && cleanFolder !== currentPrefix
        ? `${currentPrefix}/${cleanFolder}`
        : cleanFolder;
      const safePath = escapeAttr(folderPathForAction);
      const safeName = escapeHtml(folderName);

      if (currentViewMode === 'grid') {
        html += `
          <div class="fm-item" data-type="folder" data-folder-path="${safePath}" tabindex="0">
            <div class="fm-item-icon">
              ${ICONS.folder}
            </div>
            <div class="fm-item-details">
              <div class="fm-item-name" title="${safeName}">${safeName}</div>
              <div class="fm-item-meta">Folder</div>
            </div>
            <button type="button" class="fm-item-menu" data-menu-folder="${safePath}" aria-label="Folder options">
              ${ICONS.more}
            </button>
          </div>
        `;
      } else {
        html += `
          <div class="fm-item" data-type="folder" data-folder-path="${safePath}" tabindex="0">
            <div class="fm-item-checkbox"></div>
            <div class="fm-item-icon">
              ${ICONS.folderSm}
            </div>
            <div class="fm-item-name" title="${safeName}">${safeName}</div>
            <div class="fm-item-size fm-item-meta">—</div>
            <div class="fm-item-date fm-item-meta">—</div>
            <div class="fm-star-wrap"></div>
            <button type="button" class="fm-item-menu" data-menu-folder="${safePath}" aria-label="Folder options">
              ${ICONS.more}
            </button>
          </div>
        `;
      }
    });

    // Render Files
    files.forEach(file => {
      const rawKey = String(file.Key || '');
      const fileName = getBaseName(rawKey);
      const safeKey = escapeAttr(rawKey);
      const safeName = escapeHtml(fileName);
      const isStarred = starredFiles.has(rawKey);
      const isImg = isImage(fileName);
      const typeCfg = getFileTypeConfig(fileName);
      const formattedSize = file.Size ? formatFileSize(file.Size) : '—';
      const formattedDate = file.LastModified ? formatDate(file.LastModified) : '—';

      let iconInner = `<span class="ext">${typeCfg.label}</span>`;
      if (isImg) {
        iconInner = `<img src="${getViewUrl(rawKey)}" class="fm-item-thumb" alt="${safeName}" loading="lazy" onerror="this.outerHTML='<span class=\\'ext\\'>IMG</span>'">`;
      }

      if (currentViewMode === 'grid') {
        html += `
          <div class="fm-item ${isStarred ? 'starred' : ''}" data-type="file" data-key="${safeKey}" tabindex="0">
            <div class="fm-item-icon" style="${isImg ? '' : `background:${typeCfg.bg};color:${typeCfg.color}`}">
              ${iconInner}
            </div>
            <div class="fm-item-details">
              <div class="fm-item-name" title="${safeName}">${safeName}</div>
              <div class="fm-item-meta">${formattedSize} · ${formattedDate}</div>
            </div>
            <button type="button" class="fm-star ${isStarred ? 'on' : ''}" data-star-key="${safeKey}" aria-label="${isStarred ? 'Unstar' : 'Star'}">
              ${ICONS.starred}
            </button>
            <button type="button" class="fm-item-menu" data-menu-file="${safeKey}" aria-label="File options">
              ${ICONS.more}
            </button>
          </div>
        `;
      } else {
        html += `
          <div class="fm-item ${isStarred ? 'starred' : ''}" data-type="file" data-key="${safeKey}" tabindex="0">
            <div class="fm-item-checkbox">
              <input type="checkbox" class="file-select-cb" data-key="${safeKey}">
            </div>
            <div class="fm-item-icon" style="${isImg ? '' : `background:${typeCfg.bg};color:${typeCfg.color}`}">
              <span class="ext">${typeCfg.label}</span>
            </div>
            <div class="fm-item-name" title="${safeName}">${safeName}</div>
            <div class="fm-item-size fm-item-meta">${formattedSize}</div>
            <div class="fm-item-date fm-item-meta">${formattedDate}</div>
            <button type="button" class="fm-star ${isStarred ? 'on' : ''}" data-star-key="${safeKey}" aria-label="${isStarred ? 'Unstar' : 'Star'}">
              ${ICONS.starred}
            </button>
            <button type="button" class="fm-item-menu" data-menu-file="${safeKey}" aria-label="File options">
              ${ICONS.more}
            </button>
          </div>
        `;
      }
    });

    gridEl.innerHTML = html;
  }

  // Load Files API Call
  async function loadFiles(page = 1, prefix = '', search = '') {
    currentPage = page;
    currentPrefix = String(prefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
    currentSearch = search;

    syncStateUrl();

    const gridEl = document.getElementById('fm-grid');
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="fm-skeleton-grid">
          ${[...Array(6)].map(() => `
            <div class="fm-skeleton-card">
              <div class="fm-skeleton-icon"></div>
              <div class="fm-skeleton-line w-75"></div>
              <div class="fm-skeleton-line w-50"></div>
            </div>
          `).join('')}
        </div>
      `;
    }

    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const sortParam = `&sort=${currentSort}&order=${currentOrder}`;
      const recursiveParam = `&recursive=false`;
      const url = withBucketUrl(`/mbkbucket/api/files?page=${page}&prefix=${encodeURIComponent(currentPrefix)}${searchParam}${sortParam}${recursiveParam}`);

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load files');
      }

      currentNextToken = data.nextContinuationToken || null;
      currentApiPrefix = data.prefix || '';
      pageFiles = data.files || [];

      if (data.mode === 'optimized') {
        pageFolders = (data.folders || []).map(folder => stripApiPrefixFromPath(folder, currentApiPrefix)).filter(Boolean);
      } else {
        pageFolders = currentSearch
          ? []
          : extractFoldersAtCurrentLevel(pageFiles, currentApiPrefix || currentPrefix)
              .map(folder => stripApiPrefixFromPath(folder, currentApiPrefix))
              .filter(Boolean);
      }

      renderTree();
      renderBreadcrumbs();
      renderFiles();
      renderPagination(data);
    } catch (err) {
      console.error('Error loading files:', err);
      showToast(err.message || 'Error loading files', 'error');
      if (gridEl) {
        gridEl.innerHTML = `
          <div class="fm-empty">
            <div class="empty-title">Error Loading Files</div>
            <div class="empty-desc">${escapeHtml(err.message)}</div>
            <button type="button" class="btn btn-primary btn-sm mt-3" onclick="window.mbkbucket.loadFiles(${page}, '${escapeAttr(currentPrefix)}')">Retry</button>
          </div>
        `;
      }
    }
  }

  // Pagination Renderer
  function renderPagination(data) {
    const paginationContainer = document.getElementById('paginationContainer');
    const paginationList = document.getElementById('paginationList');
    if (!paginationContainer || !paginationList) return;

    if (!data.totalPages || data.totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';
    let html = '';

    // Prev
    html += `
      <li class="page-item ${data.currentPage <= 1 ? 'disabled' : ''}">
        <button type="button" class="page-link" data-page="${data.currentPage - 1}">‹</button>
      </li>
    `;

    // Pages
    for (let i = 1; i <= data.totalPages; i++) {
      if (i === 1 || i === data.totalPages || (i >= data.currentPage - 2 && i <= data.currentPage + 2)) {
        html += `
          <li class="page-item ${i === data.currentPage ? 'active' : ''}">
            <button type="button" class="page-link" data-page="${i}">${i}</button>
          </li>
        `;
      } else if (i === data.currentPage - 3 || i === data.currentPage + 3) {
        html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      }
    }

    // Next
    html += `
      <li class="page-item ${data.currentPage >= data.totalPages ? 'disabled' : ''}">
        <button type="button" class="page-link" data-page="${data.currentPage + 1}">›</button>
      </li>
    `;

    paginationList.innerHTML = html;
  }

  // Context Menu
  function openContextMenu(x, y, items) {
    const menu = document.getElementById('fm-context-menu');
    if (!menu) return;

    menu.innerHTML = items.map(item => {
      if (item === '-') return '<div class="fm-context-divider"></div>';
      return `<button type="button" class="fm-context-item ${item.danger ? 'danger' : ''}" data-action="${item.id}">${item.icon || ''} ${escapeHtml(item.label)}</button>`;
    }).join('');

    menu.style.display = 'block';

    const menuWidth = 180;
    const menuHeight = menu.offsetHeight || 150;
    const posX = Math.min(x, window.innerWidth - menuWidth - 10);
    const posY = Math.min(y, window.innerHeight - menuHeight - 10);

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    menu.querySelectorAll('.fm-context-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const actionId = btn.dataset.action;
        const targetItem = items.find(it => it.id === actionId);
        menu.style.display = 'none';
        if (targetItem && typeof targetItem.action === 'function') {
          targetItem.action();
        }
      });
    });
  }

  function closeContextMenu() {
    const menu = document.getElementById('fm-context-menu');
    if (menu) menu.style.display = 'none';
  }

  // Actions: Star, Download, Preview, Delete, New Folder
  function toggleStar(key) {
    if (starredFiles.has(key)) {
      starredFiles.delete(key);
      showToast('Removed from Starred');
    } else {
      starredFiles.add(key);
      showToast('Added to Starred', 'success');
    }
    localStorage.setItem('mbk_starred_keys', JSON.stringify([...starredFiles]));
    renderTree();
    renderFiles();
  }

  async function downloadFile(key) {
    const fileName = getBaseName(key);
    const downloadUrl = getDownloadUrl(key);
    showToast(`Downloading ${fileName}...`);
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function copyShareLink(key) {
    const viewUrl = window.location.origin + getViewUrl(key);
    navigator.clipboard.writeText(viewUrl).then(() => {
      showToast('Link copied to clipboard', 'success');
    }).catch(() => {
      showToast('Failed to copy link', 'error');
    });
  }

  // Preview Modal
  function openPreview(key) {
    const modal = document.getElementById('previewModal');
    const titleEl = document.getElementById('previewFileName');
    const contentEl = document.getElementById('previewContent');
    const openBtn = document.getElementById('previewOpenBtn');
    const downloadBtn = document.getElementById('previewDownloadBtn');

    if (!modal || !contentEl) return;

    const fileName = getBaseName(key);
    const viewUrl = getViewUrl(key);
    const downloadUrl = getDownloadUrl(key);

    if (titleEl) titleEl.textContent = fileName;
    if (openBtn) openBtn.href = viewUrl;
    if (downloadBtn) downloadBtn.href = downloadUrl;

    contentEl.innerHTML = '<div class="empty-preview"><div class="spinner-border text-light"></div><div class="mt-2 text-light">Loading preview...</div></div>';
    modal.classList.add('show');

    if (isImage(fileName)) {
      contentEl.innerHTML = `<img src="${viewUrl}" alt="${escapeAttr(fileName)}">`;
    } else if (isVideo(fileName)) {
      contentEl.innerHTML = `<video controls autoplay class="w-100" style="max-height: 70vh;"><source src="${viewUrl}"></video>`;
    } else if (isAudio(fileName)) {
      contentEl.innerHTML = `<div class="p-4 text-center"><audio controls autoplay class="w-100"><source src="${viewUrl}"></audio></div>`;
    } else if (isPdf(fileName)) {
      contentEl.innerHTML = `<iframe src="${viewUrl}" class="preview-iframe"></iframe>`;
    } else if (isTextOrCode(fileName)) {
      fetch(viewUrl).then(res => res.text()).then(text => {
        contentEl.innerHTML = `<pre class="preview-code-block"><code>${escapeHtml(text)}</code></pre>`;
      }).catch(err => {
        contentEl.innerHTML = `<div class="p-4 text-danger text-center">Failed to load text preview: ${escapeHtml(err.message)}</div>`;
      });
    } else {
      contentEl.innerHTML = `
        <div class="p-5 text-center text-light">
          <h5>No inline preview available for this file type.</h5>
          <p class="text-muted small">You can open it in a new tab or download it directly.</p>
        </div>
      `;
    }
  }

  window.closePreviewModal = function () {
    const modal = document.getElementById('previewModal');
    if (modal) modal.classList.remove('show');
  };

  // Delete Modal
  function promptDelete(key, isFolder = false) {
    const modal = document.getElementById('deleteModal');
    const deleteFileName = document.getElementById('deleteFileName');
    const deleteKey = document.getElementById('deleteKey');
    const deleteIsFolder = document.getElementById('deleteIsFolder');
    const deleteConfirmLabel = document.getElementById('deleteConfirmLabel');

    if (!modal) return;

    if (deleteFileName) deleteFileName.textContent = key;
    if (deleteKey) deleteKey.value = key;
    if (deleteIsFolder) deleteIsFolder.value = isFolder ? 'true' : '';
    if (deleteConfirmLabel) deleteConfirmLabel.textContent = isFolder ? 'Delete Folder' : 'Delete File';

    modal.classList.add('show');
  }

  window.closeModal = function () {
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) deleteModal.classList.remove('show');
  };

  // New Folder Modal
  function openNewFolderModal() {
    const modal = document.getElementById('newFolderModal');
    const input = document.getElementById('newFolderNameInput');
    if (!modal) return;
    if (input) input.value = '';
    modal.classList.add('show');
    if (input) setTimeout(() => input.focus(), 50);
  }

  window.closeNewFolderModal = function () {
    const modal = document.getElementById('newFolderModal');
    if (modal) modal.classList.remove('show');
  };

  window.submitCreateFolder = async function () {
    const input = document.getElementById('newFolderNameInput');
    const name = input ? input.value.trim() : '';
    if (!name) {
      showToast('Please enter a folder name', 'warning');
      return;
    }

    try {
      const response = await fetch(withBucketUrl('/mbkbucket/create-folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: name, prefix: currentPrefix })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to create folder');

      closeNewFolderModal();
      showToast(`Folder "${name}" created`, 'success');
      loadFiles(1, currentPrefix);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Upload Modal & Flow
  function openUploadModal() {
    const modal = document.getElementById('uploadModal');
    const prefixInput = document.getElementById('uploadPrefixInput');
    if (prefixInput) prefixInput.value = currentPrefix;
    if (modal) modal.classList.add('show');
  }

  window.closeUploadModal = function () {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.remove('show');
  };

  function updateUploadQueueUI() {
    const queueEl = document.getElementById('uploadQueue');
    const clearBtn = document.getElementById('clearQueueBtn');
    if (!queueEl) return;

    if (uploadQueue.length === 0) {
      queueEl.innerHTML = '';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    if (clearBtn) clearBtn.style.display = 'inline-flex';
    queueEl.innerHTML = uploadQueue.map((file, idx) => `
      <div class="upload-queue-item">
        <div class="d-flex align-items-center gap-2">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="upload-queue-meta">${formatFileSize(file.size)}</span>
        </div>
        <button type="button" class="btn-close" data-remove-queue="${idx}" style="font-size: 14px;">&times;</button>
      </div>
    `).join('');
  }

  async function processUploads() {
    if (isUploading || uploadQueue.length === 0) return;
    isUploading = true;

    const progressWrap = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const percentEl = document.getElementById('uploadPercent');
    const statusLabel = document.getElementById('uploadStatusLabel');
    const startBtn = document.getElementById('startUploadBtn');

    if (progressWrap) progressWrap.style.display = 'block';
    if (startBtn) startBtn.disabled = true;

    const totalFiles = uploadQueue.length;
    let completed = 0;

    for (let i = 0; i < uploadQueue.length; i++) {
      const file = uploadQueue[i];
      if (statusLabel) statusLabel.textContent = `Uploading ${file.name} (${i + 1}/${totalFiles})...`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('prefix', currentPrefix);

      try {
        const response = await fetch(withBucketUrl('/mbkbucket/upload'), {
          method: 'POST',
          body: formData
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Upload failed');
        completed++;
      } catch (err) {
        showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
      }

      const percent = Math.round(((i + 1) / totalFiles) * 100);
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (percentEl) percentEl.textContent = `${percent}%`;
    }

    showToast(`Successfully uploaded ${completed} file(s)`, 'success');
    uploadQueue = [];
    isUploading = false;
    if (startBtn) startBtn.disabled = false;
    if (progressWrap) progressWrap.style.display = 'none';
    closeUploadModal();
    updateUploadQueueUI();
    loadFiles(1, currentPrefix);
  }

  // Event Listeners Setup
  function initEventListeners() {
    // Tree clicks
    document.getElementById('fm-tree')?.addEventListener('click', (e) => {
      const link = e.target.closest('.tree-link');
      if (!link) return;
      e.preventDefault();
      const filter = link.dataset.treeFilter;
      const prefix = link.dataset.treePrefix;

      if (filter && filter !== 'all') {
        currentQuickFilter = filter;
        document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
        renderTree();
        renderBreadcrumbs();
        renderFiles();
      } else {
        currentQuickFilter = 'all';
        document.querySelectorAll('.quick-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.filter === 'all');
        });
        loadFiles(1, prefix !== undefined ? prefix : '');
      }
    });

    // Breadcrumb clicks
    document.getElementById('fm-breadcrumb')?.addEventListener('click', (e) => {
      const link = e.target.closest('[data-nav-prefix]');
      if (!link) return;
      e.preventDefault();
      currentQuickFilter = 'all';
      loadFiles(1, link.dataset.navPrefix || '');
    });

    // Quick filters
    document.querySelectorAll('.quick-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentQuickFilter = btn.dataset.filter || 'all';
        renderTree();
        renderBreadcrumbs();
        renderFiles();
        syncStateUrl();
      });
    });

    // View mode toggle
    const gridBtn = document.getElementById('view-grid');
    const listBtn = document.getElementById('view-list');

    gridBtn?.addEventListener('click', () => {
      currentViewMode = 'grid';
      localStorage.setItem('mbk_view_mode', 'grid');
      gridBtn.classList.add('active');
      listBtn?.classList.remove('active');
      renderFiles();
      syncStateUrl();
    });

    listBtn?.addEventListener('click', () => {
      currentViewMode = 'list';
      localStorage.setItem('mbk_view_mode', 'list');
      listBtn.classList.add('active');
      gridBtn?.classList.remove('active');
      renderFiles();
      syncStateUrl();
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('searchClearBtn');

    let searchTimer = null;
    searchInput?.addEventListener('input', (e) => {
      const val = e.target.value;
      if (clearSearchBtn) clearSearchBtn.style.display = val ? 'block' : 'none';

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        currentSearch = val.trim();
        renderFiles();
      }, 250);
    });

    clearSearchBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      currentSearch = '';
      renderFiles();
    });

    // Grid Item Interactions (Click, Double Click, Star, Context Menu)
    document.getElementById('fm-grid')?.addEventListener('click', (e) => {
      // Star click
      const starBtn = e.target.closest('[data-star-key]');
      if (starBtn) {
        e.stopPropagation();
        toggleStar(starBtn.dataset.starKey);
        return;
      }

      // Menu click
      const menuBtn = e.target.closest('.fm-item-menu');
      if (menuBtn) {
        e.stopPropagation();
        const rect = menuBtn.getBoundingClientRect();
        const fileKey = menuBtn.dataset.menuFile;
        const folderPath = menuBtn.dataset.menuFolder;

        if (fileKey) {
          const isStarred = starredFiles.has(fileKey);
          openContextMenu(rect.left, rect.bottom + 4, [
            { id: 'view', label: 'Preview', icon: '<i class="fas fa-eye"></i>', action: () => openPreview(fileKey) },
            { id: 'download', label: 'Download', icon: '<i class="fas fa-download"></i>', action: () => downloadFile(fileKey) },
            { id: 'share', label: 'Copy link', icon: '<i class="fas fa-link"></i>', action: () => copyShareLink(fileKey) },
            { id: 'star', label: isStarred ? 'Unstar' : 'Star', icon: '<i class="fas fa-star"></i>', action: () => toggleStar(fileKey) },
            '-',
            { id: 'delete', label: 'Delete', icon: '<i class="fas fa-trash"></i>', danger: true, action: () => promptDelete(fileKey, false) }
          ]);
        } else if (folderPath) {
          openContextMenu(rect.left, rect.bottom + 4, [
            { id: 'open', label: 'Open Folder', icon: '<i class="fas fa-folder-open"></i>', action: () => loadFiles(1, folderPath) },
            '-',
            { id: 'delete', label: 'Delete Folder', icon: '<i class="fas fa-trash"></i>', danger: true, action: () => promptDelete(folderPath + '/', true) }
          ]);
        }
        return;
      }

      // Folder click to navigate
      const folderItem = e.target.closest('[data-type="folder"]');
      if (folderItem) {
        e.stopPropagation();
        loadFiles(1, folderItem.dataset.folderPath);
        return;
      }

      // File click to preview
      const fileItem = e.target.closest('[data-type="file"]');
      if (fileItem && !e.target.closest('.file-select-cb')) {
        e.stopPropagation();
        openPreview(fileItem.dataset.key);
      }
    });

    // Bucket Selector
    document.getElementById('bucketSelector')?.addEventListener('change', (e) => {
      const newBucket = e.target.value;
      if (!newBucket) return;
      activeBucket = newBucket;
      loadFiles(1, '');
    });

    // Top action buttons & Modals
    document.querySelectorAll('[data-action="upload-files"]').forEach(btn => {
      btn.addEventListener('click', openUploadModal);
    });

    document.querySelectorAll('[data-action="create-folder"]').forEach(btn => {
      btn.addEventListener('click', openNewFolderModal);
    });

    // Drag and Drop Upload Zone
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone?.addEventListener('click', () => fileInput?.click());

    dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone?.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        uploadQueue.push(...Array.from(e.dataTransfer.files));
        updateUploadQueueUI();
      }
    });

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        uploadQueue.push(...Array.from(e.target.files));
        updateUploadQueueUI();
      }
    });

    document.getElementById('uploadQueue')?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-queue]');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.removeQueue, 10);
        uploadQueue.splice(idx, 1);
        updateUploadQueueUI();
      }
    });

    document.getElementById('clearQueueBtn')?.addEventListener('click', () => {
      uploadQueue = [];
      updateUploadQueueUI();
    });

    document.getElementById('startUploadBtn')?.addEventListener('click', processUploads);

    // Fullscreen Preview Toggle
    document.getElementById('previewFullscreenBtn')?.addEventListener('click', () => {
      document.querySelector('.preview-modal-dialog')?.classList.toggle('is-fullscreen');
    });

    // Pagination clicks
    document.getElementById('paginationList')?.addEventListener('click', (e) => {
      const link = e.target.closest('[data-page]');
      if (!link) return;
      const page = parseInt(link.dataset.page, 10);
      if (!isNaN(page) && page > 0) {
        loadFiles(page, currentPrefix, currentSearch);
      }
    });

    // Global click to close context menu
    document.addEventListener('click', closeContextMenu);

    // Handle delete form submission
    const deleteForm = document.getElementById('deleteForm');
    deleteForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(deleteForm);
      const key = formData.get('key');
      const isFolder = formData.get('folder') === 'true';

      try {
        const response = await fetch(withBucketUrl('/mbkbucket/delete'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, isFolder, prefix: currentPrefix })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Delete failed');

        closeModal();
        showToast(`Successfully deleted ${key}`, 'success');
        loadFiles(currentPage, currentPrefix);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Sync view mode buttons
    if (currentViewMode === 'list') {
      document.getElementById('view-list')?.classList.add('active');
      document.getElementById('view-grid')?.classList.remove('active');
    }

    initEventListeners();

    // Initial load with URL params
    const initialFolder = urlParams.get('folder') || '';
    const initialPage = parseInt(urlParams.get('page') || '1', 10);
    const initialSearch = urlParams.get('search') || '';

    loadFiles(initialPage, initialFolder, initialSearch);
  });

  // Expose global methods if needed
  window.mbkbucket = {
    loadFiles,
    openPreview,
    downloadFile,
    showToast
  };

})();
