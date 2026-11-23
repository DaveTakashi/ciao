/* =====================================================================
   DocMap 2026 — v12.10 «Prelievi e consegne» on the phone (scan.html, after 11f-inventory.js). Model: 02j-pick.js.

   scan.html?pk=<list>   the list made on the PC (route order, stops): scan the labels, the phone ticks them off,
                         says where to go next, then records the binders as out (status of the list) and, if wanted,
                         the signature of who receives them (finger on the screen) with a receipt and its SHA-256
                         fingerprint. The same list also brings them back ("Rientro", with or without signature).
   «Consegna con firma» on the home screen: a free list (no PC): scan what you hand over, choose why and to whom, sign.
   Storage on this phone: localStorage docmap_v26_pick_active (the list being worked, 8 h), signatures in IndexedDB
   (IVDB, id 'sig-<hand-over id>') + docmap_v26_pick_sig_outbox (ids still to upload with photo_put).
   Status events go through SC.P.data.addStatusEvents (11c), offline into the same outbox as every status.
   ===================================================================== */
'use strict';

if (typeof SC !== 'undefined' && typeof scRoute === 'function'){
  (function(){
    Object.assign(I18N.it, {
      pkm_h:'Prelievo', pkm_free_h:'Consegna con firma', pkm_free_p:'Scansiona i faldoni che consegni, poi fai firmare chi li riceve.', pkm_purpose:'Motivo',
      pkm_next:'Prossima tappa', pkm_done_all:'Tutti presi: puoi registrare.', pkm_found:'Presi', pkm_left:'Mancano', pkm_extra:'In più', pkm_cam:'Usa la fotocamera', pkm_cam_off:'Spegni la fotocamera',
      pkm_typed:'Oppure scrivi il codice', pkm_typed_ph:'es. BL12 o dm26…', pkm_ok:'{c} preso', pkm_dup:'{c} già preso', pkm_unexp:'{c} non è nell\'elenco: aggiunto come "in più"', pkm_unknown:'QR non riconosciuto: {c}', pkm_loc:'È il QR di una scatola: scansiona i faldoni.',
      pkm_finish:'Fine: registra', pkm_abort:'Abbandona l\'elenco', pkm_abort_q:'Abbandonare l\'elenco su questo telefono? Gli stati già registrati restano.', pkm_mode_out:'Uscita', pkm_mode_back:'Rientro',
      pkm_end_h:'Cosa registro?', pkm_end_out:'Segna come usciti ({n})', pkm_end_sign:'Consegna con firma ({n})', pkm_end_back:'Segna come rientrati ({n})', pkm_end_back_sign:'Rientro con firma ({n})', pkm_with_extra:'Includi anche i {n} in più',
      pkm_who:'Nome e cognome di chi riceve', pkm_who_back:'Nome e cognome di chi riconsegna', pkm_doc:'Documento (facoltativo)', pkm_pad:'Firma qui col dito', pkm_clear:'Cancella', pkm_sign_go:'Conferma e firma',
      pkm_need_who:'Scrivi il nome.', pkm_need_sig:'Manca la firma.', pkm_need_items:'Scansiona almeno un faldone.', pkm_saving:'Registrazione…', pkm_offline:'Senza rete: salvato sul telefono, parte appena torna la connessione.',
      pkm_rec_h:'Registrato', pkm_rec_p:'{n} faldoni: {s}.', pkm_rec_fp:'Impronta della ricevuta', pkm_rec_dl:'Scarica la ricevuta', pkm_rec_share:'Condividi', pkm_rec_close:'Chiudi', pkm_rec_again:'Continua con lo stesso elenco',
      pkm_active:'Prelievo in corso: {t}', pkm_open:'Torna al prelievo', pkm_bad_link:'Il link del prelievo non è valido o è incompleto.', pkm_due:'rientro entro il {d}', pkm_noid:'Serve la rete per riconoscere {n} faldoni: riprova quando c\'è connessione.',
      pkm_free_btn:'Consegna con firma', pkm_status:'Stato', pkm_back_list:'Indietro',
    });
    Object.assign(I18N.en, {
      pkm_h:'Pick list', pkm_free_h:'Hand over with signature', pkm_free_p:'Scan the binders you hand over, then have the receiver sign.', pkm_purpose:'Purpose',
      pkm_next:'Next stop', pkm_done_all:'All taken: you can record.', pkm_found:'Taken', pkm_left:'Missing', pkm_extra:'Extra', pkm_cam:'Use the camera', pkm_cam_off:'Turn the camera off',
      pkm_typed:'Or type the code', pkm_typed_ph:'e.g. BL12 or dm26…', pkm_ok:'{c} taken', pkm_dup:'{c} already taken', pkm_unexp:'{c} is not in the list: added as "extra"', pkm_unknown:'QR not recognised: {c}', pkm_loc:'This is a box QR: scan the binders.',
      pkm_finish:'Done: record', pkm_abort:'Drop the list', pkm_abort_q:'Drop the list on this phone? Statuses already recorded stay.', pkm_mode_out:'Out', pkm_mode_back:'Return',
      pkm_end_h:'What do I record?', pkm_end_out:'Mark as out ({n})', pkm_end_sign:'Hand over with signature ({n})', pkm_end_back:'Mark as returned ({n})', pkm_end_back_sign:'Return with signature ({n})', pkm_with_extra:'Also include the {n} extra',
      pkm_who:'Full name of who receives', pkm_who_back:'Full name of who returns', pkm_doc:'ID document (optional)', pkm_pad:'Sign here with your finger', pkm_clear:'Clear', pkm_sign_go:'Confirm and sign',
      pkm_need_who:'Write the name.', pkm_need_sig:'The signature is missing.', pkm_need_items:'Scan at least one binder.', pkm_saving:'Recording…', pkm_offline:'No network: saved on the phone, sent as soon as the connection is back.',
      pkm_rec_h:'Recorded', pkm_rec_p:'{n} binders: {s}.', pkm_rec_fp:'Receipt fingerprint', pkm_rec_dl:'Download the receipt', pkm_rec_share:'Share', pkm_rec_close:'Close', pkm_rec_again:'Go on with the same list',
      pkm_active:'Pick list in progress: {t}', pkm_open:'Back to the pick list', pkm_bad_link:'The pick list link is not valid or incomplete.', pkm_due:'back by {d}', pkm_noid:'The network is needed to recognise {n} binders: try again when connected.',
      pkm_free_btn:'Hand over with signature', pkm_status:'Status', pkm_back_list:'Back',
    });
    const PKM_LS = 'docmap_v26_pick_active', PKM_SIG_LS = 'docmap_v26_pick_sig_outbox', PKM_IDLE_MS = 8 * 3600 * 1000;
    const PKM = { a:null, step:'scan', msg:null, cam:null, chain:Promise.resolve(), pad:null, rec:null, busy:false, err:'', mode:'out' };
    window.PKM = PKM;
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch(e){ return d; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
    const who = () => { const u = SC.P && SC.P.auth.currentUser() || {}; return u.display_name || u.username || 'Mobile'; };
    const userKey = () => { const u = SC.P && SC.P.auth.currentUser(); return u ? (u.username || u.id || '') : ''; };
    const can = () => !!(SC.user && SC.P && SC.P.auth.can('edit'));
    function dev(){ let d = ''; try { d = localStorage.getItem('docmap_v26_scan_device') || ''; if (!d){ d = 'phone-' + uuid().slice(0, 8); localStorage.setItem('docmap_v26_scan_device', d); } } catch(e){ d = 'phone'; } return d; }
    const fb = (k) => { if (typeof dmScanFeedback === 'function') dmScanFeedback(k); };

    /* ---------------- the list on this phone ---------------- */
    function pkmLoad(){
      let a = lsGet(PKM_LS, null);
      if (a && (!a.list || !Array.isArray(a.found))) a = null;
      if (a && Date.now() - (+a.at || 0) > PKM_IDLE_MS) a = null;
      if (a && SC.user && a.user && a.user !== userKey()) a = null;
      if (!a) lsSet(PKM_LS, null);
      PKM.a = a; return a;
    }
    function pkmSave(){ if (PKM.a){ PKM.a.at = Date.now(); lsSet(PKM_LS, PKM.a); } }
    function pkmClear(){ PKM.a = null; lsSet(PKM_LS, null); }
    function pkmStart(list, free){
      const prev = pkmLoad();
      if (prev && prev.list.id === list.id){ PKM.a = prev; return; }   // the same link opened again: keep what was ticked
      PKM.a = {v:1, user:userKey(), list, free:!!free, found:[], extra:[], startedAt:nowISO(), at:Date.now()};
      PKM.mode = 'out'; pkmSave();
    }
    function pkmFree(purpose){
      const pu = pkPurpose(purpose || 'client');
      pkmStart({id:'pk-m' + uuid().replace(/-/g, '').slice(0, 14), title:t('pkm_free_h'), purpose:pu.id, status_id:pu.status, holder:pu.holder === 'me' ? who() : pu.holder === 'client' ? '' : pu.holder, due_date:'', items:[], stops:[], total:0}, true);
    }
    const counts = (a) => { const f = a.list.items.filter(x => a.found.some(y => y.s === x.s)).length; return {f, n:a.list.items.length, m:a.list.items.length - f, u:a.extra.length}; };

    /* ---------------- scanning ---------------- */
    async function pkmResolve(code, kind){
      try { const r = kind === 'binder' ? await SC.P.data.getBinderByQr(code) : await SC.P.data.getBinderByCode(code); return r && r.binder ? r.binder : null; }
      catch(e){ return e.code === 'offline' ? 'offline' : null; }
    }
    /** One scanned / typed code. rec: a binder record already loaded (the phone's camera app opened its QR). */
    async function pkmHandle(text, rec){
      const a = PKM.a; if (!a) return;
      const L = a.list;
      let b = rec ? rec.binder : null, s = b ? b.short_code : '', c = b ? b.speaking_code : '';
      if (!b){
        const p = assocParseCode(text);
        if (p.type === 'location'){ PKM.msg = {kind:'warn', text:t('pkm_loc')}; fb('warn'); return pkmUpdate(); }
        let tail = ''; const m = /([A-Za-z0-9_-]{1,40})\/?$/.exec(String(text || '').trim()); if (m) tail = m[1];
        const x = L.items.find(i => (p.type === 'binder' && i.s === p.code) || (p.type === 'text' && String(i.c).toUpperCase() === p.code) || (tail && i.s === tail));
        if (x){ s = x.s; c = x.c; }
        else if (p.type === 'binder' || p.type === 'text'){
          const r = await pkmResolve(p.code, p.type === 'binder' ? 'binder' : 'text');
          if (r === 'offline' && p.type === 'binder'){ s = p.code; c = p.code; }
          else if (r && r !== 'offline'){ b = r; s = r.short_code; c = r.speaking_code; }
        }
        if (!s){ PKM.msg = {kind:'err', text:t('pkm_unknown', {c:String(text || '').slice(0, 60)})}; fb('warn'); return pkmUpdate(); }
      }
      const inList = L.items.some(i => i.s === s);
      const have = a.found.find(y => y.s === s) || a.extra.find(y => y.s === s);
      if (have){ PKM.msg = {kind:'warn', text:t('pkm_dup', {c:c || s})}; if (b && !have.id) have.id = b.id; }
      else if (inList || a.free){ a.found.push({s, c, id:b ? b.id : '', n:b ? (b.company_name || '') : ''}); if (a.free) L.items.push({s, c, n:b ? (b.company_name || '') : '', w:-1}); PKM.msg = {kind:'ok', text:t('pkm_ok', {c:c || s})}; }
      else { a.extra.push({s, c, id:b ? b.id : '', n:b ? (b.company_name || '') : ''}); PKM.msg = {kind:'warn', text:t('pkm_unexp', {c:c || s})}; }
      pkmSave(); fb(PKM.msg.kind === 'ok' ? 'ok' : 'warn');
      if (typeof dmtRunning === 'function' && dmtRunning('catalog')) {}   // nothing: picking is not cataloguing
      pkmUpdate();
    }
    async function pkmCam(){
      if (PKM.cam){ pkmCamStop(); return scRender(); }
      if (typeof DMCamScanner !== 'function') return;
      const cam = new DMCamScanner({onCode:(txt) => { PKM.chain = PKM.chain.then(() => pkmHandle(txt)).catch(() => {}); }});
      PKM.cam = cam;
      try { await cam.start(); scRender(); }
      catch(e){ PKM.cam = null; try { cam.stop(); } catch(x){} PKM.msg = {kind:'err', text:String(e && e.message || e)}; scRender(); }
    }
    function pkmCamStop(){ if (PKM.cam){ try { PKM.cam.stop(); } catch(e){} PKM.cam = null; } }

    /* ---------------- screens ---------------- */
    function pkmNextStop(a){
      const L = a.list; if (!L.stops.length) return null;
      for (let w = 0; w < L.stops.length; w++){ const its = L.items.filter(i => i.w === w); if (its.some(i => !a.found.some(f => f.s === i.s))) return {w, text:L.stops[w], left:its.filter(i => !a.found.some(f => f.s === i.s))}; }
      return null;
    }
    function pkmListHTML(){
      const a = PKM.a; if (!a) return '';
      const c = counts(a), L = a.list, got = (i) => a.found.some(f => f.s === i.s);
      const nx = a.free ? null : pkmNextStop(a);
      let h = '<div class="pkm-k" id="pkm-k"><div class="ok"><b id="pkm-f">' + (a.free ? a.found.length : c.f) + '</b><span>' + esc(t('pkm_found')) + '</span></div>' +
        (a.free ? '' : '<div><b id="pkm-m">' + c.m + '</b><span>' + esc(t('pkm_left')) + '</span></div>') + '<div class="' + (c.u ? 'extra' : '') + '"><b id="pkm-u">' + c.u + '</b><span>' + esc(t('pkm_extra')) + '</span></div></div>' +
        (PKM.msg ? '<div class="pkm-msg ' + esc(PKM.msg.kind) + '" id="pkm-msg" role="status">' + esc(PKM.msg.text) + '</div>' : '');
      if (!a.free) h += nx ? '<div class="pkm-next" id="pkm-next"><small>' + esc(t('pkm_next')) + '</small><b>' + esc(nx.text) + '</b><div class="sc-muted">' + esc(nx.left.map(i => i.c).join(', ')) + '</div></div>' : (c.m ? '' : '<div class="pkm-msg ok" id="pkm-all">' + esc(t('pkm_done_all')) + '</div>');
      const item = (i) => '<li class="' + (got(i) ? 'ok' : '') + '">' + (got(i) ? sic('check') : '') + '<b>' + esc(i.c || i.s) + '</b><span>' + esc(i.n || '') + '</span></li>';
      if (L.stops.length) h += '<ol class="pkm-stops" id="pkm-stops">' + L.stops.map((s, w) => { const its = L.items.filter(i => i.w === w); if (!its.length) return ''; const done = its.every(got);
        return '<li class="pkm-stop' + (done ? ' done' : '') + '"><h3><i>' + (w + 1) + '</i>' + esc(s) + '</h3><ul>' + its.map(item).join('') + '</ul></li>'; }).join('') +
        (L.items.some(i => i.w < 0) ? '<li class="pkm-stop"><h3><i>?</i>—</h3><ul>' + L.items.filter(i => i.w < 0).map(item).join('') + '</ul></li>' : '') + '</ol>';
      else if (L.items.length) h += '<ul class="pkm-stops"><li class="pkm-stop"><ul>' + L.items.map(item).join('') + '</ul></li></ul>';
      if (a.extra.length) h += '<ul class="pkm-stops"><li class="pkm-stop"><h3><i>+</i>' + esc(t('pkm_extra')) + '</h3><ul>' + a.extra.map(i => '<li><b>' + esc(i.c || i.s) + '</b><span>' + esc(i.n || '') + '</span></li>').join('') + '</ul></li></ul>';
      return h;
    }
    function pkmUpdate(){ const el = document.getElementById('pkm-body'); if (el && SC.view === 'pick' && PKM.step === 'scan') el.innerHTML = pkmListHTML(); else if (SC.view === 'pick') scRender(); }
    function pkmHeadHTML(){
      const L = PKM.a.list, ty = typeof sqType === 'function' && typeof sqTypes === 'function' ? sqType(sqTypes(S.settings || {}), L.status_id) : null;
      return '<div class="sc-edit-h"><button type="button" class="sc-icon" data-s="pkm-x" aria-label="' + esc(t('pkm_back_list')) + '">' + sic('back') + '</button><h1>' + esc(L.title || t('pkm_h')) + '</h1></div>' +
        '<p class="sc-hint">' + esc(t('pkp_' + L.purpose)) + (L.holder ? ' · ' + esc(L.holder) : '') + (ty ? ' · ' + esc(sqTypeLabel(ty)) : '') + (L.due_date ? ' · ' + esc(t('pkm_due', {d:sqDayFmt(L.due_date)})) : '') + '</p>';
    }
    function pkmScanHTML(){
      const a = PKM.a;
      return '<main class="sc-main sqp-vfm" id="pkm">' + pkmHeadHTML() +
        (a.free ? '<label class="sc-field"><span>' + esc(t('pkm_purpose')) + '</span><select id="pkm-purpose" data-pkm="purpose">' + PK_PURPOSES.map(p => '<option value="' + p.id + '"' + (p.id === a.list.purpose ? ' selected' : '') + '>' + esc(t('pkp_' + p.id)) + '</option>').join('') + '</select></label>' : '') +
        (a.free ? '' : '<div class="pkm-seg" role="group" id="pkm-mode"><button type="button" data-s="pkm-mode" data-m="out" class="' + (PKM.mode === 'out' ? 'on' : '') + '" aria-pressed="' + (PKM.mode === 'out') + '">' + esc(t('pkm_mode_out')) + '</button><button type="button" data-s="pkm-mode" data-m="back" class="' + (PKM.mode === 'back' ? 'on' : '') + '" aria-pressed="' + (PKM.mode === 'back') + '">' + esc(t('pkm_mode_back')) + '</button></div>') +
        '<div class="sa-cam' + (PKM.cam ? ' on' : '') + '">' + (PKM.cam ? '<div class="sa-video" id="pkm-video"></div>' : '') + '<button type="button" class="sc-btn sc-block" data-s="pkm-cam" id="pkm-cam">' + sic('qr') + esc(PKM.cam ? t('pkm_cam_off') : t('pkm_cam')) + '</button></div>' +
        '<form class="sa-typed" data-s="pkm-typed"><label class="sc-field"><span>' + esc(t('pkm_typed')) + '</span><input id="pkm-in" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t('pkm_typed_ph')) + '"></label></form>' +
        '<section class="sc-card"><div id="pkm-body">' + pkmListHTML() + '</div></section>' +
        '<section class="sc-card"><button type="button" class="sc-btn sc-primary sc-block" data-s="pkm-end" id="pkm-end">' + sic('check') + esc(t('pkm_finish')) + '</button>' +
        '<button type="button" class="sc-link sqp-vf-abort" data-s="pkm-abort" id="pkm-abort">' + esc(t('pkm_abort')) + '</button></section></main>';
    }
    function pkmChosen(withExtra){ const a = PKM.a; return a.found.concat(withExtra ? a.extra : []); }
    function pkmEndHTML(){
      const a = PKM.a, back = PKM.mode === 'back', n = a.found.length, u = a.extra.length, wx = document.getElementById('pkm-wx');
      return '<main class="sc-main" id="pkm-endv">' + pkmHeadHTML() + '<section class="sc-card"><h2>' + esc(t('pkm_end_h')) + '</h2>' +
        (u ? '<label class="sqp-chk"><input type="checkbox" id="pkm-wx"' + (!wx || wx.checked ? ' checked' : '') + '> <span>' + esc(t('pkm_with_extra', {n:u})) + '</span></label>' : '') +
        (PKM.err ? '<div class="pkm-msg err" role="alert">' + esc(PKM.err) + '</div>' : '') +
        '<div class="sc-stack">' + (a.free ? '' : '<button type="button" class="sc-btn sc-block" data-s="pkm-rec" data-sig="0" id="pkm-rec0">' + sic('check') + esc(t(back ? 'pkm_end_back' : 'pkm_end_out', {n:n + u})) + '</button>') +
        '<button type="button" class="sc-btn sc-primary sc-block" data-s="pkm-signv" id="pkm-signv">' + sic('pencil') + esc(t(back ? 'pkm_end_back_sign' : 'pkm_end_sign', {n:n + u})) + '</button>' +
        '<button type="button" class="sc-btn sc-block" data-s="pkm-scan">' + esc(t('pkm_back_list')) + '</button></div></section></main>';
    }
    function pkmSignHTML(){
      const a = PKM.a, back = PKM.mode === 'back', L = a.list;
      return '<main class="sc-main" id="pkm-signm">' + pkmHeadHTML() + '<section class="sc-card sc-stack">' +
        '<label class="sc-field"><span>' + esc(t(back ? 'pkm_who_back' : 'pkm_who')) + '</span><input id="pkm-who" autocomplete="name" value="' + esc(back ? '' : (L.holder && L.holder !== who() ? L.holder : '')) + '"></label>' +
        '<label class="sc-field"><span>' + esc(t('pkm_doc')) + '</span><input id="pkm-doc" autocomplete="off"></label>' +
        '<div class="sc-field"><span>' + esc(t('pkm_pad')) + '</span><canvas class="pkm-pad" id="pkm-pad"></canvas><button type="button" class="sc-link" data-s="pkm-clear">' + esc(t('pkm_clear')) + '</button></div>' +
        '<p class="sc-muted">' + esc(t(back ? 'pkr_decl_back' : 'pkr_decl_out')) + '</p>' + (PKM.err ? '<div class="pkm-msg err" role="alert" id="pkm-err">' + esc(PKM.err) + '</div>' : '') +
        '<button type="button" class="sc-btn sc-primary sc-block" data-s="pkm-rec" data-sig="1" id="pkm-go"' + (PKM.busy ? ' disabled' : '') + '>' + sic('check') + esc(PKM.busy ? t('pkm_saving') : t('pkm_sign_go')) + '</button>' +
        '<button type="button" class="sc-btn sc-block" data-s="pkm-end">' + esc(t('pkm_back_list')) + '</button></section></main>';
    }
    function pkmRecHTML(){
      const R = PKM.rec;
      return '<main class="sc-main sc-center"><div class="sc-card sqp-vf-done" id="pkm-done"><div class="sc-lock">' + sic('check') + '</div><h1>' + esc(t('pkm_rec_h')) + '</h1><p id="pkm-sum">' + esc(t('pkm_rec_p', {n:R.items.length, s:R.label})) + '</p>' +
        (R.offline ? '<div class="pkm-msg warn">' + esc(t('pkm_offline')) + '</div>' : '') +
        (R.hash ? '<p class="sc-muted">' + esc(t('pkm_rec_fp')) + '</p><p class="pkm-fp" id="pkm-fp">' + esc(R.hash) + '</p>' : '') +
        '<div class="sc-stack">' + (R.hash ? '<button type="button" class="sc-btn sc-primary sc-block" data-s="pkm-dl" id="pkm-dl">' + esc(t('pkm_rec_dl')) + '</button>' : '') +
        (R.hash && navigator.share ? '<button type="button" class="sc-btn sc-block" data-s="pkm-share">' + esc(t('pkm_rec_share')) + '</button>' : '') +
        (PKM.a && !PKM.a.free ? '<button type="button" class="sc-btn sc-block" data-s="pkm-again">' + esc(t('pkm_rec_again')) + '</button>' : '') +
        '<button type="button" class="sc-btn sc-block" data-s="pkm-close">' + esc(t('pkm_rec_close')) + '</button></div></div></main>';
    }
    function pkmHTML(){
      if (PKM.step === 'done' && PKM.rec) return pkmRecHTML();
      if (!PKM.a) return scInfoHTML('alert', t('pkm_bad_link'), '');
      if (PKM.step === 'end') return pkmEndHTML();
      if (PKM.step === 'sign') return pkmSignHTML();
      return pkmScanHTML();
    }
    function pkmBannerHTML(){
      const a = PKM.a; if (!a || SC.view === 'pick') return '';
      const c = counts(a);
      return '<section class="sqp-vfb" id="pkm-banner"><div><span class="sqp-cap">' + esc(t('pkm_active', {t:a.list.title})) + '</span><b>' + (a.free ? a.found.length : c.f + ' / ' + c.n) + '</b>' + (PKM.msg ? '<small class="' + esc(PKM.msg.kind) + '">' + esc(PKM.msg.text) + '</small>' : '') + '</div>' +
        '<button type="button" class="sc-btn" data-s="pkm-open" id="pkm-open">' + sic('qr') + esc(t('pkm_open')) + '</button></section>';
    }

    /* ---------------- recording ---------------- */
    function pkmEntry(action, summary, details){ return {id:uuid(), at:nowISO(), who:who(), action, target:null, summary, details, source:MOBILE_LOG_SOURCE}; }
    async function pkmSigStore(id, dataUrl){
      try { await IVDB.put(id, {id, mime:'image/png', data:dataUrl, at:nowISO(), kind:'signature', sent:false}); } catch(e){}
      const q = lsGet(PKM_SIG_LS, []); if (!q.includes(id)) q.push(id); lsSet(PKM_SIG_LS, q);
      pkmSigFlush();
    }
    async function pkmSigFlush(){
      const q = lsGet(PKM_SIG_LS, []); if (!q.length || !SC.P || !SC.P.auth.currentUser() || navigator.onLine === false || PKM.sigBusy) return;
      if (typeof SC.P.data.invPhotoPut !== 'function') return;
      PKM.sigBusy = true; const left = [];
      for (const id of q){
        try {
          const r = await IVDB.get(id); const m = r && /^data:([^;]+);base64,(.*)$/.exec(r.data || '');
          if (!m){ continue; }
          const res = await SC.P.data.invPhotoPut({id, binder_id:'', mime:m[1], data:m[2]});
          if (res && !res.local){ r.sent = true; IVDB.put(id, r).catch(() => {}); }
        } catch(e){ if (e.code === 'offline' || e.code === 'unauthorized' || e.code === 'network') left.push(id); }
      }
      lsSet(PKM_SIG_LS, left.length ? left : null); PKM.sigBusy = false;
    }
    function pkmBackType(types, cur){
      const pres = sqPresence(cur, types), ct = cur && sqType(types, cur.status_id);
      if (pres === 'missing') return sqType(types, 'found') || sqType(types, 'returned');
      return (ct && ct.returns_to && sqType(types, ct.returns_to)) || sqType(types, 'returned');
    }
    async function pkmRecord(withSig){
      const a = PKM.a; if (!a || PKM.busy || !can()) return;
      const back = PKM.mode === 'back', L = a.list, wx = document.getElementById('pkm-wx');
      const chosen = pkmChosen(a.free || (wx ? wx.checked : PKM.wx !== false));
      PKM.err = '';
      if (!chosen.length){ PKM.err = t('pkm_need_items'); return scRender(); }
      let name = '', doc = '', sig = '';
      if (withSig){
        name = String((document.getElementById('pkm-who') || {}).value || '').trim(); doc = String((document.getElementById('pkm-doc') || {}).value || '').trim();
        if (!name){ PKM.err = t('pkm_need_who'); return scRender(); }
        if (!PKM.pad || PKM.pad.empty()){ PKM.err = t('pkm_need_sig'); PKM.keep = {name, doc}; return scRender(); }
        sig = PKM.pad.dataUrl();
      }
      PKM.busy = true; const btn = document.getElementById('pkm-go'); if (btn){ btn.disabled = true; btn.textContent = t('pkm_saving'); }
      // binder ids (the server / this browser knows them)
      const need = chosen.filter(x => !x.id);
      for (const x of need){ const r = await pkmResolve(x.s, 'binder'); if (r && r !== 'offline'){ x.id = r.id; x.c = x.c || r.speaking_code; x.n = x.n || r.company_name || ''; } }
      const miss = chosen.filter(x => !x.id);
      if (miss.length){ PKM.busy = false; PKM.err = t('pkm_noid', {n:miss.length}); pkmSave(); return scRender(); }
      let types = sqTypes(S.settings || {});
      try { if (SC.P.data.getStatus && !SC.P.server){ const st = await SC.P.data.getStatus(); if (st && Array.isArray(st.types) && st.types.length) types = st.types.map(x => sqNormType(x)).filter(Boolean); } } catch(e){}
      const hid = (back ? 'rt-' : 'dl-') + uuid().replace(/-/g, '').slice(0, 12), batch = withSig ? L.id + '.' + hid : (back ? L.id + '.' + hid : L.id);
      const at = nowISO(), sigHash = sig ? await pkSha256Hex(pkDataUrlBytes(sig)) : '';
      const items = chosen.map(x => ({id:x.id, code:x.c || x.s}));
      let hash = '';
      if (withSig){ const rec0 = {id:batch, at:'', kind:back ? 'back' : 'out', recipient:name, doc, operator:who(), sigHash, items}; PKM.recBase = rec0; }
      const note = withSig ? (back ? 'Rientro firmato' : 'Consegna firmata') + ' da ' + name + (doc ? ' · doc ' + doc : '') : (L.title || '');
      const ctx = {user:who(), device:dev(), events:[]}, events = [];
      const ty = sqType(types, L.status_id) || sqType(types, 'taken');
      chosen.forEach(x => {
        const t0 = back ? pkmBackType(types, null) : ty; if (!t0) return;
        const e = sqNewEvent({target_type:'binder', target_id:x.id, code:x.c || x.s, status_id:t0.id, holder:back ? '' : (withSig ? name : (L.holder || (t0.needs_holder === 'me' ? who() : ''))),
          due_date:back ? '' : (L.due_date || ''), date:t0.needs_date ? sqToday() : '', note, via:withSig ? 'handover' : 'pick', batch_id:batch}, ctx);
        if (e){ events.push(e); ctx.events.push(e); }
      });
      if (withSig){
        const first = events.map(e => e.at).sort()[0] || at;
        const rec = Object.assign({}, PKM.recBase, {at:first});
        hash = await pkSha256Hex(pkReceiptCanon(rec));
        const fpNote = ' · ricevuta ' + hash.slice(0, 16) + (sigHash ? ' · firma ' + sigHash.slice(0, 16) : '');
        events.forEach(e => { e.note = (e.note + fpNote).slice(0, 1000); });
        if (sig) await pkmSigStore('sig-' + hid, sig);
      }
      const label = back ? (sqTypeLabel(sqType(types, 'returned')) || 'rientro') : sqTypeLabel(ty);
      const entry = pkmEntry(withSig ? (back ? 'custody.return' : 'custody.handover') : (back ? 'pick.return' : 'pick.take'),
        (withSig ? (back ? 'Rientro firmato' : 'Consegna firmata') + ' (' + name + ')' : (back ? 'Rientro' : 'Prelievo')) + ' "' + (L.title || '') + '" da telefono: ' + events.length + ' faldoni (' + events.map(e => e.code).join(', ').slice(0, 160) + ')',
        {pick:L.id, batch, recipient:name, doc, hash, sig_hash:sigHash, sig_id:sig ? 'sig-' + hid : '', via:withSig ? 'handover' : 'pick', device:dev(), events:events.map(sqRecData)});
      let offline = false;
      try { await SC.P.data.addStatusEvents(events, entry); }
      catch(e){
        if (e.code === 'offline'){ const k = (window.SQP_API && SQP_API.SQP_OUTBOX_LS) || 'docmap_v26_scan_status_outbox'; const q = lsGet(k, []); q.push({id:uuid(), events:events.map(sqRecData), entry, at:nowISO()}); lsSet(k, q); offline = true; }
        else { PKM.busy = false; PKM.err = t('sqp_err', {m:e.message || e.code}); return scRender(); }
      }
      PKM.busy = false; pkmCamStop();
      const byId = new Map(chosen.map(x => [x.id, x]));
      PKM.rec = {id:batch, at:(events.map(e => e.at).sort()[0] || at), kind:back ? 'back' : 'out', recipient:name, doc, operator:who(), purpose:L.purpose, title:L.title, due_date:L.due_date,
        items:events.map(e => ({id:e.target_id, code:e.code, company:(byId.get(e.target_id) || {}).n || '', title:''})), sig, hash, label, offline};
      // the list: what was recorded leaves the ticked set (an out list can then be used to bring them back)
      if (a.free) pkmClear(); else { a.found = []; a.extra = []; PKM.mode = back ? 'out' : 'back'; pkmSave(); }
      PKM.step = 'done'; PKM.msg = null; fb('ok'); scRender(); window.scrollTo(0, 0);
    }
    function pkmReceiptFile(){
      const R = PKM.rec; if (!R) return null;
      const html = '<!doctype html><html lang="' + esc(S.lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(t(R.kind === 'back' ? 'pkr_h_back' : 'pkr_h_out')) + '</title><style>body{margin:12mm;background:#fff}' + PK_RECEIPT_CSS + '</style></head><body>' +
        pkReceiptHTML(R, (SC.ctx && SC.ctx.studioName) || '') + '</body></html>';
      return {name:'ricevuta_' + R.id.replace(/[^A-Za-z0-9_-]+/g, '-') + '.html', html};
    }

    /* ---------------- wiring ---------------- */
    const scRouteBase = scRoute;
    scRoute = async function(){
      const par = String(new URLSearchParams(location.search || '').get('pk') || '');
      await scRouteBase.apply(this, arguments);
      if (!SC.user) return;
      pkmLoad();
      if (par){
        const L = pkDecode(par);
        if (L){ pkmStart(L, false); PKM.step = 'scan'; }
        else PKM.a = PKM.a || null;
        try { const qs = new URLSearchParams(location.search); qs.delete('pk'); history.replaceState(null, '', 'scan.html' + (qs.toString() ? '?' + qs.toString() : '')); } catch(e){}
        SC.view = 'pick'; if (!L){ PKM.a = null; } scRender(); window.scrollTo(0, 0); return;
      }
      // the phone's own camera app opened a binder QR while a list is being worked: it counts as scanned
      if (PKM.a && SC.view === 'card' && SC.rec){ await pkmHandle('', SC.rec); scRender(); }
      else if (PKM.a && !document.getElementById('pkm-banner')) scRender();
      pkmSigFlush();
    };
    const scRenderBase = scRender;
    scRender = function(){
      if (SC.view === 'pick' && SC.user){
        document.documentElement.lang = S.lang; document.title = t('pkm_h');
        document.getElementById('app').innerHTML = scHeader() + pkmHTML();
        if (PKM.cam && PKM.cam.video){ const v = document.getElementById('pkm-video'); if (v && !v.contains(PKM.cam.video)) v.appendChild(PKM.cam.video); }
        if (PKM.step === 'sign'){ const cv = document.getElementById('pkm-pad'); if (cv){ PKM.pad = pkPadMount(cv); if (PKM.keep){ const w = document.getElementById('pkm-who'), d = document.getElementById('pkm-doc'); if (w) w.value = PKM.keep.name; if (d) d.value = PKM.keep.doc; PKM.keep = null; } } }
        return;
      }
      scRenderBase.apply(this, arguments);
      if (!SC.user) return;
      const app = document.getElementById('app'), main = app && app.querySelector('main');
      if (main && PKM.a && SC.view !== 'pick' && !document.getElementById('pkm-banner')) main.insertAdjacentHTML('afterbegin', pkmBannerHTML());
      if (SC.view === 'noqr' && can() && !PKM.a && main && !document.getElementById('pkm-free')){
        const card = main.querySelector('.sc-card') || main;
        card.insertAdjacentHTML('beforeend', '<div class="pkm-entry"><button type="button" class="sc-btn sc-block" data-s="pkm-free" id="pkm-free">' + sic('pencil') + esc(t('pkm_free_btn')) + '</button></div>');
      }
    };
    if (!SC_ICONS.pencil) SC_ICONS.pencil = '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>';
    if (!SC_ICONS.back) SC_ICONS.back = '<path d="m15 18-6-6 6-6"/>';
    const scFlushBase = scFlushOutbox;
    scFlushOutbox = async function(){ const r = await scFlushBase.apply(this, arguments); await pkmSigFlush(); return r; };
    window.addEventListener('online', () => pkmSigFlush());
    window.addEventListener('pagehide', pkmCamStop);

    function pkmAction(a, el){
      if (a === 'pkm-free'){ pkmFree('client'); PKM.step = 'scan'; PKM.msg = null; SC.view = 'pick'; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'pkm-open'){ PKM.step = 'scan'; SC.view = 'pick'; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'pkm-x'){ pkmCamStop(); SC.view = SC.rec ? 'card' : 'noqr'; PKM.err = ''; return scRender(); }
      if (a === 'pkm-cam') return pkmCam();
      if (a === 'pkm-mode'){ PKM.mode = el.dataset.m === 'back' ? 'back' : 'out'; return scRender(); }
      if (a === 'pkm-end'){ pkmCamStop(); PKM.step = 'end'; PKM.err = ''; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'pkm-scan'){ PKM.step = 'scan'; PKM.err = ''; scRender(); return; }
      if (a === 'pkm-signv'){ const wx = document.getElementById('pkm-wx'); PKM.wx = !wx || wx.checked; PKM.step = 'sign'; PKM.err = ''; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'pkm-clear'){ if (PKM.pad) PKM.pad.clear(); return; }
      if (a === 'pkm-rec') return pkmRecord(el.dataset.sig === '1');
      if (a === 'pkm-abort'){ if (window.confirm(t('pkm_abort_q'))){ pkmCamStop(); pkmClear(); SC.view = SC.rec ? 'card' : 'noqr'; scRender(); } return; }
      if (a === 'pkm-dl'){ const f = pkmReceiptFile(); if (!f) return; const u = URL.createObjectURL(new Blob([f.html], {type:'text/html'})); const x = document.createElement('a'); x.href = u; x.download = f.name; document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); return; }
      if (a === 'pkm-share'){ const f = pkmReceiptFile(); if (!f || !navigator.share) return; const file = new File([f.html], f.name, {type:'text/html'}); (navigator.canShare && navigator.canShare({files:[file]}) ? navigator.share({files:[file], title:f.name}) : navigator.share({title:f.name, text:t('pkm_rec_fp') + ': ' + PKM.rec.hash})).catch(() => {}); return; }
      if (a === 'pkm-again'){ PKM.rec = null; PKM.step = 'scan'; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'pkm-close'){ PKM.rec = null; PKM.step = 'scan'; SC.view = 'noqr'; if (PKM.a && !PKM.a.free && !PKM.a.found.length) {} return scRoute(); }
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-s]'); if (!el || el.tagName === 'FORM') return;
      const a = el.dataset.s; if (!/^pkm-/.test(a)) return;
      e.preventDefault(); e.stopPropagation(); pkmAction(a, el);
    }, true);
    document.addEventListener('change', (e) => { const el = e.target; if (el && el.dataset && el.dataset.pkm === 'purpose' && PKM.a){ const pu = pkPurpose(el.value); Object.assign(PKM.a.list, {purpose:pu.id, status_id:pu.status, holder:pu.holder === 'me' ? who() : pu.holder === 'client' ? '' : pu.holder}); pkmSave(); scRender(); } });
    document.addEventListener('submit', (e) => {
      const f = e.target; if (!f.dataset || f.dataset.s !== 'pkm-typed') return;
      e.preventDefault(); e.stopImmediatePropagation();
      const i = document.getElementById('pkm-in'), v = i ? i.value : ''; if (i){ i.value = ''; i.focus(); }
      if (String(v).trim()) PKM.chain = PKM.chain.then(() => pkmHandle(v)).catch(() => {});
    }, true);
    const tagReg = () => { try { if (typeof TAG_SCAN_HANDLERS !== 'undefined' && Array.isArray(TAG_SCAN_HANDLERS) && !TAG_SCAN_HANDLERS.some(h => h && h.id === 'pick'))
      TAG_SCAN_HANDLERS.unshift({id:'pick', active:() => SC.view === 'pick' && PKM.step === 'scan' && !!PKM.a, handle:(code) => { PKM.chain = PKM.chain.then(() => pkmHandle(code)).catch(() => {}); return true; }}); } catch(e){} };
    tagReg(); document.addEventListener('DOMContentLoaded', tagReg);
    window.PKM_API = {pkmHandle, pkmRecord, pkmLoad, pkmFree, pkmSigFlush, PKM_LS, PKM_SIG_LS};
  })();
}
