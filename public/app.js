/* =====================================================
   LinkVault — Client-Side Application Logic
   ===================================================== */

// ---- State ----
let collections = [];
let activeContextColId = null;
let verifiedCode = null;         // Stores the validated access code for the session
let pendingAction = null;        // Callback to run after code verification

// ---- DOM Refs ----
const $main       = document.getElementById('main-content');
const $empty      = document.getElementById('empty-state');
const $heroStats  = document.getElementById('hero-stats');
const $search     = document.getElementById('search-input');
const $toastBox   = document.getElementById('toast-container');

// Modals
const $modalAddItem       = document.getElementById('modal-add-item');
const $modalAddCollection = document.getElementById('modal-add-collection');
const $modalEditItem      = document.getElementById('modal-edit-item');
const $modalAccessCode    = document.getElementById('modal-access-code');
const $modalTrashLog      = document.getElementById('modal-trash-log');
const $contextMenu        = document.getElementById('context-menu');

// Forms
const $formAddItem       = document.getElementById('form-add-item');
const $formAddCollection = document.getElementById('form-add-collection');
const $formEditItem      = document.getElementById('form-edit-item');
const $formAccessCode    = document.getElementById('form-access-code');

// ========================
//  INIT
// ========================
document.addEventListener('DOMContentLoaded', () => {
  fetchCollections();
  bindEvents();
  initNavScrollEffect();
});

// ========================
//  API LAYER
// ========================
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  // Attach access code to modification requests
  if (method !== 'GET' && verifiedCode) {
    opts.headers['X-Access-Code'] = verifiedCode;
  }
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function fetchCollections() {
  try {
    collections = await api('/api/collections');
    render();
  } catch (err) {
    toast('Failed to load collections', 'error');
  }
}

// ========================
//  ACCESS CODE GATE
// ========================
// Wraps any modification action — if code not yet verified, prompt first.
function requireCode(action) {
  if (verifiedCode) {
    // Already verified this session — run immediately
    action();
  } else {
    // Store the action and show the code modal
    pendingAction = action;
    document.getElementById('access-code-input').value = '';
    document.getElementById('code-error').style.display = 'none';
    openModal($modalAccessCode);
    setTimeout(() => document.getElementById('access-code-input').focus(), 100);
  }
}

async function handleCodeSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('access-code-input');
  const code = input.value.trim();
  if (!code) return;

  try {
    await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    }).then(async res => {
      if (!res.ok) throw new Error('Invalid');
      return res.json();
    });

    // Code valid!
    verifiedCode = code;
    closeModal($modalAccessCode);
    toast('Access verified ✓', 'success');

    // Run the pending action
    if (pendingAction) {
      const action = pendingAction;
      pendingAction = null;
      action();
    }
  } catch {
    // Invalid code — shake + error
    input.classList.add('shake');
    document.getElementById('code-error').style.display = 'block';
    setTimeout(() => input.classList.remove('shake'), 400);
    input.value = '';
    input.focus();
  }
}

// ========================
//  RENDER
// ========================
function render(filter = '') {
  const query = filter.toLowerCase().trim();

  // Stats
  const totalItems = collections.reduce((s, c) => s + c.items.length, 0);
  $heroStats.innerHTML = `
    <div class="stat"><span class="stat-number">${collections.length}</span><span class="stat-label">Collections</span></div>
    <div class="stat"><span class="stat-number">${totalItems}</span><span class="stat-label">Items</span></div>
    <div class="stat"><span class="stat-number">${collections.reduce((s, c) => s + c.items.filter(i => i.type === 'pdf').length, 0)}</span><span class="stat-label">PDFs</span></div>
    <div class="stat"><span class="stat-number">${collections.reduce((s, c) => s + c.items.filter(i => i.type === 'video').length, 0)}</span><span class="stat-label">Videos</span></div>
  `;

  // Empty?
  if (collections.length === 0) {
    $empty.style.display = 'flex';
    clearRows();
    return;
  }
  $empty.style.display = 'none';

  // Build rows
  clearRows();

  collections.forEach((col, ci) => {
    // Filter items
    let items = col.items;
    if (query) {
      items = items.filter(i =>
        i.title.toLowerCase().includes(query) ||
        (i.description && i.description.toLowerCase().includes(query)) ||
        i.url.toLowerCase().includes(query)
      );
      // Skip entire row if no matches and collection name doesn't match either
      if (items.length === 0 && !col.name.toLowerCase().includes(query)) return;
    }

    const row = document.createElement('section');
    row.className = 'collection-row';
    row.style.animationDelay = `${ci * 0.08}s`;
    row.dataset.colId = col.id;

    row.innerHTML = `
      <div class="collection-header">
        <div class="collection-title">
          <div class="collection-color-bar" style="background:${col.color}"></div>
          <span class="collection-name">${escapeHtml(col.name)}</span>
          <span class="collection-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="collection-actions">
          <button class="icon-btn btn-col-add" data-col-id="${col.id}" title="Add item to this collection">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="icon-btn btn-col-menu" data-col-id="${col.id}" title="Collection options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>
      </div>
      <div class="cards-track">
        ${items.map(item => cardHTML(item, col)).join('')}
        <div class="card-add" data-col-id="${col.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Add Item</span>
        </div>
      </div>
    `;

    $main.insertBefore(row, $empty);
  });
}

function clearRows() {
  document.querySelectorAll('.collection-row').forEach(el => el.remove());
}

function cardHTML(item, col) {
  const typeIcons = { link: '🔗', pdf: '📄', video: '🎬' };
  const badgeClass = `badge-${item.type}`;
  const thumbContent = item.thumbnail
    ? `<img class="card-thumb-img" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy" />`
    : `<div class="card-thumb-placeholder" style="background:linear-gradient(135deg, ${col.color}22, ${col.color}08)">${typeIcons[item.type] || '🔗'}</div>`;

  const dateStr = item.addedAt ? new Date(item.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

  return `
    <div class="card" data-item-id="${item.id}" data-col-id="${col.id}" data-url="${escapeHtml(item.url)}">
      <div class="card-thumb">
        ${thumbContent}
        <span class="card-type-badge ${badgeClass}">${item.type}</span>
      </div>
      <div class="card-body">
        <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="card-desc">${escapeHtml(item.description || item.url)}</div>
      </div>
      <div class="card-footer">
        <span class="card-date">${dateStr}</span>
        <button class="card-edit-btn" data-item-id="${item.id}" data-col-id="${col.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ========================
//  EVENTS
// ========================
function bindEvents() {
  // Navbar buttons — all modifications go through requireCode
  document.getElementById('btn-add-item').addEventListener('click', () => {
    requireCode(() => openAddItemModal());
  });
  document.getElementById('btn-add-collection').addEventListener('click', () => {
    requireCode(() => openModal($modalAddCollection));
  });
  document.getElementById('btn-empty-add').addEventListener('click', () => {
    requireCode(() => openModal($modalAddCollection));
  });

  // Trash log button (read-only, no code needed)
  document.getElementById('btn-trash-log').addEventListener('click', openTrashLog);
  document.getElementById('modal-trash-log-close').addEventListener('click', () => closeModal($modalTrashLog));
  document.getElementById('btn-clear-log').addEventListener('click', () => {
    requireCode(handleClearLog);
  });

  // Modal closes
  document.getElementById('modal-add-item-close').addEventListener('click', () => closeModal($modalAddItem));
  document.getElementById('modal-add-collection-close').addEventListener('click', () => closeModal($modalAddCollection));
  document.getElementById('modal-edit-item-close').addEventListener('click', () => closeModal($modalEditItem));
  document.getElementById('modal-access-code-close').addEventListener('click', () => {
    closeModal($modalAccessCode);
    pendingAction = null;
  });

  // Click backdrop to close
  [$modalAddItem, $modalAddCollection, $modalEditItem, $modalTrashLog].forEach($m => {
    $m.addEventListener('click', (e) => { if (e.target === $m) closeModal($m); });
  });
  $modalAccessCode.addEventListener('click', (e) => {
    if (e.target === $modalAccessCode) {
      closeModal($modalAccessCode);
      pendingAction = null;
    }
  });

  // Escape key closes modals + context menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      [$modalAddItem, $modalAddCollection, $modalEditItem, $modalTrashLog].forEach(closeModal);
      if ($modalAccessCode.style.display !== 'none') {
        closeModal($modalAccessCode);
        pendingAction = null;
      }
      $contextMenu.style.display = 'none';
    }
  });

  // Click outside context menu
  document.addEventListener('click', (e) => {
    if (!$contextMenu.contains(e.target) && !e.target.classList.contains('btn-col-menu')) {
      $contextMenu.style.display = 'none';
    }
  });

  // Search
  $search.addEventListener('input', () => render($search.value));

  // Form submissions
  $formAddItem.addEventListener('submit', handleAddItem);
  $formAddCollection.addEventListener('submit', handleAddCollection);
  $formEditItem.addEventListener('submit', handleEditItem);
  $formAccessCode.addEventListener('submit', handleCodeSubmit);
  document.getElementById('btn-delete-item').addEventListener('click', handleDeleteItem);

  // Color picker
  document.getElementById('color-picker').addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    document.querySelectorAll('#color-picker .color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
  });

  // Delegated events on main
  $main.addEventListener('click', handleMainClick);

  // Context menu actions
  document.getElementById('ctx-rename').addEventListener('click', handleRenameCollection);
  document.getElementById('ctx-recolor').addEventListener('click', handleRecolorCollection);
  document.getElementById('ctx-delete').addEventListener('click', handleDeleteCollection);
}

// ---- Delegated click handler ----
function handleMainClick(e) {
  // Edit button on card
  const editBtn = e.target.closest('.card-edit-btn');
  if (editBtn) {
    e.stopPropagation();
    requireCode(() => openEditItemModal(editBtn.dataset.colId, editBtn.dataset.itemId));
    return;
  }

  // Card click → open URL (no code needed, read-only)
  const card = e.target.closest('.card');
  if (card && card.dataset.url) {
    window.open(card.dataset.url, '_blank', 'noopener');
    return;
  }

  // Add card
  const addCard = e.target.closest('.card-add');
  if (addCard) {
    requireCode(() => openAddItemModal(addCard.dataset.colId));
    return;
  }

  // Collection quick-add
  const colAdd = e.target.closest('.btn-col-add');
  if (colAdd) {
    requireCode(() => openAddItemModal(colAdd.dataset.colId));
    return;
  }

  // Collection menu
  const colMenu = e.target.closest('.btn-col-menu');
  if (colMenu) {
    e.stopPropagation();
    showContextMenu(colMenu, colMenu.dataset.colId);
    return;
  }
}

// ========================
//  MODALS
// ========================
function openModal($m) {
  $m.style.display = 'flex';
}

function closeModal($m) {
  $m.style.display = 'none';
}

function openAddItemModal(preselectedColId = null) {
  populateCollectionSelect('item-collection', preselectedColId);
  $formAddItem.reset();
  if (preselectedColId) document.getElementById('item-collection').value = preselectedColId;
  openModal($modalAddItem);
  document.getElementById('item-title').focus();
}

function openEditItemModal(colId, itemId) {
  const col = collections.find(c => c.id === colId);
  const item = col?.items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('edit-item-id').value = itemId;
  document.getElementById('edit-item-col-id').value = colId;
  document.getElementById('edit-item-title').value = item.title;
  document.getElementById('edit-item-url').value = item.url;
  document.getElementById('edit-item-type').value = item.type;
  document.getElementById('edit-item-desc').value = item.description || '';
  document.getElementById('edit-item-thumb').value = item.thumbnail || '';
  populateCollectionSelect('edit-item-move', colId);
  openModal($modalEditItem);
}

function populateCollectionSelect(selectId, selectedId = null) {
  const $sel = document.getElementById(selectId);
  $sel.innerHTML = collections.map(c =>
    `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
  ).join('');
}

// ========================
//  HANDLERS
// ========================
async function handleAddItem(e) {
  e.preventDefault();
  const colId = document.getElementById('item-collection').value;
  const body = {
    title: document.getElementById('item-title').value.trim(),
    url: document.getElementById('item-url').value.trim(),
    type: document.getElementById('item-type').value,
    description: document.getElementById('item-desc').value.trim(),
    thumbnail: document.getElementById('item-thumb').value.trim()
  };
  try {
    await api(`/api/collections/${colId}/items`, 'POST', body);
    closeModal($modalAddItem);
    toast('Item added!', 'success');
    fetchCollections();
  } catch (err) {
    if (err.message.includes('access code')) {
      verifiedCode = null;
      toast('Session expired — please re-enter code', 'error');
    } else {
      toast('Failed to add item', 'error');
    }
  }
}

async function handleAddCollection(e) {
  e.preventDefault();
  const name = document.getElementById('col-name').value.trim();
  const activeDot = document.querySelector('#color-picker .color-dot.active');
  const color = activeDot ? activeDot.dataset.color : '#e50914';
  try {
    await api('/api/collections', 'POST', { name, color });
    closeModal($modalAddCollection);
    $formAddCollection.reset();
    document.querySelector('#color-picker .color-dot').classList.add('active');
    toast('Collection created!', 'success');
    fetchCollections();
  } catch (err) {
    if (err.message.includes('access code')) {
      verifiedCode = null;
      toast('Session expired — please re-enter code', 'error');
    } else {
      toast('Failed to create collection', 'error');
    }
  }
}

async function handleEditItem(e) {
  e.preventDefault();
  const itemId = document.getElementById('edit-item-id').value;
  const colId = document.getElementById('edit-item-col-id').value;
  const newColId = document.getElementById('edit-item-move').value;

  const body = {
    title: document.getElementById('edit-item-title').value.trim(),
    url: document.getElementById('edit-item-url').value.trim(),
    type: document.getElementById('edit-item-type').value,
    description: document.getElementById('edit-item-desc').value.trim(),
    thumbnail: document.getElementById('edit-item-thumb').value.trim()
  };

  try {
    await api(`/api/collections/${colId}/items/${itemId}`, 'PUT', body);
    // Move if collection changed
    if (newColId !== colId) {
      await api(`/api/collections/${colId}/items/${itemId}/move`, 'POST', { targetCollectionId: newColId });
    }
    closeModal($modalEditItem);
    toast('Item updated!', 'success');
    fetchCollections();
  } catch (err) {
    if (err.message.includes('access code')) {
      verifiedCode = null;
      toast('Session expired — please re-enter code', 'error');
    } else {
      toast('Failed to update item', 'error');
    }
  }
}

async function handleDeleteItem() {
  const itemId = document.getElementById('edit-item-id').value;
  const colId = document.getElementById('edit-item-col-id').value;
  if (!confirm('Delete this item? It will be logged in the Trash Log.')) return;
  try {
    await api(`/api/collections/${colId}/items/${itemId}`, 'DELETE');
    closeModal($modalEditItem);
    toast('Item deleted — logged to trash', 'success');
    fetchCollections();
  } catch (err) {
    if (err.message.includes('access code')) {
      verifiedCode = null;
      toast('Session expired — please re-enter code', 'error');
    } else {
      toast('Failed to delete item', 'error');
    }
  }
}

// ---- Context menu ----
function showContextMenu(btn, colId) {
  activeContextColId = colId;
  const rect = btn.getBoundingClientRect();
  $contextMenu.style.display = 'block';
  $contextMenu.style.top = `${rect.bottom + 6}px`;
  $contextMenu.style.left = `${rect.left}px`;
}

async function handleRenameCollection() {
  $contextMenu.style.display = 'none';
  requireCode(() => {
    const col = collections.find(c => c.id === activeContextColId);
    if (!col) return;
    const name = prompt('Rename collection:', col.name);
    if (!name || !name.trim()) return;
    api(`/api/collections/${activeContextColId}`, 'PUT', { name: name.trim() })
      .then(() => { toast('Collection renamed!', 'success'); fetchCollections(); })
      .catch(() => toast('Failed to rename', 'error'));
  });
}

async function handleRecolorCollection() {
  $contextMenu.style.display = 'none';
  requireCode(() => {
    const colors = ['#e50914','#0071eb','#46d369','#f5c518','#bf94ff','#ff6b6b','#00d4ff','#ff9f43'];
    const col = collections.find(c => c.id === activeContextColId);
    if (!col) return;
    const currentIdx = colors.indexOf(col.color);
    const nextColor = colors[(currentIdx + 1) % colors.length];
    api(`/api/collections/${activeContextColId}`, 'PUT', { color: nextColor })
      .then(() => { toast('Color changed!', 'success'); fetchCollections(); })
      .catch(() => toast('Failed to change color', 'error'));
  });
}

async function handleDeleteCollection() {
  $contextMenu.style.display = 'none';
  requireCode(() => {
    if (!confirm('Delete this collection and all its items? It will be logged in the Trash Log.')) return;
    api(`/api/collections/${activeContextColId}`, 'DELETE')
      .then(() => { toast('Collection deleted — logged to trash', 'success'); fetchCollections(); })
      .catch(() => toast('Failed to delete collection', 'error'));
  });
}

// ========================
//  TRASH LOG
// ========================
async function openTrashLog() {
  openModal($modalTrashLog);
  const $body = document.getElementById('trash-log-body');
  $body.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">Loading…</p>';

  try {
    const log = await api('/api/deleted-log');
    if (!log.length) {
      $body.innerHTML = `
        <div class="trash-empty">
          <div class="trash-empty-icon">✨</div>
          <p>No deleted items yet. Your trash log is clean!</p>
        </div>
      `;
      return;
    }

    // Show newest first
    const sorted = [...log].reverse();
    $body.innerHTML = sorted.map(entry => {
      const isCollection = entry.type === 'collection';
      const icon = isCollection ? '📁' : (entry.data.type === 'pdf' ? '📄' : entry.data.type === 'video' ? '🎬' : '🔗');
      const title = isCollection ? entry.data.name : entry.data.title;
      const badgeClass = isCollection ? 'trash-badge-collection' : 'trash-badge-item';
      const badgeText = isCollection ? 'Collection' : 'Item';
      const date = new Date(entry.deletedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const extraInfo = isCollection
        ? `${entry.data.items?.length || 0} items inside`
        : (entry.collectionName ? `from "${entry.collectionName}"` : '');

      return `
        <div class="trash-entry">
          <div class="trash-entry-icon">${icon}</div>
          <div class="trash-entry-body">
            <div class="trash-entry-title">${escapeHtml(title)}</div>
            <div class="trash-entry-meta">
              <span class="trash-entry-badge ${badgeClass}">${badgeText}</span>
              <span>${date}</span>
              ${extraInfo ? `<span>${escapeHtml(extraInfo)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    $body.innerHTML = '<p class="text-muted" style="text-align:center;padding:2rem;">Failed to load log.</p>';
  }
}

async function handleClearLog() {
  if (!confirm('Clear the entire deletion log? This cannot be undone.')) return;
  try {
    await api('/api/deleted-log', 'DELETE');
    toast('Trash log cleared', 'success');
    openTrashLog(); // Refresh the modal
  } catch {
    toast('Failed to clear log', 'error');
  }
}

// ========================
//  NAVBAR SCROLL EFFECT
// ========================
function initNavScrollEffect() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

// ========================
//  TOAST
// ========================
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  $toastBox.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  }, 2800);
}

// ========================
//  UTILS
// ========================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
