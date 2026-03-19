/* ═══════════════════════════════════════════════════════════
   INDEX.JS — logic specific to index.html only
   Depends on: shared.js (must load first)
═══════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────
   § 1  FEATURED DISHES CONFIG
   Update this list when the menu changes.
───────────────────────────────────────────── */
const FEATURED_NAMES = [
  'Margherita Pizza',
  'Pink Sauce Pasta',
  'Paneer Tikka Sandwich',
  'Chocolate Milkshake',
  'Veg Manchurian',
  'Schezwan Noodles',
];


/* ─────────────────────────────────────────────
   § 2  DISH CARD — qty sync helper
───────────────────────────────────────────── */

/**
 * Sync a dish card's Add button / qty controls
 * to match the current cart state.
 */
function syncCardQty(card, id) {
  const qty     = getItemQty(id);          /* shared.js */
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
   § 3  BUILD DISH CARD DOM ELEMENT
───────────────────────────────────────────── */
function buildDishCard(item) {
  const src      = imgSrc(item.name);          /* shared.js */
  const safeName = escapeHtml(item.name);      /* shared.js */
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
          <button class="dish-qty-btn plus" aria-label="Add one">+</button>
        </div>
      </div>
    </div>`;

  /* Image error fallback */
  const img = card.querySelector('img');
  if (img) {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      img.parentElement.style.background = '#e8e0d4';
    }, { once:true });
  }

  /* Add to cart */
  card.querySelector('.btn-add').addEventListener('click', () => {
    addToCart(item);           /* shared.js — opens cart drawer too */
    syncCardQty(card, id);
  });

  /* Qty: decrease */
  card.querySelector('.minus').addEventListener('click', () => {
    changeQty(id, -1);         /* shared.js */
    syncCardQty(card, id);
  });

  /* Qty: increase */
  card.querySelector('.plus').addEventListener('click', () => {
    changeQty(id, 1);          /* shared.js */
    syncCardQty(card, id);
  });

  /* Keep in sync if cart changes elsewhere (e.g. remove from cart drawer) */
  document.addEventListener('cart:updated', () => syncCardQty(card, id));

  /* Set initial state from existing cart */
  syncCardQty(card, id);

  return card;
}


/* ─────────────────────────────────────────────
   § 4  LOAD FEATURED DISHES
───────────────────────────────────────────── */
async function loadFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  try {
    const all      = await getMenuData();    /* shared.js — cached single fetch */
    const featured = FEATURED_NAMES
      .map(n => all.find(i => i.name === n))
      .filter(Boolean);
    if (!featured.length) throw new Error('empty');
    grid.innerHTML = '';
    featured.forEach(item => grid.appendChild(buildDishCard(item)));
  } catch {
    grid.innerHTML = '<div class="state-box"><p>⚠️ Could not load dishes. Make sure your backend is running.</p></div>';
  }
}


/* ─────────────────────────────────────────────
   § 5  HERO SEARCH
───────────────────────────────────────────── */
function initHeroSearch() {
  const input = document.getElementById('heroSearchInput');
  const btn   = document.getElementById('heroSearchBtn');
  const box   = document.getElementById('searchResults');
  const wrap  = document.getElementById('heroSearch');
  if (!input) return;

  function doSearch() {
    const q = input.value.trim();
    if (q) window.location.href = `menu.html?search=${encodeURIComponent(q)}`;
  }

  btn?.addEventListener('click', doSearch);

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { box?.classList.remove('open'); doSearch(); }
  });

  input.addEventListener('input', function () {
    renderSearchDropdown(this.value.trim().toLowerCase());
  });

  document.addEventListener('click', e => {
    if (!wrap?.contains(e.target)) box?.classList.remove('open');
  });
}

async function renderSearchDropdown(q) {
  const box = document.getElementById('searchResults');
  if (!box) return;
  box.innerHTML = '';
  if (!q) { box.classList.remove('open'); return; }

  const all     = await getMenuData();    /* shared.js — cached */
  const matches = all.filter(i =>
    i.name.toLowerCase().includes(q) ||
    (i.category||'').toLowerCase().includes(q)
  ).slice(0, 6);

  if (!matches.length) {
    box.innerHTML = `<div class="search-no-results">No dishes found for "<b>${escapeHtml(q)}</b>"</div>`;
    box.classList.add('open');
    return;
  }

  matches.forEach(item => {
    const src  = imgSrc(item.name);
    const safe = escapeHtml(item.name);
    const div  = document.createElement('div');
    div.className = 'search-result-item';
    div.innerHTML = `
      ${src ? `<img class="search-result-img" src="${src}" alt="${safe}" loading="lazy"/>` : '<div class="search-result-img"></div>'}
      <div class="search-result-info">
        <div class="search-result-name">${safe}</div>
        <div class="search-result-cat">${escapeHtml(item.category||'')}</div>
      </div>
      <div class="search-result-price">₹${item.price}</div>`;
    const img = div.querySelector('img');
    if (img) img.addEventListener('error', () => { img.style.display='none'; }, { once:true });
    div.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      addToCart(item);                    /* shared.js */
      box.classList.remove('open');
    });
    box.appendChild(div);
  });
  box.classList.add('open');
}


/* ─────────────────────────────────────────────
   § 6  CATEGORY DRAG SCROLL (desktop)
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
   § 7  INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initShared();             /* shared.js — nav, cart, hamburger, location, auth */
  initAnnounceBar();        /* shared.js — announcement bar */
  loadFeatured();           /* also primes the menu data cache */
  initHeroSearch();
  initCategoryDragScroll();
});