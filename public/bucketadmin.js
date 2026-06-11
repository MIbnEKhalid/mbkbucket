// Global state
let currentPage = 1;
let currentPrefix = '';
let currentSearch = '';
let currentSort = 'name';
let currentOrder = 'asc';
let currentViewMode = 'folder'; // 'folder' or 'flat'
let pageFiles = [];
let pageFolders = [];
let currentNextToken = null;
let currentApiPrefix = '';
const bucketAppName = document.getElementById('bucketAppData')?.dataset.appName || '';
const selectedBucket = new URLSearchParams(window.location.search).get('bucket') || '';
let activeBucket = selectedBucket;
const isRootApp = String(bucketAppName || '').toLowerCase() === 'portal';
const rootLabel = isRootApp ? 'root' : (bucketAppName || 'app');
let currentQuickFilter = 'all';
let virtualRenderLimit = 0;
const VIRTUAL_RENDER_THRESHOLD = 500;
const VIRTUAL_RENDER_BATCH = 250;
let lastRenderContext = null;
const MEDIA_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'mp4', 'webm', 'ogg', 'avi', 'mov', 'mp3', 'wav', 'flac', 'aac', 'm4a']);
const DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv']);
const CODE_EXTENSIONS = new Set(['js', 'ts', 'html', 'htm', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf', 'json', 'xml', 'log']);

function withBucketUrl(url) {
    if (!activeBucket) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bucket=${encodeURIComponent(activeBucket)}`;
}

function getViewUrl(encodedKey) {
    return withBucketUrl(`/mbkbucket/view/${encodedKey}`);
}

function getDownloadUrl(encodedKey) {
    return withBucketUrl(`/mbkbucket/download/${encodedKey}`);
}

function stripApiPrefixFromPath(path, apiPrefix = '') {
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    const normalizedApiPrefix = String(apiPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');

    if (!normalizedApiPrefix) return normalizedPath;
    if (normalizedPath === normalizedApiPrefix || normalizedPath === `${normalizedApiPrefix}/`) return '';
    if (normalizedPath.startsWith(`${normalizedApiPrefix}/`)) {
        return normalizedPath.slice(normalizedApiPrefix.length + 1);
    }

    return normalizedPath;
}

function toApiFolderPath(prefix = '', apiPrefix = '') {
    const uiPrefix = String(prefix || '').replace(/^\/+/, '');
    const normalizedApiPrefix = String(apiPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');

    if (!uiPrefix) return '';
    if (!normalizedApiPrefix) return uiPrefix;
    if (uiPrefix === normalizedApiPrefix || uiPrefix.startsWith(`${normalizedApiPrefix}/`)) {
        return uiPrefix;
    }
    return `${normalizedApiPrefix}/${uiPrefix}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value = '') {
    return escapeHtml(value);
}

function getBaseName(path = '') {
    const value = String(path || '');
    const lastSlashIndex = value.lastIndexOf('/');
    return lastSlashIndex === -1 ? value : value.substring(lastSlashIndex + 1);
}

function dataAttr(name, value = '') {
    return `data-${name}="${escapeAttr(value)}"`;
}

function mutedDash() {
    return '<span class="muted-cell-value">&mdash;</span>';
}

function syncStateUrl(page = currentPage, prefix = currentPrefix, search = currentSearch) {
    try {
        const parts = [];
        if (activeBucket) parts.push(`bucket=${encodeURIComponent(activeBucket)}`);
        if (prefix) {
            const folderPathForUrl = toApiFolderPath(prefix, currentApiPrefix);
            const folderEncoded = encodeURIComponent(folderPathForUrl).replace(/%2F/g, '/');
            parts.push(`folder=${folderEncoded}`);
        }
        if (page && page > 1) parts.push(`page=${page}`);
        if (search) parts.push(`search=${encodeURIComponent(search)}`);
        parts.push(`sort=${encodeURIComponent(currentSort)}`);
        parts.push(`order=${encodeURIComponent(currentOrder)}`);
        parts.push(`view=${encodeURIComponent(currentViewMode)}`);
        parts.push(`filter=${encodeURIComponent(currentQuickFilter)}`);

        const newUrl = '/mbkbucket' + (parts.length ? '?' + parts.join('&') : '');
        window.history.replaceState(null, '', newUrl);
    } catch (e) {
        console.warn('history update failed', e);
    }
}

function getActiveBucketLabel() {
    return activeBucket || 'default bucket';
}

function matchesQuickFilter(fileName = '', filter = currentQuickFilter) {
    const ext = getBaseName(fileName).split('.').pop().toLowerCase();
    if (filter === 'media') return MEDIA_EXTENSIONS.has(ext);
    if (filter === 'docs') return DOC_EXTENSIONS.has(ext);
    if (filter === 'code') return CODE_EXTENSIONS.has(ext);
    return true;
}

function updateQuickFilterUI() {
    document.querySelectorAll('.quick-filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.filter === currentQuickFilter);
    });
}

// Show alert message (Toast)
function showAlert(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) {
        // Fallback to old method if container missing
        const alertId = type === 'success' ? 'successAlert' : 'errorAlert';
        const messageId = type === 'success' ? 'successMessage' : 'errorMessage';
        const alertEl = document.getElementById(alertId);
        const messageEl = document.getElementById(messageId);
        if (alertEl && messageEl) {
            messageEl.textContent = message;
            alertEl.style.display = 'flex';
            setTimeout(() => alertEl.style.display = 'none', 5000);
        }
        return;
    }

    // Create toast element
    const toast = document.createElement('div');
    const isSuccess = type === 'success';
    toast.className = `toast-notification ${type}`;
    toast.style.cssText = `
        background: ${isSuccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-weight: 500;
    `;

    toast.innerHTML = `
        <i class="fas ${isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle'} toast-icon"></i>
        <div class="toast-message">${message}</div>
        <button type="button" data-action="close-toast" class="toast-close-btn">&times;</button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    // Auto dismiss
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Fetch and render files
async function loadFiles(page = 1, prefix = '', search = '', sort = currentSort, order = currentOrder, token = '') {
    currentPage = page;
    currentPrefix = prefix;
    currentSearch = search;
    currentSort = sort;
    currentOrder = order;
    virtualRenderLimit = 0;

    // Update browser URL so navigation is shareable/bookmarkable.
    syncStateUrl(page, prefix, search);

    const container = document.getElementById('fileListContainer');
    const paginationContainer = document.getElementById('paginationContainer');
    const fileListTitle = document.getElementById('fileListTitle');
    const totalFilesCount = document.getElementById('totalFilesCount');
    const filterInfo = document.getElementById('filterInfo');

    // Show loading skeleton state
    container.innerHTML = `
      <div class="table-responsive">
        <div class="skeleton-row">
          <div class="skeleton-box s-40"></div>
          <div class="skeleton-box s-200"></div>
          <div class="skeleton-box s-80"></div>
          <div class="skeleton-box s-200"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-box s-40"></div>
          <div class="skeleton-box s-200"></div>
          <div class="skeleton-box s-80"></div>
          <div class="skeleton-box s-200"></div>
        </div>
      </div>
    `;

    try {
        const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
        const sortParam = `&sort=${sort}&order=${order}`;
        
        // Determine recursive mode
        const isFolderMode = currentViewMode === 'folder';
        const recursiveParam = `&recursive=${!isFolderMode}`; // false if folder mode, true if flat mode
        const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

        const response = await fetch(withBucketUrl(`/mbkbucket/api/files?page=${page}&prefix=${encodeURIComponent(prefix)}${searchParam}${sortParam}${recursiveParam}${tokenParam}`));
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load files');
        }
        
        // Store next token
        currentNextToken = data.nextContinuationToken || null;
        currentApiPrefix = data.prefix || '';

        // Update stats
        if (data.totalFiles === -1) {
             totalFilesCount.textContent = `${(data.files.length + (data.folders ? data.folders.length : 0))}${data.hasNextPage ? '+' : ''} Items`;
        } else {
             totalFilesCount.textContent = `${data.totalFiles} ${search ? 'Results' : 'Files'}`;
        }

        if (search) {
            const filterSuffix = currentQuickFilter !== 'all' ? ` • Filter: ${currentQuickFilter}` : '';
            filterInfo.textContent = `Bucket: ${getActiveBucketLabel()} • Search: "${search}"${filterSuffix}`;
            fileListTitle.innerHTML = `Search Results <span class="text-muted">for: </span><span class="badge bg-info">${search}</span>`;
        } else {
            const label = prefix || rootLabel;
            const filterSuffix = currentQuickFilter !== 'all' ? ` • Filter: ${currentQuickFilter}` : '';
            filterInfo.textContent = `Bucket: ${getActiveBucketLabel()} • Folder: ${label}${filterSuffix}`;
            fileListTitle.innerHTML = `Files <span class="text-muted">in: </span><span class="badge bg-info">${label}</span>`;
        }

        // Render files or empty state
        const hasContent = (data.files && data.files.length > 0) || (data.folders && data.folders.length > 0);

        if (!hasContent && !prefix && !search) {
            container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <h4>No files found</h4>
                        <p>Bucket <strong>${escapeHtml(getActiveBucketLabel())}</strong> is empty. Upload some files to get started!</p>
            <button class="btn btn-lg" data-action="upload-files">
              <i class="fas fa-plus"></i> Upload Your First File
            </button>
          </div>
        `;
            paginationContainer.style.display = 'none';
        } else {
            // Store for client-side sorting and view switching
            pageFiles = data.files || [];

            if (data.mode === 'optimized') {
                  pageFolders = (data.folders || []).map(folder => stripApiPrefixFromPath(folder, currentApiPrefix)).filter(Boolean);
            } else {
                pageFolders = search
                    ? []
                    : extractFoldersAtCurrentLevel(data.files, currentApiPrefix || prefix)
                      .map(folder => stripApiPrefixFromPath(folder, currentApiPrefix))
                      .filter(Boolean);
            }

              renderFilesTable(pageFiles, pageFolders, prefix, currentApiPrefix);
            renderPagination(data);
            paginationContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle empty-state-error-icon"></i>
          <h4>Error Loading Files</h4>
                    <p>Bucket <strong>${escapeHtml(getActiveBucketLabel())}</strong>: ${escapeHtml(error.message)}</p>
          <button class="btn btn-primary" data-action="retry-load" ${dataAttr('retry-page', page)} ${dataAttr('retry-prefix', prefix)}>
            <i class="fas fa-redo"></i> Retry
          </button>
        </div>
      `;
        paginationContainer.style.display = 'none';
    }
}

// Toggle sort order
function toggleSort(field) {
    if (currentSort === field) {
        currentOrder = currentOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort = field;
        currentOrder = 'asc';
    }

    // Sort local data instead of calling API
    if (pageFiles && pageFiles.length > 0) {
        pageFiles.sort((a, b) => {
            let valA, valB;
            if (field === 'size') {
                valA = a.Size || 0;
                valB = b.Size || 0;
            } else if (field === 'date') {
                valA = new Date(a.LastModified || 0).getTime();
                valB = new Date(b.LastModified || 0).getTime();
            } else {
                valA = getBaseName(a.Key).toLowerCase();
                valB = getBaseName(b.Key).toLowerCase();
            }

            if (valA < valB) return currentOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentOrder === 'asc' ? 1 : -1;
            return 0;
        });

        renderFilesTable(pageFiles, pageFolders, currentPrefix, currentApiPrefix);
        syncStateUrl(currentPage, currentPrefix, currentSearch);
    }
}

// Perform search
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const search = searchInput.value.trim();
    if (search) {
        loadFiles(1, currentPrefix, search);
    }
}

// Clear search
function clearSearch() {
    document.getElementById('searchInput').value = '';
    loadFiles(1, currentPrefix, '');
}

function setQuickFilter(filter = 'all') {
    const nextFilter = String(filter || 'all').toLowerCase();
    if (currentQuickFilter === nextFilter) return;
    currentQuickFilter = nextFilter;
    updateQuickFilterUI();
    renderFilesTable(pageFiles, pageFolders, currentPrefix, currentApiPrefix);
    syncStateUrl(currentPage, currentPrefix, currentSearch);
}

// Extract unique folders at current level
function extractFoldersAtCurrentLevel(files, prefix) {
    const folderSet = new Set();

    files.forEach(file => {
        const key = file.Key;
        // Remove prefix from key
        const relativePath = prefix ? key.substring(prefix.length + (prefix.endsWith('/') ? 0 : 1)) : key;

        // Check if there's a folder in the relative path
        const slashIndex = relativePath.indexOf('/');
        if (slashIndex !== -1) {
            const folderName = relativePath.substring(0, slashIndex);
            const fullFolderPath = prefix ? `${prefix}/${folderName}` : folderName;
            folderSet.add(fullFolderPath);
        }
    });

    return Array.from(folderSet).sort();
}

// Change view mode
function changeViewMode(mode) {
    if (currentViewMode === mode) return;
    currentViewMode = mode;

    // Update button states
    const btnFolder = document.getElementById('viewBtnFolder');
    const btnFlat = document.getElementById('viewBtnFlat');

    if (mode === 'folder') {
        btnFolder.classList.add('active');
        btnFolder.classList.remove('btn-outline-light');
        btnFolder.classList.add('btn-light');

        btnFlat.classList.remove('active');
        btnFlat.classList.remove('btn-light');
        btnFlat.classList.add('btn-outline-light');
    } else {
        btnFlat.classList.add('active');
        btnFlat.classList.remove('btn-outline-light');
        btnFlat.classList.add('btn-light');

        btnFolder.classList.remove('active');
        btnFolder.classList.remove('btn-light');
        btnFolder.classList.add('btn-outline-light');
    }

    // Refetch to respect recursive/non-recursive mode and keep URL state.
    loadFiles(1, currentPrefix, currentSearch, currentSort, currentOrder);
}

function expandVirtualRows() {
    if (!lastRenderContext) return;
    virtualRenderLimit += VIRTUAL_RENDER_BATCH;
    renderFilesTable(lastRenderContext.files, lastRenderContext.folders, lastRenderContext.prefix, lastRenderContext.apiPrefix);
}

// Extract folders that match a search query from file paths
function extractMatchingFolders(files, search) {
    if (!search) return [];
    
    const searchLower = search.toLowerCase();
    const folderSet = new Set();
    
    files.forEach(file => {
        const parts = file.Key.split('/');
        // Remove filename
        parts.pop();
        
        let currentPath = '';
        parts.forEach(part => {
             const segmentPath = currentPath ? `${currentPath}/${part}` : part;
             currentPath = segmentPath;
             
             // If any part of the path matches the search, include that full path as a folder
             // AND ensure we don't include the full file path, just the directory
             if (part.toLowerCase().includes(searchLower)) {
                 folderSet.add(currentPath);
             }
        });
    });
    
    return Array.from(folderSet).sort();
}

// Render files table
function renderFilesTable(files, folders = [], prefix = '', apiPrefix = '') {
    lastRenderContext = { files, folders, prefix, apiPrefix };
    const normalizedPrefix = String(prefix || '').replace(/\/+$/, '');
    const basePrefix = apiPrefix || prefix;
    const relativeBaseOffset = basePrefix ? basePrefix.length + (basePrefix.endsWith('/') ? 0 : 1) : 0;

    // Determine which files/folders to show based on view mode
    let displayFiles = [];
    let displayFolders = [];

    // Force flat view if searching
    const isSearchActive = !!currentSearch;
    const mode = isSearchActive ? 'flat' : currentViewMode;

    if (mode === 'flat') {
        // In flat mode, show all files in the current loaded page/list regardless of folder depth
        if (isSearchActive) {
            // Search Mode:
            // 1. Show files where FILENAME matches the search term
            const searchLower = currentSearch.toLowerCase();
            displayFiles = files.filter(f => {
                // Skip folder marker objects (keys ending with /)
                if (f.Key.endsWith('/')) return false;
                
                const fileName = getBaseName(f.Key);
                return fileName.toLowerCase().includes(searchLower);
            });

            // 2. Show folders where FOLDER NAME matches the search term
            displayFolders = extractMatchingFolders(files, currentSearch);
        } else {
            // Normal Flat Mode: Show all files, no folders
            // Filter out folder marker objects (keys ending with /)
            displayFiles = files.filter(f => !f.Key.endsWith('/'));
            displayFolders = [];
        }
    } else {
        // Normal Folder View logic
        // Filter files to show only those at current level (not in subfolders)
        displayFiles = files.filter(file => {
            // Skip folder marker objects (keys ending with /)
            if (file.Key.endsWith('/')) return false;
            
            const relativePath = basePrefix ? file.Key.substring(relativeBaseOffset) : file.Key;
            // File is at current level if it has no '/' in relative path
            return !relativePath.includes('/');
        });
        displayFolders = folders;
    }

    // Apply quick file-type filter after mode/path filtering.
    displayFiles = displayFiles.filter((f) => {
        const name = getBaseName(f?.Key);
        return matchesQuickFilter(name, currentQuickFilter);
    });

    // Generate breadcrumb navigation
    let breadcrumb = '';
    // Show breadcrumb only if we are in folder mode OR if we have a prefix filter active even in flat mode
    // (In flat mode, the prefix acts as a base filter, but we see recursive files under it)
    if (prefix) {
        const parts = prefix.split('/').filter(p => p);
        const safeRootLabel = escapeHtml(rootLabel);
        const safeRootTitle = escapeAttr(rootLabel);
        const breadcrumbParts = [`
        <div class="breadcrumb-nav">
          <div class="breadcrumb-item">
            <i class="fas fa-home"></i>
            <button type="button" class="breadcrumb-link" ${dataAttr('nav-prefix', '')} title="Go to ${safeRootTitle}">${safeRootLabel}</button>
          </div>
      `];

        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += (currentPath ? '/' : '') + part;
            const isLast = index === parts.length - 1;

            if (isLast) {
                const safePart = escapeHtml(part);
                breadcrumbParts.push(`
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <div class="breadcrumb-item">
              <span class="breadcrumb-current">${safePart}</span>
            </div>
          `);
            } else {
                const pathCopy = currentPath;
                const safePart = escapeHtml(part);
                const safePathTitle = escapeAttr(pathCopy);
                breadcrumbParts.push(`
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <div class="breadcrumb-item">
              <button type="button" class="breadcrumb-link" ${dataAttr('nav-prefix', pathCopy)} title="Go to ${safePathTitle}">${safePart}</button>
            </div>
          `);
            }
        });

        breadcrumbParts.push(`</div>`);
        breadcrumb = breadcrumbParts.join('');
    }

    // Generate folder rows (only used in folder mode)
        const folderRows = displayFolders.map(folderPath => {
        // Handle folder paths which typically end in a slash (e.g., "folder/subfolder/")
                const rawFolderPath = String(folderPath || '');
                const cleanPath = rawFolderPath.replace(/\/+$/, '');
                const folderPathForAction = normalizedPrefix && cleanPath && !cleanPath.startsWith(`${normalizedPrefix}/`)
                    ? `${normalizedPrefix}/${cleanPath}`
                    : cleanPath;
                const folderKeyForDelete = `${folderPathForAction}/`;
        const folderName = getBaseName(cleanPath);
                const safeFolderName = escapeHtml(folderName);
                const safeFolderPathAttr = escapeAttr(`${folderPathForAction}/`);
                const safeFolderDeleteKeyAttr = escapeAttr(folderKeyForDelete);
        
        return `
                <tr class="folder-row" data-folder-path="${safeFolderPathAttr}" title="Open folder: ${safeFolderName}">
          <td class="table-cell-center">
            <!-- no selection for folders -->
          </td>
          <td class="file-name-cell">
            <div class="file-row-main">
              <div class="file-icon">
                <i class="fas fa-folder"></i>
              </div>
              <div class="file-info">
                <div class="file-name folder-name">
                                    <i class="fas fa-folder folder-leading-icon"></i>${safeFolderName}/
                </div>
              </div>              
                            <button type="button" class="btn btn-danger btn-sm delete-btn dtm" data-key="${safeFolderDeleteKeyAttr}" data-is-folder="true" title="Delete folder">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
          <td>
            ${mutedDash()}
          </td>
          <td class="table-cell-center">
            ${mutedDash()}
          </td>
          <td class="table-cell-center">
            <div class="btn-group" role="group">
                            <button type="button" class="btn btn-danger btn-sm delete-btn" data-key="${safeFolderDeleteKeyAttr}" data-is-folder="true" title="Delete folder">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const isVirtualized = displayFiles.length > VIRTUAL_RENDER_THRESHOLD;
    if (!isVirtualized) {
        virtualRenderLimit = 0;
    } else if (!virtualRenderLimit) {
        virtualRenderLimit = VIRTUAL_RENDER_BATCH;
    }
    const visibleFiles = isVirtualized ? displayFiles.slice(0, virtualRenderLimit) : displayFiles;

    // Generate file rows
    const fileRows = visibleFiles.map(file => {
        const rawKey = String(file.Key || '');
        const encodedKey = encodeURIComponent(rawKey);
        const safeKeyAttr = escapeAttr(rawKey);

        // Calculate display name and icon directly
        const fullPath = rawKey;
        const lastSlashIndex = fullPath.lastIndexOf('/');
        let filename = fullPath;
        let folderPath = '';

        if (lastSlashIndex !== -1) {
            filename = fullPath.substring(lastSlashIndex + 1);
            folderPath = fullPath.substring(0, lastSlashIndex + 1); // include trailing slash
        }

        const iconClass = window.getFileIcon ? window.getFileIcon(filename) : 'fas fa-file';
        const typeCategory = window.getFileTypeCategory ? window.getFileTypeCategory(filename) : '';
        const truncatedName = (window.truncateFileName ? window.truncateFileName(filename) : filename) || filename;
        const isFileViewable = window.isViewable ? window.isViewable(filename) : false;
                const safeFilename = escapeHtml(filename);
                const safeTruncatedName = escapeHtml(truncatedName);
                const safeFolderPath = escapeHtml(folderPath);
                const viewButtonClass = isFileViewable ? 'btn btn-primary btn-sm view-btn' : 'btn btn-primary btn-sm view-btn is-disabled';
                const viewButtonDisabled = isFileViewable ? '' : 'disabled';

        // If in flat mode, we might want to show the folder path more prominently
        const pathDisplay = (currentViewMode === 'flat' && folderPath && folderPath !== prefix + (prefix ? '/' : ''))
            ? `<div class="file-path-display">
                         <i class="fas fa-folder path-display-icon"></i> ${safeFolderPath}
           </div>`
            : '';

        return `
        <tr class="file-row">
          <td class="table-cell-center">
                        <input type="checkbox" class="selectFileCheckbox" data-key="${safeKeyAttr}" aria-label="Select ${safeKeyAttr}" />
          </td>
          <td class="file-name-cell">
            <div class="file-row-main">
              <div class="file-icon ${typeCategory}">
                <i class="${iconClass}"></i>
              </div>
              <div class="file-info">
                ${pathDisplay}
                                <div class="file-name" data-full-path="${safeKeyAttr}" title="${safeFilename}">${safeTruncatedName}</div>
              </div>
            </div>
          </td>
          <td>
            ${file.Size ? `<span class="file-size">${formatFileSize(file.Size)}</span>` : '<span class="muted-cell-value">N/A</span>'}
          </td>
          <td>
            ${file.LastModified ? `<span class="muted-cell-value">${formatDate(file.LastModified)}</span>` : '<span class="muted-cell-value">N/A</span>'}
          </td>
          <td class="table-cell-center">
            <div class="btn-group" role="group">
                            <button type="button" class="${viewButtonClass}" data-key="${safeKeyAttr}" data-filename="${safeKeyAttr}"
                data-key-enc="${encodedKey}" title="${isFileViewable ? 'View file in browser' : 'File type not supported for viewing'}" ${viewButtonDisabled}>
                <i class="fas fa-eye"></i>
              </button>
              <button type="button" class="btn btn-info btn-sm copy-btn" data-key-enc="${encodedKey}" title="Copy Link">
                <i class="fas fa-link"></i>
              </button>
                            <a href="${getDownloadUrl(encodedKey)}" class="btn btn-success btn-sm"
                title="Download file">
                <i class="fas fa-download"></i>
              </a>
                            <button type="button" class="btn btn-danger btn-sm delete-btn" data-key="${safeKeyAttr}" title="Delete file">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const allRows = folderRows + fileRows;

    if (allRows === '') {
        document.getElementById('fileListContainer').innerHTML = `
                ${breadcrumb}
        <div class="empty-state">
          <div class="empty-state-illustration">
            <i class="fas fa-folder-open empty-state-folder-icon"></i>
            <i class="fas fa-search empty-state-search-icon"></i>
          </div>
          <h4>No files found</h4>
          <p class="empty-state-description">
                        ${prefix ? `This folder <strong>${escapeHtml(prefix)}</strong> is currently empty in bucket <strong>${escapeHtml(getActiveBucketLabel())}</strong>.` : `Bucket <strong>${escapeHtml(getActiveBucketLabel())}</strong> is empty. Start by uploading files or creating a new folder.`}
          </p>
          <div class="empty-state-actions">
            <button class="btn btn-primary" data-action="upload-files">
              <i class="fas fa-cloud-upload-alt"></i> Upload Files
            </button>
            <button class="btn btn-outline-secondary" data-action="create-folder">
              <i class="fas fa-folder-plus"></i> New Folder
            </button>
                        ${prefix ? `<button class="btn btn-light" data-action="go-root">
                            <i class="fas fa-home"></i> Go to ${rootLabel}
            </button>` : ''}
          </div>
        </div>
      `;
        return;
    }

    // Sort icon helper
    const getSortIcon = (field) => {
        if (currentSort !== field) return '<i class="fas fa-sort sort-icon sort-icon-inactive"></i>';
        return currentOrder === 'asc'
            ? '<i class="fas fa-sort-up sort-icon sort-icon-active"></i>'
            : '<i class="fas fa-sort-down sort-icon sort-icon-active"></i>';
    };

        const virtualizedInfo = isVirtualized
                ? `<div class="virtualized-info">
                        <span>Showing ${visibleFiles.length} of ${displayFiles.length} files in this view.</span>
                        <div class="virtualized-actions">
                            ${visibleFiles.length < displayFiles.length ? '<button class="btn btn-sm btn-outline-secondary" data-action="expand-virtual">Load more</button>' : ''}
                        </div>
                    </div>`
                : '';

        document.getElementById('fileListContainer').innerHTML = `
      ${breadcrumb}
      <div class="table-responsive">
        <div id="bulkActionsBar" class="bulk-actions-bar">
          <span id="bulkSelectedCount">0 selected</span>
          <div class="bulk-actions-controls">
            <button class="btn btn-danger btn-sm" id="bulkDeleteBtn" disabled>
              <i class="fas fa-trash"></i> Delete Selected
            </button>
          </div>
        </div>
        <table class="table table-hover mb-0">
          <thead>
            <tr>
              <th class="table-select-col">
                <input type="checkbox" id="selectAllCheckbox" aria-label="Select all files" />
              </th>
              <th class="sortable-heading file-name-heading" data-sort-field="name">
                <i class="fas fa-file-alt"></i> Name ${getSortIcon('name')}
              </th>
              <th class="sortable-heading" data-sort-field="size">
                <i class="fas fa-weight"></i> Size ${getSortIcon('size')}
              </th> 
              <th class="sortable-heading" data-sort-field="date">
                <i class="fas fa-calendar"></i> Last Modified ${getSortIcon('date')}
              </th>
              <th class="table-cell-center">
                <i class="fas fa-cogs"></i> Actions
              </th>
            </tr>
          </thead>
          <tbody>
            ${allRows}
          </tbody>
        </table>
                ${virtualizedInfo}
      </div>
    `;

    // Wire selection checkboxes and bulk actions
    setupSelection();
}

// Render pagination
function renderPagination(data) {
    const { currentPage, totalPages, hasPrevPage, hasNextPage, mode } = data;

    let paginationHTML = '';
    const pageLink = (page, label, extra = {}) => {
        const attrs = [
            dataAttr('page', page),
            dataAttr('prefix', currentPrefix),
            dataAttr('search', currentSearch),
            dataAttr('sort', extra.sort || currentSort),
            dataAttr('order', extra.order || currentOrder)
        ];
        if (extra.token) attrs.push(dataAttr('token', extra.token));
        return `<a class="page-link" href="#" ${attrs.join(' ')}>${label}</a>`;
    };

    if (mode === 'optimized') {
        // Optimized Mode: Token-based pagination (Next only, limited Prev)
        
        // Previous button (Disabled for now as we don't track history stack of tokens)
        paginationHTML += `
        <li class="page-item disabled">
          <span class="page-link" title="Previous page not supported in optimized view">
            <i class="fas fa-chevron-left"></i> Previous
          </span>
        </li>
      `;
      
      // Current Page Indicator
      paginationHTML += `
          <li class="page-item active">
            <span class="page-link">${currentPage}</span>
          </li>
      `;

      // Next button
      if (hasNextPage) {
          paginationHTML += `
          <li class="page-item">
            ${pageLink(currentPage + 1, 'Next <i class="fas fa-chevron-right"></i>', { token: currentNextToken || '' })}
          </li>
        `;
      } else {
          paginationHTML += `
          <li class="page-item disabled">
            <span class="page-link">
              Next <i class="fas fa-chevron-right"></i>
            </span>
          </li>
        `;
      }

    } else {
        // Legacy Mode: Numbered pagination
        
        // Previous button
        if (hasPrevPage) {
            paginationHTML += `
            <li class="page-item">
              ${pageLink(currentPage - 1, '<i class="fas fa-chevron-left"></i> Previous')}
            </li>
          `;
        } else {
            paginationHTML += `
            <li class="page-item disabled">
              <span class="page-link">
                <i class="fas fa-chevron-left"></i> Previous
              </span>
            </li>
          `;
        }

        // Smart Page Numbers (limit visible pages)
        const maxPagesToShow = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        if (endPage - startPage + 1 < maxPagesToShow) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }

        // First page
        if (startPage > 1) {
             paginationHTML += `
            <li class="page-item">
                ${pageLink(1, '1')}
            </li>`;
            if (startPage > 2) {
                 paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                paginationHTML += `
              <li class="page-item active">
                <span class="page-link">${i}</span>
              </li>
            `;
            } else {
                paginationHTML += `
              <li class="page-item">
                ${pageLink(i, String(i))}
              </li>
            `;
            }
        }
        
        // Last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                 paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHTML += `
            <li class="page-item">
                ${pageLink(totalPages, String(totalPages))}
            </li>`;
        }

        // Next button
        if (hasNextPage) {
            paginationHTML += `
            <li class="page-item">
              ${pageLink(currentPage + 1, 'Next <i class="fas fa-chevron-right"></i>')}
            </li>
          `;
        } else {
            paginationHTML += `
            <li class="page-item disabled">
              <span class="page-link">
                Next <i class="fas fa-chevron-right"></i>
              </span>
            </li>
          `;
        }
    }

    document.getElementById('paginationList').innerHTML = paginationHTML;
}

function confirmDelete(key, isFolder = false) {
    document.getElementById('deleteKey').value = key;
    document.getElementById('deleteIsFolder').value = isFolder ? 'true' : '';
    document.getElementById('deleteFileName').textContent = key;

    // Update modal message and button label for folders
    const modalHeading = document.querySelector('#deleteModal .modal-body h6');
    const smallText = document.querySelector('#deleteModal .modal-body small');
    const confirmLabel = document.getElementById('deleteConfirmLabel');

    if (isFolder) {
        if (modalHeading) modalHeading.textContent = 'Are you sure you want to delete this folder and all its contents?';
        if (smallText) smallText.textContent = 'This action will remove the folder and all files within it and cannot be undone.';
        if (confirmLabel) confirmLabel.textContent = 'Delete Folder';
    } else {
        if (modalHeading) modalHeading.textContent = 'Are you sure you want to delete this file?';
        if (smallText) smallText.textContent = 'This action cannot be undone.';
        if (confirmLabel) confirmLabel.textContent = 'Delete File';
    }

    document.getElementById('deleteModal').classList.add('show');
    document.getElementById('deleteModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('deleteModal').classList.remove('show');
    document.getElementById('deleteModal').style.display = 'none';
}

// Handle delete form submission
document.getElementById('deleteForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const key = document.getElementById('deleteKey').value;
    const isFolder = document.getElementById('deleteIsFolder').value === 'true';

    try {
        const response = await fetch(withBucketUrl('/mbkbucket/delete'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, folder: isFolder })
        });

        const data = await response.json();

        if (data.success) {
            showAlert('File deleted successfully', 'success');
            closeModal();
            // Reload file list
            loadFiles(currentPage, currentPrefix);
        } else {
            showAlert(data.error || 'Delete failed', 'error');
            closeModal();
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        showAlert('Error deleting file: ' + error.message, 'error');
        closeModal();
    }
});

// Auto-dismiss alerts with fade effect
setTimeout(() => {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        alert.style.opacity = '0';
        alert.style.transform = 'translateY(-10px)';
        setTimeout(() => alert.remove(), 300);
    });
}, 5000);

// Upload queue, drag-and-drop and multi-file support
const uploadQueue = []; // { id, file, status, progress, controller/xhr, uploadId }
const xhrMap = new Map();
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB chunk threshold

function createId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }

function addFilesToQueue(fileList) {
    for (const f of Array.from(fileList)) {
        uploadQueue.push({ id: createId(), file: f, status: 'queued', progress: 0, uploadedBytes: 0, uploadRate: 0 });
    }
    renderUploadQueue();
}

// Render upload queue UI
function renderUploadQueue() {
    const container = document.getElementById('uploadQueue');
    if (!container) return;
    if (uploadQueue.length === 0) {
        container.innerHTML = `
        <div class="form-text">No files selected.</div>
      `;
        return;
    }

    // Local size formatter so it's always in scope regardless of IIFE load order
    function fmtSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    container.innerHTML = uploadQueue.map(item => {
        const safeName = escapeHtml(item.file.name);
        const iconClass = window.getFileIcon ? window.getFileIcon(item.file.name) : 'fas fa-file-alt';
        const typeCategory = window.getFileTypeCategory ? window.getFileTypeCategory(item.file.name) : '';
        let statusText;
        if (item.status === 'uploading') {
            const pct = Math.round(item.progress || 0);
            statusText = fmtSize(item.uploadedBytes || 0) + ' / ' + fmtSize(item.file.size) + ' (' + pct + '%)';
            if (item.uploadRate > 0) statusText += ' \u00b7 ' + fmtSize(item.uploadRate) + '/s';
        } else {
            statusText = item.status;
        }
        const actionBtn = item.status === 'uploading'
            ? `<button class="btn btn-sm btn-outline-secondary cancel-upload" data-id="${item.id}"><i class="fas fa-ban"></i></button>`
            : `<button class="btn btn-sm btn-danger remove-queued" data-id="${item.id}"><i class="fas fa-trash"></i></button>`;
        return `
      <div class="upload-item" data-id="${item.id}">
        <div class="meta">
          <div class="upload-item-meta-row">
                        <div class="file-icon upload-file-icon ${typeCategory}"><i class="${iconClass}"></i></div>
                        <div class="name upload-item-name" title="${safeName}">${safeName}</div>
            <div class="form-text file-size upload-item-size-label">${formatFileSize(item.file.size)}</div>
          </div>
        </div>
        <div class="upload-progress-cell">
          <div class="progress-container upload-progress-track">
            <div class="progress-bar upload-progress-bar" style="width: ${Math.round(item.progress)}%;"></div>
          </div>
          <div class="upload-item-status-row">
            <small class="text-muted status">${statusText}</small>
            <div class="controls">${actionBtn}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Wire up controls
    document.querySelectorAll('.remove-queued').forEach(btn => btn.addEventListener('click', function (e) {
        const id = this.dataset.id;
        const idx = uploadQueue.findIndex(i => i.id === id);
        if (idx !== -1) uploadQueue.splice(idx, 1);
        renderUploadQueue();
    }));

    document.querySelectorAll('.cancel-upload').forEach(btn => btn.addEventListener('click', async function (e) {
        const id = this.dataset.id;
        const handle = xhrMap.get(id);
        const entry = uploadQueue.find(i => i.id === id);

        // Abort in-flight fetch
        if (handle && handle.controller) handle.controller.abort();
        // Abort legacy XHR (small file path)
        if (handle && handle.xhr) handle.xhr.abort();

        // Tell S3 to discard the incomplete multipart upload
        if (entry && entry.s3UploadId && entry.s3Key) {
            try {
                await fetch(withBucketUrl('/mbkbucket/upload-abort'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uploadId: entry.s3UploadId, key: entry.s3Key })
                });
            } catch (_) { /* best-effort */ }
        }

        if (entry) { entry.status = 'cancelled'; entry.progress = 0; }
        xhrMap.delete(id);
        renderUploadQueue();
    }));
}

// Drag & drop wiring
const dropZone = document.getElementById('dropZone');
const fileInputEl = document.getElementById('fileInput');
if (dropZone) {
    dropZone.addEventListener('click', () => fileInputEl.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files) addFilesToQueue(e.dataTransfer.files);
    });
}

fileInputEl?.addEventListener('change', function (e) {
    if (e.target.files && e.target.files.length) {
        addFilesToQueue(e.target.files);
    }
});

// Start queued uploads (single or chunked) and provide cancelation controls
async function startUploadEntry(entry) {
    if (!entry || entry.status === 'uploading' || entry.status === 'done') return;
    entry.status = 'uploading';
    renderUploadQueue();

    const file = entry.file;
    try {
        if (file.size > CHUNK_SIZE) {
            // ---------------------------------------------------------------
            // S3 Multipart Upload
            // Step 1 — Initiate: get uploadId + key from the server
            // ---------------------------------------------------------------
            const initResp = await fetch(withBucketUrl('/mbkbucket/upload-init'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    prefix: currentPrefix,
                    contentType: file.type || 'application/octet-stream'
                })
            });
            const initJson = await initResp.json();
            if (!initResp.ok || !initJson.success) throw new Error(initJson.error || 'Failed to initiate upload');

            const { uploadId, key } = initJson;
            entry.s3UploadId = uploadId;  // stored so cancel handler can abort
            entry.s3Key = key;

            // ---------------------------------------------------------------
            // Step 2 — Upload parts (1-based partNumber, min 5 MB except last)
            // ---------------------------------------------------------------
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const parts = []; // [{ partNumber, ETag }]
            let uploadedBytes = 0;

            for (let i = 0; i < totalChunks; i++) {
                const _chunkStart = Date.now();
                if (entry.status === 'cancelled') {
                    // Clean up on S3
                    await fetch(withBucketUrl('/mbkbucket/upload-abort'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uploadId, key })
                    }).catch(() => {});
                    throw new Error('Upload cancelled');
                }

                const start = i * CHUNK_SIZE;
                const blob = file.slice(start, Math.min(file.size, start + CHUNK_SIZE));
                const partNumber = i + 1; // S3 parts are 1-based

                const fd = new FormData();
                fd.append('chunk', blob, file.name);
                fd.append('uploadId', uploadId);
                fd.append('key', key);
                fd.append('partNumber', String(partNumber));

                const controller = new AbortController();
                xhrMap.set(entry.id, { controller, s3UploadId: uploadId, s3Key: key });

                const chunkResp = await fetch(withBucketUrl('/mbkbucket/upload-chunk'), {
                    method: 'POST',
                    body: fd,
                    signal: controller.signal
                });
                const chunkJson = await chunkResp.json();
                if (!chunkResp.ok || !chunkJson.success) throw new Error(chunkJson.error || `Part ${partNumber} upload failed`);

                parts.push({ partNumber: chunkJson.partNumber, ETag: chunkJson.ETag });
                uploadedBytes += blob.size;
                const _chunkDuration = (Date.now() - _chunkStart) / 1000;
                entry.uploadRate = _chunkDuration > 0 ? blob.size / _chunkDuration : 0;
                entry.uploadedBytes = uploadedBytes;
                entry.progress = (uploadedBytes / file.size) * 95; // reserve last 5% for complete call
                renderUploadQueue();
            }

            // ---------------------------------------------------------------
            // Step 3 — Complete: assemble all parts on S3
            // ---------------------------------------------------------------
            const completeResp = await fetch(withBucketUrl('/mbkbucket/upload-complete'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId, key, parts })
            });
            const completeJson = await completeResp.json();
            if (!completeResp.ok || !completeJson.success) throw new Error(completeJson.error || 'Failed to complete upload');

            entry.status = 'done'; entry.progress = 100;
            xhrMap.delete(entry.id);
            renderUploadQueue();
            showAlert(`${file.name} uploaded successfully`, 'success');
            loadFiles(currentPage, currentPrefix);
        } else {
            // small file XHR
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('prefix', currentPrefix);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', withBucketUrl('/mbkbucket/upload'));

            xhr.upload.addEventListener('progress', (e) => {
                if (!e.lengthComputable) return;
                const _now = Date.now();
                const _dt = (_now - (entry._rateLastTime || _now)) / 1000;
                const _db = e.loaded - (entry._rateLastBytes || 0);
                if (_dt > 0.2) {
                    entry.uploadRate = _db / _dt;
                    entry._rateLastTime = _now;
                    entry._rateLastBytes = e.loaded;
                }
                entry.uploadedBytes = e.loaded;
                entry.progress = (e.loaded / e.total) * 100;
                renderUploadQueue();
            });
            entry._rateLastTime = Date.now();
            entry._rateLastBytes = 0;

            xhr.addEventListener('load', () => {
                try {
                    const resp = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300 && resp.success) {
                        entry.status = 'done'; entry.progress = 100; renderUploadQueue();
                        showAlert('File uploaded successfully', 'success');
                        loadFiles(currentPage, currentPrefix);
                    } else {
                        entry.status = 'error'; renderUploadQueue();
                        showAlert(resp.error || 'Upload failed', 'error');
                    }
                } catch (err) {
                    entry.status = 'error'; renderUploadQueue();
                    showAlert('Upload response parse error', 'error');
                }
                xhrMap.delete(entry.id);
            });

            xhr.addEventListener('error', () => { entry.status = 'error'; renderUploadQueue(); showAlert('Network error during upload', 'error'); xhrMap.delete(entry.id); });
            xhr.addEventListener('abort', () => { entry.status = 'cancelled'; renderUploadQueue(); xhrMap.delete(entry.id); });

            xhrMap.set(entry.id, { xhr });
            xhr.send(fd);
        }
    } catch (err) {
        console.error('Upload failed for', entry.file.name, err);
        // If a multipart upload was initiated but didn't finish (not a user cancel), abort it on S3
        if (entry.s3UploadId && entry.s3Key && entry.status !== 'cancelled') {
            fetch(withBucketUrl('/mbkbucket/upload-abort'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId: entry.s3UploadId, key: entry.s3Key })
            }).catch(() => {});
        }
        entry.status = entry.status === 'cancelled' ? 'cancelled' : 'error';
        xhrMap.delete(entry.id);
        renderUploadQueue();
        showAlert('Upload failed: ' + (err.message || 'unknown'), 'error');
    }
}

function startAllUploads() {
    for (const entry of uploadQueue.slice()) {
        if (entry.status === 'queued' || entry.status === 'error') startUploadEntry(entry);
    }
}

document.getElementById('startUploadBtn')?.addEventListener('click', startAllUploads);
document.getElementById('clearQueueBtn')?.addEventListener('click', function () { uploadQueue.length = 0; renderUploadQueue(); });



// Initialize upload section collapse functionality
function initializeUploadCollapse() {
    const toggleBtn = document.getElementById('uploadToggleBtn');
    const uploadSection = document.getElementById('uploadSection');
    const uploadCard = uploadSection?.closest('.dashboard-card');
    
    if (!toggleBtn || !uploadSection) return;

    const syncUploadCollapseState = (expanded) => {
        uploadSection.classList.toggle('expanded', expanded);
        toggleBtn.classList.toggle('expanded', expanded);
        toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        uploadSection.setAttribute('aria-hidden', expanded ? 'false' : 'true');
        if (uploadCard) uploadCard.classList.toggle('upload-panel-open', expanded);
    };

    toggleBtn.setAttribute('role', 'button');
    toggleBtn.setAttribute('tabindex', '0');
    toggleBtn.setAttribute('aria-controls', 'uploadSection');
    syncUploadCollapseState(uploadSection.classList.contains('expanded'));
    
    toggleBtn.addEventListener('click', function() {
        const isExpanded = uploadSection.classList.contains('expanded');
        syncUploadCollapseState(!isExpanded);
    });

    toggleBtn.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const isExpanded = uploadSection.classList.contains('expanded');
            syncUploadCollapseState(!isExpanded);
        }
    });
}

// Add hover effects and animations
document.addEventListener('DOMContentLoaded', function () {
    // Initialize collapsible upload section
    initializeUploadCollapse();

    const bucketSelectorEl = document.getElementById('bucketSelector');
    const bucketSwitchStatusEl = document.getElementById('bucketSwitchStatus');
    if (bucketSelectorEl && bucketSelectorEl.value) {
        activeBucket = bucketSelectorEl.value;
    }
    if (bucketSelectorEl) {
        bucketSelectorEl.addEventListener('change', function () {
            const nextBucket = String(this.value || '').trim();
            if (!nextBucket) return;
            if (nextBucket === activeBucket) return;

            const nextParams = new URLSearchParams(window.location.search);
            nextParams.set('bucket', nextBucket);
            nextParams.delete('page');
            nextParams.delete('token');

            this.disabled = true;
            this.setAttribute('aria-busy', 'true');
            bucketSwitchStatusEl?.classList.remove('is-hidden');

            const qs = nextParams.toString();
            window.location.href = `/mbkbucket${qs ? `?${qs}` : ''}`;
        });
    }
    
    // Load initial files with persisted state.
    const urlParams = new URLSearchParams(window.location.search);
    const initialPrefix = urlParams.get('folder') || urlParams.get('prefix') || '';
    const initialPage = parseInt(urlParams.get('page')) || 1;
    const initialSearch = urlParams.get('search') || '';
    const initialSort = (urlParams.get('sort') || 'name').toLowerCase();
    const initialOrder = (urlParams.get('order') || 'asc').toLowerCase();
    const initialView = (urlParams.get('view') || currentViewMode).toLowerCase();
    const initialFilter = (urlParams.get('filter') || 'all').toLowerCase();

    if (initialView === 'folder' || initialView === 'flat') {
        currentViewMode = initialView;
    }
    currentQuickFilter = ['all', 'media', 'docs', 'code'].includes(initialFilter) ? initialFilter : 'all';
    updateQuickFilterUI();

    // Ensure view button state reflects restored mode before first render.
    if (currentViewMode === 'flat') {
        const btnFolder = document.getElementById('viewBtnFolder');
        const btnFlat = document.getElementById('viewBtnFlat');
        btnFlat?.classList.add('active', 'btn-light');
        btnFlat?.classList.remove('btn-outline-light');
        btnFolder?.classList.remove('active', 'btn-light');
        btnFolder?.classList.add('btn-outline-light');
    }

    const searchInputInit = document.getElementById('searchInput');
    if (searchInputInit) searchInputInit.value = initialSearch;
    loadFiles(initialPage, initialPrefix, initialSearch, initialSort, initialOrder);

    // Search behavior: Trigger when the Search button is clicked OR when the user presses Enter in the search input
    const searchInputEl = document.getElementById('searchInput');
    if (searchInputEl) {
        // Trigger search when Enter is pressed in the input
        searchInputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    }

    // Close modal when clicking outside
    document.getElementById('deleteModal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeModal();
        }
    });

    // Delegate view and delete button clicks to avoid inline JS with unescaped data
    document.addEventListener('click', function (e) {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const action = actionBtn.dataset.action;
            if (action === 'upload-files') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                document.getElementById('fileInput')?.click();
            } else if (action === 'create-folder') {
                createFolder();
            } else if (action === 'create-file') {
                createFile();
            } else if (action === 'go-root') {
                loadFiles(1, '');
            } else if (action === 'expand-virtual') {
                expandVirtualRows();
            } else if (action === 'search') {
                performSearch();
            } else if (action === 'clear-search') {
                clearSearch();
            } else if (action === 'retry-load') {
                loadFiles(parseInt(actionBtn.dataset.retryPage, 10) || 1, actionBtn.dataset.retryPrefix || '');
            } else if (action === 'close-toast') {
                actionBtn.closest('.toast-notification')?.remove();
            }
            return;
        }

        const quickFilterBtn = e.target.closest('[data-filter]');
        if (quickFilterBtn) {
            setQuickFilter(quickFilterBtn.dataset.filter || 'all');
            return;
        }

        const viewModeBtn = e.target.closest('[data-view-mode]');
        if (viewModeBtn) {
            changeViewMode(viewModeBtn.dataset.viewMode);
            return;
        }

        const navBtn = e.target.closest('[data-nav-prefix]');
        if (navBtn) {
            loadFiles(1, navBtn.dataset.navPrefix || '');
            return;
        }

        const sortHeader = e.target.closest('[data-sort-field]');
        if (sortHeader) {
            toggleSort(sortHeader.dataset.sortField);
            return;
        }

        const pageLink = e.target.closest('.page-link[data-page]');
        if (pageLink) {
            e.preventDefault();
            loadFiles(
                parseInt(pageLink.dataset.page, 10) || 1,
                pageLink.dataset.prefix || '',
                pageLink.dataset.search || '',
                pageLink.dataset.sort || currentSort,
                pageLink.dataset.order || currentOrder,
                pageLink.dataset.token || ''
            );
            return;
        }

        const folderRow = e.target.closest('.folder-row');
        if (folderRow && !e.target.closest('.delete-btn')) {
            const folderPath = folderRow.dataset.folderPath;
            if (folderPath) loadFiles(1, folderPath);
            return;
        }

        const vbtn = e.target.closest('.view-btn');
        if (vbtn) {
            const keyEnc = vbtn.dataset.keyEnc;
            const key = keyEnc || vbtn.dataset.key;
            const filename = vbtn.dataset.filename || (vbtn.dataset.key || key);
            handleViewFile(key, filename, e);
            return;
        }

        const dbtn = e.target.closest('.delete-btn');
        if (dbtn) {
            e.stopPropagation();
            const key = dbtn.dataset.key;
            const isFolder = dbtn.dataset.isFolder === 'true';
            if (key) confirmDelete(key, isFolder);
            return;
        }

        const cbtn = e.target.closest('.copy-btn');
        if (cbtn) {
            e.stopPropagation();
            const keyEnc = cbtn.dataset.keyEnc;
            if (!keyEnc) return;
            const link = `${window.location.origin}${getViewUrl(keyEnc)}`;
            const fallbackCopy = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = link;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showAlert('Link copied to clipboard!', 'success');
                } catch {
                    showAlert('Failed to copy link', 'error');
                }
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(link).then(() => {
                    showAlert('Link copied to clipboard!', 'success');
                }).catch(fallbackCopy);
            } else {
                fallbackCopy();
            }
            return;
        }

    });
});

// Function to check if file can be viewed in browser

// Enhanced view button click handler
function handleViewFile(key, filename, event) {
    // Prevent default action and event bubbling
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!isViewable(filename)) {
        alert(`File type "${filename.split('.').pop().toUpperCase()}" is not supported for viewing in browser.\n\nSupported types include: Images, Videos (MP4, WebM), Audio (MP3, WAV), Text files, Code files, and PDF documents.`);
        return false;
    }

    // Determine file type
    const extension = filename.split('.').pop().toLowerCase();
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const videoTypes = ['mp4', 'webm', 'ogg'];

    // Determine preview mode from extension groups
    const previewableImage = imageTypes.includes(extension);
    const previewableVideo = videoTypes.includes(extension);
    const previewableAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension);
    const previewablePdf = extension === 'pdf';
    const previewableText = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'ts', 'html', 'htm', 'css', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf'].includes(extension);

    let previewMode = 'unsupported';
    if (previewableImage) previewMode = 'image';
    else if (previewableVideo) previewMode = 'video';
    else if (previewableAudio) previewMode = 'audio';
    else if (previewablePdf) previewMode = 'pdf';
    else if (previewableText) previewMode = 'text';

    // Build an encoded key safely (if key already appears encoded, don't double-encode)
    const encodedKey = (key && key.includes('%')) ? key : encodeURIComponent(key || filename);

    // Show the inline preview
    showPreviewModal(encodedKey, filename, extension, previewMode);
    return false;
}

// Function to get file type category

// Preview modal helpers
function showPreviewModal(encodedKey, filename, extension, previewMode = 'auto') {
    const modal = document.getElementById('previewModal');
    if (!modal) {
        window.open(getViewUrl(encodedKey), '_blank', 'noopener,noreferrer');
        return;
    }

    const dialog = modal.querySelector('.modal-dialog');
    const titleEl = document.getElementById('previewFileName');
    const contentEl = modal.querySelector('.preview-content');
    const openBtn = document.getElementById('previewOpenBtn');
    const downloadBtn = document.getElementById('previewDownloadBtn');
    const closeBtn = document.getElementById('previewCloseBtn');
    const closeFooter = document.getElementById('previewCloseFooter');
    const fsBtn = document.getElementById('previewFullscreenBtn');

    titleEl.textContent = filename;
    titleEl.title = filename;
    openBtn.href = getViewUrl(encodedKey);
    downloadBtn.href = getDownloadUrl(encodedKey);
    // Ensure downloaded file has the original filename
    downloadBtn.setAttribute('download', filename);

    // Reset sizing classes
    dialog.classList.remove('preview-large', 'preview-compact');

    // Clear previous content and show loading
    contentEl.innerHTML = `<div class="empty-preview"><i class="fas fa-spinner fa-spin"></i><div style="margin-top:0.5rem; color:var(--gray-color-ml);">Loading preview...</div></div>`;

    const imgTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const videoTypes = ['mp4', 'webm', 'ogg'];
    const audioTypes = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    const textTypes = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'ts', 'html', 'htm', 'css', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf'];
    const effectiveMode = previewMode === 'auto'
        ? (imgTypes.includes(extension) ? 'image'
            : videoTypes.includes(extension) ? 'video'
                : audioTypes.includes(extension) ? 'audio'
                    : extension === 'pdf' ? 'pdf'
                        : textTypes.includes(extension) ? 'text'
                            : 'unsupported')
        : previewMode;

    // Render content and adjust dialog size
    if (effectiveMode === 'image') {
        dialog.classList.add('preview-compact');
        const img = document.createElement('img');
        img.className = 'preview-img';
        img.src = getViewUrl(encodedKey);
        img.alt = filename;
        img.onload = () => { };
        img.onerror = () => { contentEl.textContent = 'Could not load preview.'; };
        contentEl.innerHTML = '';
        contentEl.appendChild(img);
    } else if (effectiveMode === 'video') {
        dialog.classList.add('preview-large');
        const video = document.createElement('video');
        video.className = 'preview-video';
        video.controls = true;
        video.src = getViewUrl(encodedKey);
        contentEl.innerHTML = '';
        contentEl.appendChild(video);
    } else if (effectiveMode === 'audio') {
        dialog.classList.add('preview-compact');
        const audio = document.createElement('audio');
        audio.className = 'preview-audio';
        audio.controls = true;
        audio.src = getViewUrl(encodedKey);
        contentEl.innerHTML = '';
        contentEl.appendChild(audio);
    } else if (effectiveMode === 'pdf') {
        dialog.classList.add('preview-large');
        const iframe = document.createElement('iframe');
        iframe.className = 'preview-iframe';
        iframe.src = getViewUrl(encodedKey);
        contentEl.innerHTML = '';
        contentEl.appendChild(iframe);
    } else if (effectiveMode === 'text') {
        dialog.classList.add('preview-compact');
        
        fetch(getViewUrl(encodedKey))
            .then(r => r.text())
            .then(text => {
                contentEl.innerHTML = '';
                const pre = document.createElement('pre');
                pre.textContent = text;
                pre.className = 'preview-text';
                contentEl.appendChild(pre);
            })
            .catch(err => { contentEl.textContent = 'Could not load preview.'; });
    } else {
        contentEl.innerHTML = `<div style="text-align:center;">Preview not available for this file type. <a href="${getDownloadUrl(encodedKey)}">Download</a></div>`;
    }

    // Show modal
    modal.classList.add('show');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    // Focus management + focus trap
    const prevFocus = document.activeElement;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    function getFocusable() { return Array.from(modal.querySelectorAll(focusableSelector)).filter(el => !el.hasAttribute('disabled')); }
    const focusable = () => getFocusable();
    const firstFocusable = () => focusable()[0];
    const lastFocusable = () => focusable()[focusable().length - 1];

    // Focus initial
    (closeBtn || closeFooter).focus();

    function onKeyDown(e) {
        if (e.key === 'Escape') return cleanup();
        if (e.key === 'Tab') {
            const f = focusable();
            if (f.length === 0) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
    }

    function onBackdropClick(e) { if (e.target === modal) cleanup(); }

    // Fullscreen toggle
    let fsActive = false;
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            dialog.requestFullscreen?.();
            fsBtn.innerHTML = '<i class="fas fa-compress"></i>';
            fsActive = true;
        } else {
            document.exitFullscreen?.();
            fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
            fsActive = false;
        }
    }

    function cleanup() {
        // Exit fullscreen if active
        if (fsActive && document.fullscreenElement) document.exitFullscreen?.();
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        modal.removeEventListener('click', onBackdropClick);
        document.removeEventListener('keydown', onKeyDown);
        fsBtn.removeEventListener('click', toggleFullscreen);
        (closeBtn || closeFooter).removeEventListener('click', cleanup);
        closeFooter.removeEventListener('click', cleanup);
    }

    modal.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    fsBtn.addEventListener('click', toggleFullscreen);
    (closeBtn || closeFooter).addEventListener('click', cleanup);
    closeFooter.addEventListener('click', cleanup);
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

// Update file icons in the table
function updateFileIcons() {
    const fileRows = document.querySelectorAll('.file-row');
    fileRows.forEach(row => {
        const fileNameElement = row.querySelector('.file-name');
        const folderPathElement = row.querySelector('.folder-path');
        const fileIconElement = row.querySelector('.file-icon i');
        const fileIconContainer = row.querySelector('.file-icon');
        const viewButton = row.querySelector('.view-btn');

        if (fileNameElement && fileIconElement && fileIconContainer) {
            const fullPath = fileNameElement.getAttribute('data-full-path');

            // Split the path into folder and filename
            const lastSlashIndex = fullPath.lastIndexOf('/');
            let folder = '';
            let filename = fullPath;

            if (lastSlashIndex !== -1) {
                folder = fullPath.substring(0, lastSlashIndex);
                filename = fullPath.substring(lastSlashIndex + 1);
            }

            // Truncate long filenames
            const truncatedName = truncateFileName(filename);

            // Update the display
            fileNameElement.textContent = truncatedName;
            fileNameElement.title = filename; // Full name on hover



            const iconClass = getFileIcon(filename);
            const typeCategory = getFileTypeCategory(filename);

            // Update icon
            fileIconElement.className = iconClass;

            // Add type-specific styling
            if (typeCategory) {
                fileIconContainer.classList.add(typeCategory);
            }

            // Show/hide and update view button based on file type
            if (viewButton) {
                const isFileViewable = isViewable(filename);

                if (isFileViewable) {
                    viewButton.style.display = 'inline-flex';
                    viewButton.style.opacity = '1';
                    viewButton.title = 'View file in browser';
                    viewButton.disabled = false;
                } else {
                    viewButton.style.opacity = '0.5';
                    viewButton.title = 'File type not supported for viewing';
                    viewButton.disabled = true;
                }
            }
        }
    });
}

// Selection & bulk actions
function setupSelection() {
    const selectAll = document.getElementById('selectAllCheckbox');
    const bulkBar = document.getElementById('bulkActionsBar');
    const bulkCount = document.getElementById('bulkSelectedCount');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

    const checkboxes = Array.from(document.querySelectorAll('.selectFileCheckbox'));

    const selected = new Set();

    function updateUI() {
        const count = selected.size;
        bulkCount.textContent = `${count} selected`;
        bulkBar.style.display = count > 0 ? 'block' : 'none';
        bulkDeleteBtn.disabled = count === 0;
        if (selectAll) selectAll.checked = checkboxes.length > 0 && selected.size === checkboxes.length;
    }

    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.addEventListener('change', function (e) {
            const key = this.dataset.key;
            if (this.checked) selected.add(key); else selected.delete(key);
            updateUI();
        });
    });

    if (selectAll) {
        selectAll.checked = false;
        selectAll.addEventListener('change', function () {
            const checked = this.checked;
            selected.clear();
            checkboxes.forEach(cb => { cb.checked = checked; if (checked) selected.add(cb.dataset.key); });
            updateUI();
        });
    }

    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async function () {
            if (!confirm('Delete selected files? This cannot be undone.')) return;
            const keys = Array.from(selected);
            try {
                const resp = await fetch(withBucketUrl('/mbkbucket/delete'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
                const json = await resp.json();
                if (json.success) {
                    showAlert('Deleted selected files', 'success');
                    loadFiles(currentPage, currentPrefix);
                } else {
                    showAlert(json.error || 'Delete failed', 'error');
                }
            } catch (err) {
                showAlert('Delete failed: ' + err.message, 'error');
            }
        });
    }
}

// Create folder (zero-byte placeholder object)
async function createFolder() {
    const name = prompt('Enter new folder name (no slashes):');
    if (!name) return;
    const safe = name.replace(/[\\/]+/g, '').trim();
    if (!safe) return showAlert('Invalid folder name', 'error');

    try {
        const resp = await fetch(withBucketUrl('/mbkbucket/create-folder'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: currentPrefix, folderName: safe }) });
        const json = await resp.json();
        if (json.success) {
            showAlert('Folder created', 'success');
            loadFiles(currentPage, currentPrefix);
        } else {
            showAlert(json.error || 'Create folder failed', 'error');
        }
    } catch (err) {
        showAlert('Create folder failed: ' + err.message, 'error');
    }
}

// Create new file
async function createFile() {
    let name = prompt('Enter new file name:');
    if (!name) return;
    
    name = name.trim();
    if (!name.includes('.')) {
        name += '.txt';
    }
    
    // Ensure no leading slashes, we upload to currentPrefix
    if (name.startsWith('/')) name = name.substring(1);
    
    // Check if valid
    if (!name) return showAlert('Invalid file name', 'error');

    // Create empty file content
    const file = new File([" "], name, { type: "text/plain" });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', currentPrefix);
    
    try {
        const resp = await fetch(withBucketUrl('/mbkbucket/upload'), {
            method: 'POST',
            body: formData
        });
        
        const json = await resp.json();
        if (json.success) {
            showAlert('File created', 'success');
            loadFiles(currentPage, currentPrefix);
        } else {
            showAlert(json.error || 'Create file failed', 'error');
        }
    } catch (err) {
        showAlert('Create file failed: ' + err.message, 'error');
    }
}



// mbkbucket shared utilities (exposed to global window for backward compatibility)
(function (w) {
    'use strict';

    w.formatDate = function (dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    w.formatFileSize = function (bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    w.formatTime = function (seconds) {
        if (seconds < 60) {
            return Math.round(seconds) + 's';
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return minutes + 'm ' + remainingSeconds + 's';
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return hours + 'h ' + minutes + 'm';
        }
    };

    w.getFileIcon = function (filename) {
        const extension = (filename || '').split('.').pop().toLowerCase();

        const iconMap = {
            jpg: 'fas fa-image',
            jpeg: 'fas fa-image',
            png: 'fas fa-image',
            gif: 'fas fa-image',
            webp: 'fas fa-image',
            svg: 'fas fa-image',
            bmp: 'fas fa-image',
            ico: 'fas fa-image',
            mp4: 'fas fa-video',
            webm: 'fas fa-video',
            ogg: 'fas fa-video',
            avi: 'fas fa-video',
            mov: 'fas fa-video',
            wmv: 'fas fa-video',
            flv: 'fas fa-video',
            mkv: 'fas fa-video',
            mp3: 'fas fa-music',
            wav: 'fas fa-music',
            flac: 'fas fa-music',
            aac: 'fas fa-music',
            m4a: 'fas fa-music',
            pdf: 'fas fa-file-pdf',
            doc: 'fas fa-file-word',
            docx: 'fas fa-file-word',
            xls: 'fas fa-file-excel',
            xlsx: 'fas fa-file-excel',
            ppt: 'fas fa-file-powerpoint',
            pptx: 'fas fa-file-powerpoint',
            js: 'fab fa-js-square',
            ts: 'fas fa-code',
            html: 'fab fa-html5',
            htm: 'fab fa-html5',
            css: 'fab fa-css3-alt',
            php: 'fab fa-php',
            py: 'fab fa-python',
            java: 'fab fa-java',
            cpp: 'fas fa-code',
            c: 'fas fa-code',
            h: 'fas fa-code',
            cs: 'fas fa-code',
            rb: 'fas fa-code',
            go: 'fas fa-code',
            rs: 'fas fa-code',
            sql: 'fas fa-database',
            sh: 'fas fa-terminal',
            bat: 'fas fa-terminal',
            ps1: 'fas fa-terminal',
            txt: 'fas fa-file-alt',
            md: 'fab fa-markdown',
            json: 'fas fa-code',
            xml: 'fas fa-code',
            csv: 'fas fa-file-csv',
            log: 'fas fa-file-alt',
            yaml: 'fas fa-code',
            yml: 'fas fa-code',
            toml: 'fas fa-code',
            ini: 'fas fa-cog',
            conf: 'fas fa-cog',
            zip: 'fas fa-file-archive',
            rar: 'fas fa-file-archive',
            '7z': 'fas fa-file-archive',
            tar: 'fas fa-file-archive',
            gz: 'fas fa-file-archive'
        };

        return iconMap[extension] || 'fas fa-file-alt';
    };

    w.isViewable = function (filename) {
        const extension = (filename || '').split('.').pop().toLowerCase();
        const viewableTypes = [
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
            'mp4', 'webm', 'ogg',
            'mp3', 'wav', 'ogg',
            'txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'ts', 'html', 'htm', 'css',
            'php', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql',
            'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf',
            'pdf'
        ];

        return viewableTypes.includes(extension);
    };

    w.getFileTypeCategory = function (filename) {
        const extension = (filename || '').split('.').pop().toLowerCase();
        const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        const videoTypes = ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv', 'mkv'];
        const audioTypes = ['mp3', 'wav', 'flac', 'aac', 'm4a'];
        const documentTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        const codeTypes = ['js', 'ts', 'html', 'htm', 'css', 'php', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf', 'txt', 'md', 'json', 'xml', 'csv', 'log'];

        if (imageTypes.includes(extension)) return 'image-file';
        if (videoTypes.includes(extension)) return 'video-file';
        if (audioTypes.includes(extension)) return 'audio-file';
        if (documentTypes.includes(extension)) return 'document-file';
        if (codeTypes.includes(extension)) return 'code-file';

        return '';
    };

    w.truncateFileName = function (filename) {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) return filename;
        const maxLength = 30;
        if ((filename || '').length <= maxLength) return filename;
        const dotIndex = filename.lastIndexOf('.');
        let name = filename;
        let extension = '';
        if (dotIndex !== -1) {
            name = filename.substring(0, dotIndex);
            extension = filename.substring(dotIndex);
        }
        const lastChars = 3;
        const extensionLength = extension.length;
        const ellipsis = '...';
        const availableForName = maxLength - ellipsis.length - lastChars - extensionLength;
        if (availableForName <= 0) return filename.substring(0, maxLength - ellipsis.length) + ellipsis;
        const firstPart = name.substring(0, availableForName);
        const lastPart = name.substring(name.length - lastChars);
        return firstPart + ellipsis + lastPart + extension;
    };

    // Debounce helper - returns a function that delays invocation until after wait ms
    w.debounce = function (fn, wait) {
        let timeout = null;
        return function () {
            const ctx = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                fn.apply(ctx, args);
            }, wait);
        };
    };

})(window);
