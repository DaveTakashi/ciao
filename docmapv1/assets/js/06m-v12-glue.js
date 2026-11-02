/* =====================================================================
   DocMap 2026 (DM26) — 06m-v12-glue.js (v12 integration)
   The three v12 streams were built in parallel and talk through feature-detected hooks. This file connects them:
     window.statusSearchHook   (contract in 04c-search.js) ← statuses of 02d-status.js / 06j-status.js
     window.archiveSearchHook  (contract in 04c-search.js) ← archives of 02e-archives.js
     window.dmAccessLast(kind, id) (read by sqLastSeen, 02d-status.js) ← "Chi l'ha visto" of 06k-access.js
   Every hook is defined only when the module it reads is loaded, and never throws (the search engine also swallows
   exceptions). Loaded on index.html after 06l-archives.js / 06j-status.js / 06k-access.js, and on scan.html last.
   ===================================================================== */
'use strict';

(function(){
  const fold = (s) => typeof srchFold === 'function' ? srchFold(s) : String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const events = () => (typeof S !== 'undefined' && S && Array.isArray(S.statusEvents)) ? S.statusEvents : [];
  const types = () => (typeof sqTypes === 'function' && typeof S !== 'undefined' && S) ? sqTypes(S.settings) : [];

  /* ---- statuses → search ('stato:<v>', facet "status", badge on the cards) ---- */
  if (typeof sqCurrent === 'function' && typeof window.statusSearchHook === 'undefined'){
    // words a user may type for a presence: 'stato:fuori', 'stato:mancante', 'stato:dentro'
    const PRESENCE_WORDS = { out:['fuori', 'out', 'preso', 'uscito', 'fuori archivio'], missing:['mancante', 'missing', 'non trovato', 'perso'], in:['dentro', 'in', 'in archivio', 'presente'] };
    const cur = (b) => b && b.id ? sqCurrent(events(), 'binder', b.id) : null;
    window.statusSearchHook = {
      statusOf(b){
        const ev = cur(b); if (!ev) return null;
        const ty = sqType(types(), ev.status_id), p = sqPresence(ev, types());
        return {id:ev.status_id, label:sqTypeLabel(ty || {id:ev.status_id}), cls:'sq-p-' + p};
      },
      match(b, v){
        const q = fold(v).trim(); if (!q) return null;
        const ty = types(), ev = cur(b), p = ev ? sqPresence(ev, ty) : 'none';
        if (p === 'out' || p === 'missing' || p === 'in'){ for (const k of Object.keys(PRESENCE_WORDS)) if (PRESENCE_WORDS[k].includes(q)) return p === k; }
        else if (Object.keys(PRESENCE_WORDS).some(k => PRESENCE_WORDS[k].includes(q))) return null;   // no movement recorded: the old archive_state (Fuori / Corrente…) decides
        if (q === 'ritardo' || q === 'scaduto' || q === 'overdue') return !!(ev && sqOverdue(ev, ty));
        const t1 = ty.find(x => fold(x.id) === q || fold(sqTypeLabel(x)) === q || fold(sqTypeLabel(x)).startsWith(q));
        if (!t1) return null;   // not a status word: the built-in rules (archive_state…) decide
        return !!(ev && ev.status_id === t1.id);
      },
      words(b){ const ev = cur(b); if (!ev) return ''; const ty = sqType(types(), ev.status_id); return [sqTypeLabel(ty || {id:ev.status_id}), ev.holder, ev.note].filter(Boolean).join(' '); },
      values(){ return types().filter(x => !x.disabled).map(x => ({id:x.id, label:sqTypeLabel(x)})); },
      chips(){ return [{q:'stato:fuori', label:(typeof t === 'function' ? t('sq_chip_out') : 'Fuori archivio')}]; }
    };
  }

  /* ---- archives → search ('archivio:<v>', facet "archive") ---- */
  if (typeof binderArchiveId === 'function' && typeof archById === 'function' && typeof window.archiveSearchHook === 'undefined'){
    const arch = (b) => { const id = binderArchiveId(b) || (typeof ARCH_DEFAULT_ID !== 'undefined' ? ARCH_DEFAULT_ID : ''); return archById(id); };
    window.archiveSearchHook = {
      archiveOf(b){ const a = arch(b); return a ? {id:a.id, label:archName(a)} : null; },
      match(b, v){ const q = fold(v).trim(); if (!q) return null; const a = arch(b); if (!a) return false; return fold(a.code) === q || fold(archName(a)) === q || fold(archName(a)).startsWith(q); },
      words(b){ const a = arch(b); return a ? [archName(a), a.code].filter(Boolean).join(' ') : ''; }
    };
  }

  /* ---- "who scanned / viewed it last" for the status card ---- */
  if (typeof window.dmAccessLast === 'undefined' && (typeof AC !== 'undefined' || typeof acLocalViews === 'function')){
    window.dmAccessLast = function(kind, id){
      try {
        const srv = typeof AC !== 'undefined' && AC.seen && AC.seen[id] && AC.seen[id].items && AC.seen[id].items[0];
        if (srv && srv.at) return {user:srv.user || '', at:srv.at, via:srv.via || ''};
        if (kind === 'binder' && typeof acLocalViews === 'function'){ const l = acLocalViews(id); const e = l[l.length - 1]; if (e) return {user:e.who || '', at:e.at, via:(e.details && e.details.via) || 'nav'}; }
      } catch(e){}
      return null;
    };
  }
})();

if (typeof I18N !== 'undefined'){
  Object.assign(I18N.it, { sq_chip_out:'Fuori archivio' });
  Object.assign(I18N.en, { sq_chip_out:'Out of the archive' });
}
