/* ═══════════════════════════════════════════════════════════
   CONTACT.JS — logic specific to contact.html only
   Depends on: shared.js (must load first)

   All shared behaviour (navbar, cart, mobile menu, auth,
   location tab, announcement bar) is handled by shared.js.
   This file handles only contact-page-specific concerns.
═══════════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────
   § 1  LAZY MAP — load iframe only when in view
   Avoids blocking page load with Google Maps
───────────────────────────────────────────── */
function initLazyMap() {
  const iframe = document.querySelector('.map-wrap iframe');
  if (!iframe) return;

  const realSrc = iframe.getAttribute('src');
  iframe.removeAttribute('src');            /* pause load until visible */

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      iframe.src = realSrc;
      observer.disconnect();
    }
  }, { rootMargin:'200px' });               /* start loading 200px before visible */

  observer.observe(iframe.closest('.map-wrap'));
}


/* ─────────────────────────────────────────────
   § 2  INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initShared();        /* shared.js — navbar, cart, mobile menu, auth, location */
  initAnnounceBar();   /* shared.js — announcement bar */
  initLazyMap();
});