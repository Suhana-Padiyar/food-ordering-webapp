/* ═══════════════════════════════════════════════════════════
   MENU.JS — logic specific to menu.html only
   Depends on: shared.js (must load first)
   shared.js provides: CONFIG, IMAGE_MAP, escapeHtml, imgSrc,
   getMenuData, addToCart, changeQty, getItemQty,
   cart:updated event, initShared, initAnnounceBar
═══════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────
   § 1  DISH CARD QTY SYNC
───────────────────────────────────────────── */
function syncCardQty(card, id) {
  const qty     = getItemQty(id);
  const addBtn  = card.querySelector('.btn-add');
  const qtyCtrl = card.querySelector('.dish-qty-ctrl');
  const qtyNum  = card.querySelector('.dish-qty-num');

  if (qty > 0) {
    if (addBtn)  addBtn.style.display = 'none';
    qtyCtrl?.classList.add('visible');
    if (qtyNum)  qtyNum.textContent   = qty;
  } else {
    if (addBtn)  addBtn.style.display = '';
    qtyCtrl?.classList.remove('visible');
  }
}


/* ─────────────────────────────────────────────
   § 2  BUILD DISH CARD
───────────────────────────────────────────── */
function buildDishCard(item) {
  const src      = item.image
    ? (item.image.startsWith('http') ? item.image
      : imgSrc(item.name) || `${CONFIG.API_BASE}/images/${item.image}`)
    : '';
  const safeName = escapeHtml(item.name);
  const safeDesc = escapeHtml(item.description || '');
  const safeCat  = escapeHtml(item.category    || '');
  const id       = String(item._id);

  const card = document.createElement('div');
  card.className  = 'dish-card';
  card.dataset.id = id;

  card.innerHTML = `
    <div class="dish-img-wrap">
      ${src ? `<img src="${src}" alt="${safeName}" loading="lazy"/>` : ''}
      <div class="veg-badge"><div class="veg-dot"></div></div>
      <div class="cat-tag">${safeCat}</div>
    </div>
    <div class="dish-body">
      <div class="dish-name">${safeName}</div>
      <div class="dish-desc">${safeDesc}</div>
      <div class="dish-footer">
        <span class="dish-price">&#8377;${item.price}</span>
        <button class="btn-add" aria-label="Add ${safeName} to cart">+ Add</button>
        <div class="dish-qty-ctrl" role="group" aria-label="Quantity for ${safeName}">
          <button class="dish-qty-btn minus" aria-label="Remove one">−</button>
          <span class="dish-qty-num">0</span>
          <button class="dish-qty-btn plus"  aria-label="Add one">+</button>
        </div>
      </div>
    </div>`;

  /* Image error fallback */
  const img = card.querySelector('img');
  if (img) {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      img.parentElement.style.background = '#e8e0d4';
    }, { once: true });
  }

  /* Add to cart */
  card.querySelector('.btn-add').addEventListener('click', () => {
    addToCart(item);
    syncCardQty(card, id);
  });

  /* Decrease qty */
  card.querySelector('.minus').addEventListener('click', () => {
    changeQty(id, -1);
    syncCardQty(card, id);
  });

  /* Increase qty */
  card.querySelector('.plus').addEventListener('click', () => {
    changeQty(id, 1);
    syncCardQty(card, id);
  });

  /* Stay in sync when cart changes from elsewhere (e.g. cart drawer) */
  document.addEventListener('cart:updated', () => syncCardQty(card, id));

  /* Set initial state from existing cart */
  syncCardQty(card, id);

  return card;
}


/* ─────────────────────────────────────────────
   § 3  RENDER CARDS INTO GRID
───────────────────────────────────────────── */
function renderCards(items) {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="state-box"><p>No dishes found in this category.</p></div>';
    return;
  }
  items.forEach(item => grid.appendChild(buildDishCard(item)));
}


/* ─────────────────────────────────────────────
   § 4  LOAD MENU FROM API
───────────────────────────────────────────── */
let allItems = [];

async function loadMenu() {
  const grid = document.getElementById('menuGrid');
  try {
    allItems = await getMenuData();   /* shared.js — cached single fetch */

    /* Handle ?search= param from homepage hero search */
    const urlParam = new URLSearchParams(window.location.search).get('search');
    if (urlParam) {
      const q        = urlParam.toLowerCase();
      const filtered = allItems.filter(i =>
        i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
      );
      const input = document.getElementById('heroSearchInput');
      if (input) input.value = urlParam;
      renderCards(filtered.length ? filtered : allItems);
    } else {
      renderCards(allItems);
    }
  } catch {
    grid.innerHTML = '<div class="state-box"><p>⚠️ Could not load menu. Make sure your backend is running.</p></div>';
  }
}


/* ─────────────────────────────────────────────
   § 5  CATEGORY FILTER
───────────────────────────────────────────── */
function initCategoryFilter() {
  document.getElementById('categoriesRow')?.addEventListener('click', e => {
    const item = e.target.closest('.cat-item');
    if (!item) return;
    document.querySelectorAll('.cat-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    const cat = item.dataset.cat;
    renderCards(
      cat === 'All'
        ? allItems
        : allItems.filter(i => (i.category || '').trim().toLowerCase() === cat.trim().toLowerCase())
    );
  });
}


/* ─────────────────────────────────────────────
   § 6  HERO SEARCH
───────────────────────────────────────────── */
function initMenuSearch() {
  const input = document.getElementById('heroSearchInput');
  const btn   = document.getElementById('heroSearchBtn');
  const box   = document.getElementById('searchResults');
  const wrap  = document.getElementById('heroSearch');
  if (!input) return;

  /* Live dropdown */
  input.addEventListener('input', function () {
    renderSearchDropdown(this.value.trim().toLowerCase());
  });

  /* Enter key — filter grid */
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      box?.classList.remove('open');
      const q = input.value.trim().toLowerCase();
      if (q) renderCards(allItems.filter(i =>
        i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
      ));
    }
  });

  /* Search button — filter grid */
  btn?.addEventListener('click', () => {
    box?.classList.remove('open');
    const q = input.value.trim().toLowerCase();
    if (q) renderCards(allItems.filter(i =>
      i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
    ));
  });

  /* Close dropdown on outside click */
  document.addEventListener('click', e => {
    if (!wrap?.contains(e.target)) box?.classList.remove('open');
  });
}

function positionSearchBox() {
  const wrap = document.getElementById('heroSearch');
  const box  = document.getElementById('searchResults');
  if (!wrap || !box) return;
  const rect = wrap.getBoundingClientRect();
  box.style.top   = (rect.bottom + 8) + 'px';
  box.style.left  = rect.left + 'px';
  box.style.width = rect.width + 'px';
}

function renderSearchDropdown(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  box.innerHTML = '';
  if (!q) { box.classList.remove('open'); return; }
  positionSearchBox();

  const matches = allItems.filter(i =>
    i.name.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q)
  ).slice(0, 6);

  if (!matches.length) {
    box.innerHTML = `<div class="search-no-results">No dishes found for "<b>${escapeHtml(q)}</b>"</div>`;
    box.classList.add('open');
    return;
  }

  matches.forEach(item => {
    const src      = item.image
      ? (item.image.startsWith('http') ? item.image
        : imgSrc(item.name) || `${CONFIG.API_BASE}/images/${item.image}`)
      : '';
    const safeName = escapeHtml(item.name);
    const div      = document.createElement('div');
    div.className  = 'search-result-item';
    div.innerHTML  = `
      ${src ? `<img class="search-result-img" src="${src}" alt="${safeName}" loading="lazy"/>` : '<div class="search-result-img"></div>'}
      <div class="search-result-info">
        <div class="search-result-name">${safeName}</div>
        <div class="search-result-cat">${escapeHtml(item.category || '')}</div>
      </div>
      <div class="search-result-price">&#8377;${item.price}</div>`;
    const img = div.querySelector('img.search-result-img');
    if (img) img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    div.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      addToCart(item);
      box.classList.remove('open');
    });
    box.appendChild(div);
  });
  box.classList.add('open');
}


/* ─────────────────────────────────────────────
   § 7  CATEGORY DRAG SCROLL (desktop)
───────────────────────────────────────────── */
function initCategoryDragScroll() {
  const wrap = document.querySelector('.categories-scroll-wrap');
  if (!wrap) return;
  let isDown = false, startX, scrollLeft;
  wrap.addEventListener('mousedown', e => {
    isDown     = true;
    startX     = e.pageX - wrap.offsetLeft;
    scrollLeft = wrap.scrollLeft;
    wrap.style.userSelect = 'none';
  });
  wrap.addEventListener('mouseleave', ()  => { isDown = false; });
  wrap.addEventListener('mouseup',    ()  => { isDown = false; wrap.style.userSelect = ''; });
  wrap.addEventListener('mousemove',  e  => {
    if (!isDown) return;
    e.preventDefault();
    wrap.scrollLeft = scrollLeft - (e.pageX - wrap.offsetLeft - startX) * 1.4;
  });
}


/* ─────────────────────────────────────────────
   § 8  INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initShared();             /* shared.js — nav, cart, hamburger, location, auth */
  initAnnounceBar();        /* shared.js — uses CONFIG.ANNOUNCE_KEY */
  loadMenu();               /* fetch + render, handles ?search= param */
  initCategoryFilter();
  initMenuSearch();
  initCategoryDragScroll();
});