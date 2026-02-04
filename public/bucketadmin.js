// Global state
let currentPage = 1;
let currentPrefix = '';
let currentSearch = '';
let currentSort = 'name';
let currentOrder = 'asc';
let currentViewMode = 'folder'; // 'folder' or 'flat'
let pageFiles = [];
let pageFolders = [];
const bucketAppName = document.getElementById('bucketAppData')?.dataset.appName || '';
// Bucket is configured centrally on the server; client should not select a bucket.

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
        <i class="fas ${isSuccess ? 'fa-check-circle' : 'fa-exclamation-circle'}" style="font-size: 1.25rem;"></i>
        <div style="flex: 1;">${message}</div>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:white; cursor:pointer; opacity:0.8; font-size:1.2rem;">&times;</button>
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
async function loadFiles(page = 1, prefix = '', search = '', sort = currentSort, order = currentOrder) {
    currentPage = page;
    currentPrefix = prefix;
    currentSearch = search;
    currentSort = sort;
    currentOrder = order;

    // Update browser URL so navigation is shareable/bookmarkable (folder shown as readable path)
    try {
        const parts = [];
        if (prefix) {
            // preserve slashes in folder param for readability: encode then restore slashes
            const folderEncoded = encodeURIComponent(prefix).replace(/%2F/g, '/');
            parts.push(`folder=${folderEncoded}`);
        }
        if (page && page > 1) parts.push(`page=${page}`);
        if (search) parts.push(`search=${encodeURIComponent(search)}`);
        // Optional: Add sort/order to URL if desired, skipping for simplicity/clean URLs for now

        const newUrl = '/mbkbucket' + (parts.length ? '?' + parts.join('&') : '');
        window.history.replaceState(null, '', newUrl);
    } catch (e) {
        // Ignore history errors in older browsers
        console.warn('history update failed', e);
    }

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
          <div class="skeleton-box s-80"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-box s-40"></div>
          <div class="skeleton-box s-200"></div>
          <div class="skeleton-box s-80"></div>
          <div class="skeleton-box s-80"></div>
        </div>
        <div class="skeleton-row">
          <div class="skeleton-box s-40"></div>
          <div class="skeleton-box s-200"></div>
          <div class="skeleton-box s-80"></div>
          <div class="skeleton-box s-80"></div>
        </div>
      </div>
    `;

    try {
        const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
        const sortParam = `&sort=${sort}&order=${order}`;
        const response = await fetch(`/mbkbucket/api/files?page=${page}&prefix=${encodeURIComponent(prefix)}${searchParam}${sortParam}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load files');
        }

        // Update stats
        totalFilesCount.textContent = `${data.totalFiles} ${search ? 'Results' : 'Files'}`;

        if (search) {
            filterInfo.textContent = `Search results for: "${search}"`;
            fileListTitle.innerHTML = `Search Results <span class="text-muted">for: </span><span class="badge bg-info">${search}</span>`;
        } else {
            const label = prefix || bucketAppName || 'Root';
            filterInfo.textContent = `Filtered by folder: ${label}`;
            fileListTitle.innerHTML = `Files <span class="text-muted">in: </span><span class="badge bg-info">${label}</span>`;
        }

        // Render files or empty state
        if (data.files.length === 0 && !prefix) {
            container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <h4>No files found</h4>
            <p>Your bucket is empty. Upload some files to get started!</p>
            <button class="btn btn-lg" onclick="document.getElementById('fileInput').click()">
              <i class="fas fa-plus"></i> Upload Your First File
            </button>
          </div>
        `;
            paginationContainer.style.display = 'none';
        } else {
            // Store for client-side sorting and view switching
            pageFiles = data.files;

            // Only calculate folders if we are in search or folder mode (for potential future switching)
            // But mainly we rely on currentViewMode in the render function
            pageFolders = search ? [] : extractFoldersAtCurrentLevel(data.files, prefix);

            renderFilesTable(pageFiles, pageFolders, prefix);
            renderPagination(data);
            paginationContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle" style="color: var(--danger-color-ml);"></i>
          <h4>Error Loading Files</h4>
          <p>${error.message}</p>
          <button class="btn btn-primary" onclick="loadFiles(${page}, '${prefix}')">
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
                valA = (a.Key || '').split('/').pop().toLowerCase();
                valB = (b.Key || '').split('/').pop().toLowerCase();
            }

            if (valA < valB) return currentOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentOrder === 'asc' ? 1 : -1;
            return 0;
        });

        renderFilesTable(pageFiles, pageFolders, currentPrefix);
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

// Extract unique folders at current level
function extractFoldersAtCurrentLevel(files, prefix) {
    const folderSet = new Set();
    const prefixDepth = prefix ? prefix.split('/').filter(p => p).length : 0;

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

    // Re-render with existing data
    renderFilesTable(pageFiles, pageFolders, currentPrefix);
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
function renderFilesTable(files, folders = [], prefix = '') {
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
                const fileName = f.Key.split('/').pop();
                return fileName.toLowerCase().includes(searchLower);
            });

            // 2. Show folders where FOLDER NAME matches the search term
            displayFolders = extractMatchingFolders(files, currentSearch);
        } else {
            // Normal Flat Mode: Show all files, no folders
            displayFiles = files;
            displayFolders = [];
        }
    } else {
        // Normal Folder View logic
        // Filter files to show only those at current level (not in subfolders)
        displayFiles = files.filter(file => {
            const relativePath = prefix ? file.Key.substring(prefix.length + (prefix.endsWith('/') ? 0 : 1)) : file.Key;
            // File is at current level if it has no '/' in relative path
            return !relativePath.includes('/');
        });
        displayFolders = folders;
    }

    // Generate breadcrumb navigation
    let breadcrumb = '';
    // Show breadcrumb only if we are in folder mode OR if we have a prefix filter active even in flat mode
    // (In flat mode, the prefix acts as a base filter, but we see recursive files under it)
    if (prefix) {
        const parts = prefix.split('/').filter(p => p);
        let breadcrumbHTML = `
        <div class="breadcrumb-nav">
          <div class="breadcrumb-item">
            <i class="fas fa-home"></i>
            <span class="breadcrumb-link" onclick="loadFiles(1, '')" title="Go to root">Root</span>
          </div>
      `;

        let currentPath = '';
        parts.forEach((part, index) => {
            currentPath += (currentPath ? '/' : '') + part;
            const isLast = index === parts.length - 1;

            if (isLast) {
                breadcrumbHTML += `
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <div class="breadcrumb-item">
              <span class="breadcrumb-current">${part}</span>
            </div>
          `;
            } else {
                const pathCopy = currentPath;
                breadcrumbHTML += `
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <div class="breadcrumb-item">
              <span class="breadcrumb-link" onclick="loadFiles(1, '${pathCopy}')" title="Go to ${pathCopy}">${part}</span>
            </div>
          `;
            }
        });

        breadcrumbHTML += `</div>`;
        breadcrumb = breadcrumbHTML;
    }

    // Generate folder rows (only used in folder mode)
    const folderRows = displayFolders.map(folderPath => {
        const folderName = folderPath.split('/').pop();
        return `
        <tr class="folder-row" onclick="loadFiles(1, '${folderPath}')" title="Open folder: ${folderName}">
          <td style="text-align:center;">
            <!-- no selection for folders -->
          </td>
          <td style="padding-left: 1.5rem;">
            <div style="display: flex; align-items: center;">
              <div class="file-icon">
                <i class="fas fa-folder"></i>
              </div>
              <div class="file-info">
                <div class="file-name" style="font-weight: 700;">
                  <i class="fas fa-folder" style="margin-right: 0.5rem; color: #f59e0b;"></i>${folderName}/
                </div>
              </div>              
              <button type="button" class="btn btn-danger btn-sm delete-btn dtm" onclick="event.stopPropagation(); confirmDelete('${folderPath}/', true);" data-key="${folderPath}/" data-is-folder="true" title="Delete folder">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
          <td>
            <span style="color: var(--gray-color-ml);">\u2014</span>
          </td>
          <td style="text-align: center;">
            <span style="color: var(--gray-color-ml);">\u2014</span>
          </td>
          <td style="text-align: center;">
            <div class="btn-group" role="group">
              <button type="button" class="btn btn-danger btn-sm delete-btn" onclick="event.stopPropagation(); confirmDelete('${folderPath}/', true);" data-key="${folderPath}/" data-is-folder="true" title="Delete folder">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Generate file rows
    const fileRows = displayFiles.map(file => {
        const encodedKey = encodeURIComponent(file.Key);

        // Calculate display name and icon directly
        const fullPath = file.Key;
        const lastSlashIndex = fullPath.lastIndexOf('/');
        let filename = fullPath;
        let folderPath = '';

        if (lastSlashIndex !== -1) {
            filename = fullPath.substring(lastSlashIndex + 1);
            folderPath = fullPath.substring(0, lastSlashIndex + 1); // include trailing slash
        }

        const iconClass = getFileIcon(filename);
        const typeCategory = getFileTypeCategory(filename);
        const truncatedName = truncateFileName(filename);
        const isFileViewable = isViewable(filename);

        // If in flat mode, we might want to show the folder path more prominently
        const pathDisplay = (currentViewMode === 'flat' && folderPath && folderPath !== prefix + (prefix ? '/' : ''))
            ? `<div style="font-size: 0.75rem; color: var(--gray-color-ml); margin-bottom:2px;">
             <i class="fas fa-folder" style="margin-right:4px; opacity:0.5;"></i> ${folderPath}
           </div>`
            : '';

        return `
        <tr class="file-row">
          <td style="text-align:center;">
            <input type="checkbox" class="selectFileCheckbox" data-key="${file.Key}" aria-label="Select ${file.Key}" />
          </td>
          <td style="padding-left: 1.5rem;">
            <div style="display: flex; align-items: center;">
              <div class="file-icon ${typeCategory}">
                <i class="${iconClass}"></i>
              </div>
              <div class="file-info">
                ${pathDisplay}
                <div class="file-name" data-full-path="${file.Key}" title="${filename}">${truncatedName}</div>
              </div>
            </div>
          </td>
          <td>
            ${file.Size ? `<span class="file-size">${formatFileSize(file.Size)}</span>` : '<span style="color: var(--gray-color-ml);">N/A</span>'}
          </td>
          <td>
            ${file.LastModified ? `<span style="color: var(--gray-color-ml);">${formatDate(file.LastModified)}</span>` : '<span style="color: var(--gray-color-ml);">N/A</span>'}
          </td>
          <td style="text-align: center;">
            <div class="btn-group" role="group">
              <button type="button" class="btn btn-primary btn-sm view-btn" data-key="${file.Key}" data-filename="${file.Key}"
                data-key-enc="${encodedKey}" title="${isFileViewable ? 'View file in browser' : 'File type not supported for viewing'}" ${!isFileViewable ? 'disabled style="opacity:0.5"' : ''}>
                <i class="fas fa-eye"></i>
              </button>
              <a href="/mbkbucket/download/${encodedKey}" class="btn btn-success btn-sm"
                title="Download file">
                <i class="fas fa-download"></i>
              </a>
              <button type="button" class="btn btn-danger btn-sm delete-btn" data-key="${file.Key}" title="Delete file">
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
        <div class="empty-state">
          <div style="margin-bottom: 1.5rem; position: relative; display: inline-block;">
            <i class="fas fa-folder-open" style="font-size: 4rem; color: #cbd5e0;"></i>
            <i class="fas fa-search" style="font-size: 2rem; color: var(--primary-color-ml); position: absolute; bottom: -5px; right: -10px; background: white; border-radius: 50%; padding: 5px;"></i>
          </div>
          <h4>No files found</h4>
          <p style="max-width: 400px; margin: 0 auto 1.5rem; color: var(--text-muted-color-ml);">
            ${prefix ? `This folder <strong>${prefix}</strong> is currently empty.` : 'Your bucket is empty. Start by uploading files or creating a new folder.'}
          </p>
          <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="window.scrollTo({top: 0, behavior: 'smooth'}); document.getElementById('fileInput').click()">
              <i class="fas fa-cloud-upload-alt"></i> Upload Files
            </button>
            <button class="btn btn-outline-secondary" onclick="createFolder()">
              <i class="fas fa-folder-plus"></i> New Folder
            </button>
            ${prefix ? `<button class="btn btn-light" onclick="loadFiles(1, '')">
              <i class="fas fa-home"></i> Go to Root
            </button>` : ''}
          </div>
        </div>
      `;
        return;
    }

    // Sort icon helper
    const getSortIcon = (field) => {
        if (currentSort !== field) return '<i class="fas fa-sort" style="color:var(--gray-color-ml); opacity:0.3; font-size:0.8rem; margin-left:0.5rem;"></i>';
        return currentOrder === 'asc'
            ? '<i class="fas fa-sort-up" style="color:var(--primary-color-ml); font-size:0.9rem; margin-left:0.5rem;"></i>'
            : '<i class="fas fa-sort-down" style="color:var(--primary-color-ml); font-size:0.9rem; margin-left:0.5rem;"></i>';
    };

    document.getElementById('fileListContainer').innerHTML = `
      ${breadcrumb}
      <div class="table-responsive">
        <div id="bulkActionsBar" style="display:none; padding: 0.5rem; border-bottom: 1px solid var(--gray-light-color-ml); background: var(--light-color-ml);">
          <span id="bulkSelectedCount">0 selected</span>
          <div style="float: right;">
            <button class="btn btn-danger btn-sm" id="bulkDeleteBtn" disabled>
              <i class="fas fa-trash"></i> Delete Selected
            </button>
          </div>
        </div>
        <table class="table table-hover mb-0">
          <thead>
            <tr>
              <th style="width:48px; text-align:center;">
                <input type="checkbox" id="selectAllCheckbox" aria-label="Select all files" />
              </th>
              <th style="padding-left: 1.5rem; cursor: pointer;" onclick="toggleSort('name')">
                <i class="fas fa-file-alt"></i> Name ${getSortIcon('name')}
              </th>
              <th style="cursor: pointer;" onclick="toggleSort('size')">
                <i class="fas fa-weight"></i> Size ${getSortIcon('size')}
              </th> 
              <th style="cursor: pointer;" onclick="toggleSort('date')">
                <i class="fas fa-calendar"></i> Last Modified ${getSortIcon('date')}
              </th>
              <th style="text-align: center;">
                <i class="fas fa-cogs"></i> Actions
              </th>
            </tr>
          </thead>
          <tbody>
            ${allRows}
          </tbody>
        </table>
      </div>
    `;

    // Wire selection checkboxes and bulk actions
    setupSelection();
}

// Render pagination
function renderPagination(data) {
    const { currentPage, totalPages, hasPrevPage, hasNextPage } = data;

    let paginationHTML = '';

    // Previous button
    if (hasPrevPage) {
        paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="event.preventDefault(); loadFiles(${currentPage - 1}, '${currentPrefix}', '${currentSearch}')">
            <i class="fas fa-chevron-left"></i> Previous
          </a>
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

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            paginationHTML += `
          <li class="page-item active">
            <span class="page-link">${i}</span>
          </li>
        `;
        } else {
            paginationHTML += `
          <li class="page-item">
            <a class="page-link" href="#" onclick="event.preventDefault(); loadFiles(${i}, '${currentPrefix}', '${currentSearch}')">${i}</a>
          </li>
        `;
        }
    }

    // Next button
    if (hasNextPage) {
        paginationHTML += `
        <li class="page-item">
          <a class="page-link" href="#" onclick="event.preventDefault(); loadFiles(${currentPage + 1}, '${currentPrefix}', '${currentSearch}')">
            Next <i class="fas fa-chevron-right"></i>
          </a>
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
        const response = await fetch('/mbkbucket/delete', {
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
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunk threshold

function createId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }

function addFilesToQueue(fileList) {
    for (const f of Array.from(fileList)) {
        uploadQueue.push({ id: createId(), file: f, status: 'queued', progress: 0 });
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

    container.innerHTML = uploadQueue.map(item => `
      <div class="upload-item" data-id="${item.id}">
        <div class="meta">
          <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; width:100%; margin-bottom:5px;">
            <div class="file-icon"><i class="fas fa-file"></i></div>
            <div class="name">${item.file.name}</div>
            <div class="form-text file-size" style="white-space:nowrap; color:var(--text-muted-color-ml); font-size:0.875rem; margin-left:auto;">${formatFileSize(item.file.size)}</div>
          </div>
        </div>
        <div style="min-width:220px;">
          <div class="progress-container" style="height: 8px; margin-bottom: 6px;">
            <div class="progress-bar" style="width: ${Math.round(item.progress)}%; height: 8px;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
            <small class="text-muted status">${item.status}</small>
            <div class="controls">
              ${item.status === 'uploading' ? `<button class="btn btn-sm btn-outline-secondary cancel-upload" data-id="${item.id}"><i class="fas fa-ban"></i></button>` : `<button class="btn btn-sm btn-danger remove-queued" data-id="${item.id}"><i class="fas fa-trash"></i></button>`}
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Wire up controls
    document.querySelectorAll('.remove-queued').forEach(btn => btn.addEventListener('click', function (e) {
        const id = this.dataset.id;
        const idx = uploadQueue.findIndex(i => i.id === id);
        if (idx !== -1) uploadQueue.splice(idx, 1);
        renderUploadQueue();
    }));

    document.querySelectorAll('.cancel-upload').forEach(btn => btn.addEventListener('click', function (e) {
        const id = this.dataset.id;
        const handle = xhrMap.get(id);
        if (handle && handle.abort) {
            handle.abort();
        } else if (handle && handle.xhr) {
            handle.xhr.abort();
        }
        const entry = uploadQueue.find(i => i.id === id);
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
            // chunked upload
            const uploadId = createId();
            entry.uploadId = uploadId;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            let uploadedBytes = 0;
            for (let i = 0; i < totalChunks; i++) {
                if (entry.status === 'cancelled') throw new Error('Upload cancelled');
                const start = i * CHUNK_SIZE;
                const end = Math.min(file.size, start + CHUNK_SIZE);
                const blob = file.slice(start, end);

                const fd = new FormData();
                fd.append('chunk', blob, file.name);
                fd.append('uploadId', uploadId);
                fd.append('fileName', file.name);
                fd.append('chunkIndex', String(i));
                fd.append('totalChunks', String(totalChunks));

                const controller = new AbortController();
                xhrMap.set(entry.id, { controller });

                const resp = await fetch('/mbkbucket/upload-chunk', { method: 'POST', body: fd, signal: controller.signal });
                if (!resp.ok) throw new Error('Chunk upload failed');
                uploadedBytes += blob.size;
                entry.progress = (uploadedBytes / file.size) * 95; // up to 95% until assembly
                renderUploadQueue();
            }

            // complete
            const completeResp = await fetch('/mbkbucket/upload-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadId: entry.uploadId, fileName: file.name, prefix: currentPrefix, contentType: file.type || 'application/octet-stream' }) });
            const completeJson = await completeResp.json();
            if (!completeResp.ok || !completeJson.success) throw new Error(completeJson.error || 'Assemble failed');

            entry.status = 'done'; entry.progress = 100; xhrMap.delete(entry.id); renderUploadQueue();
            showAlert('File uploaded successfully', 'success');
            loadFiles(currentPage, currentPrefix);
        } else {
            // small file XHR
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('prefix', currentPrefix);

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/mbkbucket/upload');

            xhr.upload.addEventListener('progress', (e) => {
                if (!e.lengthComputable) return;
                entry.progress = (e.loaded / e.total) * 100;
                renderUploadQueue();
            });

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
        entry.status = entry.status === 'cancelled' ? 'cancelled' : 'error';
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



// Add hover effects and animations
document.addEventListener('DOMContentLoaded', function () {
    // Load initial files (support both legacy 'prefix' and new 'folder' query param)
    const urlParams = new URLSearchParams(window.location.search);
    const initialPrefix = urlParams.get('folder') || urlParams.get('prefix') || bucketAppName || '';
    const initialPage = parseInt(urlParams.get('page')) || 1;
    loadFiles(initialPage, initialPrefix);

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

    // Use inline preview modal for supported types
    const previewableImage = imageTypes.includes(extension);
    const previewableVideo = videoTypes.includes(extension);
    const previewableAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension);
    const previewablePdf = extension === 'pdf';
    const previewableText = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'ts', 'html', 'htm', 'css', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'rb', 'go', 'rs', 'sql', 'sh', 'bat', 'ps1', 'yaml', 'yml', 'toml', 'ini', 'conf'].includes(extension);

    // Build an encoded key safely (if key already appears encoded, don't double-encode)
    const encodedKey = (key && key.includes('%')) ? key : encodeURIComponent(key || filename);

    // Show the inline preview
    showPreviewModal(encodedKey, filename, extension);
    return false;
}

// Function to get file type category

// Preview modal helpers
function showPreviewModal(encodedKey, filename, extension) {
    const modal = document.getElementById('previewModal');
    if (!modal) {
        window.open(`/mbkbucket/view/${encodedKey}`, '_blank', 'noopener,noreferrer');
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
    openBtn.href = `/mbkbucket/view/${encodedKey}`;
    downloadBtn.href = `/mbkbucket/download/${encodedKey}`;
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

    // Render content and adjust dialog size
    if (imgTypes.includes(extension)) {
        dialog.classList.add('preview-compact');
        const img = document.createElement('img');
        img.className = 'preview-img';
        img.src = `/mbkbucket/view/${encodedKey}`;
        img.alt = filename;
        img.onload = () => { };
        img.onerror = () => { contentEl.textContent = 'Could not load preview.'; };
        contentEl.innerHTML = '';
        contentEl.appendChild(img);
    } else if (videoTypes.includes(extension)) {
        dialog.classList.add('preview-large');
        const video = document.createElement('video');
        video.className = 'preview-video';
        video.controls = true;
        video.src = `/mbkbucket/view/${encodedKey}`;
        contentEl.innerHTML = '';
        contentEl.appendChild(video);
    } else if (audioTypes.includes(extension)) {
        dialog.classList.add('preview-compact');
        const audio = document.createElement('audio');
        audio.className = 'preview-audio';
        audio.controls = true;
        audio.src = `/mbkbucket/view/${encodedKey}`;
        contentEl.innerHTML = '';
        contentEl.appendChild(audio);
    } else if (extension === 'pdf') {
        dialog.classList.add('preview-large');
        const iframe = document.createElement('iframe');
        iframe.className = 'preview-iframe';
        iframe.src = `/mbkbucket/view/${encodedKey}`;
        contentEl.innerHTML = '';
        contentEl.appendChild(iframe);
    } else if (textTypes.includes(extension)) {
        dialog.classList.add('preview-compact');
        
        fetch(`/mbkbucket/view/${encodedKey}`)
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
        contentEl.innerHTML = `<div style="text-align:center;">Preview not available for this file type. <a href="/mbkbucket/download/${encodedKey}">Download</a></div>`;
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
                const resp = await fetch('/mbkbucket/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
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
        const resp = await fetch('/mbkbucket/create-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: currentPrefix, folderName: safe }) });
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
        const resp = await fetch('/mbkbucket/upload', {
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