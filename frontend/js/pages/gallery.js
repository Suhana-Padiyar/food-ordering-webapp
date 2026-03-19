/* ═══════════════════════════════════════════════════════════
   GALLERY.JS — Community Moments Wall
   Depends on: shared.js (must load first)

   Backend API expected (FastAPI):
     GET    /api/gallery              → [{_id, imageUrl, caption, author, authorId, likes:[], reports:[], createdAt, isOfficial}]
     POST   /api/gallery              → multipart: image file + caption (auth required)
     POST   /api/gallery/:id/like     → toggle like (auth required) → {likes:[...]}
     POST   /api/gallery/:id/report   → submit report (auth required) → {ok:true}
     DELETE /api/gallery/:id          → admin only (auth required)
═══════════════════════════════════════════════════════════ */

const GALLERY_API = CONFIG.API_BASE + '/api/gallery';

/* ─────────────────────────────────────────────
   § 1  STATE
───────────────────────────────────────────── */
let allPosts  = [];   /* all loaded posts (café + user) */
let lbIndex   = 0;    /* current lightbox index */

/* ─────────────────────────────────────────────
   § 2  CAFÉ'S OWN PHOTOS (always shown)
   These are the static gallery images already on disk.
   They appear as "official" posts merged into the wall.
───────────────────────────────────────────── */
const OFFICIAL_POSTS = [];


/* ─────────────────────────────────────────────
   § 3  LOAD & RENDER WALL
───────────────────────────────────────────── */
async function loadWall() {
  const grid = document.getElementById('momentsGrid');
  grid.innerHTML = '<div class="wall-state"><div class="spinner"></div><p>Loading moments…</p></div>';

  let userPosts     = [];
  let officialPosts = [];
  let officialLikes = {};
  try {
    const token = localStorage.getItem('sg_token');
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

    const [officialRes, galleryRes, likesRes] = await Promise.all([
      fetch(GALLERY_API + '/official',       { headers: authHeader }),
      fetch(GALLERY_API,                     { headers: authHeader }),
      fetch(GALLERY_API + '/official-likes', { headers: authHeader }),
    ]);

    if (officialRes.ok) {
      const raw = await officialRes.json();
      officialPosts = raw.filter(p => p.imageUrl && p.imageUrl.startsWith('http'));
    }
    if (!officialPosts.length) officialPosts = OFFICIAL_POSTS; /* fallback to hardcoded (now empty) */

    if (galleryRes.ok) {
      const raw = await galleryRes.json();
      userPosts = raw.filter(p =>
        p.imageUrl &&
        p.imageUrl.startsWith('http') &&
        !String(p._id).startsWith('off-')
      );
    }
    if (likesRes.ok) officialLikes = await likesRes.json();
  } catch {
    officialPosts = OFFICIAL_POSTS;
  }

  /* Merge official like counts from DB */
  const mergedOfficial = officialPosts.map(p => {
    const db = officialLikes[p._id];
    return db ? { ...p, likeCount: db.likeCount, hasLiked: db.hasLiked } : p;
  });

  /* Merge: official posts first, then user posts newest first */
  allPosts = [
    ...mergedOfficial,
    ...userPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  ];

  renderWall();
  updateStats(userPosts.length);
}

function renderWall() {
  const grid    = document.getElementById('momentsGrid');
  const userId  = localStorage.getItem('sg_user_id') || localStorage.getItem('sg_user_email') || '';
  const role    = localStorage.getItem('sg_user_role') || '';

  grid.innerHTML = '';

  if (!allPosts.length) {
    grid.innerHTML = `<div class="wall-state">
      <span class="big-icon">📸</span>
      <p>No moments yet.<br/>Be the first to share yours!</p>
    </div>`;
    return;
  }

  allPosts.forEach((post, idx) => {
    const card = buildCard(post, idx, userId, role);
    grid.appendChild(card);
  });
}

function buildCard(post, idx, userId, role) {
  const card = document.createElement('div');
  card.className = 'moment-card' + (post.isOfficial ? ' official' : '');
  card.dataset.idx = idx;

  const likeCount  = post.likeCount  ?? (Array.isArray(post.likes) ? post.likes.length : 0);
  const hasLiked   = post.hasLiked  ?? (Array.isArray(post.likes) && post.likes.includes(userId));
  const initial    = post.isOfficial ? '🌿' : (post.author || 'A').charAt(0).toUpperCase();
  const isAdmin    = role === 'admin';
  const isOwner    = userId && post.authorId && post.authorId === userId;
  const canDelete  = (isAdmin || isOwner) && !post.isOfficial;
  const dateStr    = post.createdAt ? new Date(post.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';

  card.innerHTML = `
    <div class="moment-img-wrap">
      <div class="official-badge">✦ शहर Garden</div>
      <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.caption || 'Moment at Sheher')}" loading="lazy"/>
      <div class="moment-img-overlay">
        <span class="overlay-hint">Click to view</span>
      </div>
    </div>
    <div class="moment-body">
      ${post.caption ? `<p class="moment-caption">"${escapeHtml(post.caption)}"</p>` : '<p class="moment-caption no-caption">No caption</p>'}
      <div class="moment-meta">
        <div class="moment-author">
          <div class="moment-avatar ${post.isOfficial ? 'official-av' : ''}">${post.isOfficial ? '🌿' : escapeHtml(initial)}</div>
          <div>
            <div class="moment-author-name">${escapeHtml(post.author || 'Guest')}</div>
            ${dateStr ? `<div class="moment-date">${dateStr}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="moment-actions">
        <button class="action-btn like-btn ${hasLiked ? 'liked' : ''}" data-id="${post._id}" aria-label="Like">
          <svg viewBox="0 0 24 24" fill="${hasLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="like-count">${likeCount}</span>
        </button>
        ${!post.isOfficial ? `
        <button class="action-btn report-btn" data-id="${post._id}" aria-label="Report">
          ⚑ Report
        </button>` : ''}
        <div class="spacer"></div>
        ${canDelete ? `<button class="action-btn delete-btn" data-id="${post._id}" aria-label="Delete" style="border-color:#fed7d7;color:#c53030;">🗑 Delete</button>` : ''}
      </div>
    </div>`;

  /* Image click → lightbox */
  card.querySelector('.moment-img-wrap').addEventListener('click', () => openLightbox(idx));

  /* Like */
  const likeBtn = card.querySelector('.like-btn');
  if (likeBtn) likeBtn.addEventListener('click', e => { e.stopPropagation(); handleLike(post._id, likeBtn); });

  /* Report */
  const reportBtn = card.querySelector('.report-btn');
  if (reportBtn) reportBtn.addEventListener('click', e => { e.stopPropagation(); openReportModal(post._id); });

  /* Delete */
  const deleteBtn = card.querySelector('.delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', e => { e.stopPropagation(); handleDelete(post._id); });

  /* Image error fallback */
  const img = card.querySelector('img');
  img.addEventListener('error', () => {
    img.parentElement.style.background = '#e8e0d4';
    img.style.display = 'none';
  }, { once: true });

  return card;
}

function updateStats(userCount) {
  const totalEl = document.getElementById('statTotal');
  const userEl  = document.getElementById('statUser');
  if (totalEl) totalEl.textContent = OFFICIAL_POSTS.length + userCount;
  if (userEl)  userEl.textContent  = userCount;
}

/* ─────────────────────────────────────────────
   § 4  LIKE
───────────────────────────────────────────── */
async function handleLike(postId, btn) {
  const token = localStorage.getItem('sg_token');
  if (!token) {
    openUploadModal(true); /* nudge to sign in */
    return;
  }
  /* Optimistic UI */
  const liked   = btn.classList.toggle('liked');
  const countEl = btn.querySelector('.like-count');
  const current = parseInt(countEl.textContent, 10) || 0;
  countEl.textContent = liked ? current + 1 : Math.max(0, current - 1);
  btn.querySelector('path').setAttribute('fill', liked ? 'currentColor' : 'none');

  try {
    const res  = await fetch(`${GALLERY_API}/${postId}/like`, {
      method:'POST',
      headers:{ Authorization:`Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      /* Sync to server truth */
      countEl.textContent = data.likeCount;
      btn.classList.toggle('liked', data.hasLiked);
      btn.querySelector('path').setAttribute('fill', data.hasLiked ? 'currentColor' : 'none');
      /* Update allPosts cache */
      const p = allPosts.find(x => String(x._id) === String(postId));
      if (p) { p.likeCount = data.likeCount; p.hasLiked = data.hasLiked; }
    }
  } catch {
    /* rollback on failure */
    btn.classList.toggle('liked');
    countEl.textContent = current;
    btn.querySelector('path').setAttribute('fill', liked ? 'none' : 'currentColor');
  }
}

/* ─────────────────────────────────────────────
   § 5  REPORT MODAL
───────────────────────────────────────────── */
let reportingPostId = null;

function openReportModal(postId) {
  const token = localStorage.getItem('sg_token');
  if (!token) { openUploadModal(true); return; }
  reportingPostId = postId;
  document.getElementById('reportOverlay').classList.add('open');
}

function closeReportModal() {
  document.getElementById('reportOverlay').classList.remove('open');
  reportingPostId = null;
}

async function submitReport() {
  if (!reportingPostId) return;
  const token  = localStorage.getItem('sg_token');
  const reason = document.querySelector('input[name="reportReason"]:checked')?.value || 'inappropriate';
  try {
    await fetch(`${GALLERY_API}/${reportingPostId}/report`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({ reason }),
    });
  } catch { /* silent — report is best-effort */ }
  closeReportModal();
  showToast('Report submitted. Thank you for keeping our community safe.');
}

/* ─────────────────────────────────────────────
   § 6  DELETE
───────────────────────────────────────────── */
async function handleDelete(postId) {
  if (!confirm('Delete this post permanently?')) return;
  const token = localStorage.getItem('sg_token');
  try {
    const res = await fetch(`${GALLERY_API}/${postId}`, {
      method:'DELETE',
      headers:{ Authorization:`Bearer ${token}` },
    });
    if (res.ok) {
      allPosts = allPosts.filter(p => p._id !== postId);
      renderWall();
      showToast('Post deleted.');
    }
  } catch { showToast('Could not delete. Try again.', true); }
}

/* ─────────────────────────────────────────────
   § 7  UPLOAD MODAL
───────────────────────────────────────────── */
let selectedFile = null;

function openUploadModal(loginNudgeOnly = false) {
  selectedFile = null;
  document.getElementById('uploadOverlay').classList.add('open');
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('dropZone').style.display     = 'block';
  document.getElementById('captionInput').value         = '';
  document.getElementById('modalMsg').className         = 'modal-msg';
  document.getElementById('modalMsg').textContent       = '';

  const token     = localStorage.getItem('sg_token');
  const nudge     = document.getElementById('loginNudge');
  const postArea  = document.getElementById('postArea');
  const postBtn   = document.getElementById('postBtn');

  if (!token) {
    nudge.style.display    = 'block';
    postArea.style.display = 'none';
    postBtn.disabled       = true;
  } else {
    nudge.style.display    = 'none';
    postArea.style.display = 'block';
    postBtn.disabled       = false;
  }
}

function closeUploadModal() {
  document.getElementById('uploadOverlay').classList.remove('open');
  selectedFile = null;
}

function handleFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) {
    showModalMsg('Please select an image file (JPG, PNG, WEBP).', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showModalMsg('Image must be under 10 MB.', 'error');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('previewImg').src    = e.target.result;
    document.getElementById('uploadPreview').style.display = 'block';
    document.getElementById('dropZone').style.display     = 'none';
  };
  reader.readAsDataURL(file);
}

async function submitPost() {
  const token = localStorage.getItem('sg_token');
  if (!token) return;
  if (!selectedFile) { showModalMsg('Please select a photo first.', 'error'); return; }

  const caption = document.getElementById('captionInput').value.trim();
  const btn     = document.getElementById('postBtn');

  btn.classList.add('loading');
  btn.disabled = true;

  const formData = new FormData();
  formData.append('image',   selectedFile);
  formData.append('caption', caption);

  try {
    const res = await fetch(GALLERY_API, {
      method:'POST',
      headers:{ Authorization:`Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const newPost = await res.json();
    /* Inject at position after official posts */
    allPosts.splice(OFFICIAL_POSTS.length, 0, newPost);
    renderWall();
    closeUploadModal();
    showToast('Your moment is now live! 🎉');
    updateStats(allPosts.length - OFFICIAL_POSTS.length);
  } catch (err) {
    showModalMsg('Could not upload. Make sure the backend is running.', 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showModalMsg(text, type) {
  const el = document.getElementById('modalMsg');
  el.textContent = text;
  el.className   = `modal-msg ${type}`;
}

/* ─────────────────────────────────────────────
   § 8  LIGHTBOX
───────────────────────────────────────────── */
function openLightbox(idx) {
  lbIndex = idx;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function renderLightbox() {
  const post = allPosts[lbIndex];
  if (!post) return;
  document.getElementById('lbImg').src           = post.imageUrl;
  document.getElementById('lbCaption').textContent = post.caption || '';
  document.getElementById('lbAuthor').textContent  = post.isOfficial ? 'शहर Garden' : `— ${post.author || 'Guest'}`;
}

function lbMove(dir) {
  lbIndex = (lbIndex + dir + allPosts.length) % allPosts.length;
  renderLightbox();
}

/* ─────────────────────────────────────────────
   § 9  TOAST
───────────────────────────────────────────── */
function showToast(msg, isError = false) {
  let toast = document.getElementById('galleryToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'galleryToast';
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a3516;color:#fff;padding:12px 24px;border-radius:32px;font-size:0.88rem;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:opacity 0.4s;pointer-events:none;font-family:Poppins,sans-serif;';
    document.body.appendChild(toast);
  }
  if (isError) toast.style.background = '#c53030';
  else         toast.style.background = '#1a3516';
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3200);
}

/* ─────────────────────────────────────────────
   § 10  DRAG SCROLL FOR EVENTS (not needed — masonry)
   Bind all interactive elements
───────────────────────────────────────────── */
function initGallery() {
  /* Upload modal triggers */
  document.getElementById('btnShareMoment')?.addEventListener('click', () => openUploadModal());
  document.getElementById('modalClose')?.addEventListener('click', closeUploadModal);
  document.getElementById('cancelBtn')?.addEventListener('click', closeUploadModal);
  document.getElementById('uploadOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeUploadModal();
  });

  /* File input / drag-drop */
  const fileInput = document.getElementById('fileInput');
  fileInput?.addEventListener('change', e => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });

  const dropZone = document.getElementById('dropZone');
  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });

  /* Remove preview */
  document.getElementById('removePreview')?.addEventListener('click', () => {
    selectedFile = null;
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('dropZone').style.display     = 'block';
    document.getElementById('fileInput').value            = '';
  });

  /* Post button */
  document.getElementById('postBtn')?.addEventListener('click', submitPost);

  /* Report modal */
  document.getElementById('reportOverlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeReportModal();
  });
  document.getElementById('reportCancelBtn')?.addEventListener('click', closeReportModal);
  document.getElementById('reportSubmitBtn')?.addEventListener('click', submitReport);

  /* Lightbox */
  document.getElementById('lbClose')?.addEventListener('click', closeLightbox);
  document.getElementById('lbPrev')?.addEventListener('click', e => { e.stopPropagation(); lbMove(-1); });
  document.getElementById('lbNext')?.addEventListener('click', e => { e.stopPropagation(); lbMove(1); });
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  /* Keyboard */
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  lbMove(-1);
    if (e.key === 'ArrowRight') lbMove(1);
  });
}

/* ─────────────────────────────────────────────
   § 11  INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initShared();
  initAnnounceBar();
  loadWall();
  initGallery();
});