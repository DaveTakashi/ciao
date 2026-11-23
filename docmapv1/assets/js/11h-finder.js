/* =====================================================================
   DocMap 2026 — v12.10 «Faldone smarrito» on the phone page (scan.html, after 11g-pick.js). Model: 02k-finder.js.
   Signed out + a label code in the address (QR scanned by a stranger): above the sign-in / first set-up form,
   the studio contact only, with Call / WhatsApp / SMS / E-mail buttons that carry the label code.
   Source: local mode → the studio settings in this browser; web mode → public route `finder` (no token);
   then docmap.config.js `finder`. Never shows binder data and never says whether the code exists.
   ===================================================================== */
'use strict';
(function(){
  if (typeof scRoute !== 'function' || typeof scRender !== 'function') return;
  const FD = window.FD = {f:null, code:'', tried:''};
  const SHOW = ['login', 'setup', 'nousers', 'token', 'nocrypto'];

  async function fdLoad(code){
    const cfg = typeof dmConfig === 'function' ? dmConfig() : {};
    let f = null;
    try {
      if (SC.P && SC.P.server && cfg.apiBase){
        const u = new DMServer(cfg.apiBase, '').url('finder', code ? {c:code} : {});
        const ac = typeof AbortController === 'function' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), 8000) : 0;
        try { const r = await fetch(u, {cache:'no-store', credentials:'omit', signal:ac ? ac.signal : undefined}); if (r.ok){ const j = await r.json(); if (j && j.on === true) f = fdNorm(j, false, ''); } }
        finally { clearTimeout(tm); }
      } else if (SC.P && SC.P.data && typeof SC.P.data.readState === 'function'){
        const {st} = await SC.P.data.readState();
        if (st && st.settings) f = fdNorm(st.settings.finder, false, st.settings.studioName);
      }
    } catch(e){ f = null; }   // offline, old server (404), encrypted state: fall back to the installer's config
    if (!f && cfg.finder) f = fdNorm(cfg.finder, true, cfg.studioName || '');
    return f;
  }

  const scRouteBase = scRoute;
  scRoute = async function(){
    const r = await scRouteBase.apply(this, arguments);
    const code = fdCode((SC.params && (SC.params.qr || SC.params.code)) || '');
    if (SC.user || !code){ FD.f = null; return r; }
    if (FD.tried !== code){
      FD.tried = code; FD.code = code; FD.f = await fdLoad(code);
      if (FD.f && !SC.user && SHOW.includes(SC.view)) scRender();
    }
    return r;
  };
  const scRenderBase = scRender;
  scRender = function(){
    const r = scRenderBase.apply(this, arguments);
    if (SC.user || !FD.f || !SHOW.includes(SC.view)) return r;
    const main = document.querySelector('#app main'); if (!main || document.getElementById('fd-card')) return r;
    main.classList.add('fd-main');
    main.insertAdjacentHTML('afterbegin', fdCardHTML(FD.f, FD.code, 'sc-btn sc-block') + '<p class="fd-staff">' + esc(t('fd_staff')) + '</p>');
    // a stranger should read the contact, not get the keyboard of the sign-in form
    setTimeout(() => { const a = document.activeElement; if (a && a.closest && a.closest('#app form')) a.blur(); window.scrollTo(0, 0); }, 60);
    return r;
  };
  window.FD_API = {fdLoad};
})();
