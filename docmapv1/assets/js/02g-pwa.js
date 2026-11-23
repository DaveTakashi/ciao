/* =====================================================================
   DocMap 2026 — v12.9: installable app (PWA). Registers sw.js (app folder) when the page is served over https
   (or http on localhost): never from file://, where browsers refuse service workers anyway.
   The worker caches ONLY the program files (index.html, scan.html, assets/, vendor/, docmap.config.js, manifests,
   icons), always network-first: online you always get the files on the server, offline the last copy opens.
   It never touches api.php, server-php/ or any data request. DOCMAP_CONFIG.pwa === false turns it off.
   ===================================================================== */
'use strict';

function dmPwaAllowed(loc){
  loc = loc || location;
  if (window.DOCMAP_CONFIG && window.DOCMAP_CONFIG.pwa === false) return false;
  if (!('serviceWorker' in navigator)) return false;
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
}
/** sw.js sits next to index.html / scan.html: resolve it from the document base (scan.html sets <base> on /q/<code>). */
function dmPwaUrl(){ return new URL('sw.js', document.baseURI).href; }
async function dmPwaRegister(){
  if (!dmPwaAllowed()) return null;
  const url = dmPwaUrl();
  try { return await navigator.serviceWorker.register(url, {scope:new URL('./', url).href}); }
  catch(e){ console.warn(('' + brandName() + ': app installabile non attiva (') + (e && e.message || e) + ')'); return null; }
}
/** Page of the phone (scan.html, also as /q/<code>) or of the PC (index.html). */
function dmPwaIsPhonePage(path){ return /(^|\/)scan\.html$|\/q\/[A-Za-z0-9_-]{1,40}\/?$/.test(path || location.pathname); }
/** Manifest + home-screen icon links, added only where the app can be installed: a <link rel="manifest"> on a file://
    page would only print a console error. */
function dmPwaLinks(){
  if (!dmPwaAllowed() || document.querySelector('link[rel="manifest"]')) return;
  const add = (attrs) => { const l = document.createElement('link'); Object.keys(attrs).forEach(k => l.setAttribute(k, attrs[k])); document.head.appendChild(l); };
  add({rel:'manifest', href:dmPwaIsPhonePage() ? 'scan.webmanifest' : 'manifest.webmanifest'});
  add({rel:'apple-touch-icon', href:'assets/icons/apple-touch-icon.png'});
  const m = document.createElement('meta'); m.name = 'apple-mobile-web-app-capable'; m.content = 'yes'; document.head.appendChild(m);
}
dmPwaLinks();
window.addEventListener('load', () => { dmPwaRegister(); });
