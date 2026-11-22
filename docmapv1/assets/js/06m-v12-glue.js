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
  // the phone page keeps the studio settings (custom status types) in SR.ph.settings, the PC in S.settings
  const settings = () => (typeof SR !== 'undefined' && SR && SR.ph && SR.ph.settings) || (typeof S !== 'undefined' && S ? S.settings : null) || {};
  const types = () => (typeof sqTypes === 'function' && typeof S !== 'undefined' && S) ? sqTypes(settings()) : [];

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
      words(b){ const a = arch(b); return a ? [archName(a), a.code].filter(Boolean).join(' ') : ''; },
      // v12.1: one quick chip per archive when the studio has more than one (phone search home)
      chips(){ return typeof archMulti === 'function' && archMulti() ? archList().map(a => ({q:'archivio:' + (a.code || archName(a)), label:archName(a)})) : []; }
    };
    /* v12.1, phone: the archive on each result card (only with several archives) */
    if (typeof srPhCardHTML === 'function' && typeof archMulti === 'function'){
      const base = srPhCardHTML;
      window.srPhCardHTML = function(b, marks){
        const h = base(b, marks); if (!archMulti()) return h;
        const a = arch(b); if (!a) return h;
        const badge = '<span class="sr-pc-ar" style="--ac:' + esc(a.color || '#475569') + '" title="' + esc(archName(a)) + '">' + esc(a.code || archName(a)) + '</span>';
        return h.replace(/(<b class="sr-pc-code">[\s\S]*?<\/b>)/, (m) => m + badge);
      };
    }
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

/* ---- v12.1: the top bar never overlaps ----
   The bar is one line (brand · navigation · pills on the right) and wraps only below 1180 px (css-info.css). With extra
   pills (server status "Accesso negato", "Da esportare", English labels) one line can be too short at any width: then the
   navigation would slide under the pills. dmTopbarFit measures and, when it does not fit, moves the navigation to its own
   row (class tb-wrap). Runs after every top-bar render, after a server status change and on resize. */
function dmTopbarFit(){
  const tb = document.getElementById('topbar'); if (!tb) return;
  tb.classList.remove('tb-wrap');
  const nav = tb.querySelector('.nav'), tr = tb.querySelector('.top-right');
  let over = tb.scrollWidth > tb.clientWidth + 1 || (nav && nav.scrollWidth > nav.clientWidth + 1);
  if (!over && nav && tr){ const kids = nav.children, last = kids[kids.length - 1]; if (last && last.getBoundingClientRect().right > tr.getBoundingClientRect().left - 4) over = true; }
  if (over) tb.classList.add('tb-wrap');
}
(function(){
  if (typeof renderTopbar === 'function' && document.getElementById('topbar')){
    const base = renderTopbar;
    window.renderTopbar = function(){ const r = base.apply(this, arguments); try { dmTopbarFit(); } catch(e){} return r; };
    try { renderTopbar = window.renderTopbar; } catch(e){}
  }
  if (typeof srvRender === 'function'){
    const base = srvRender;
    window.srvRender = function(){ const r = base.apply(this, arguments); try { dmTopbarFit(); } catch(e){} return r; };
    try { srvRender = window.srvRender; } catch(e){}
  }
  let tm = 0; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(dmTopbarFit, 60); });
})();

/* ---- v12.2 help topics: test the location mapping in 15 minutes, which sync to use ---- */
if (typeof HELP_TOPICS !== 'undefined' && Array.isArray(HELP_TOPICS) && !HELP_TOPICS.some(x => x.id === 'locations-test')){
  HELP_TOPICS.push({ id:'locations-test', guide:'locations', tags:['archive'], acts:['how'], pop:20, related:['locations', 'status'],
    title:{it:'Come provo la mappatura delle ubicazioni con i QR (15 minuti)?', en:'How do I try the location mapping with QR codes (15 minutes)?'},
    body:{
      it:'<ol><li><b>Informazioni › Ubicazioni › Crea in serie…</b>: premi il primo <b>esempio pronto</b> (un elemento per livello e 10 scatole) → <b>Crea</b>. Nascono le ubicazioni con codici e QR; il riepilogo sotto dice quante.</li>' +
        '<li>Spunta 2-3 scatole → <b>Stampa etichette</b> (anche su carta normale) e incollale su tre scatole vere o su tre fogli.</li>' +
        '<li>Stampa anche le etichette di 6 faldoni di prova (Archivio, spunta, <b>Stampa etichette</b>).</li>' +
        '<li><b>Dal PC</b>: <b>Modalità associazione</b> → con la webcam o un lettore USB leggi il QR della scatola 1, poi 3 faldoni; poi la scatola 2 e altri 3 faldoni.</li>' +
        '<li><b>Dal telefono</b> (versione online): inquadra il QR di una scatola → <b>Avvia associazione qui</b> → inquadra un faldone.</li>' +
        '<li>Controlla: in Archivio la colonna ubicazione mostra <span class="kbd">MAG1-A1-B01</span>; inquadrando il QR di un faldone il telefono dice <b>Dov\'è?</b>; il QR di un <b>contenitore</b> (armadio, scaffale) dice "compresi quelli nelle scatole interne".</li>' +
        '<li>Prova anche <b>Applica a tutta la scatola</b> → <b>Preso</b> e poi <b>Verifica rientro</b> lasciando fuori un faldone: risulta <b>Mancante</b>.</li>' +
        '<li>Finito: puoi eliminare le ubicazioni di prova dall\'albero (o tenerle). Tutto è nel Registro attività e si annulla.</li></ol>',
      en:'<ol><li><b>Information › Locations › Create in series…</b>: press the first <b>ready-made</b> example (one item per level and 10 boxes) → <b>Create</b>. The locations get codes and QR; the summary below says how many.</li>' +
        '<li>Tick 2-3 boxes → <b>Print labels</b> (plain paper is fine) and stick them on three real boxes or sheets.</li>' +
        '<li>Print the labels of 6 test binders too (Archive, tick, <b>Print labels</b>).</li>' +
        '<li><b>On the PC</b>: <b>Association mode</b> → with the webcam or a USB scanner read box 1, then 3 binders; then box 2 and 3 more binders.</li>' +
        '<li><b>On the phone</b> (online version): point at a box QR → <b>Start association here</b> → point at a binder.</li>' +
        '<li>Check: in Archive the location column shows <span class="kbd">MAG1-A1-B01</span>; scanning a binder QR the phone shows <b>Where is it?</b>; the QR of a <b>container</b> (cabinet, shelf) says "those in the nested boxes included".</li>' +
        '<li>Also try <b>Apply to the whole box</b> → <b>Taken</b>, then <b>Return check</b> leaving one binder out: it shows as <b>Missing</b>.</li>' +
        '<li>Done: delete the test locations from the tree (or keep them). Everything is in the Activity log and can be undone.</li></ol>'
    }});
  HELP_TOPICS.push({ id:'sync-guide', guide:null, tags:['online', 'export', 'import'], acts:['how'], pop:45, related:['sync', 'server'],
    title:{it:'Quale sincronizzazione uso tra PC locale, web app e telefoni?', en:'Which sync do I use between the local PC, the web app and phones?'},
    body:{
      it:'<p><b>Con il server online (consigliato)</b>: sul PC, ⚙ Sincronizzazione › riquadro <b>Server online</b> → indirizzo e codice di accesso → <b>Sincronizza con il server</b>. Lo stesso pulsante manda le tue modifiche al web e riceve quelle di web app e telefoni. La prima volta, a server vuoto, conferma <b>Carica il mio archivio sul server (prima volta)</b>. Web app e telefoni si sincronizzano da soli.</p>' +
        '<p><b>Senza server</b>: <b>Scambio con un file</b> — esporti un file cifrato da una parte (PC: <b>Copia export per web app</b>; web app: <b>Esporta per il client locale</b>) e lo importi dall\'altra con <b>Analizza</b> → <b>Applica</b>.</p><p>Guida completa: <span class="kbd">docs/GUIDA-SINCRONIZZAZIONE.md</span>.</p>',
      en:'<p><b>With the online server (recommended)</b>: on the PC, ⚙ Sync › <b>Online server</b> box → address and access code → <b>Sync with the server</b>. The same button sends your changes to the web and receives those of the web app and phones. The first time, with an empty server, confirm <b>Upload my archive to the server (first time)</b>. The web app and phones sync by themselves.</p>' +
        '<p><b>Without a server</b>: <b>File exchange</b> — export an encrypted file on one side (PC: <b>Export for the web app</b>; web app: <b>Export for the local client</b>) and import it on the other with <b>Analyse</b> → <b>Apply</b>.</p><p>Full guide: <span class="kbd">docs/GUIDA-SINCRONIZZAZIONE.md</span>.</p>'
    }});
}

if (typeof I18N !== 'undefined'){
  Object.assign(I18N.it, { sq_chip_out:'Fuori archivio' });
  Object.assign(I18N.en, { sq_chip_out:'Out of the archive' });
}
