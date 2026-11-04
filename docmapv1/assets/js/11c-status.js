/* =====================================================================
   DocMap 2026 — v12 (stream Q): statuses on the phone page (scan.html, after 11b-assoc.js)
   Model: 02d-status.js · desktop: 06j-status.js · CSS: assets/css-status.css (sqp-* classes).

   - Binder page: a status card on top ("Preso da Mario · da 2 giorni" / "In archivio", last scan or last action) with
     2–4 big context-aware buttons and "Altro…"; a document of the contents list is tapped for its own status.
     One tap for types that ask nothing (holder 'me' is prefilled), else a second tap on a short prefilled form.
     10 s "Annulla" bar (a compensating event: the log stays append-only).
   - Box (location) page: "Applica a tutta la scatola" (the box + every binder in it, one batch) and "Verifica rientro":
     scan the binders that came back (camera, typed code, or the phone's own camera app opening their QR), live
     counters, finish → returned / missing events + a 'status.verify' activity-log line (report, CSV download).
   Providers (10-auth.js classes, extended here):
     LocalDataProvider.getStatus() → {events, types}            (whole state: same browser as the desktop)
     LocalDataProvider.addStatusEvents(events, entry)            → writes st.statusEvents + the pending log line
     RemoteDataProvider.addStatusEvents(events, entry)           → POST ?r=push {records:[{type:'status_event'…}], activity_log:[entry]}
     The server's binder / location responses carry status_events + status_types (v12; absent on an older server).
   Local storage (this phone only):
     docmap_v26_scan_status_outbox  [{id, events, entry, at}]   remote mode, waiting for the network
     docmap_v26_status_verify       {v, user, box:{id, code, short_code}, startedAt, at, expected:[{id, code, company, short_code}], found:[id], extra:[{id, code}]}
   ===================================================================== */
'use strict';

if (typeof SC !== 'undefined' && typeof scRoute === 'function'){
  (function(){
    Object.assign(I18N.it, {
      sqp_cap:'Stato', sqp_more:'Altro…', sqp_undo:'Annulla', sqp_done:'{s}: {c}', sqp_undone:'Annullato', sqp_ro:'Solo consultazione: lo stato lo cambia chi ha un utente di modifica.',
      sqp_offline:'Senza rete: lo stato è salvato sul telefono e parte appena torna la connessione.', sqp_wait:'{n} stati in attesa di invio', sqp_err:'Stato non salvato: {m}',
      sqp_old:'Il server va aggiornato a DocMap v12 per mostrare gli stati sui telefoni (quelli registrati arrivano comunque al PC col registro attività).',
      sqp_docs_tip:'Tocca un documento per segnarne lo stato.', sqp_doc:'Documento', sqp_cancel:'Chiudi', sqp_confirm:'Conferma', sqp_back:'Indietro', sqp_pick:'Scegli lo stato',
      sqp_box_cap:'Stato della scatola', sqp_box_all:'Applica a tutta la scatola', sqp_box_n:'la scatola e i {n} faldoni che contiene', sqp_box_nn:'la scatola e i {n} faldoni che contiene, compresi quelli nelle scatole interne', sqp_verify:'Verifica rientro',
      sqp_vf_h:'Verifica rientro', sqp_vf_p:'Scansiona il QR di ogni faldone tornato nella scatola. Alla fine DocMap segna i trovati come rientrati e ti dice cosa manca.',
      sqp_vf_found:'Trovati', sqp_vf_missing:'Mancano', sqp_vf_extra:'In più', sqp_vf_cam:'Usa la fotocamera', sqp_vf_cam_off:'Spegni la fotocamera', sqp_vf_typed:'Oppure scrivi il codice', sqp_vf_typed_ph:'es. BL12 o dm26…',
      sqp_vf_ok:'{c} trovato', sqp_vf_dup:'{c} già contato', sqp_vf_unexp:'{c} non era atteso in questa scatola', sqp_vf_unknown:'QR non riconosciuto: {c}', sqp_vf_loc:'È il QR di una scatola: scansiona i faldoni.',
      sqp_vf_finish:'Fine verifica', sqp_vf_abort:'Annulla verifica', sqp_vf_mark:'Segna i {n} mancanti come "{s}"', sqp_vf_mark1:'Segna il mancante come "{s}"', sqp_vf_go:'Salva la verifica', sqp_vf_none:'Nessun faldone atteso in questa scatola.',
      sqp_vf_saved:'Verifica salvata: {f} trovati, {m} mancanti, {u} in più.', sqp_vf_csv:'Scarica il report (CSV)', sqp_vf_close:'Chiudi', sqp_vf_active:'Verifica rientro in corso: {b}', sqp_vf_open:'Torna alla verifica',
      sqp_vf_count:'{f} di {n}', sqp_vf_left:'Mancano ancora: {l}'
    });
    Object.assign(I18N.en, {
      sqp_cap:'Status', sqp_more:'More…', sqp_undo:'Undo', sqp_done:'{s}: {c}', sqp_undone:'Undone', sqp_ro:'Read only: the status is changed by users who can edit.',
      sqp_offline:'No network: the status is saved on the phone and sent as soon as the connection is back.', sqp_wait:'{n} statuses waiting to be sent', sqp_err:'Status not saved: {m}',
      sqp_old:'The server must be updated to DocMap v12 to show statuses on phones (recorded ones still reach the PC with the activity log).',
      sqp_docs_tip:'Tap a document to set its status.', sqp_doc:'Document', sqp_cancel:'Close', sqp_confirm:'Confirm', sqp_back:'Back', sqp_pick:'Pick the status',
      sqp_box_cap:'Status of the box', sqp_box_all:'Apply to the whole box', sqp_box_n:'the box and the {n} binders in it', sqp_box_nn:'the box and the {n} binders in it, those in the nested boxes included', sqp_verify:'Return check',
      sqp_vf_h:'Return check', sqp_vf_p:'Scan the QR of every binder that came back into the box. At the end DocMap marks the found ones as returned and tells you what is missing.',
      sqp_vf_found:'Found', sqp_vf_missing:'Missing', sqp_vf_extra:'Extra', sqp_vf_cam:'Use the camera', sqp_vf_cam_off:'Turn the camera off', sqp_vf_typed:'Or type the code', sqp_vf_typed_ph:'e.g. BL12 or dm26…',
      sqp_vf_ok:'{c} found', sqp_vf_dup:'{c} already counted', sqp_vf_unexp:'{c} was not expected in this box', sqp_vf_unknown:'Unknown QR: {c}', sqp_vf_loc:'That is a box QR: scan the binders.',
      sqp_vf_finish:'Finish check', sqp_vf_abort:'Cancel check', sqp_vf_mark:'Mark the {n} missing ones as "{s}"', sqp_vf_mark1:'Mark the missing one as "{s}"', sqp_vf_go:'Save the check', sqp_vf_none:'No binder expected in this box.',
      sqp_vf_saved:'Check saved: {f} found, {m} missing, {u} extra.', sqp_vf_csv:'Download the report (CSV)', sqp_vf_close:'Close', sqp_vf_active:'Return check in progress: {b}', sqp_vf_open:'Back to the check',
      sqp_vf_count:'{f} of {n}', sqp_vf_left:'Still missing: {l}'
    });
    const SQP_OUTBOX_LS = 'docmap_v26_scan_status_outbox', SQP_VF_LS = 'docmap_v26_status_verify', SQP_DEV_LS = 'docmap_v26_scan_device', SQP_VF_IDLE_MS = 4 * 3600 * 1000;
    const SQP = { ev:[], types:sqDefaultTypes(), ok:true, raw:null, sheet:null, undo:null, undoTimer:0, msg:null, vf:null, vfMsg:null, vfDone:null, cam:null, busy:false, loadedFor:'' };
    window.SQP = SQP;   // tests and debugging

    /* ---------------- helpers ---------------- */
    const sqpWho = () => { const u = SC.P && SC.P.auth.currentUser() || {}; return u.display_name || u.username || 'Mobile'; };
    const sqpUserKey = () => { const u = SC.P && SC.P.auth.currentUser(); return u ? (u.username || u.id || '') : ''; };
    function sqpDevice(){ let d = ''; try { d = localStorage.getItem(SQP_DEV_LS) || ''; if (!d){ d = 'phone-' + uuid().slice(0, 8); localStorage.setItem(SQP_DEV_LS, d); } } catch(e){ d = 'phone'; } return d; }
    const sqpCan = () => !!(SC.user && SC.P && SC.P.auth.can('edit'));
    const sqpDocText = (it) => (it.year ? it.year + ': ' : '') + (it.description || '');
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch(e){ return d; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
    function sqpOutbox(){ const q = lsGet(SQP_OUTBOX_LS, []); return Array.isArray(q) ? q : []; }
    function sqpDownload(name, text){
      try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch(e){}
    }

    /* ---------------- providers ---------------- */
    LocalDataProvider.prototype.getStatus = async function(){
      const {st} = await this.readState();
      return {events:sqNormEvents(st && st.statusEvents), types:sqTypes(st && st.settings), ok:true};
    };
    /** Same browser as the desktop: write the events into the stored state (keeping the previous copy) + one pending log line. */
    LocalDataProvider.prototype.addStatusEvents = async function(events, entry){
      const {raw, st} = await this.readState();
      if (!st) throw new DMError('not_found');
      st.statusEvents = sqNormEvents(st.statusEvents); sqMergeEvents(st.statusEvents, events);
      st.hasUnexportedChanges = true;
      try { if (DocMapVault.isActive()) await DocMapVault.saveState(st); else { if (raw) localStorage.setItem(LS_PREV, raw); localStorage.setItem(LS_KEY, JSON.stringify(st)); } }
      catch(e){ throw new DMError('storage', 'quota'); }
      // the desktop picks the line up live (10-auth mobileLiveMerge → logMerge, 06j merges details.events) or at boot
      try { if (DocMapVault.isActive()) await DocMapVault.appendLog(entry); else { const p = lsGetJSON('docmap_v26_log_pending', []); (Array.isArray(p) ? p : []).push(entry); lsSetJSON('docmap_v26_log_pending', p); } } catch(e){}
      return {ok:true};
    };
    /** Shared online database: one push with the events as records and the log line. An older server rejects the
        records as 'invalid' but keeps the log line, whose details.events reach the desktops anyway (06j logMerge). */
    RemoteDataProvider.prototype.addStatusEvents = async function(events, entry){
      const r = await this.srv.call('push', {method:'POST', body:{records:events.map(e => ({type:'status_event', id:e.id, updated_at:e.at, data:sqRecData(e)})), tombstones:[], activity_log:[entry], deviceId:sqpDevice(), operator:entry.who}});
      const bad = (r.rejected || []).filter(x => x.type === 'status_event');
      return {ok:!bad.length, old:bad.some(x => x.reason === 'invalid')};
    };
    // keep the raw binder response: status_events, status_types and (stream A) last_scan / last_view / access
    const callBase = DMServer.prototype.call;
    DMServer.prototype.call = async function(route){ const j = await callBase.apply(this, arguments); if (route === 'binder' && j && j.binder) SQP.rawBinder = j; return j; };

    /* ---------------- loading ---------------- */
    function sqpTargetsShown(){ return SC.view === 'card' && SC.rec ? {kind:'binder', id:SC.rec.binder.id} : SC.view === 'location' && SC.loc ? {kind:'location', id:SC.loc.location.id} : null; }
    /** Events + types for the page shown: local state, or the server response; plus what still waits in the outbox. */
    async function sqpLoad(){
      SQP.raw = null;
      if (!SC.user) return;
      try {
        if (!SC.P.server){ const s = await SC.P.data.getStatus(); SQP.ev = s.events; SQP.types = s.types; SQP.ok = true; }
        else {
          const r = SC.view === 'location' ? SC.loc : (SQP.rawBinder && SC.rec && SQP.rawBinder.binder && SQP.rawBinder.binder.id === SC.rec.binder.id ? SQP.rawBinder : null);
          SQP.raw = r;
          SQP.ok = !!(r && Array.isArray(r.status_events));
          SQP.ev = sqNormEvents(r && r.status_events);
          SQP.types = sqTypes({statusTypes:r && r.status_types});
        }
      } catch(e){ SQP.ev = []; }
      sqpOutbox().forEach(x => sqMergeEvents(SQP.ev, x.events));
      if (SQP.local) sqMergeEvents(SQP.ev, SQP.local);   // recorded on this page (an older server does not return them)
    }

    /* ---------------- recording ---------------- */
    function sqpEntry(action, target, summary, details){ return {id:uuid(), at:nowISO(), who:sqpWho(), action, target, summary, details, source:MOBILE_LOG_SOURCE}; }
    /** Append events (one per target), send them with one log line; offline → outbox. Returns the events or null. */
    async function sqpRecord(targets, ty, vals, opts){
      opts = opts || {}; vals = vals || {};
      if (!sqpCan() || !targets.length) return null;
      const batch = targets.length > 1 ? 'sb-' + uuid() : '', ctx = {user:sqpWho(), device:sqpDevice(), events:SQP.ev}, events = [];
      targets.forEach(tg => { const e = opts.undoOf ? sqUndoEvent(tg, ctx) : sqNewEvent({target_type:tg.target_type, target_id:tg.target_id, doc_id:tg.doc_id || '', status_id:ty.id, holder:vals.holder || '', due_date:vals.due_date || '', date:vals.date || '',
        note:vals.note || '', via:opts.via || 'scan', box_id:opts.box ? opts.box.id : (tg.box_id || ''), batch_id:batch, code:tg.code || '', doc_text:tg.doc_text || ''}, ctx); if (e){ events.push(e); ctx.events = SQP.ev.concat(events); } });
      if (!events.length && !opts.entry) return null;
      const label = ty ? sqTypeLabel(ty) : t('sqp_undone'), first = events[0];
      const what = (e) => e.target_type === 'document' ? e.code + ' › ' + e.doc_text : e.target_type === 'location' ? 'scatola ' + e.code : e.code;
      const action = opts.action || (opts.undoOf ? 'status.undo' : opts.box ? 'status.box' : 'status.set');
      const entry = opts.entry || sqpEntry(action, opts.box ? {type:'location', id:opts.box.id, code:opts.box.code} : first.target_type === 'location' ? {type:'location', id:first.target_id, code:first.code} : {type:'binder', id:first.target_id, code:first.code},
        (opts.undoOf ? 'Annullato da telefono lo stato di ' : 'Stato "' + label + '"' + (vals.holder ? ' (' + vals.holder + ')' : '') + ' da telefono: ') + events.map(what).join(', ').slice(0, 200) + (events.length > 1 ? ' — ' + events.length + ' oggetti' : ''),
        {status:ty ? ty.id : '', holder:vals.holder || '', due_date:vals.due_date || '', note:vals.note || '', count:events.length, batch_id:batch, via:opts.via || 'scan', device:sqpDevice(), events:[]});
      entry.details.events = events.map(sqRecData);
      SQP.busy = true;
      try {
        const r = await SC.P.data.addStatusEvents(events, entry);
        if (r && r.old) SQP.ok = false;
      } catch(e){
        SQP.busy = false;
        if (e.code === 'offline'){ const q = sqpOutbox(); q.push({id:uuid(), events:events.map(sqRecData), entry, at:nowISO()}); lsSet(SQP_OUTBOX_LS, q); SQP.msg = {kind:'warn', text:t('sqp_offline')}; }
        else { SQP.msg = {kind:'err', text:t('sqp_err', {m:e.message || e.code})}; return null; }
      }
      SQP.busy = false;
      (SQP.local || (SQP.local = [])).push(...events);
      sqMergeEvents(SQP.ev, events);
      return events;
    }
    function sqpUndoStart(events, text){
      clearTimeout(SQP.undoTimer);
      SQP.undo = events && events.length && !events[0].undo_of ? {events, text, until:Date.now() + SQ_UNDO_MS} : null;
      if (SQP.undo) SQP.undoTimer = setTimeout(() => { SQP.undo = null; const u = document.getElementById('sqp-undo'); if (u) u.remove(); }, SQ_UNDO_MS);
    }
    async function sqpUndo(){
      const u = SQP.undo; if (!u) return;
      SQP.undo = null; clearTimeout(SQP.undoTimer);
      const ev = await sqpRecord(u.events, null, {}, {undoOf:true, via:'undo'});
      if (ev){ SQP.msg = SQP.msg && SQP.msg.kind === 'warn' ? SQP.msg : {kind:'ok', text:t('sqp_undone')}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); }
      scRender();
    }

    /* ---------------- targets of the page ---------------- */
    const tgBinder = (b) => ({target_type:'binder', target_id:b.id, code:b.speaking_code});
    const tgDoc = (b, it) => ({target_type:'document', target_id:b.id, doc_id:it.id, code:b.speaking_code, doc_text:sqpDocText(it)});
    const tgBox = (l) => ({target_type:'location', target_id:l.id, code:l.code || ''});
    /** v12.1: binders directly in the box + those in the boxes nested in it (server field nested_binders; absent before v12.1). */
    const sqpBoxAll = (r) => (r.binders || []).concat(Array.isArray(r.nested_binders) ? r.nested_binders : []);
    function sqpBoxTargets(){
      const r = SC.loc, l = r.location;
      return [tgBox(l)].concat(sqpBoxAll(r).map(b => ({target_type:'binder', target_id:b.id, code:b.speaking_code, box_id:l.id})));
    }

    /* ---------------- sheet (bottom overlay) ---------------- */
    /** ctx: {targets, kind:'binder'|'document'|'box', title, cur, client, box, via} */
    function sqpOpen(ctx){ SQP.sheet = Object.assign({step:'pick', all:false, ty:null, vals:{}}, ctx); sqpSheetDraw(); }
    function sqpClose(){ SQP.sheet = null; const o = document.getElementById('sqp-ov'); if (o) o.remove(); document.body.classList.remove('sqp-lock'); }
    function sqpDefaults(ty, ctx){ return {holder:ty.needs_holder === 'me' ? sqpWho() : ty.needs_holder === 'client' ? (ctx.client || '') : '', due_date:'', date:ty.needs_date ? sqToday() : '', note:''}; }
    function sqpHolders(ty){
      const seen = new Map(), add = (v) => { v = String(v || '').trim(); if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v); };
      if (ty.needs_holder === 'me') add(sqpWho());
      if (ty.needs_holder === 'client' && SQP.sheet) add(SQP.sheet.client);
      SQP.ev.slice().reverse().forEach(e => { const x = sqType(SQP.types, e.status_id); if (x && x.needs_holder === ty.needs_holder && seen.size < 60) add(e.holder); });
      return Array.from(seen.values());
    }
    function sqpSheetDraw(){
      const X = SQP.sheet; if (!X) return sqpClose();
      let o = document.getElementById('sqp-ov');
      if (!o){ o = document.createElement('div'); o.id = 'sqp-ov'; o.className = 'sqp-ov'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); document.body.appendChild(o); document.body.classList.add('sqp-lock'); }
      const types = SQP.types;
      let body = '';
      if (X.step === 'pick'){
        const list = X.all ? sqTypesFor(types, X.kind) : (X.targets.length === 1 ? sqQuickFor(types, X.kind, X.cur, 4) : sqTypesFor(types, X.kind).filter(x => x.quick));
        body = '<div class="sqp-grid">' + list.map(ty => '<button type="button" class="sqp-tbtn" data-s="sqp-pick" data-id="' + esc(ty.id) + '" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '<span>' + esc(sqTypeLabel(ty)) + '</span></button>').join('') +
          (X.all ? '' : '<button type="button" class="sqp-tbtn sqp-more" data-s="sqp-all">' + sqIc('more') + '<span>' + esc(t('sqp_more')) + '</span></button>') + '</div>';
      } else {
        const ty = X.ty, n = sqNeeds(ty), v = X.vals, opt = (k) => k === 'optional' ? ' <small>(' + esc(t('sq_optional')) + ')</small>' : '';
        body = '<div class="sqp-chosen" style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '<b>' + esc(sqTypeLabel(ty)) + '</b><button type="button" class="sqp-link" data-s="sqp-back">' + esc(t('sqp_back')) + '</button></div>' +
          '<form class="sqp-form" data-s="sqp-form">' +
          (n.holder ? '<label class="sc-field"><span>' + esc(t(ty.needs_holder === 'client' ? 'sq_holder_client' : ty.needs_holder === 'entity' ? 'sq_holder_entity' : 'sq_holder')) + '</span><input id="sqp-holder" data-sqp="holder" value="' + esc(v.holder || '') + '" list="sqp-holders" autocomplete="off"><datalist id="sqp-holders">' + sqpHolders(ty).map(h => '<option value="' + esc(h) + '">').join('') + '</datalist></label>' : '') +
          (n.due ? '<label class="sc-field"><span>' + esc(t('sq_due_date')) + opt(n.due) + '</span><input type="date" id="sqp-due" data-sqp="due_date" value="' + esc(v.due_date || '') + '"></label>' : '') +
          (n.date ? '<label class="sc-field"><span>' + esc(t('sq_date')) + opt(n.date) + '</span><input type="date" id="sqp-date" data-sqp="date" value="' + esc(v.date || '') + '"></label>' : '') +
          (n.note ? '<label class="sc-field"><span>' + esc(t('sq_note')) + opt(n.note) + '</span><textarea id="sqp-note" data-sqp="note" rows="2">' + esc(v.note || '') + '</textarea></label>' : '') +
          '<div class="sc-err" id="sqp-err" role="alert"></div><button type="submit" class="sc-btn sc-primary sc-block" id="sqp-go">' + sic('check') + esc(t('sqp_confirm')) + '</button></form>';
      }
      o.innerHTML = '<div class="sqp-bg" data-s="sqp-close"></div><div class="sqp-sheet"><div class="sqp-sh-h"><div><span class="sqp-cap">' + esc(X.step === 'pick' ? t('sqp_pick') : t('sqp_cap')) + '</span><b>' + esc(X.title) + '</b></div>' +
        '<button type="button" class="sc-icon sqp-x" data-s="sqp-close" aria-label="' + esc(t('sqp_cancel')) + '">' + sqIc('x') + '</button></div>' +
        (X.cur !== undefined && X.targets.length === 1 && X.step === 'pick' ? '<div class="sqp-sh-now">' + sqpBadge(X.cur) + '</div>' : '') + body + '</div>';
      if (X.step === 'form') setTimeout(() => { const f = o.querySelector('[data-sqp]'); if (f && !f.value) f.focus(); }, 40);
    }
    function sqpPick(id){
      const X = SQP.sheet; if (!X) return;
      const ty = sqType(SQP.types, id); if (!ty) return;
      X.ty = ty; X.vals = sqpDefaults(ty, X);
      if (sqNeeds(ty).oneTap) return sqpGo();
      X.step = 'form'; sqpSheetDraw();
    }
    async function sqpGo(){
      const X = SQP.sheet; if (!X || !X.ty || SQP.busy) return;
      document.querySelectorAll('#sqp-ov [data-sqp]').forEach(el => { X.vals[el.dataset.sqp] = el.value; });
      const err = sqCheck(X.ty, X.vals); if (err){ const e = document.getElementById('sqp-err'); if (e) e.textContent = t(err); return; }
      sqpClose(); SQP.msg = null;
      const ev = await sqpRecord(X.targets, X.ty, X.vals, {via:X.via || 'scan', box:X.box});
      if (ev){
        const first = ev[0], c = first.target_type === 'document' ? first.doc_text : X.box ? X.box.code : first.code;
        sqpUndoStart(ev, t('sqp_done', {s:sqTypeLabel(X.ty), c}));
        if (typeof dmScanFeedback === 'function') dmScanFeedback('ok');
      }
      scRender();
    }

    /* ---------------- rendering ---------------- */
    function sqpBadge(ev, short){
      const ty = ev ? sqType(SQP.types, ev.status_id) : null, p = sqPresence(ev, SQP.types);
      return '<span class="sqp-badge p-' + p + (sqOverdue(ev, SQP.types) ? ' od' : '') + '" style="--sq:' + esc(ty ? ty.color : '#059669') + '"' + (ev ? ' title="' + esc(sqHeadline(ev, SQP.types) + ' · ' + sqSubline(ev, SQP.types)) + '"' : '') + '>' + sqIc(ty ? ty.icon : 'in') +
        '<span>' + esc(!ev ? t('sq_p_none') : short ? sqTypeLabel(ty || {id:ev.status_id}) : sqHeadline(ev, SQP.types)) + '</span></span>';
    }
    function sqpMsgHTML(){
      const m = SQP.msg, u = SQP.undo && SQP.undo.until > Date.now() ? SQP.undo : null, w = sqpOutbox().length;
      return (u ? '<div class="sqp-undo" id="sqp-undo" role="status">' + sic('check') + '<span>' + esc(u.text) + '</span><button type="button" data-s="sqp-undo" id="sqp-undo-btn">' + sqIc('undo') + esc(t('sqp_undo')) + '</button><i style="animation-duration:' + Math.max(0, u.until - Date.now()) + 'ms"></i></div>' : '') +
        (m ? '<div class="sc-msg ' + esc(m.kind) + ' sqp-msg" id="sqp-msg" role="status">' + sic(m.kind === 'ok' ? 'check' : 'alert') + '<span>' + esc(m.text) + '</span></div>' : '') +
        (w ? '<div class="sqp-wait" id="sqp-wait">' + sqIc('clock') + esc(t('sqp_wait', {n:w})) + '</div>' : '');
    }
    /** The big status card of a target (binder or box). */
    function sqpCardHTML(kind, cur, seen, quick, extra){
      const ty = cur ? sqType(SQP.types, cur.status_id) : null, p = sqPresence(cur, SQP.types), od = sqOverdue(cur, SQP.types);
      const last = seen ? t('sq_last_scan', {u:seen.user, w:sqWhen(seen.at)}) : cur ? t('sq_last_act', {s:ty ? sqTypeLabel(ty) : cur.status_id, u:cur.user, w:sqWhen(cur.at)}) : '';
      return '<section class="sc-card sqp-card p-' + p + (od ? ' od' : '') + '" id="sqp-card" style="--sq:' + esc(ty ? ty.color : '#059669') + '" aria-live="polite">' +
        '<div class="sqp-now"><span class="sqp-dot">' + sqIc(ty ? ty.icon : 'in') + '</span><div class="sqp-now-t"><span class="sqp-cap">' + esc(kind === 'box' ? t('sqp_box_cap') : t('sqp_cap')) + '</span>' +
          '<div class="sqp-head" id="sqp-head">' + esc(cur ? sqHeadline(cur, SQP.types) : t('sq_p_none')) + '</div>' + (cur ? '<div class="sqp-sub" id="sqp-sub">' + esc(sqSubline(cur, SQP.types)) + '</div>' : '') + (cur && cur.note ? '<div class="sqp-note">' + esc(cur.note) + '</div>' : '') + '</div></div>' +
        (last ? '<div class="sqp-seen" id="sqp-seen">' + sqIc('clock') + '<span>' + esc(last) + '</span></div>' : '') +
        (!SQP.ok ? '<div class="sqp-old">' + esc(t('sqp_old')) + '</div>' : '') +
        sqpMsgHTML() +
        (sqpCan() ? (quick || '') : '<div class="sqp-ro">' + sic('lock') + esc(t('sqp_ro')) + '</div>') + (extra || '') + '</section>';
    }
    function sqpQuickHTML(kind, cur, data){
      const list = sqQuickFor(SQP.types, kind, cur, 3);
      return '<div class="sqp-q">' + list.map(ty => '<button type="button" class="sqp-qbtn" data-s="sqp-quick" data-st="' + esc(ty.id) + '"' + (data || '') + ' style="--sq:' + esc(ty.color) + '">' + sqIc(ty.icon) + '<span>' + esc(sqTypeLabel(ty)) + '</span></button>').join('') +
        '<button type="button" class="sqp-qbtn sqp-more" data-s="sqp-other"' + (data || '') + '>' + sqIc('more') + '<span>' + esc(t('sqp_more')) + '</span></button></div>';
    }
    function sqpDecorateCard(){
      const b = SC.rec.binder, cur = sqCurrent(SQP.ev, 'binder', b.id), hero = document.querySelector('#app .sc-hero');
      if (!hero || document.getElementById('sqp-card')) return;
      hero.insertAdjacentHTML('afterend', sqpVfBannerHTML() + sqpCardHTML('binder', cur, sqLastSeen('binder', b.id, SQP.raw), sqpQuickHTML('binder', cur)));
      // documents: their status and a tap target
      const docs = sqDocCurrents(SQP.ev, b.id), items = b.contents_items || [];
      document.querySelectorAll('#sc-items > li').forEach((li, i) => {
        const it = items[i]; if (!it || !it.id) return;
        const e = docs.get(it.id);
        if (e){ const chip = li.querySelector('.sc-ci'), h = sqpBadge(e, true); if (chip) chip.outerHTML = h; else li.insertAdjacentHTML('beforeend', h); }   // the status replaces the old "in archivio / in uso" chip
        if (sqpCan()){ li.classList.add('sqp-tap'); li.dataset.s = 'sqp-doc'; li.dataset.doc = it.id; li.setAttribute('role', 'button'); li.tabIndex = 0; }
      });
      const ul = document.getElementById('sc-items'); if (ul && sqpCan() && items.length) ul.insertAdjacentHTML('beforebegin', '<p class="sqp-tip" id="sqp-tip">' + esc(t('sqp_docs_tip')) + '</p>');
    }
    function sqpDecorateLoc(){
      const r = SC.loc, l = r.location, cur = sqCurrent(SQP.ev, 'location', l.id), hero = document.querySelector('#app .sa-hero');
      if (!hero || document.getElementById('sqp-card')) return;
      const n = sqpBoxAll(r).length;
      const btns = '<div class="sqp-box-acts"><button type="button" class="sc-btn sc-primary sc-block" data-s="sqp-box" id="sqp-box">' + sqIc('box') + esc(t('sqp_box_all')) + '</button>' +
        '<button type="button" class="sc-btn sc-block" data-s="sqp-vf-start" id="sqp-vf-start">' + sqIc('scan') + esc(t('sqp_verify')) + '</button></div>';
      hero.insertAdjacentHTML('afterend', sqpVfBannerHTML() + sqpCardHTML('box', cur, sqLastSeen('location', l.id, SQP.raw), btns, n ? '<p class="sqp-tip" id="sqp-box-n">' + esc(t((r.nested_binders || []).length ? 'sqp_box_nn' : 'sqp_box_n', {n})) + '</p>' : ''));
      const list = document.querySelectorAll('#sa-binders > li');
      (r.binders || []).forEach((b, i) => { const e = sqCurrent(SQP.ev, 'binder', b.id), li = list[i]; if (e && li){ const a = li.querySelector('.sa-l-t'); if (a) a.insertAdjacentHTML('afterend', sqpBadge(e, true)); } });
    }

    /* ---------------- return check ("Verifica rientro") ---------------- */
    function sqpVfLoad(){
      let v = lsGet(SQP_VF_LS, null);
      if (v && (!v.box || !v.box.id || !Array.isArray(v.expected))) v = null;
      if (v && Date.now() - (+v.at || 0) > SQP_VF_IDLE_MS) v = null;
      if (v && SC.user && v.user && v.user !== sqpUserKey()) v = null;
      if (!v) lsSet(SQP_VF_LS, null);
      SQP.vf = v; return v;
    }
    function sqpVfSave(){ if (SQP.vf){ SQP.vf.at = Date.now(); lsSet(SQP_VF_LS, SQP.vf); } }
    function sqpVfClear(){ SQP.vf = null; lsSet(SQP_VF_LS, null); }
    function sqpVfStart(){
      const r = SC.loc, l = r.location;
      const expected = sqVerifyExpected(l.id, sqpBoxAll(r), SQP.ev, SQP.types);
      if (typeof SA_API !== 'undefined' && SA_API.saClear) SA_API.saClear();   // association mode off: a check must not move binders
      SQP.vf = {v:1, user:sqpUserKey(), box:{id:l.id, code:l.code || '', short_code:l.short_code || ''}, startedAt:nowISO(), at:Date.now(), expected, found:[], extra:[]};
      sqpVfSave(); SQP.vfMsg = null; SQP.vfDone = null; SC.view = 'sqverify'; scRender(); window.scrollTo(0, 0);
    }
    const sqpVfCounts = (v) => { const f = v.expected.filter(x => v.found.includes(x.id)).length; return {f, n:v.expected.length, m:v.expected.length - f, u:v.extra.length}; };
    /** One scanned / typed code during the check. rec: an already loaded binder record (native camera flow). */
    async function sqpVfHandle(text, rec){
      const v = SQP.vf; if (!v) return;
      let b = rec ? rec.binder : null;
      if (!b){
        const p = assocParseCode(text);
        if (p.type === 'location'){ SQP.vfMsg = {kind:'warn', text:t('sqp_vf_loc')}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); return sqpVfUpdate(); }
        let x = v.expected.find(e => p.type === 'binder' ? e.short_code === p.code : String(e.code).toUpperCase() === p.code);
        if (x) b = {id:x.id, speaking_code:x.code};
        else if (p.type === 'binder' || p.type === 'text'){
          try { const r = p.type === 'binder' ? await SC.P.data.getBinderByQr(p.code) : await SC.P.data.getBinderByCode(p.code); b = r ? r.binder : null; } catch(e){ b = null; }
        }
        if (!b){ SQP.vfMsg = {kind:'err', text:t('sqp_vf_unknown', {c:String(text || '').slice(0, 60)})}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); return sqpVfUpdate(); }
      }
      const exp = v.expected.find(e => e.id === b.id);
      if (exp){
        if (v.found.includes(b.id)) SQP.vfMsg = {kind:'warn', text:t('sqp_vf_dup', {c:exp.code})};
        else { v.found.push(b.id); SQP.vfMsg = {kind:'ok', text:t('sqp_vf_ok', {c:exp.code})}; }
      } else if (v.extra.some(e => e.id === b.id)) SQP.vfMsg = {kind:'warn', text:t('sqp_vf_dup', {c:b.speaking_code})};
      else { v.extra.push({id:b.id, code:b.speaking_code || ''}); SQP.vfMsg = {kind:'warn', text:t('sqp_vf_unexp', {c:b.speaking_code})}; }
      sqpVfSave();
      if (typeof dmScanFeedback === 'function') dmScanFeedback(SQP.vfMsg.kind === 'ok' ? 'ok' : 'warn');
      sqpVfUpdate();
    }
    function sqpVfBannerHTML(){
      const v = SQP.vf; if (!v || SC.view === 'sqverify') return '';
      const c = sqpVfCounts(v);
      return '<section class="sqp-vfb" id="sqp-vfb"><div><span class="sqp-cap">' + esc(t('sqp_vf_active', {b:v.box.code})) + '</span><b id="sqp-vfb-n">' + esc(t('sqp_vf_count', {f:c.f, n:c.n})) + '</b>' + (SQP.vfMsg ? '<small class="' + esc(SQP.vfMsg.kind) + '">' + esc(SQP.vfMsg.text) + '</small>' : '') + '</div>' +
        '<button type="button" class="sc-btn" data-s="sqp-vf-open" id="sqp-vf-open">' + sqIc('scan') + esc(t('sqp_vf_open')) + '</button></section>';
    }
    function sqpVfListHTML(){
      const v = SQP.vf; if (!v) return '';
      const c = sqpVfCounts(v);
      return '<div class="sqp-vf-k" id="sqp-vf-k"><div class="ok"><b id="sqp-vf-f">' + c.f + '</b><span>' + esc(t('sqp_vf_found')) + '</span></div><div class="' + (c.m ? 'miss' : '') + '"><b id="sqp-vf-m">' + c.m + '</b><span>' + esc(t('sqp_vf_missing')) + '</span></div><div class="' + (c.u ? 'extra' : '') + '"><b id="sqp-vf-u">' + c.u + '</b><span>' + esc(t('sqp_vf_extra')) + '</span></div></div>' +
        (SQP.vfMsg ? '<div class="sqp-vf-msg ' + esc(SQP.vfMsg.kind) + '" id="sqp-vf-msg" role="status">' + esc(SQP.vfMsg.text) + '</div>' : '') +
        (v.expected.length ? '<ul class="sqp-vf-list" id="sqp-vf-list">' + v.expected.map(x => '<li class="' + (v.found.includes(x.id) ? 'ok' : '') + '">' + sqIc(v.found.includes(x.id) ? 'check' : 'clock') + '<b>' + esc(x.code) + '</b><span>' + esc(x.company || '') + '</span></li>').join('') +
          v.extra.map(x => '<li class="extra">' + sqIc('alert') + '<b>' + esc(x.code) + '</b><span>' + esc(t('sqp_vf_extra')) + '</span></li>').join('') + '</ul>' : '<p class="sc-muted">' + esc(t('sqp_vf_none')) + '</p>');
    }
    function sqpVfUpdate(){
      if (SC.view === 'sqverify'){ const el = document.getElementById('sqp-vf-body'), end = document.getElementById('sqp-vf-end'); if (el) el.innerHTML = sqpVfListHTML(); if (end) end.innerHTML = sqpVfEndHTML(); return; }
      const b = document.getElementById('sqp-vfb'); if (b) b.outerHTML = sqpVfBannerHTML();
    }
    function sqpVfHTML(){
      const v = SQP.vf, D = SQP.vfDone;
      if (D) return '<main class="sc-main"><div class="sc-card sqp-vf-done" id="sqp-vf-done"><div class="sc-lock">' + sic('check') + '</div><h1>' + esc(t('sqp_vf_h')) + ' · ' + esc(D.box.code) + '</h1><p id="sqp-vf-sum">' + esc(t('sqp_vf_saved', {f:D.found.length, m:D.missing.length, u:D.unexpected.length})) + '</p>' +
        (D.missing.length ? '<p class="sqp-miss">' + esc(t('sqp_vf_left', {l:D.missing.map(x => x.code).join(', ')})) + '</p>' : '') + sqpMsgHTML() +
        '<div class="sc-stack"><button type="button" class="sc-btn sc-primary sc-block" data-s="sqp-vf-csv" id="sqp-vf-csv">' + sqIc('doc') + esc(t('sqp_vf_csv')) + '</button><button type="button" class="sc-btn sc-block" data-s="sqp-vf-close">' + esc(t('sqp_vf_close')) + '</button></div></div></main>';
      if (!v) return '<main class="sc-main"></main>';
      return '<main class="sc-main sqp-vfm"><div class="sc-edit-h"><button type="button" class="sc-icon" data-s="sqp-vf-back" aria-label="' + esc(t('sqp_back')) + '">' + sic('back') + '</button><h1>' + esc(t('sqp_vf_h')) + ' · ' + esc(v.box.code) + '</h1></div>' +
        '<p class="sc-hint">' + esc(t('sqp_vf_p')) + '</p>' +
        '<div class="sa-cam' + (SQP.cam ? ' on' : '') + '">' + (SQP.cam ? '<div class="sa-video" id="sqp-video"></div>' : '') + '<button type="button" class="sc-btn sc-block" data-s="sqp-vf-cam" id="sqp-vf-cam">' + sqIc('scan') + esc(SQP.cam ? t('sqp_vf_cam_off') : t('sqp_vf_cam')) + '</button></div>' +
        '<form class="sa-typed" data-s="sqp-vf-typed"><label class="sc-field"><span>' + esc(t('sqp_vf_typed')) + '</span><input id="sqp-vf-in" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t('sqp_vf_typed_ph')) + '"></label></form>' +
        '<section class="sc-card"><div id="sqp-vf-body">' + sqpVfListHTML() + '</div></section>' +
        '<section class="sc-card sqp-vf-end" id="sqp-vf-end">' + sqpVfEndHTML() + '</section></main>';
    }
    function sqpVfEndHTML(){
      const v = SQP.vf; if (!v) return '';
      const c = sqpVfCounts(v), missTy = sqType(SQP.types, 'missing') || SQP.types.find(x => x.presence === 'missing'), was = document.getElementById('sqp-vf-mark');
      return (c.m && missTy ? '<label class="sqp-chk"><input type="checkbox" id="sqp-vf-mark"' + (!was || was.checked ? ' checked' : '') + '> <span>' + esc(t(c.m === 1 ? 'sqp_vf_mark1' : 'sqp_vf_mark', {n:c.m, s:sqTypeLabel(missTy)})) + '</span></label>' : '') +
        '<button type="button" class="sc-btn sc-primary sc-block" data-s="sqp-vf-finish" id="sqp-vf-finish">' + sic('check') + esc(t('sqp_vf_go')) + '</button>' +
        '<button type="button" class="sc-link sqp-vf-abort" data-s="sqp-vf-abort" id="sqp-vf-abort">' + esc(t('sqp_vf_abort')) + '</button>';
    }
    /** Finish: returned for the found binders that were out (their type's "returns_to"), found for missing ones,
        missing for the absent ones (if confirmed), the box back too; one batch + one 'status.verify' log line. */
    async function sqpVfFinish(){
      const v = SQP.vf; if (!v || SQP.busy || !sqpCan()) return;
      const types = SQP.types, mark = !!(document.getElementById('sqp-vf-mark') || {}).checked, batch = 'sv-' + uuid(), ctx = {user:sqpWho(), device:sqpDevice(), events:SQP.ev.slice()}, events = [];
      const backTy = (cur) => { const p = sqPresence(cur, types), ct = cur && sqType(types, cur.status_id); if (p === 'missing') return sqType(types, 'found') || sqType(types, 'returned'); if (p !== 'out') return null; return (ct && ct.returns_to && sqType(types, ct.returns_to)) || sqType(types, 'returned'); };
      const add = (tg, ty) => { if (!ty) return; const e = sqNewEvent(Object.assign({status_id:ty.id, via:'verify', box_id:v.box.id, batch_id:batch, holder:'', due_date:'', date:ty.needs_date ? sqToday() : '', note:''}, tg), ctx); if (e){ events.push(e); ctx.events.push(e); } };
      const found = v.expected.filter(x => v.found.includes(x.id)), missing = v.expected.filter(x => !v.found.includes(x.id));
      found.forEach(x => add({target_type:'binder', target_id:x.id, code:x.code}, backTy(sqCurrent(SQP.ev, 'binder', x.id))));
      add({target_type:'location', target_id:v.box.id, code:v.box.code}, backTy(sqCurrent(SQP.ev, 'location', v.box.id)));
      const missTy = sqType(types, 'missing') || types.find(x => x.presence === 'missing');
      if (mark && missTy) missing.forEach(x => { const cur = sqCurrent(SQP.ev, 'binder', x.id); if (!cur || cur.status_id !== missTy.id) add({target_type:'binder', target_id:x.id, code:x.code}, missTy); });
      const brief = (x) => ({id:x.id, code:x.code});
      const details = {box:brief(v.box), found:found.map(brief), missing:missing.map(brief), unexpected:v.extra.map(brief), batch_id:batch, started_at:v.startedAt, marked_missing:mark, via:'verify', device:sqpDevice(), events:[]};
      const entry = sqpEntry('status.verify', {type:'location', id:v.box.id, code:v.box.code},
        'Verifica rientro della scatola ' + v.box.code + ' da telefono: ' + found.length + ' trovati, ' + missing.length + ' mancanti' + (missing.length ? ' (' + missing.map(x => x.code).join(', ').slice(0, 160) + ')' : '') + ', ' + v.extra.length + ' in più', details);
      entry.details.events = events.map(sqRecData);
      SQP.busy = true; SQP.msg = null;
      try { await SC.P.data.addStatusEvents(events, entry); }
      catch(e){
        if (e.code === 'offline'){ const q = sqpOutbox(); q.push({id:uuid(), events:events.map(sqRecData), entry, at:nowISO()}); lsSet(SQP_OUTBOX_LS, q); SQP.msg = {kind:'warn', text:t('sqp_offline')}; }
        else { SQP.busy = false; SQP.vfMsg = {kind:'err', text:t('sqp_err', {m:e.message || e.code})}; return scRender(); }
      }
      SQP.busy = false;
      (SQP.local || (SQP.local = [])).push(...events); sqMergeEvents(SQP.ev, events);
      sqpCamStop(); sqpVfClear();
      SQP.vfDone = details; SQP.vfMsg = null;
      if (typeof dmScanFeedback === 'function') dmScanFeedback('ok');
      scRender(); window.scrollTo(0, 0);
    }
    async function sqpCamToggle(){
      if (SQP.cam){ sqpCamStop(); return scRender(); }
      if (typeof DMCamScanner !== 'function') return;
      const cam = new DMCamScanner({onCode:(txt) => { SQP.chain = (SQP.chain || Promise.resolve()).then(() => sqpVfHandle(txt)).catch(() => {}); }});
      SQP.cam = cam;
      try { await cam.start(); scRender(); }
      catch(e){ SQP.cam = null; try { cam.stop(); } catch(x){} SQP.vfMsg = {kind:'err', text:String(e && e.message || e)}; scRender(); }
    }
    function sqpCamStop(){ if (SQP.cam){ try { SQP.cam.stop(); } catch(e){} SQP.cam = null; } }

    /* ---------------- wiring into 11-scan / 11b-assoc ---------------- */
    const scRouteBase = scRoute;
    scRoute = async function(){
      sqpClose(); if (SC.view === 'sqverify') sqpCamStop();
      SQP.msg = null; SQP.undo = null; SQP.vfDone = null; SQP.local = null; SQP.loadedFor = '';
      await scRouteBase.apply(this, arguments);
      if (!SC.user){ SQP.vf = null; return; }
      sqpVfLoad();
      const tg = sqpTargetsShown(); if (!tg) return;
      await sqpLoad(); SQP.loadedFor = tg.kind + ':' + tg.id;
      // native camera flow: a binder page opened while a return check runs counts as scanned
      if (SQP.vf && tg.kind === 'binder' && SC.rec) await sqpVfHandle('', SC.rec);
      if (sqpTargetsShown()) scRender();
      sqpFlush();
    };
    const scRenderBase = scRender;
    scRender = function(){
      if (SC.view === 'sqverify'){
        document.documentElement.lang = S.lang; document.title = t('sqp_vf_h');
        document.getElementById('app').innerHTML = scHeader() + sqpVfHTML();
        if (SQP.cam) SQP.cam.attach(document.getElementById('sqp-video'));
        return;
      }
      sqpCamStop();
      scRenderBase.apply(this, arguments);
      if (!SC.user) return;
      const tg = sqpTargetsShown(); if (!tg || SQP.loadedFor !== tg.kind + ':' + tg.id) return;   // statuses of this page not loaded yet
      try { if (tg.kind === 'binder') sqpDecorateCard(); else sqpDecorateLoc(); } catch(e){ console.warn('status', e); }
    };
    // desktop state changed in another tab (local mode): reload the statuses too
    const renderBannerBase = renderBanner;
    renderBanner = function(){ renderBannerBase.apply(this, arguments); if (SC.user && sqpTargetsShown() && !SC.P.server) sqpLoad().then(() => { if (sqpTargetsShown() && !SQP.sheet) scRender(); }); };
    /** Send what waits in the outbox, in order; keeps what still fails for the network. */
    async function sqpFlush(){
      const q = sqpOutbox(); if (!q.length || !SC.P || !SC.P.auth.currentUser() || navigator.onLine === false || SQP.flushing) return;
      SQP.flushing = true; const left = [];
      for (const it of q){
        try { await SC.P.data.addStatusEvents(sqNormEvents(it.events), it.entry); }
        catch(e){ if (e.code === 'offline' || e.code === 'unauthorized') left.push(it); }
      }
      lsSet(SQP_OUTBOX_LS, left.length ? left : null); SQP.flushing = false;
      const w = document.getElementById('sqp-wait'); if (w && !left.length) w.remove();
    }
    const scFlushOutboxBase = scFlushOutbox;
    scFlushOutbox = async function(){ const r = await scFlushOutboxBase.apply(this, arguments); await sqpFlush(); return r; };
    window.addEventListener('online', () => sqpFlush());

    /* ---------------- events ---------------- */
    function sqpAction(a, el){
      if (a === 'sqp-close') return sqpClose();
      if (a === 'sqp-all'){ if (SQP.sheet){ SQP.sheet.all = true; sqpSheetDraw(); } return; }
      if (a === 'sqp-back'){ if (SQP.sheet){ SQP.sheet.step = 'pick'; SQP.sheet.ty = null; sqpSheetDraw(); } return; }
      if (a === 'sqp-pick') return sqpPick(el.dataset.id);
      if (a === 'sqp-undo') return sqpUndo();
      if (a === 'sqp-quick' || a === 'sqp-other'){
        if (!sqpCan()) return;
        if (SC.view === 'card' && SC.rec){
          const b = SC.rec.binder, cur = sqCurrent(SQP.ev, 'binder', b.id);
          sqpOpen({targets:[tgBinder(b)], kind:'binder', title:b.speaking_code + ' · ' + (b.company_name || ''), cur, client:b.company_name, via:'scan', all:a === 'sqp-other'});
          if (a === 'sqp-quick') sqpPick(el.dataset.st);
        }
        return;
      }
      if (a === 'sqp-doc'){
        if (!sqpCan() || !SC.rec) return;
        const b = SC.rec.binder, it = (b.contents_items || []).find(x => x.id === el.dataset.doc); if (!it) return;
        return sqpOpen({targets:[tgDoc(b, it)], kind:'document', title:b.speaking_code + ' › ' + sqpDocText(it), cur:sqCurrent(SQP.ev, 'document', b.id, it.id), client:b.company_name, via:'scan'});
      }
      if (a === 'sqp-box'){
        if (!sqpCan() || !SC.loc) return;
        const l = SC.loc.location;
        return sqpOpen({targets:sqpBoxTargets(), kind:'box', title:t('sqp_box_all') + ' · ' + (l.code || ''), cur:sqCurrent(SQP.ev, 'location', l.id), via:'box', box:{id:l.id, code:l.code || ''}});
      }
      if (a === 'sqp-vf-start'){ if (sqpCan() && SC.loc) sqpVfStart(); return; }
      if (a === 'sqp-vf-open'){ if (SQP.vf){ SC.view = 'sqverify'; SQP.vfDone = null; scRender(); window.scrollTo(0, 0); } return; }
      if (a === 'sqp-vf-back'){ sqpCamStop(); SC.view = SC.loc && SQP.vf && SC.loc.location.id === SQP.vf.box.id ? 'location' : (SC.rec ? 'card' : SC.loc ? 'location' : 'noqr'); return scRender(); }
      if (a === 'sqp-vf-cam') return sqpCamToggle();
      if (a === 'sqp-vf-finish') return sqpVfFinish();
      if (a === 'sqp-vf-abort'){ sqpCamStop(); sqpVfClear(); SQP.vfMsg = null; SC.view = SC.loc ? 'location' : SC.rec ? 'card' : 'noqr'; return scRender(); }
      if (a === 'sqp-vf-csv'){ const D = SQP.vfDone; if (D) sqpDownload('docmap_verifica_' + String(D.box.code || 'scatola').replace(/[^A-Za-z0-9_-]+/g, '-') + '_' + sqToday() + '.csv', sqVerifyCsv(D)); return; }
      if (a === 'sqp-vf-close'){ SQP.vfDone = null; SC.view = SC.loc ? 'location' : SC.rec ? 'card' : 'noqr'; return scRoute(); }
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-s]'); if (!el || el.tagName === 'FORM') return;
      const a = el.dataset.s; if (!/^sqp-/.test(a)) return;
      e.preventDefault(); e.stopPropagation();
      sqpAction(a, el);
    }, true);
    document.addEventListener('keydown', (e) => {
      const el = e.target;
      if (el && el.classList && el.classList.contains('sqp-tap') && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); sqpAction('sqp-doc', el); }
      if (e.key === 'Escape' && SQP.sheet) sqpClose();
    });
    document.addEventListener('submit', (e) => {
      const f = e.target; if (!f.dataset || !/^sqp-/.test(f.dataset.s || '')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (f.dataset.s === 'sqp-form') return sqpGo();
      if (f.dataset.s === 'sqp-vf-typed'){ const i = document.getElementById('sqp-vf-in'), v = i ? i.value : ''; if (i){ i.value = ''; i.focus(); } if (String(v).trim()) SQP.chain = (SQP.chain || Promise.resolve()).then(() => sqpVfHandle(v)).catch(() => {}); }
    }, true);
    window.addEventListener('pagehide', sqpCamStop);
    /* v12 stream C integration (feature-detected): the global scan dispatcher (11e-nfc.js, onTagScanned → TAG_SCAN_HANDLERS)
       sends QR / NFC / keyboard reads to the open "Verifica rientro" first. Registered now and again once every script has loaded. */
    const sqpTagReg = () => { try { if (typeof TAG_SCAN_HANDLERS !== 'undefined' && Array.isArray(TAG_SCAN_HANDLERS) && !TAG_SCAN_HANDLERS.some(h => h && h.id === 'status-verify'))
      TAG_SCAN_HANDLERS.unshift({id:'status-verify', active:() => SC.view === 'sqverify' && !!SQP.vf, handle:(code) => { SQP.chain = (SQP.chain || Promise.resolve()).then(() => sqpVfHandle(code)).catch(() => {}); return true; }}); } catch(e){} };
    sqpTagReg(); document.addEventListener('DOMContentLoaded', sqpTagReg);
    window.SQP_API = {sqpLoad, sqpRecord, sqpFlush, sqpVfHandle, sqpVfLoad, SQP_OUTBOX_LS, SQP_VF_LS};
  })();
}
