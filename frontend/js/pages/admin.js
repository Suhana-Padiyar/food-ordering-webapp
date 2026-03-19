/* ═══════════════════════════════════════════════════════════
   ADMIN.JS — शहर Garden Cafe & Kitchen Admin Panel
═══════════════════════════════════════════════════════════ */

const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? 'http://127.0.0.1:8000'
  : 'https://your-production-api.com'; /* ← replace before deploying */

/* ══════════════════════════════════════════════
   STATE
══════════════════════════════════════════════ */
let token           = localStorage.getItem('sg_token');
let allOrders       = [];
let currentFilter   = 'all';
let confirmCallback = null;
let autoRefreshTimer = null;
let pendingImageData = null;   /* for dish modal */
let galleryImageData = null;   /* for gallery post modal */
let currentGalleryTab = 'official';
let insightsRange   = 'week';
let revenueChart    = null;
let ordersChart     = null;

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
(async function init() {
  if (!token) { window.location.href = 'login.html'; return; }

  try {
    const res  = await fetch(`${API}/api/me`, { headers: authHeaders() });
    const user = await res.json();
    if (!res.ok || user.role !== 'admin') {
      alert('Access denied. Admin only.');
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('adminName').textContent = '👤 ' + (user.name || 'Admin');
  } catch {
    alert('Could not connect to backend.');
    return;
  }

  loadOrders();
  startAutoRefresh();
})();

/* ══════════════════════════════════════════════
   AUTH HELPERS
══════════════════════════════════════════════ */
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

function logout() {
  ['sg_token','sg_user_id','sg_user_email','sg_user_name','sg_user_role','sg_user_phone']
    .forEach(k => localStorage.removeItem(k));
  window.location.href = 'login.html';
}

/* ══════════════════════════════════════════════
   PANEL NAVIGATION
══════════════════════════════════════════════ */
const PANEL_TITLES = {
  orders:   'Orders',
  menu:     'Menu Management',
  coupons:  'Coupons',
  gallery:  'Gallery',
  insights: 'Insights',
  settings: 'Settings',
};

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('.nav-item[data-panel]').forEach(n => {
    if (n.dataset.panel === name) n.classList.add('active');
  });
  document.getElementById('topbarTitle').textContent = PANEL_TITLES[name] || name;
  closeSidebar();

  /* Start auto-refresh only on orders; stop it everywhere else */
  if (name === 'orders') startAutoRefresh();
  else stopAutoRefresh();

  if (name === 'menu')     { loadMenuItems(); loadCategories(); }
  if (name === 'coupons')  loadCoupons();
  if (name === 'settings') loadSettings();
  if (name === 'gallery')  loadGallery(currentGalleryTab);
  if (name === 'insights') loadInsights(insightsRange);
}

/* Mobile sidebar */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ══════════════════════════════════════════════
   AUTO REFRESH — only active on orders panel
══════════════════════════════════════════════ */
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => loadOrders(true), 30000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

function updateRefreshTime() {
  const time = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  const el = document.getElementById('lastRefresh');
  if (el) el.textContent = `Updated ${time}`;
}

/* ══════════════════════════════════════════════
   ORDERS
══════════════════════════════════════════════ */
async function loadOrders(silent = false) {
  if (!silent) {
    document.getElementById('ordersTableBody').innerHTML =
      `<tr><td colspan="7" class="loading-box"><div class="spinner"></div></td></tr>`;
  }
  try {
    const res = await fetch(`${API}/api/orders`, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    allOrders = await res.json();
    filterOrders(currentFilter, null, true);
    updatePendingBadge();
    updateRefreshTime();
  } catch {
    document.getElementById('ordersTableBody').innerHTML =
      `<tr><td colspan="7" class="empty-row">⚠️ Could not load orders.</td></tr>`;
  }
}

function updatePendingBadge() {
  const pending = allOrders.filter(o => o.status === 'pending').length;
  const badge   = document.getElementById('pendingBadge');
  if (badge) { badge.textContent = pending; badge.classList.toggle('show', pending > 0); }
}

function filterOrders(status, btn, silent = false) {
  currentFilter = status;
  /* Scope selector to orders panel only so insights range buttons are not affected */
  const ordersPanel = document.getElementById('panel-orders');
  if (!silent) {
    ordersPanel?.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  } else {
    ordersPanel?.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === currentFilter);
    });
  }
  const filtered = status === 'all' ? allOrders : allOrders.filter(o => o.status === status);
  renderOrders(filtered);
}

function renderOrders(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No orders found.</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const shortId  = o._id.slice(-8).toUpperCase();
    const itemList = (o.items || []).slice(0,2).map(i => `${i.name} ×${i.qty||i.quantity||1}`).join(', ');
    const more     = (o.items||[]).length > 2 ? ` +${o.items.length-2} more` : '';
    const date     = new Date(o.created_at).toLocaleDateString('en-IN',
      { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    const statusClass = {
      pending:'badge-pending', confirmed:'badge-confirmed', preparing:'badge-preparing',
      out_for_delivery:'badge-out', delivered:'badge-delivered', cancelled:'badge-cancelled',
    }[o.status] || 'badge-pending';

    return `<tr>
      <td><code style="font-size:0.76rem;color:var(--green);font-weight:700">#${escapeHtml(shortId)}</code></td>
      <td>
        <div style="font-weight:600;font-size:0.84rem">${escapeHtml(o.customer_name||'')}</div>
        <div style="font-size:0.72rem;color:var(--text-mid)">${escapeHtml(o.customer_phone||'')}</div>
      </td>
      <td style="max-width:160px">
        <div style="font-size:0.78rem">${escapeHtml(itemList)}${more}</div>
      </td>
      <td style="font-weight:700;color:var(--gold)">₹${(o.total||0).toFixed(0)}</td>
      <td>
        <select class="status-select" onchange="updateStatus('${o._id}', this.value)">
          ${['pending','confirmed','preparing','out_for_delivery','delivered','cancelled'].map(s =>
            `<option value="${s}" ${o.status===s?'selected':''}>${formatStatus(s)}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        ${o.payment_status === 'paid'
          ? '<span class="badge badge-paid">✅ Paid</span>'
          : o.status === 'cancelled'
            ? '<span style="font-size:0.72rem;color:var(--text-mid)">—</span>'
            : `<button class="btn-primary btn-sm" onclick="markPaid('${o._id}')">Mark Paid</button>`}
      </td>
      <td style="font-size:0.75rem;color:var(--text-mid);white-space:nowrap">${date}</td>
      <td>
        <button class="btn-primary btn-sm btn-danger" onclick="confirmArchiveOrder('${o._id}')">Archive</button>
      </td>
    </tr>`;
  }).join('');
}

async function updateStatus(orderId, status) {
  try {
    const res = await fetch(`${API}/api/orders/${orderId}/status`, {
      method:'PUT', headers:authHeaders(), body:JSON.stringify({ status })
    });
    if (!res.ok) throw new Error();
    const order = allOrders.find(o => o._id === orderId);
    if (order) order.status = status;
    updatePendingBadge();
    showToast('Status updated', 'success');
  } catch {
    showToast('Failed to update status', 'error');
    loadOrders(true);
  }
}

async function markPaid(orderId) {
  try {
    const res = await fetch(`${API}/api/orders/${orderId}/payment`, {
      method:'PUT', headers:authHeaders(),
      body:JSON.stringify({ payment_status:'paid', payment_method:'manual' })
    });
    if (!res.ok) throw new Error();
    const order = allOrders.find(o => o._id === orderId);
    if (order) order.payment_status = 'paid';
    filterOrders(currentFilter, null, true);
    showToast('Marked as paid', 'success');
  } catch {
    showToast('Failed to update payment', 'error');
  }
}

function confirmArchiveOrder(id) {
  showConfirm('🗃️', 'Archive this order?',
    'It will be hidden from the orders list but kept in the database.',
    () => archiveOrder(id));
}

async function archiveOrder(id) {
  try {
    const res = await fetch(`${API}/api/orders/${id}/archive`, {
      method:'PUT', headers:authHeaders()
    });
    if (!res.ok) throw new Error();
    allOrders = allOrders.filter(o => o._id !== id);
    filterOrders(currentFilter, null, true);
    updatePendingBadge();
    showToast('Order archived', 'success');
  } catch {
    showToast('Failed to archive order', 'error');
  }
}

/* ══════════════════════════════════════════════
   MENU ITEMS
══════════════════════════════════════════════ */
let allMenuItems  = [];
let allCategories = [];
let currentMenuCat = 'all';

async function loadCategories() {
  try {
    const res  = await fetch(`${API}/api/menu/categories`, { headers: authHeaders() });
    allCategories = await res.json();
    renderCategoryChips();
    populateCategoryDropdown();
  } catch { /* silent */ }
}

function renderCategoryChips() {
  const bar = document.getElementById('catChipsBar');
  if (!bar) return;
  const allChip = `<div class="cat-chip ${currentMenuCat==='all'?'active':''}" onclick="filterMenuByCat('all',this)">All</div>`;
  const chips = allCategories.map(c => {
    const imgSrc = c.image
      ? (c.image.startsWith('data:')||c.image.startsWith('http') ? c.image : `${API}/images/${c.image}`)
      : '';
    return `<div class="cat-chip ${currentMenuCat===c.name?'active':''}" onclick="filterMenuByCat('${escapeHtml(c.name)}',this)">
      ${imgSrc ? `<img class="cat-chip-img" src="${imgSrc}" onerror="this.style.display='none'"/>` : ''}
      ${escapeHtml(c.name)}
    </div>`;
  }).join('');
  bar.innerHTML = allChip + chips;
}

function populateCategoryDropdown() {
  const sel = document.getElementById('dish_category');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select category</option>' +
    allCategories.map(c => `<option value="${escapeHtml(c.name)}" ${c.name===current?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
}

function filterMenuByCat(cat, btn) {
  currentMenuCat = cat;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const filtered = cat === 'all' ? allMenuItems : allMenuItems.filter(i => i.category === cat);
  renderMenuList(filtered);
}

async function loadMenuItems() {
  document.getElementById('menuAdminGrid').innerHTML =
    '<div class="loading-box"><div class="spinner"></div></div>';
  try {
    const res   = await fetch(`${API}/api/menu?all=true`, { headers: authHeaders() });
    allMenuItems = await res.json();
    filterMenuByCat(currentMenuCat, null);
  } catch {
    document.getElementById('menuAdminGrid').innerHTML =
      '<div class="loading-box">⚠️ Could not load menu items.</div>';
  }
}

function renderMenuList(items) {
  const grid = document.getElementById('menuAdminGrid');
  if (!items.length) {
    grid.innerHTML = '<div class="loading-box">No dishes in this category.</div>';
    return;
  }
  grid.innerHTML = '<div class="menu-admin-list">' + items.map(item => {
    const src = item.image
      ? (item.image.startsWith('data:')||item.image.startsWith('http') ? item.image : `${API}/images/${item.image}`)
      : '';
    const imgHtml = src
      ? `<img class="mal-img" src="${src}" alt="${escapeHtml(item.name)}"
           onerror="this.parentNode.innerHTML='<div class=\\'mal-img-placeholder\\'><img src=\\'\\'></div>'"/>`
      : `<div class="mal-img-placeholder">🍽️</div>`;
    return `
    <div class="menu-list-row ${item.available===false?'unavailable':''}" id="card-${item._id}">
      ${imgHtml}
      <div class="mal-info">
        <div class="mal-top">
          <span class="mal-name">${escapeHtml(item.name)}</span>
          <span class="mal-cat">${escapeHtml(item.category||'')}</span>
          <span class="badge ${item.available!==false?'badge-available':'badge-unavailable'}">
            ${item.available!==false?'✅ Visible':'❌ Hidden'}
          </span>
        </div>
        <div class="mal-desc">${escapeHtml(item.description||'—')}</div>
      </div>
      <span class="mal-price">₹${item.price}</span>
      <div class="mal-actions">
        <button class="btn-primary btn-sm ${item.available!==false?'btn-warning':''}"
          style="${item.available!==false?'':'background:var(--success)'}"
          onclick="toggleDish('${item._id}', ${item.available!==false})">
          ${item.available!==false?'Hide':'Show'}
        </button>
        <button class="btn-primary btn-sm"
          onclick='openEditDishModal(${JSON.stringify(item).replace(/'/g,"&#39;")})'>Edit</button>
        <button class="btn-primary btn-sm btn-danger"
          onclick="confirmDeleteDish('${item._id}','${escapeHtml(item.name)}')">Del</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}

async function toggleDish(id, currentlyAvailable) {
  try {
    const res = await fetch(`${API}/api/menu/${id}/toggle`, { method:'PUT', headers:authHeaders() });
    if (!res.ok) throw new Error();
    showToast(currentlyAvailable ? 'Dish hidden from menu' : 'Dish now visible', 'success');
    loadMenuItems();
  } catch { showToast('Failed to toggle dish', 'error'); }
}

function confirmDeleteDish(id, name) {
  showConfirm('🗑️', `Delete "${name}"?`,
    'This will permanently remove this dish from your menu.',
    () => deleteDish(id));
}

async function deleteDish(id) {
  try {
    const res = await fetch(`${API}/api/menu/${id}`, { method:'DELETE', headers:authHeaders() });
    if (!res.ok) throw new Error();
    showToast('Dish deleted', 'success');
    loadMenuItems();
  } catch { showToast('Failed to delete dish', 'error'); }
}

/* ── Dish Modal ── */
function openAddDishModal() {
  pendingImageData = null;
  document.getElementById('dish_id').value          = '';
  document.getElementById('dish_name').value        = '';
  document.getElementById('dish_price').value       = '';
  document.getElementById('dish_description').value = '';
  document.getElementById('dish_available').value   = 'true';
  document.getElementById('dish_image').value       = '';
  document.getElementById('dish_image_file').value  = '';
  populateCategoryDropdown();
  setImagePreview('');
  document.getElementById('dishModalTitle').textContent  = 'Add New Dish';
  document.getElementById('dishSaveBtnText').textContent = 'Add Dish';
  document.getElementById('dishModal').classList.add('open');
}

function openEditDishModal(item) {
  pendingImageData = null;
  document.getElementById('dish_id').value          = item._id;
  document.getElementById('dish_name').value        = item.name;
  document.getElementById('dish_price').value       = item.price;
  document.getElementById('dish_description').value = item.description || '';
  document.getElementById('dish_available').value   = item.available !== false ? 'true' : 'false';
  document.getElementById('dish_image').value       = item.image || '';
  document.getElementById('dish_image_file').value  = '';
  populateCategoryDropdown();
  document.getElementById('dish_category').value = item.category || '';
  const src = item.image
    ? (item.image.startsWith('data:')||item.image.startsWith('http') ? item.image : `${API}/images/${item.image}`)
    : '';
  setImagePreview(src);
  document.getElementById('dishModalTitle').textContent  = 'Edit Dish';
  document.getElementById('dishSaveBtnText').textContent = 'Save Changes';
  document.getElementById('dishModal').classList.add('open');
}

function closeDishModal() {
  document.getElementById('dishModal').classList.remove('open');
}

async function saveDish() {
  const id          = document.getElementById('dish_id').value;
  const name        = document.getElementById('dish_name').value.trim();
  const category    = document.getElementById('dish_category').value;
  const price       = document.getElementById('dish_price').value;
  const description = document.getElementById('dish_description').value.trim();
  const available   = document.getElementById('dish_available').value === 'true';

  if (!name || !category || !price) {
    showToast('Name, category and price are required', 'error'); return;
  }

  const imageFilename = document.getElementById('dish_image').value.trim();
  const imageValue    = pendingImageData || imageFilename;
  const payload       = { name, category, price: parseFloat(price), description, available, image: imageValue };

  try {
    const url    = id ? `${API}/api/menu/${id}` : `${API}/api/menu`;
    const method = id ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    const data   = await res.json();
    if (!res.ok) { showToast(data.detail || 'Error saving dish', 'error'); return; }
    showToast(id ? 'Dish updated!' : 'Dish added!', 'success');
    closeDishModal();
    await loadMenuItems();
    await loadCategories();
  } catch { showToast('Connection error', 'error'); }
}

/* ── Dish image handling ── */
function handleImageFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    pendingImageData = e.target.result;
    const preview = document.getElementById('dish_image_preview');
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src   = pendingImageData;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    preview.appendChild(img);
    document.getElementById('dish_image').value = file.name;
  };
  reader.readAsDataURL(file);
}

function setImagePreview(src) {
  const preview = document.getElementById('dish_image_preview');
  if (src) {
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src   = src;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    img.onerror = () => {
      preview.innerHTML = '<span style="font-size:0.82rem;color:var(--text-mid)">📷 Click to upload image</span>';
    };
    preview.appendChild(img);
  } else {
    preview.innerHTML = '<span style="font-size:0.82rem;color:var(--text-mid)">📷 Click to upload image</span>';
  }
}

/* ── Add Category Modal ── */
function openAddCategoryModal() {
  document.getElementById('newCatName').value = '';
  document.getElementById('categoryModal').classList.add('open');
}
function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('open');
}

async function saveCategory() {
  const name = document.getElementById('newCatName').value.trim();
  if (!name) { showToast('Category name is required', 'error'); return; }
  try {
    const res  = await fetch(`${API}/api/menu/categories`, {
      method:'POST', headers: authHeaders(), body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.detail || 'Error adding category', 'error'); return; }
    showToast(`Category "${name}" added!`, 'success');
    closeCategoryModal();
    loadCategories();
  } catch { showToast('Connection error', 'error'); }
}

/* ══════════════════════════════════════════════
   COUPONS
══════════════════════════════════════════════ */
async function loadCoupons() {
  document.getElementById('couponsTableBody').innerHTML =
    '<tr><td colspan="6" class="loading-box"><div class="spinner"></div></td></tr>';
  try {
    const res     = await fetch(`${API}/api/coupons`, { headers: authHeaders() });
    const coupons = await res.json();
    renderCoupons(coupons);
  } catch {
    document.getElementById('couponsTableBody').innerHTML =
      '<tr><td colspan="6" class="empty-row">⚠️ Could not load coupons.</td></tr>';
  }
}

function renderCoupons(coupons) {
  const tbody = document.getElementById('couponsTableBody');
  if (!coupons.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No coupons yet.</td></tr>';
    return;
  }
  tbody.innerHTML = coupons.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('en-IN',
      { day:'2-digit', month:'short', year:'numeric' });
    return `<tr>
      <td><span class="coupon-code-cell">${escapeHtml(c.code)}</span></td>
      <td><strong>${c.discount_percent}% off</strong></td>
      <td>${c.first_time_only ? '✅ Yes' : '—'}</td>
      <td><span class="badge ${c.active?'badge-active':'badge-inactive'}">${c.active?'Active':'Inactive'}</span></td>
      <td style="font-size:0.78rem;color:var(--text-mid)">${date}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-primary btn-sm" style="background:${c.active?'var(--warning)':'var(--success)'}"
            onclick="toggleCoupon('${c.code}',${c.active})">
            ${c.active?'Deactivate':'Activate'}
          </button>
          <button class="btn-primary btn-sm btn-danger" onclick="confirmDeleteCoupon('${c.code}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openAddCouponModal() {
  document.getElementById('cp_code').value       = '';
  document.getElementById('cp_discount').value   = '';
  document.getElementById('cp_first_time').value = 'true';
  document.getElementById('cp_active').value     = 'true';
  document.getElementById('couponModal').classList.add('open');
}
function closeCouponModal() {
  document.getElementById('couponModal').classList.remove('open');
}

async function saveCoupon() {
  const code       = document.getElementById('cp_code').value.trim().toUpperCase();
  const discount   = document.getElementById('cp_discount').value;
  const first_time = document.getElementById('cp_first_time').value === 'true';
  const active     = document.getElementById('cp_active').value === 'true';
  if (!code || !discount) { showToast('Code and discount are required', 'error'); return; }
  try {
    const res  = await fetch(`${API}/api/coupons`, {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({ code, discount_percent: parseInt(discount), first_time_only: first_time, active })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.detail || 'Error creating coupon', 'error'); return; }
    showToast('Coupon created!', 'success');
    closeCouponModal();
    loadCoupons();
  } catch { showToast('Connection error', 'error'); }
}

async function toggleCoupon(code, currentlyActive) {
  try {
    const res = await fetch(`${API}/api/coupons/${code}`, {
      method:'PUT', headers: authHeaders(), body: JSON.stringify({ active: !currentlyActive })
    });
    if (!res.ok) throw new Error();
    showToast(currentlyActive ? 'Coupon deactivated' : 'Coupon activated', 'success');
    loadCoupons();
  } catch { showToast('Failed to update coupon', 'error'); }
}

function confirmDeleteCoupon(code) {
  showConfirm('🗑️', `Delete coupon "${code}"?`,
    'Customers will no longer be able to use this code.',
    () => deleteCoupon(code));
}

async function deleteCoupon(code) {
  try {
    const res = await fetch(`${API}/api/coupons/${code}`, { method:'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error();
    showToast('Coupon deleted', 'success');
    loadCoupons();
  } catch { showToast('Failed to delete coupon', 'error'); }
}

/* ══════════════════════════════════════════════
   GALLERY
══════════════════════════════════════════════ */
async function loadGallery(tab) {
  currentGalleryTab = tab;
  document.querySelectorAll('.gallery-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  const container = document.getElementById('galleryContent');
  container.innerHTML = '<div class="loading-box"><div class="spinner"></div></div>';

  try {
    const res   = await fetch(`${API}/api/admin/gallery`, { headers: authHeaders() });
    const posts = await res.json();

    if (tab === 'official') {
      const official = posts.filter(p => p.isOfficial);
      renderGalleryGrid(official, 'official', container);
    } else if (tab === 'community') {
      const community = posts.filter(p => !p.isOfficial && p.reportCount === 0);
      renderGalleryGrid(community, 'community', container);
    } else if (tab === 'reported') {
      const reported = posts.filter(p => !p.isOfficial && p.reportCount > 0)
        .sort((a,b) => b.reportCount - a.reportCount);
      renderReportedGrid(reported, container);
      /* Update badge */
      const badge = document.getElementById('reportedBadge');
      if (badge) { badge.textContent = reported.length; badge.style.display = reported.length ? 'inline-block' : 'none'; }
    }
  } catch {
    container.innerHTML = '<div class="loading-box">⚠️ Could not load gallery.</div>';
  }
}

function renderGalleryGrid(posts, type, container) {
  if (!posts.length) {
    container.innerHTML = `<div class="loading-box">${type==='official'?'No official posts yet. Click "+ New Post" to add one!':'No community posts yet.'}</div>`;
    return;
  }
  container.innerHTML = '<div class="gallery-grid">' + posts.map(p => {
    const initial  = (p.author||'S').charAt(0).toUpperCase();
    const imgUrl   = p.imageUrl || '';   /* do NOT escapeHtml — Cloudinary URLs must stay raw */
    return `<div class="gallery-card ${p.isOfficial?'official':''}">
      ${imgUrl
        ? `<img class="gallery-card-img" src="${imgUrl}" alt="post"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="gallery-card-img" style="display:none;align-items:center;justify-content:center;background:#f0ede6;font-size:2rem;">🖼️</div>`
        : `<div class="gallery-card-img" style="display:flex;align-items:center;justify-content:center;background:#f0ede6;font-size:2rem;">🖼️</div>`
      }
      <div class="gallery-card-body">
        <div class="gallery-card-meta">
          <div class="gallery-avatar">${escapeHtml(initial)}</div>
          <div class="gallery-author">${escapeHtml(p.author||'')}</div>
          ${p.isOfficial ? '<span class="gallery-official-badge">⭐ Official</span>' : ''}
        </div>
        ${p.caption ? `<div class="gallery-caption">${escapeHtml(p.caption)}</div>` : ''}
        <div class="gallery-card-footer">
          <span class="gallery-like-count">❤️ ${p.likeCount||0}</span>
          <div class="gallery-card-actions">
            ${p.isOfficial ? `<button class="btn-primary btn-xs btn-blue" onclick="openEditGalleryPostModal('${p._id}','${escapeHtml(p.caption||'')}','${escapeHtml(p.imageUrl||'')}',${p.hidden||false})">Edit</button>` : ''}
            <button class="btn-primary btn-xs btn-danger" onclick="confirmDeletePost('${p._id}')">Delete</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function renderReportedGrid(posts, container) {
  if (!posts.length) {
    container.innerHTML = '<div class="loading-box">🎉 No reported posts. All clear!</div>';
    return;
  }
  container.innerHTML = '<div class="gallery-grid">' + posts.map(p => {
    const initial = (p.author||'U').charAt(0).toUpperCase();
    const reasons = (p.reports||[]).map(r => r.reason).filter(Boolean);
    const reasonText = [...new Set(reasons)].join(', ') || 'not specified';
    const imgUrl   = p.imageUrl || '';
    return `<div class="gallery-card reported">
      ${imgUrl
        ? `<img class="gallery-card-img" src="${imgUrl}" alt="reported post"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="gallery-card-img" style="display:none;align-items:center;justify-content:center;background:#f0ede6;font-size:2rem;">🖼️</div>`
        : `<div class="gallery-card-img" style="display:flex;align-items:center;justify-content:center;background:#f0ede6;font-size:2rem;">🖼️</div>`
      }
      <div class="gallery-card-body">
        <div class="gallery-card-meta">
          <div class="gallery-avatar">${escapeHtml(initial)}</div>
          <div class="gallery-author">${escapeHtml(p.author||'Unknown')}</div>
          <span class="badge badge-reported">⚑ ${p.reportCount}</span>
        </div>
        ${p.caption ? `<div class="gallery-caption">${escapeHtml(p.caption)}</div>` : ''}
      </div>
      <div class="gallery-report-info">
        <p>Reasons: ${escapeHtml(reasonText)}</p>
      </div>
      <div style="padding:8px 12px;display:flex;gap:6px">
        <button class="btn-primary btn-sm btn-danger" style="flex:1"
          onclick="confirmDeletePost('${p._id}')">🗑️ Delete</button>
        <button class="btn-primary btn-sm" style="flex:1;background:var(--success)"
          onclick="ignoreReport('${p._id}')">✓ Ignore</button>
      </div>
    </div>`;
  }).join('') + '</div>';
}

function openGalleryPostModal() {
  galleryImageData = null;
  document.getElementById('gallery_caption').value = '';
  document.getElementById('gallery_image_file').value = '';
  document.getElementById('galleryDropzone').innerHTML = `
    <div class="dz-icon">🖼️</div>
    <div class="dz-text">Click to select image<br/><small>JPG, PNG, WEBP, GIF · max 10MB</small></div>`;
  document.getElementById('galleryPostModal').classList.add('open');
}
function closeGalleryPostModal() {
  document.getElementById('galleryPostModal').classList.remove('open');
}

/* ── Edit Gallery Post ── */
let editGalleryImageData = null;

function openEditGalleryPostModal(id, caption, imageUrl, hidden) {
  editGalleryImageData = null;
  document.getElementById('edit_post_id').value          = id;
  document.getElementById('edit_gallery_caption').value  = caption;
  document.getElementById('edit_gallery_visible').value  = hidden ? 'false' : 'true';
  document.getElementById('edit_gallery_image_file').value = '';

  /* Reset dropzone */
  document.getElementById('editGalleryDropzone').innerHTML = `
    <div class="dz-icon" style="font-size:1.4rem">🖼️</div>
    <div class="dz-text">Click to select new image<br/><small>JPG, PNG, WEBP, GIF · max 10MB</small></div>`;

  /* Show current image */
  const preview = document.getElementById('editGalleryCurrentImg');
  if (imageUrl) {
    preview.innerHTML = `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'"/>`;
  } else {
    preview.innerHTML = '<span style="font-size:0.82rem;color:var(--text-mid)">No image</span>';
  }

  document.getElementById('editGalleryPostModal').classList.add('open');
}

function closeEditGalleryPostModal() {
  document.getElementById('editGalleryPostModal').classList.remove('open');
}

function handleEditGalleryImageFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    editGalleryImageData = e.target.result;
    const dz = document.getElementById('editGalleryDropzone');
    dz.innerHTML = '';
    const img = document.createElement('img');
    img.src = editGalleryImageData;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    dz.appendChild(img);
  };
  reader.readAsDataURL(file);
}

async function saveEditGalleryPost() {
  const id      = document.getElementById('edit_post_id').value;
  const caption = document.getElementById('edit_gallery_caption').value.trim();
  const hidden  = document.getElementById('edit_gallery_visible').value === 'false';
  const fileInput = document.getElementById('edit_gallery_image_file');

  const btn = document.getElementById('editGalleryPostSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const formData = new FormData();
    formData.append('caption', caption);
    formData.append('hidden', hidden);
    if (fileInput.files[0]) formData.append('image', fileInput.files[0]);

    const res = await fetch(`${API}/api/admin/gallery/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.detail || 'Update failed', 'error'); return; }
    showToast('Post updated!', 'success');
    closeEditGalleryPostModal();
    loadGallery('official');
  } catch { showToast('Connection error', 'error'); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

function handleGalleryImageFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    galleryImageData = e.target.result;
    const dz = document.getElementById('galleryDropzone');
    dz.innerHTML = '';
    const img = document.createElement('img');
    img.src = galleryImageData;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;';
    dz.appendChild(img);
  };
  reader.readAsDataURL(file);
}

async function saveGalleryPost() {
  const fileInput = document.getElementById('gallery_image_file');
  const caption   = document.getElementById('gallery_caption').value.trim();
  if (!fileInput.files[0]) { showToast('Please select an image', 'error'); return; }

  const btn = document.getElementById('galleryPostSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  try {
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    formData.append('caption', caption);

    const res = await fetch(`${API}/api/admin/gallery`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.detail || 'Upload failed', 'error'); return; }
    showToast('Post published! 🎉', 'success');
    closeGalleryPostModal();
    loadGallery('official');
  } catch { showToast('Connection error', 'error'); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Publish Post';
  }
}

function confirmDeletePost(id) {
  showConfirm('🗑️', 'Delete this post?',
    'The image will be permanently removed from gallery and Cloudinary.',
    () => deletePost(id));
}

async function deletePost(id) {
  try {
    const res = await fetch(`${API}/api/gallery/${id}`, { method:'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error();
    showToast('Post deleted', 'success');
    loadGallery(currentGalleryTab);
  } catch { showToast('Failed to delete post', 'error'); }
}

async function ignoreReport(id) {
  try {
    const res = await fetch(`${API}/api/admin/gallery/${id}/ignore-report`, {
      method:'PUT', headers: authHeaders()
    });
    if (!res.ok) throw new Error();
    showToast('Reports cleared', 'success');
    loadGallery('reported');
  } catch { showToast('Failed to clear reports', 'error'); }
}

/* ══════════════════════════════════════════════
   INSIGHTS
══════════════════════════════════════════════ */
async function loadInsights(range) {
  insightsRange = range;
  document.querySelectorAll('.range-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.range === range);
  });

  const container = document.getElementById('insightsContent');
  container.innerHTML = '<div class="loading-box"><div class="spinner"></div></div>';

  try {
    const res  = await fetch(`${API}/api/insights?range=${range}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
    renderInsights(data);
  } catch (e) {
    container.innerHTML = `<div class="loading-box">⚠️ Could not load insights: ${e.message}</div>`;
  }
}

function renderInsights(d) {
  const container = document.getElementById('insightsContent');

  const rangeLabels = { today:'Today', week:'Last 7 Days', month:'Last 30 Days', year:'Last Year', lifetime:'All Time' };
  const rangeLabel  = rangeLabels[d.range] || d.range;

  container.innerHTML = `
    <!-- Stat cards -->
    <div class="stats-row" id="insightsStats">
      <div class="stat-card">
        <div class="stat-num" id="ins-orders">${d.total_orders}</div>
        <div class="stat-label">Total Orders</div>
        <div class="stat-sub">${rangeLabel}</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-num" id="ins-revenue">₹${(d.total_revenue||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
        <div class="stat-label">Revenue</div>
        <div class="stat-sub">Paid orders only</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-num" id="ins-avg">₹${(d.avg_order_value||0).toFixed(0)}</div>
        <div class="stat-label">Avg Order Value</div>
        <div class="stat-sub">${rangeLabel}</div>
      </div>
      <div class="stat-card purple">
        <div class="stat-num" id="ins-rate">${d.delivery_rate}%</div>
        <div class="stat-label">Delivery Rate</div>
        <div class="stat-sub">Orders delivered</div>
      </div>
    </div>

    <!-- Charts -->
    <div class="charts-row">
      <div class="chart-card">
        <h3>📈 Revenue Over Time</h3>
        <canvas id="revenueChart"></canvas>
      </div>
      <div class="chart-card">
        <h3>📦 Orders Over Time</h3>
        <canvas id="ordersChart"></canvas>
      </div>
    </div>

    <!-- Breakdown -->
    <div class="breakdown-row">
      <div class="breakdown-card">
        <h3>Order Status Breakdown</h3>
        <div class="breakdown-item"><span class="breakdown-label">⏳ Pending</span><span class="breakdown-val">${d.pending}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">🔄 Active</span><span class="breakdown-val">${d.active}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">✅ Delivered</span><span class="breakdown-val">${d.delivered}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">❌ Cancelled</span><span class="breakdown-val">${d.cancelled}</span></div>
      </div>
      <div class="breakdown-card">
        <h3>Revenue Summary</h3>
        <div class="breakdown-item"><span class="breakdown-label">Total Orders</span><span class="breakdown-val">${d.total_orders}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">Total Revenue</span><span class="breakdown-val">₹${(d.total_revenue||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">Avg Order Value</span><span class="breakdown-val">₹${(d.avg_order_value||0).toFixed(0)}</span></div>
        <div class="breakdown-item"><span class="breakdown-label">Delivery Rate</span><span class="breakdown-val">${d.delivery_rate}%</span></div>
      </div>
    </div>`;

  /* Draw charts after DOM is ready */
  requestAnimationFrame(() => drawCharts(d.timeline || []));
}

function drawCharts(timeline) {
  /* Destroy old instances if they exist */
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  if (ordersChart)  { ordersChart.destroy();  ordersChart  = null; }

  /* Smart label thinning for long timelines */
  const maxLabels = 14;
  const step = Math.ceil(timeline.length / maxLabels);
  const labels  = timeline.map((d,i) => (i % step === 0 || i === timeline.length-1) ? d.date.slice(5) : '');
  const revenue = timeline.map(d => d.revenue);
  const orders  = timeline.map(d => d.orders);

  const commonOpts = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: { legend:{ display:false }, tooltip:{ mode:'index', intersect:false } },
    scales: {
      x: { grid:{ display:false }, ticks:{ maxRotation:0, font:{ size:10 } } },
      y: { grid:{ color:'#f0ede6' }, ticks:{ font:{ size:10 } }, beginAtZero:true }
    },
  };

  const rCtx = document.getElementById('revenueChart')?.getContext('2d');
  if (rCtx) {
    revenueChart = new Chart(rCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: revenue,
          borderColor: '#e8a020',
          backgroundColor: 'rgba(232,160,32,0.08)',
          borderWidth: 2.5,
          pointRadius: timeline.length > 30 ? 0 : 3,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        ...commonOpts,
        scales: {
          ...commonOpts.scales,
          y: { ...commonOpts.scales.y, ticks: { ...commonOpts.scales.y.ticks, callback: v => '₹'+v } }
        }
      }
    });
  }

  const oCtx = document.getElementById('ordersChart')?.getContext('2d');
  if (oCtx) {
    ordersChart = new Chart(oCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: orders,
          backgroundColor: 'rgba(45,90,39,0.75)',
          hoverBackgroundColor: '#2d5a27',
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: commonOpts,
    });
  }
}

/* ══════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════ */
async function loadSettings() {
  try {
    const res  = await fetch(`${API}/api/settings`);
    const data = await res.json();
    document.getElementById('set_delivery_charge').value = data.delivery_charge || 30;
    document.getElementById('set_free_above').value      = data.free_delivery_above || 500;
    document.getElementById('set_min_order').value       = data.min_order_value || 250;
    document.getElementById('set_delivery_time').value   = data.estimated_delivery_time || '30–45 minutes';
  } catch { showToast('Could not load settings', 'error'); }
}

async function saveDeliverySettings() {
  const payload = {
    delivery_charge:     parseFloat(document.getElementById('set_delivery_charge').value),
    free_delivery_above: parseFloat(document.getElementById('set_free_above').value),
    min_order_value:     parseFloat(document.getElementById('set_min_order').value),
  };
  if (Object.values(payload).some(v => isNaN(v))) { showToast('Please enter valid numbers', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/settings`, { method:'PUT', headers:authHeaders(), body:JSON.stringify(payload) });
    if (!res.ok) throw new Error();
    showToast('Delivery settings saved!', 'success');
  } catch { showToast('Failed to save settings', 'error'); }
}

async function saveDeliveryTime() {
  const time = document.getElementById('set_delivery_time').value.trim();
  if (!time) { showToast('Please enter a delivery time', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/settings`, {
      method:'PUT', headers:authHeaders(), body:JSON.stringify({ estimated_delivery_time: time })
    });
    if (!res.ok) throw new Error();
    showToast('Delivery time saved!', 'success');
  } catch { showToast('Failed to save delivery time', 'error'); }
}

/* ══════════════════════════════════════════════
   CONFIRM DIALOG
══════════════════════════════════════════════ */
function showConfirm(icon, title, msg, callback) {
  document.getElementById('confirmIcon').textContent  = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent   = msg;
  confirmCallback = callback;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() {
  confirmCallback = null;
  document.getElementById('confirmOverlay').classList.remove('open');
}
function confirmOk() {
  if (confirmCallback) confirmCallback();
  closeConfirm();
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function formatStatus(s) {
  const map = {
    pending:'Pending', confirmed:'Confirmed', preparing:'Preparing',
    out_for_delivery:'Out for Delivery', delivered:'Delivered', cancelled:'Cancelled'
  };
  return map[s] || s;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => { t.className = `toast ${type}`; }, 3000);
}

/* ══════════════════════════════════════════════
   CLOSE MODALS ON OVERLAY CLICK
══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dishModal')?.addEventListener('click',
    e => { if (e.target === document.getElementById('dishModal')) closeDishModal(); });
  document.getElementById('couponModal')?.addEventListener('click',
    e => { if (e.target === document.getElementById('couponModal')) closeCouponModal(); });
  document.getElementById('categoryModal')?.addEventListener('click',
    e => { if (e.target === document.getElementById('categoryModal')) closeCategoryModal(); });
  document.getElementById('galleryPostModal')?.addEventListener('click',
    e => { if (e.target === document.getElementById('galleryPostModal')) closeGalleryPostModal(); });
  document.getElementById('editGalleryPostModal')?.addEventListener('click',
    e => { if (e.target === document.getElementById('editGalleryPostModal')) closeEditGalleryPostModal(); });
  document.getElementById('confirmOverlay')?.addEventListener('click',
    e => { if (e.target === document.getElementById('confirmOverlay')) closeConfirm(); });
});