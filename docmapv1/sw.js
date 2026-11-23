/* =====================================================================
   Service worker (v12.9, app installabile). Lives next to index.html; scope = the app folder.

   What it does
   - Keeps a copy of the PROGRAM files only, so the app opens without network (phone in a basement archive).
   - Network-first for every file it handles: online you always get what is on the server (an update shows at the
     next load), offline the last copy is used. No stale program after an update.
   - Precache at install: index.html, scan.html, docmap.config.js, the two manifests and every file they reference
     (scripts, styles, icons, and the fonts named inside the styles), so the list never needs to be kept by hand.

   What it never does
   - It never answers api.php, server-php/, photos or any other request: they go to the network untouched
     (no data, no token ever lands in this cache). Only GET, same origin, program paths (SHELL_RE).
   - It never caches an error page, a redirect or an opaque response.
   ===================================================================== */
'use strict';

const SW_VERSION = '26.12.13';
const SW_CACHE = 'docmap-shell-' + SW_VERSION;
const SW_PAGES = ['index.html', 'scan.html', 'docmap.config.js', 'brand.js', 'manifest.webmanifest', 'scan.webmanifest'];
/* program paths, relative to the app folder (a leading q/ is the QR route of scan.html: same files) */
const SHELL_RE = /^(?:q\/)?((?:assets|vendor)\/[^?#]+\.(?:js|css|woff2|png|svg|ico)|docmap\.config\.js|brand\.js|index\.html|scan\.html|[a-z]+\.webmanifest)$/;
const QR_RE = /^q\/[A-Za-z0-9_-]{1,40}\/?$/;

const swBase = () => new URL('./', self.location.href).href;
/** Path of a same-origin URL relative to the app folder, or null when it is outside it / another origin. */
function swRel(url){
  const u = new URL(url), b = swBase();
  if (u.origin !== self.location.origin || !u.href.startsWith(b)) return null;
  return decodeURIComponent(u.pathname.slice(new URL(b).pathname.length));
}
function swCacheable(res){ return !!res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected; }

/** Relative references found in a page, a manifest or a stylesheet (src=, href=, url(), "src": in manifests). */
function swRefs(text, from){
  const out = new Set(), add = (r) => {
    if (!r || /^(?:[a-z]+:|\/\/|#|data:)/i.test(r)) return;
    try { const rel = swRel(new URL(r, from).href); if (rel && SHELL_RE.test(rel)) out.add(rel.replace(/^q\//, '')); } catch(e){}
  };
  text.replace(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi, (m, r) => add(r));
  text.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (m, r) => add(r));
  text.replace(/"src"\s*:\s*"([^"]+)"/g, (m, r) => add(r));
  return out;
}

async function swPrecache(){
  const cache = await caches.open(SW_CACHE), base = swBase(), done = new Set(), queue = SW_PAGES.slice();
  while (queue.length){
    const rel = queue.shift(); if (done.has(rel)) continue; done.add(rel);
    const url = new URL(rel, base).href;
    try {
      const res = await fetch(url, {cache:'no-cache', credentials:'same-origin'});
      if (!swCacheable(res)) continue;
      await cache.put(url, res.clone());
      if (/\.(html|css|webmanifest)$/.test(rel)) swRefs(await res.text(), url).forEach(r => { if (!done.has(r)) queue.push(r); });
    } catch(e){ /* offline at install: the runtime cache fills the gaps later */ }
  }
}

self.addEventListener('install', (e) => { e.waitUntil(swPrecache().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('docmap-shell-') && k !== SW_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/** The cached copy that stands in for a request when the network fails. */
function swFallbackKey(rel){
  if (rel === '' || rel === 'index.html') return 'index.html';
  if (QR_RE.test(rel) || rel === 'scan.html') return 'scan.html';
  return rel.replace(/^q\//, '');
}
async function swNetworkFirst(req, rel){
  const cache = await caches.open(SW_CACHE);
  try {
    const res = await fetch(req);
    if (swCacheable(res) && SHELL_RE.test(rel)) cache.put(new URL(rel.replace(/^q\//, ''), swBase()).href, res.clone()).catch(() => {});
    return res;
  } catch(err){
    const hit = await cache.match(new URL(swFallbackKey(rel), swBase()).href, {ignoreSearch:true});
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const rel = swRel(req.url); if (rel == null) return;
  const nav = req.mode === 'navigate';
  /* pages: the app pages and the QR route only; everything else (api.php, server-php/, …) is not ours */
  if (nav ? !(rel === '' || rel === 'index.html' || rel === 'scan.html' || QR_RE.test(rel)) : !SHELL_RE.test(rel)) return;
  e.respondWith(swNetworkFirst(req, rel));
});
