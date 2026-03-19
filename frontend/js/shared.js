/* ═══════════════════════════════════════════════════════════
   SHARED.JS — loaded by every page before page-specific JS
   Contains: CONFIG, IMAGE_MAP, NAV_ITEMS, helpers,
   menu cache, cart, auth navbar, location tab,
   hamburger/slide menu, nav+footer rendering.
═══════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────
   § 1  CONFIG — change API_BASE for production
───────────────────────────────────────────── */
const CONFIG = {
  API_BASE:     window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
                  ? 'http://127.0.0.1:8000'
                  : 'https://your-production-api.com',   /* ← replace before deploying */
  get API_MENU() { return this.API_BASE + '/api/menu'; },
  CART_KEY:     'sg_cart',
  TOKEN_KEY:    'sg_token',
  USER_ID:      'sg_user_id',
  USER_NAME:    'sg_user_name',
  USER_EMAIL:   'sg_user_email',
  USER_ROLE:    'sg_user_role',
  USER_PHONE:   'sg_user_phone',
  LOCATION_KEY: 'sg_user_location',
  ANNOUNCE_KEY: 'sg_announce_v3',   /* bump to re-show bar after content update */
};


/* ─────────────────────────────────────────────
   § 2  IMAGE MAP — add new dishes here only
───────────────────────────────────────────── */
const IMAGE_MAP = {
  'Margherita Pizza':        'margherita_pizza.png',
  'Peri Peri Paneer Pizza':  'peri_peri_paneer_pizza.png',
  'Peppy Paneer Pizza':      'peppy_paneer_pizza.png',
  'Corn & Cheese Pizza':     'corn_n_chees_pizza.png',
  'Farmhouse Pizza':         'farm_house_pizza.png',
  'Loaded Vegetable Pizza':  'loaded_veggie_pizza.png',
  'Peri Peri Pasta':         'peri_peri_pasta.png',
  'Red Sauce Pasta':         'red_sause_pasta.png',
  'Pink Sauce Pasta':        'pink_sause_pasta.png',
  'White Sauce Pasta':       'white_sause_pasta.png',
  'Paneer Tikka Pasta':      'paneer_tikka_pasta.png',
  'Cheese Jalapeño Pasta':   'cheese_jalapeno_pasta.png',
  'Veg Grilled Sandwich':    'veg_grilled_sandwich.png',
  'Schezwan Sandwich':       'schezwan_sandwich.png',
  'Chilli Garlic Sandwich':  'chilly_garlic_sandwich.png',
  'Paneer Tikka Sandwich':   'paneer_tikka_sandwich.png',
  'Vanilla Milkshake':       'vanilla_milkshake.png',
  'Strawberry Milkshake':    'strawberry_milkshake.png',
  'Butterscotch Milkshake':  'butterscotch_milkshake.png',
  'Chocolate Milkshake':     'chocolate_milkshake.png',
  'Veg Chowmein':            'veg_chowmein.png',
  'Schezwan Noodles':        'schezwan_noodles.png',
  'Chilli Garlic Noodles':   'chilly_garlic_noodles.png',
  'Veg Spring Roll':         'veg_springroll.png',
  'Soya Chilli':             'soya_chilly.png',
  'Veg Manchurian':          'machurian.png',
};


/* ─────────────────────────────────────────────
   § 3  NAV ITEMS — single source for all pages
───────────────────────────────────────────── */
const NAV_ITEMS = [
  { label:'Home',       href:'index.html'   },
  { label:'Menu',       href:'menu.html'    },
  { label:'Gallery',    href:'gallery.html' },
  { label:'Contact Us', href:'contact.html' },
];


/* ─────────────────────────────────────────────
   § 4  HELPERS
───────────────────────────────────────────── */

/** Prevent XSS — escape before any innerHTML injection */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** Resolve image path for a dish name */
function imgSrc(name) {
  return IMAGE_MAP[name] ? `images/${IMAGE_MAP[name]}` : '';
}

/** Build Authorization header object */
function authHeaders() {
  const token = localStorage.getItem(CONFIG.TOKEN_KEY);
  return {
    'Content-Type':'application/json',
    ...(token ? { 'Authorization':`Bearer ${token}` } : {}),
  };
}


/* ─────────────────────────────────────────────
   § 5  MENU DATA CACHE — one fetch, shared
───────────────────────────────────────────── */
let _menuDataPromise = null;
function getMenuData() {
  if (!_menuDataPromise) {
    _menuDataPromise = fetch(CONFIG.API_MENU)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .catch(() => []);
  }
  return _menuDataPromise;
}


/* ─────────────────────────────────────────────
   § 6  CART
───────────────────────────────────────────── */
function getCartKey() {
  const email = localStorage.getItem(CONFIG.USER_EMAIL);
  return email ? `sg_cart_${email}` : CONFIG.CART_KEY;
}

let cart = JSON.parse(localStorage.getItem(getCartKey()) || '[]');

function saveCart() {
  localStorage.setItem(getCartKey(), JSON.stringify(cart));
}

function updateBadge() {
  const count = cart.reduce((s,i) => s + (i.qty||0), 0);
  /* Desktop badge */
  const b = document.getElementById('cartBadge');
  if (b) { b.textContent = count; b.classList.toggle('visible', count > 0); }
  /* Mobile badge */
  const bm = document.getElementById('cartBadgeMobile');
  if (bm) { bm.textContent = count; bm.classList.toggle('visible', count > 0); }
  /* Notify dish cards on this page */
  document.dispatchEvent(new CustomEvent('cart:updated', { detail:{ cart } }));
}

function getItemQty(id) {
  const item = cart.find(c => c._id === id);
  return item ? (item.qty||0) : 0;
}

function addToCart(item) {
  const ex = cart.find(c => c._id === item._id);
  if (ex) ex.qty = (ex.qty||0) + 1;
  else cart.push({ ...item, qty:1 });
  saveCart(); updateBadge(); renderCartDrawer(); openCart();
}

function changeQty(id, delta) {
  const item = cart.find(c => c._id === id);
  if (!item) return;
  item.qty = (item.qty||0) + delta;
  if (item.qty <= 0) cart = cart.filter(c => c._id !== id);
  saveCart(); updateBadge(); renderCartDrawer();
}

function renderCartDrawer() {
  const container = document.getElementById('cartItems');
  const footer    = document.getElementById('cartFooter');
  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty"><div style="font-size:3rem">🍽️</div><p>Your cart is empty.<br/>Add some delicious dishes!</p></div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  let total = 0;
  container.innerHTML = '';
  cart.forEach(item => {
    const qty  = item.qty||0;
    total += item.price * qty;
    const src  = imgSrc(item.name);
    const name = escapeHtml(item.name);
    const id   = String(item._id);
    const row  = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      ${src ? `<img class="cart-item-img" src="${src}" alt="${name}" loading="lazy"/>` : '<div class="cart-item-img"></div>'}
      <div class="cart-item-info">
        <div class="cart-item-name">${name}</div>
        <div class="cart-item-price">₹${item.price} × ${qty} = ₹${item.price*qty}</div>
      </div>
      <div class="cart-qty">
        <button class="qty-btn minus" aria-label="Remove one">−</button>
        <span class="qty-num">${qty}</span>
        <button class="qty-btn plus" aria-label="Add one">+</button>
      </div>`;
    const img = row.querySelector('img.cart-item-img');
    if (img) img.addEventListener('error', () => { img.style.display='none'; }, { once:true });
    row.querySelector('.minus').addEventListener('click', () => changeQty(id,-1));
    row.querySelector('.plus').addEventListener('click',  () => changeQty(id, 1));
    container.appendChild(row);
  });

  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = `₹${total}`;
  if (footer) footer.style.display = 'block';
}

function openCart()  {
  document.getElementById('cartDrawer')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartDrawer')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function initCart() {
  document.getElementById('cartBtn')?.addEventListener('click', openCart);
  document.getElementById('cartBtnMobile')?.addEventListener('click', openCart);  /* mobile cart */
  document.getElementById('cartClose')?.addEventListener('click', closeCart);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
  document.getElementById('checkoutBtn')?.addEventListener('click', () => {
    window.location.href = 'checkout.html';
  });
  updateBadge();
  renderCartDrawer();
}


/* ─────────────────────────────────────────────
   § 7  AUTH NAVBAR
───────────────────────────────────────────── */
function initAuthNavbar() {
  const token = localStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token) return;

  const name     = localStorage.getItem(CONFIG.USER_NAME) || localStorage.getItem(CONFIG.USER_EMAIL) || 'User';
  const role     = localStorage.getItem(CONFIG.USER_ROLE);
  const initial  = escapeHtml(name.charAt(0).toUpperCase());
  const first    = escapeHtml(name.split(' ')[0]);
  const safeName = escapeHtml(name);

  /* Desktop — replace Sign In button */
  const desktopBtn = document.querySelector('.nav-actions .btn-signin');
  if (desktopBtn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'user-menu';
    wrapper.innerHTML = `
      <button class="user-btn" id="userMenuBtn" aria-label="User menu">
        <div class="user-avatar">${initial}</div>
        <span>${first}</span>
        <span style="font-size:0.65rem;opacity:0.75">▼</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <div class="user-dropdown-name">Signed in as<strong>${safeName}</strong></div>
        ${role==='admin' ? '<a class="dropdown-item" href="admin.html">⚙️ Admin Panel</a>' : ''}
        <a class="dropdown-item" href="orders.html">📦 My Orders</a>
        <button class="dropdown-item logout" id="logoutBtn">🚪 Sign Out</button>
      </div>`;
    desktopBtn.replaceWith(wrapper);
    document.getElementById('userMenuBtn').addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('userDropdown').classList.toggle('open');
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);
  }
  document.addEventListener('click', () => {
    document.getElementById('userDropdown')?.classList.remove('open');
  });

  /* Mobile — replace Sign In link in slide menu footer */
  const mobileSignIn = document.getElementById('mobileSignIn');
  if (mobileSignIn) {
    mobileSignIn.textContent = `👤 ${name.split(' ')[0]}`;
    mobileSignIn.removeAttribute('href');
    mobileSignIn.style.cssText = 'background:rgba(255,255,255,0.12);color:var(--white);border-radius:8px;padding:10px 14px;font-weight:600;cursor:default;display:block;text-align:center;';

    const footer = document.getElementById('mobileMenuFooter');
    if (footer && role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.href = 'admin.html';
      adminLink.textContent = '⚙️ Admin Panel';
      adminLink.style.cssText = 'display:block;color:var(--gold-light);text-decoration:none;font-size:0.9rem;font-weight:600;padding:10px 14px;border-radius:8px;background:rgba(245,200,66,0.12);text-align:center;';
      footer.appendChild(adminLink);
    }
    if (footer) {
      const ordersLink = document.createElement('a');
      ordersLink.href = 'orders.html';
      ordersLink.textContent = '📦 My Orders';
      ordersLink.style.cssText = 'display:block;color:var(--white);text-decoration:none;font-size:0.9rem;font-weight:600;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,0.08);text-align:center;';
      footer.appendChild(ordersLink);
    }
    if (footer) {
      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = '🚪 Sign Out';
      logoutBtn.style.cssText = 'width:100%;color:#fc8181;background:rgba(229,62,62,0.12);border:1px solid rgba(229,62,62,0.25);border-radius:8px;padding:10px 14px;font-size:0.9rem;font-weight:600;font-family:Poppins,sans-serif;cursor:pointer;';
      logoutBtn.addEventListener('click', logout);
      footer.appendChild(logoutBtn);
    }
  }
}

function logout() {
  [CONFIG.TOKEN_KEY, CONFIG.USER_ID, CONFIG.USER_EMAIL, CONFIG.USER_NAME, CONFIG.USER_ROLE, CONFIG.USER_PHONE]
    .forEach(k => localStorage.removeItem(k));
  window.location.href = 'login.html';
}


/* ─────────────────────────────────────────────
   § 8  LOCATION TAB
───────────────────────────────────────────── */
function initLocation() {
  const tab      = document.getElementById('locationTab');
  const dropdown = document.getElementById('locationDropdown');
  const valEl    = document.getElementById('locValue');
  const savedEl  = document.getElementById('locCurrentVal');
  const fetchBtn = document.getElementById('btnFetchLocation');
  const spinner  = document.getElementById('locSpinner');
  if (!tab) return;

  /* Restore saved location */
  try {
    const saved = localStorage.getItem(CONFIG.LOCATION_KEY);
    if (saved) {
      const loc = JSON.parse(saved);
      if (valEl)   valEl.textContent   = loc.short;
      if (savedEl) savedEl.textContent = loc.full;
    }
  } catch { /* ignore */ }

  /* Toggle dropdown */
  tab.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    tab.setAttribute('aria-expanded', isOpen);
  });
  document.addEventListener('click', e => {
    if (!tab.contains(e.target)) {
      dropdown.classList.remove('open');
      tab.setAttribute('aria-expanded','false');
    }
  });

  /* GPS fetch */
  fetchBtn?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      if (savedEl) savedEl.textContent = 'Geolocation not supported by your browser.';
      return;
    }
    fetchBtn.disabled = true;
    spinner?.classList.add('show');
    const label = fetchBtn.querySelector('.btn-loc-label');
    if (label) label.textContent = 'Detecting…';

    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude:lat, longitude:lon } = pos.coords;
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`,
            { headers:{ 'Accept-Language':'en' } }
          );
          const data = await res.json();
          const addr = data.address || {};
          const area = addr.neighbourhood || addr.suburb || addr.village || addr.town || addr.county || '';
          const city = addr.city || addr.town || addr.county || '';
          const short = [area,city].filter(Boolean).join(', ') || data.display_name?.split(',')[0] || 'Your location';
          const full  = data.display_name || short;
          localStorage.setItem(CONFIG.LOCATION_KEY, JSON.stringify({ short, full, lat, lon }));
          if (valEl)   valEl.textContent   = short;
          if (savedEl) savedEl.textContent = full;
          dropdown.classList.remove('open');
        } catch {
          if (savedEl) savedEl.textContent = 'Could not fetch address. Try again.';
        } finally { resetBtn(); }
      },
      err => {
        const msgs = { 1:'Location permission denied.',2:'Location unavailable.',3:'Request timed out.' };
        if (savedEl) savedEl.textContent = msgs[err.code] || 'Could not get location.';
        resetBtn();
      },
      { timeout:12000, maximumAge:300000 }
    );
  });

  function resetBtn() {
    if (fetchBtn) {
      fetchBtn.disabled = false;
      const label = fetchBtn.querySelector('.btn-loc-label');
      if (label) label.textContent = 'Use My Current Location';
    }
    spinner?.classList.remove('show');
  }
}


/* ─────────────────────────────────────────────
   § 9  HAMBURGER + SLIDE MENU
───────────────────────────────────────────── */
function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const menu      = document.getElementById('mobileMenu');
  const overlay   = document.getElementById('mobileMenuOverlay');
  const closeBtn  = document.getElementById('mobileMenuClose');
  if (!hamburger || !menu) return;

  function openMenu() {
    menu.classList.add('open');
    overlay?.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
  }
  function closeMenu() {
    menu.classList.remove('open');
    overlay?.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => menu.classList.contains('open') ? closeMenu() : openMenu());
  overlay?.addEventListener('click', closeMenu);
  closeBtn?.addEventListener('click', closeMenu);
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
}


/* ─────────────────────────────────────────────
   § 10  NAV + FOOTER RENDERING
───────────────────────────────────────────── */
function initNav() {
  const current = location.pathname.split('/').pop() || 'index.html';

  /* Desktop nav */
  const navLinks = document.getElementById('navLinks');
  if (navLinks) {
    navLinks.innerHTML = NAV_ITEMS.map(n =>
      `<li><a href="${n.href}"${n.href===current?' class="active"':''}>${n.label}</a></li>`
    ).join('');
  }

  /* Mobile slide menu links */
  const mobileLinks = document.getElementById('mobileNavLinks');
  if (mobileLinks) {
    mobileLinks.innerHTML = NAV_ITEMS.map(n =>
      `<a href="${n.href}"${n.href===current?' class="active"':''}>${n.label}</a>`
    ).join('');
  }

  /* Footer links — desktop */
  const footerLinks = document.getElementById('footerLinks');
  if (footerLinks) {
    footerLinks.innerHTML = NAV_ITEMS.map(n =>
      `<li><a href="${n.href}">${n.label}</a></li>`
    ).join('');
  }

  /* Footer links — mobile */
  const footerLinksMobile = document.getElementById('footerLinksMobile');
  if (footerLinksMobile) {
    footerLinksMobile.innerHTML = NAV_ITEMS.map(n =>
      `<li><a href="${n.href}">${n.label}</a></li>`
    ).join('');
  }
}


/* ─────────────────────────────────────────────
   § 11  ANNOUNCEMENT BAR
   Call initAnnounceBar() from index.js / menu.js
───────────────────────────────────────────── */
function initAnnounceBar() {
  const bar = document.getElementById('announceBar');
  if (!bar) return;
  document.getElementById('announceClose')?.addEventListener('click', () => {
    bar.style.display = 'none';
    const nav = document.querySelector('nav');
    if (nav) nav.style.top = '0';
  });
}


/* ─────────────────────────────────────────────
   § 13  FLOATING ORDER TRACKER PILL
   Shows at bottom of every page when user has
   active orders. Polls every 30s silently.
   Hidden on orders.html and track.html.
───────────────────────────────────────────── */
(function injectTrackerStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #orderTrackerPill {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      z-index: 8000;
      background: var(--green-dark, #1a3516);
      color: #fff;
      border-radius: 50px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      cursor: pointer;
      transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
      text-decoration: none;
      max-width: calc(100vw - 32px);
      border: 1px solid rgba(255,255,255,0.12);
      white-space: nowrap;
    }
    #orderTrackerPill.visible {
      transform: translateX(-50%) translateY(0);
    }
    #orderTrackerPill:hover {
      box-shadow: 0 12px 40px rgba(0,0,0,0.35);
      background: #243d1f;
    }
    .pill-icon {
      font-size: 1.1rem;
      animation: pillBounce 1.5s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes pillBounce {
      0%,100% { transform: translateY(0);   }
      50%      { transform: translateY(-3px); }
    }
    .pill-text {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }
    .pill-label {
      font-size: 0.78rem;
      font-weight: 700;
      font-family: 'Poppins', sans-serif;
    }
    .pill-sub {
      font-size: 0.68rem;
      opacity: 0.65;
      font-family: 'Poppins', sans-serif;
    }
    .pill-arrow {
      font-size: 0.8rem;
      opacity: 0.7;
      flex-shrink: 0;
    }
    .pill-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #68d391;
      flex-shrink: 0;
      animation: pillDotPulse 2s ease-in-out infinite;
    }
    @keyframes pillDotPulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:0.4; transform:scale(0.7); }
    }
    @media(max-width:700px) {
      #orderTrackerPill { bottom: 16px; padding: 11px 16px; gap: 8px; }
      .pill-label { font-size: 0.74rem; }
    }
  `;
  document.head.appendChild(style);
})();

let _trackerPill     = null;
let _trackerInterval = null;

async function initTrackerPill() {
  /* Don't show on orders or track pages — redundant there */
  const page = location.pathname.split('/').pop();
  if (page === 'orders.html' || page === 'track.html') return;

  /* Only for logged-in users */
  const token = localStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token) return;

  /* Create pill element once */
  if (!_trackerPill) {
    _trackerPill = document.createElement('a');
    _trackerPill.id = 'orderTrackerPill';
    document.body.appendChild(_trackerPill);
  }

  await _fetchAndUpdatePill();

  /* Poll every 30 seconds */
  if (_trackerInterval) clearInterval(_trackerInterval);
  _trackerInterval = setInterval(_fetchAndUpdatePill, 30000);
}

async function _fetchAndUpdatePill() {
  const token = localStorage.getItem(CONFIG.TOKEN_KEY);
  if (!token || !_trackerPill) return;

  try {
    const res = await fetch(
      CONFIG.API_BASE + '/api/orders/my?active=true',
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!res.ok) throw new Error();
    const orders = await res.json();

    const ACTIVE = ['pending','confirmed','preparing','out_for_delivery'];
    const active = orders.filter(o => ACTIVE.includes(o.status));

    if (!active.length) {
      /* No active orders — hide pill */
      _trackerPill.classList.remove('visible');
      return;
    }

    const STATUS_LABELS = {
      pending:          'Order received',
      confirmed:        'Order confirmed',
      preparing:        'Being prepared',
      out_for_delivery: 'Out for delivery',
    };
    const STATUS_ICONS = {
      pending:          '📋',
      confirmed:        '✅',
      preparing:        '👨‍🍳',
      out_for_delivery: '🛵',
    };

    if (active.length === 1) {
      const o     = active[0];
      const icon  = STATUS_ICONS[o.status]  || '📦';
      const label = STATUS_LABELS[o.status] || 'Active order';
      _trackerPill.href = `track.html?id=${o._id}`;
      _trackerPill.innerHTML = `
        <div class="pill-dot"></div>
        <span class="pill-icon">${icon}</span>
        <div class="pill-text">
          <span class="pill-label">${label}</span>
          <span class="pill-sub">Tap to track your order →</span>
        </div>
        <span class="pill-arrow">›</span>`;
    } else {
      _trackerPill.href = 'orders.html';
      _trackerPill.innerHTML = `
        <div class="pill-dot"></div>
        <span class="pill-icon">📦</span>
        <div class="pill-text">
          <span class="pill-label">${active.length} active orders</span>
          <span class="pill-sub">Tap to view all →</span>
        </div>
        <span class="pill-arrow">›</span>`;
    }

    /* Slight delay before showing so it feels like it loaded in */
    setTimeout(() => _trackerPill.classList.add('visible'), 600);

  } catch {
    /* Silently fail — don't show pill on error */
    _trackerPill.classList.remove('visible');
  }
}


/* ─────────────────────────────────────────────
   § 12  SHARED INIT — call once per page
───────────────────────────────────────────── */
function initShared() {
  initNav();
  initCart();
  initHamburger();
  initLocation();
  initAuthNavbar();
  initTrackerPill();
}