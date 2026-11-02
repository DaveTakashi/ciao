/* =====================================================================
   DocMap 2026 — v11 (stream X): camera QR scanner + "Modalità associazione" on the phone page (scan.html)

   1. DMCamScanner (both pages): continuous QR scanning from the camera.
        const cam = new DMCamScanner({onCode:(text) => …}); await cam.start(); cam.attach(box); … cam.stop();
      Uses the native BarcodeDetector when the browser has it (Chrome Android, Edge), otherwise the vendored
      offline decoder vendor/jsqr.js (jsQR 1.4.0, Apache-2.0), loaded lazily with a classic <script> so it also
      works from file://. The same text is reported again only after DM_CAM_DEDUPE_MS without seeing it.
      dmDecodeQRCanvas(canvas) → Promise<text|''> decodes one frame (used by the tests).

   2. scan.html (only when 11-scan.js is loaded, i.e. `SC` exists):
      - /q/<location short code> (dm26L + 8, see 02c-locations.js) shows the location: path, sub-locations,
        binders inside, and for editors a big "Avvia associazione qui" button.
      - Association state, per device, in localStorage SA_LS = 'docmap_v26_assoc':
          {v:1, user, box:{id, code, title, path, short_code}, startedAt, at (last activity, ms), n,
           list:[{id, code, company, from:{id, code}, prev_code, to:{id, code}, etag, at, undone}]}  (list ≤ 200)
        It expires after SA_IDLE_MS (30 min) without activity, and belongs to the user who started it.
      - While active: opening any binder QR URL assigns that binder to the active box at once
        (DataProvider.saveBinderPatch with {location_id, location_code}, force: the patch only touches the
        location fields and the server/provider merges them onto the current record), with a banner, an undo
        button, a vibration and a beep. Opening another location QR switches the active box.
      - "Scansiona in sequenza": in-page camera, keeps scanning (location QR → switch box, binder QR → assign),
        running list "Scatola B04: 12 faldoni", duplicate detection; also accepts typed / keyboard-scanner codes.
      - Every assignment and undo is logged: action 'binder.locate', details {from, to, via:'phone'|'phone-camera'|
        'phone-typed'|'undo', device, user} (source 'mobile', like any phone edit).
      - Data access: DataProvider.getLocationByQr / getLocationById (added below to LocalDataProvider and
        RemoteDataProvider: local state, or GET ?r=location on the server). Network is needed in remote mode.
   ===================================================================== */
'use strict';

/* ---------------- 1. camera scanner (shared) ---------------- */
const DM_CAM_DEDUPE_MS = 2500;
let DM_JSQR_PROMISE = null;
/** Load vendor/jsqr.js once (classic script tag: works from file:// and offline). */
function dmLoadJsQR(){
  if (typeof window.jsQR === 'function') return Promise.resolve(window.jsQR);
  if (DM_JSQR_PROMISE) return DM_JSQR_PROMISE;
  DM_JSQR_PROMISE = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = window.DM_JSQR_SRC || 'vendor/jsqr.js';
    s.onload = () => typeof window.jsQR === 'function' ? res(window.jsQR) : rej(new Error('jsQR'));
    s.onerror = () => { DM_JSQR_PROMISE = null; rej(new Error('vendor/jsqr.js')); };
    document.head.appendChild(s);
  });
  return DM_JSQR_PROMISE;
}
/** Decode the QR in a canvas (or image data source) with the offline decoder. */
async function dmDecodeQRCanvas(cv){
  const jsQR = await dmLoadJsQR();
  const g = cv.getContext('2d', {willReadFrequently:true}), d = g.getImageData(0, 0, cv.width, cv.height);
  const r = jsQR(d.data, d.width, d.height, {inversionAttempts:'attemptBoth'});
  return r ? r.data : '';
}
class DMCamScanner {
  constructor(o){
    o = o || {};
    this.onCode = o.onCode || (() => {}); this.dedupeMs = o.dedupeMs || DM_CAM_DEDUPE_MS; this.interval = o.interval || 180;
    this.video = document.createElement('video'); this.video.className = 'dm-cam'; this.video.muted = true; this.video.autoplay = true;
    this.video.setAttribute('playsinline', ''); this.video.setAttribute('muted', '');
    this.stream = null; this.running = false; this.last = ''; this.lastAt = 0; this.engine = ''; this.timer = 0; this.cv = null;
  }
  static supported(){ return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  async start(){
    if (!DMCamScanner.supported()) throw new Error(t('cam_unsupported'));
    this.stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}, audio:false});
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch(e){}
    this.detect = await this.makeDetector();
    this.running = true; this.tick();
    return this;
  }
  async makeDetector(){
    if (typeof window.BarcodeDetector === 'function'){
      try {
        const f = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
        if (f.includes('qr_code')){ const d = new window.BarcodeDetector({formats:['qr_code']}); this.engine = 'native'; return async (v) => { const r = await d.detect(v); return r && r.length ? r[0].rawValue : ''; }; }
      } catch(e){}
    }
    const jsQR = await dmLoadJsQR(); this.engine = 'jsqr';
    this.cv = document.createElement('canvas');
    return async (v) => {
      const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return '';
      const k = Math.min(1, 720 / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
      if (this.cv.width !== cw) this.cv.width = cw; if (this.cv.height !== ch) this.cv.height = ch;
      const g = this.cv.getContext('2d', {willReadFrequently:true}); g.drawImage(v, 0, 0, cw, ch);
      const r = jsQR(g.getImageData(0, 0, cw, ch).data, cw, ch, {inversionAttempts:'dontInvert'});
      return r ? r.data : '';
    };
  }
  tick(){
    if (!this.running) return;
    this.timer = setTimeout(async () => {
      if (!this.running) return;
      try { if (this.video.readyState >= 2){ const txt = await this.detect(this.video); if (txt) this.emit(txt); } } catch(e){}
      this.tick();
    }, this.interval);
  }
  /** Report a decoded text, skipping the same text seen again within dedupeMs (the QR is still in front of the lens). */
  emit(txt){
    const now = Date.now();
    if (txt === this.last && now - this.lastAt < this.dedupeMs){ this.lastAt = now; return; }
    this.last = txt; this.lastAt = now;
    try { this.onCode(txt); } catch(e){ console.warn('scan', e); }
  }
  /** Put the live video in a box (re-attaching after a re-render keeps it playing). */
  attach(box){ if (!box) return; if (this.video.parentNode !== box){ box.innerHTML = ''; box.appendChild(this.video); } try { const p = this.video.play(); if (p && p.catch) p.catch(() => {}); } catch(e){} }
  stop(){
    this.running = false; clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(tr => { try { tr.stop(); } catch(e){} });
    this.stream = null; try { this.video.srcObject = null; } catch(e){}
    if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
  }
}
/** Short confirmation feedback: vibration (phones) + a soft beep (WebAudio, no file). kind: ok | switch | warn */
function dmScanFeedback(kind){
  try { if (navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) navigator.vibrate(kind === 'warn' ? [60, 60, 60] : kind === 'switch' ? [40, 40, 120] : 70); } catch(e){}
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = dmScanFeedback.ac || (dmScanFeedback.ac = new AC()), o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = kind === 'warn' ? 220 : kind === 'switch' ? 660 : 880; g.gain.value = 0.06;
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + (kind === 'switch' ? 0.18 : 0.09));
  } catch(e){}
}

Object.assign(I18N.it, { cam_unsupported:'Questo browser non dà accesso alla fotocamera.' });
Object.assign(I18N.en, { cam_unsupported:'This browser gives no access to the camera.' });

/* ---------------- 2. scan.html: association mode ---------------- */
if (typeof SC !== 'undefined' && typeof scRoute === 'function'){
  (function(){
    Object.assign(I18N.it, {
      sa_title:'DocMap — Ubicazione', sa_loc:'Ubicazione', sa_start:'Avvia associazione qui', sa_active:'Associazione attiva', sa_stop:'Stop', sa_seq:'Scansiona in sequenza',
      sa_hint:'Da ora ogni QR di faldone che apri finisce in questa scatola. Il QR di un\'altra scatola cambia la scatola attiva.',
      sa_here:'Associazione attiva in questa ubicazione.', sa_ro:'Puoi solo consultare questa ubicazione.', sa_binders:'Faldoni qui', sa_children:'Contiene', sa_none:'Nessun faldone in questa ubicazione.',
      sa_count:'{n} faldoni', sa_count1:'1 faldone', sa_session:'{n} in questa sessione', sa_assigned:'{b} messo in {l}', sa_already:'{b} è già in {l}', sa_switched:'Scatola attiva: {l}',
      sa_undo:'Annulla', sa_undone:'Annullato: {b} torna in {l}', sa_undone0:'Annullato: {b} senza ubicazione', sa_expired:'Associazione scaduta dopo 30 minuti senza scansioni.',
      sa_stopped:'Associazione terminata: {n} faldoni registrati.', sa_nf_h:'Ubicazione non trovata', sa_nf_p:'Questo QR non corrisponde a nessuna ubicazione dell\'archivio. Forse è stata eliminata o non è ancora sincronizzata.',
      sa_seq_h:'Scansione in sequenza', sa_cam_wait:'Inquadra un QR: scatola o faldone.', sa_cam_err:'Fotocamera non disponibile: {m}', sa_cam_on:'Accendi fotocamera', sa_cam_off:'Spegni fotocamera',
      sa_nobox:'Scansiona prima il QR di una scatola.', sa_unknown:'QR sconosciuto: {c}', sa_dup:'Già registrato in {l}: {b}', sa_typed:'Codice (lettore o tastiera)', sa_typed_ph:'QR o codice del faldone, poi Invio',
      sa_close:'Chiudi', sa_last:'Ultime scansioni', sa_was:'era in {l}', sa_nowhere:'senza ubicazione', sa_err:'Non salvato: {m}', sa_open:'Apri', sa_ed_only:'Serve un utente che può modificare.',
      sa_back_loc:'Torna all\'ubicazione'
    });
    Object.assign(I18N.en, {
      sa_title:'DocMap — Location', sa_loc:'Location', sa_start:'Start association here', sa_active:'Association mode on', sa_stop:'Stop', sa_seq:'Scan in sequence',
      sa_hint:'From now on every binder QR you open goes into this box. The QR of another box switches the active box.',
      sa_here:'Association mode is on for this location.', sa_ro:'You can only view this location.', sa_binders:'Binders here', sa_children:'Contains', sa_none:'No binders in this location.',
      sa_count:'{n} binders', sa_count1:'1 binder', sa_session:'{n} this session', sa_assigned:'{b} put in {l}', sa_already:'{b} is already in {l}', sa_switched:'Active box: {l}',
      sa_undo:'Undo', sa_undone:'Undone: {b} back to {l}', sa_undone0:'Undone: {b} has no location', sa_expired:'Association mode expired after 30 minutes without scans.',
      sa_stopped:'Association mode ended: {n} binders recorded.', sa_nf_h:'Location not found', sa_nf_p:'This QR matches no location of the archive. It may have been deleted or not synced yet.',
      sa_seq_h:'Scan in sequence', sa_cam_wait:'Point at a QR: box or binder.', sa_cam_err:'Camera not available: {m}', sa_cam_on:'Turn camera on', sa_cam_off:'Turn camera off',
      sa_nobox:'Scan a box QR first.', sa_unknown:'Unknown QR: {c}', sa_dup:'Already recorded in {l}: {b}', sa_typed:'Code (scanner or keyboard)', sa_typed_ph:'Binder QR or code, then Enter',
      sa_close:'Close', sa_last:'Latest scans', sa_was:'was in {l}', sa_nowhere:'no location', sa_err:'Not saved: {m}', sa_open:'Open', sa_ed_only:'A user who can edit is needed.',
      sa_back_loc:'Back to the location'
    });
    Object.assign(SC_ICONS, {
      box:'<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>', scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
      stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>', undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
      chev:'<path d="m9 18 6-6-6-6"/>'
    });

    const SA_LS = 'docmap_v26_assoc', SA_DEV_LS = 'docmap_v26_scan_device', SA_IDLE_MS = 30 * 60 * 1000, SA_MAX_LIST = 200;
    const SA = { st:null, cam:null, busy:Promise.resolve(), msg:null, locInfo:null };
    window.SA = SA;   // tests and debugging

    /* ---- state ---- */
    function saDevice(){ let d = ''; try { d = localStorage.getItem(SA_DEV_LS) || ''; if (!d){ d = 'phone-' + uuid().slice(0, 8); localStorage.setItem(SA_DEV_LS, d); } } catch(e){ d = 'phone'; } return d; }
    function saUser(){ const u = SC.P && SC.P.auth.currentUser(); return u ? (u.username || u.id || '') : ''; }
    function saWho(){ const u = SC.P && SC.P.auth.currentUser() || {}; return u.display_name || u.username || 'Mobile'; }
    /** Read the stored state; drops it when expired or started by another user. */
    function saLoad(){
      let st = null; try { st = JSON.parse(localStorage.getItem(SA_LS) || 'null'); } catch(e){ st = null; }
      if (st && (!st.box || !st.box.id)) st = null;
      if (st && Date.now() - (+st.at || 0) > SA_IDLE_MS){ SA.msg = {kind:'warn', text:t('sa_expired')}; SC.msg = {kind:'warn', text:t('sa_expired'), sa:true}; saClear(); st = null; }
      if (st && SC.user && st.user && st.user !== saUser()){ saClear(); st = null; }
      SA.st = st; return st;
    }
    function saSave(){ if (!SA.st) return; SA.st.at = Date.now(); if (SA.st.list.length > SA_MAX_LIST) SA.st.list = SA.st.list.slice(-SA_MAX_LIST); try { localStorage.setItem(SA_LS, JSON.stringify(SA.st)); } catch(e){} }
    function saClear(){ SA.st = null; try { localStorage.removeItem(SA_LS); } catch(e){} }
    function saActive(){ return !!(SA.st && SC.user && SC.P.auth.can('edit')); }
    const saTitle = (l) => l.name || ((l.kind || locLevelName(+l.level || 0, {})) + ' ' + (l.seg || '')).trim();
    function saBoxFrom(r){ const l = r.location; return {id:l.id, code:l.code || '', title:saTitle(l), short_code:l.short_code || '', path:(r.path || []).map(saTitle).concat([saTitle(l)]).join(' › ')}; }
    function saStart(r){ SA.st = {v:1, user:saUser(), box:saBoxFrom(r), startedAt:nowISO(), at:Date.now(), n:0, list:[]}; saSave(); }
    function saSetBox(r){ SA.st.box = saBoxFrom(r); saSave(); }
    const saInBox = (id) => SA.st ? SA.st.list.filter(x => !x.undone && x.to.id === id).length : 0;

    /* ---- providers: locations ---- */
    function saLocPackLocal(st, l){
      if (!l) return null;
      locIndexUse(Array.isArray(st.locations) ? st.locations : []);
      try {
        const brief = (x) => ({id:x.id, code:locCodeFor(x.id) || x.code || '', name:x.name || '', kind:x.kind || '', seg:x.seg || '', level:locDepth(x.id)});
        const bs = (st.binders || []).filter(b => b.location_id === l.id).sort((a, b) => naturalCmp(a.speaking_code || '', b.speaking_code || ''));
        const loc = Object.assign({}, l, {code:locCodeFor(l.id) || l.code || '', level:locDepth(l.id)});
        return {location:loc, etag:l.updated_at, path:locPath(l.id).slice(0, -1).map(brief), children:locChildren(l.id).map(brief),
          binders:bs.slice(0, 500).map(b => ({id:b.id, speaking_code:b.speaking_code, company_name:b.company_name || '', binder_title:b.binder_title || '', color_hex:b.color_hex || '', short_code:b.short_code || ''})), count:bs.length};
      } finally { locIndexUse(null); }
    }
    LocalDataProvider.prototype.getLocationByQr = async function(qr){ const {st} = await this.readState(); if (!st) return null; return saLocPackLocal(st, (st.locations || []).find(l => l.short_code === String(qr || '').trim())); };
    LocalDataProvider.prototype.getLocationById = async function(id){ const {st} = await this.readState(); if (!st) return null; return saLocPackLocal(st, (st.locations || []).find(l => l.id === id)); };
    RemoteDataProvider.prototype.getLocation = async function(q){ try { return await this.srv.call('location', {q}); } catch(e){ if (e.code === 'not_found') return null; throw e; } };
    RemoteDataProvider.prototype.getLocationByQr = function(qr){ return this.getLocation({qr:String(qr || '').trim()}); };
    RemoteDataProvider.prototype.getLocationById = function(id){ return this.getLocation({id}); };

    /* ---- assignment ---- */
    /** Put the binder of `rec` ({binder, etag}) in the active box. Returns {kind:'ok'|'already'|'err', rec}. */
    async function saAssign(rec, via){
      const b = rec.binder, box = SA.st.box;
      if (b.location_id === box.id) return {kind:'already', rec};
      const fromId = b.location_id || '', from = {id:fromId, code:fromId ? String(b.location_code || '') : ''};
      const log = {action:'binder.locate', summary:'Faldone ' + b.speaking_code + ' messo in ' + box.code + (from.code ? ' (era in ' + from.code + ')' : '') + ' · associazione da telefono',
        details:{from, to:{id:box.id, code:box.code}, via, device:saDevice(), user:saUser()}};
      const r = await SC.P.data.saveBinderPatch(b.id, {location_id:box.id, location_code:box.code}, {etag:rec.etag, user:SC.P.auth.currentUser(), force:true, log});
      SA.st.n++;
      SA.st.list.push({id:b.id, code:b.speaking_code, company:b.company_name || '', from, prev_code:String(b.location_code || ''), to:{id:box.id, code:box.code}, etag:r.etag, at:nowISO(), undone:false});
      saSave();
      return {kind:'ok', rec:Object.assign({}, rec, {binder:r.binder, etag:r.etag})};
    }
    async function saUndo(i){
      const x = SA.st && SA.st.list[i]; if (!x || x.undone) return;
      try {
        const log = {action:'binder.locate', summary:'Annullata associazione: faldone ' + x.code + (x.from.code ? ' torna in ' + x.from.code : ' senza ubicazione'),
          details:{from:x.to, to:x.from, via:'undo', device:saDevice(), user:saUser()}};
        const r = await SC.P.data.saveBinderPatch(x.id, {location_id:x.from.id || '', location_code:x.from.id ? x.from.code : x.prev_code}, {etag:x.etag, user:SC.P.auth.currentUser(), force:true, log});
        x.undone = true; saSave();
        if (SC.rec && SC.rec.binder.id === x.id) SC.rec = Object.assign({}, SC.rec, {binder:r.binder, etag:r.etag});
        SA.msg = {kind:'warn', text:x.from.code ? t('sa_undone', {b:x.code, l:x.from.code}) : t('sa_undone0', {b:x.code})};
        dmScanFeedback('warn');
      } catch(e){ SA.msg = {kind:'err', text:t('sa_err', {m:e.message || e.code})}; }
      if (SC.view === 'seq') saSeqUpdate(); else scRender();
    }
    function saErrText(e){ return e.code === 'offline' ? t('sc_srv_off') : t('sa_err', {m:e.message || e.code}); }

    /* ---- routing ---- */
    const scRouteBase = scRoute;
    scRoute = async function(){
      SC.user = SC.P.auth.currentUser();
      if (SC.msg && SC.msg.sa) SC.msg = null;
      if (SC.user) saLoad(); else SA.st = null;
      const qr = SC.params.qr || '';
      if (SC.view === 'seq' && !(SC.user && LOC_SC_RE.test(qr))) saCamStop();
      if (!SC.user || (SC.P.server && !DocMapVault.srvToken()) || !LOC_SC_RE.test(qr)){
        await scRouteBase();
        if (SC.view === 'card' && SC.rec && saActive()) await saAutoAssign();
        return;
      }
      let r;
      try { r = await SC.P.data.getLocationByQr(qr); }
      catch(e){
        if (SC.P.server && e.code === 'unauthorized'){ SC.view = 'token'; SC.loginErr = t('sc_e_token'); return scRender(); }
        if (e.code === 'unauthorized'){ await SC.P.auth.logout(); return scRoute(); }
        SC.view = 'error'; SC.msg = {kind:'err', text:SC.P.server ? saErrText(e) : t('sc_storage')}; return scRender();
      }
      SC.rec = null; SC.loc = r;
      if (!r){ SC.view = 'locnf'; return scRender(); }
      if (SA.st && SC.P.auth.can('edit') && SA.st.box.id !== r.location.id){ saSetBox(r); SA.msg = {kind:'switch', text:t('sa_switched', {l:SA.st.box.code})}; dmScanFeedback('switch'); }
      else if (SA.st && SA.st.box.id === r.location.id){ saSetBox(r); }
      if (SC.view !== 'seq') SC.view = 'location';
      scRender();
    };
    /** Native-camera flow: a binder URL opened while association mode is on. */
    async function saAutoAssign(){
      const b = SC.rec.binder, box = SA.st.box;
      const undone = SA.st.list.some(x => x.id === b.id && x.to.id === box.id && x.undone) && b.location_id !== box.id;
      if (undone) return scRender();   // undone on purpose: reopening the same page must not put it back
      try {
        const res = await saAssign(SC.rec, 'phone');
        SC.rec = res.rec;
        SA.msg = res.kind === 'ok' ? {kind:'ok', text:t('sa_assigned', {b:b.speaking_code, l:box.code}), last:true} : {kind:'warn', text:t('sa_already', {b:b.speaking_code, l:box.code})};
        dmScanFeedback(res.kind === 'ok' ? 'ok' : 'warn');
      } catch(e){
        if (e.code === 'offline'){ scQueue({location_id:box.id, location_code:box.code}); SA.msg = {kind:'warn', text:t('sc_offline')}; }
        else SA.msg = {kind:'err', text:saErrText(e)};
      }
      scRender(); scLoadPhoto();
    }

    /* ---- rendering ---- */
    const scRenderBase = scRender;
    scRender = function(){
      if (['location', 'locnf', 'seq'].includes(SC.view)){
        if (SC.view !== 'seq') saCamStop();
        document.documentElement.lang = S.lang; document.title = t('sa_title');
        document.getElementById('app').innerHTML = scHeader() + (SC.view === 'location' ? saLocHTML() : SC.view === 'seq' ? saSeqHTML() : saNotFoundHTML());
        if (SC.view === 'seq'){ if (SA.cam) SA.cam.attach(document.getElementById('sa-video')); const i = document.getElementById('sa-typed'); if (i && !SA.cam) setTimeout(() => i.focus(), 30); }
        return;
      }
      scRenderBase();
      if (saActive() && ['card', 'edit', 'notfound', 'noqr'].includes(SC.view)){ const m = document.querySelector('#app .sc-main'); if (m) m.insertAdjacentHTML('afterbegin', saBannerHTML()); }
    };
    function saMsgHTML(){
      const m = SA.msg; if (!m) return '';
      const last = SA.st && m.last ? SA.st.list.length - 1 : -1, x = last >= 0 ? SA.st.list[last] : null;
      return '<div class="sa-msg ' + esc(m.kind) + '" id="sa-msg" role="status">' + sic(m.kind === 'ok' ? 'check' : m.kind === 'switch' ? 'box' : 'alert') + '<span>' + esc(m.text) +
        (x && x.from.code ? '<small>' + esc(t('sa_was', {l:x.from.code})) + '</small>' : '') + '</span>' +
        (x && !x.undone ? '<button type="button" class="sa-undo" data-s="sa-undo" data-i="' + last + '" id="sa-undo">' + sic('undo') + esc(t('sa_undo')) + '</button>' : '') + '</div>';
    }
    function saBannerHTML(){
      const A = SA.st, box = A.box, n = saInBox(box.id);
      return '<section class="sa-banner" id="sa-banner" aria-label="' + esc(t('sa_active')) + '"><div class="sa-b-top"><span class="sa-pulse" aria-hidden="true"></span><span class="sa-b-cap">' + esc(t('sa_active')) + '</span>' +
          '<button type="button" class="sa-stop" data-s="sa-stop" id="sa-stop">' + sic('stop') + esc(t('sa_stop')) + '</button></div>' +
        '<a class="sa-b-box" href="scan.html?q=' + encodeURIComponent(box.short_code) + '" data-s="sa-open-loc">' + sic('box') + '<span><b class="sa-b-code" id="sa-box">' + esc(box.code) + '</b><small>' + esc(box.path) + '</small></span></a>' +
        '<div class="sa-b-row"><span class="sa-b-n" id="sa-n">' + esc(t('sa_session', {n:A.n})) + (n ? ' · ' + esc(box.code.split('-').pop() + ': ' + (n === 1 ? t('sa_count1') : t('sa_count', {n}))) : '') + '</span>' +
          (SC.view === 'seq' ? '' : '<button type="button" class="sa-seq-btn" data-s="sa-seq" id="sa-seq">' + sic('scan') + esc(t('sa_seq')) + '</button>') + '</div>' + saMsgHTML() + '</section>';
    }
    function saLocHTML(){
      const r = SC.loc, l = r.location, canEdit = SC.P.auth.can('edit'), here = SA.st && SA.st.box.id === l.id;
      const path = (r.path || []);
      const nB = +r.count || 0;
      return '<main class="sc-main">' + scUserBar() + scMsgHTML() + (saActive() ? saBannerHTML() : (SA.msg ? saMsgHTML() : '')) +
        '<article class="sc-card sa-hero"><div class="sa-kind">' + sic('box') + esc(l.kind || locLevelName(+l.level || 0, {})) + '</div>' +
          '<div class="sa-code" id="sa-code">' + esc(l.code) + '</div>' + (l.name ? '<div class="sa-name">' + esc(l.name) + '</div>' : '') +
          (path.length ? '<ol class="sa-crumbs" id="sa-path">' + path.map(p => '<li>' + esc(saTitle(p)) + '</li>').join('') + '<li aria-current="true"><b>' + esc(saTitle(l)) + '</b></li></ol>' : '') +
          '<div class="sa-count" id="sa-count">' + esc(nB === 1 ? t('sa_count1') : t('sa_count', {n:nB})) + '</div>' +
          (l.notes ? '<p class="sc-notes">' + esc(l.notes) + '</p>' : '') + '</article>' +
        (canEdit ? (here ? '<div class="sc-msg ok sa-here" id="sa-here">' + sic('check') + '<span>' + esc(t('sa_here')) + '</span></div>' :
            '<button type="button" class="sc-btn sc-primary sc-block sa-start" data-s="sa-start" id="sa-start">' + sic('scan') + esc(t('sa_start')) + '</button><p class="sc-hint sa-hint">' + esc(t('sa_hint')) + '</p>')
          : '<div class="sc-ro sc-muted">' + sic('lock') + esc(t('sa_ro')) + '</div>') +
        ((r.children || []).length ? '<section class="sc-card"><h2>' + esc(t('sa_children')) + '</h2><ul class="sa-list">' + r.children.map(c => '<li><span class="sa-l-code">' + esc(c.code) + '</span><span class="sa-l-t">' + esc(saTitle(c)) + '</span></li>').join('') + '</ul></section>' : '') +
        '<section class="sc-card"><h2>' + esc(t('sa_binders')) + '</h2>' + ((r.binders || []).length ? '<ul class="sa-list" id="sa-binders">' + r.binders.map(b =>
          '<li><a href="scan.html?q=' + encodeURIComponent(b.short_code) + '" data-s="sa-open" data-q="' + esc(b.short_code) + '"><i class="sa-dot" style="background:' + esc(b.color_hex || '#2563EB') + '"></i><span class="sa-l-code">' + esc(b.speaking_code) + '</span><span class="sa-l-t">' + esc(b.company_name) + (b.binder_title ? ' · ' + esc(b.binder_title) : '') + '</span>' + sic('chev') + '</a></li>').join('') + '</ul>'
          : '<div class="sc-muted">' + esc(t('sa_none')) + '</div>') + '</section>' +
        '<div class="sc-foot sc-muted">' + esc(t('sc_updated', {d:fmtDate(l.updated_at, true)})) + (SC.P.mode === 'local' ? '<br>' + esc(t('sc_local')) : SC.P.server ? '<br>' + esc(t('sc_server')) : '') + '</div></main>';
    }
    function saNotFoundHTML(){
      return '<main class="sc-main">' + scUserBar() + '<div class="sc-card sc-info" id="sa-notfound"><div class="sc-lock">' + sic('alert') + '</div><h1>' + esc(t('sa_nf_h')) + '</h1><p>' + esc(t('sa_nf_p')) + '</p></div></main>';
    }
    function saSeqHTML(){
      return '<main class="sc-main sa-seqm"><div class="sc-edit-h"><button type="button" class="sc-icon" data-s="sa-seq-close" aria-label="' + esc(t('sa_close')) + '">' + sic('back') + '</button><h1>' + esc(t('sa_seq_h')) + '</h1></div>' +
        '<div id="sa-seq-head">' + saSeqHeadHTML() + '</div>' +
        '<div class="sa-cam' + (SA.cam ? ' on' : '') + '"><div class="sa-video" id="sa-video">' + (SA.cam ? '' : '<div class="sa-cam-off">' + sic('cam') + '<span>' + esc(t('sa_cam_wait')) + '</span></div>') + '</div>' +
          '<button type="button" class="sc-btn sc-block" data-s="sa-cam" id="sa-cam">' + sic('cam') + esc(SA.cam ? t('sa_cam_off') : t('sa_cam_on')) + '</button></div>' +
        '<form class="sa-typed" data-s="sa-typed-form"><label class="sc-field"><span>' + esc(t('sa_typed')) + '</span><input id="sa-typed" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t('sa_typed_ph')) + '"></label></form>' +
        '<section class="sc-card"><h2>' + esc(t('sa_last')) + '</h2><div id="sa-seq-list">' + saSeqListHTML() + '</div></section></main>';
    }
    function saSeqHeadHTML(){ return (saActive() ? saBannerHTML() : '<div class="sc-msg warn">' + sic('alert') + '<span>' + esc(t('sa_nobox')) + '</span></div>' + saMsgHTML()); }
    function saSeqListHTML(){
      const L = SA.st ? SA.st.list : [];
      if (!L.length) return '<div class="sc-muted">—</div>';
      const groups = []; L.forEach((x, i) => { let g = groups[groups.length - 1]; if (!g || g.code !== x.to.code){ g = {code:x.to.code, rows:[]}; groups.push(g); } g.rows.push([x, i]); });
      return groups.reverse().slice(0, 12).map(g => '<div class="sa-grp"><div class="sa-grp-h">' + sic('box') + '<b>' + esc(g.code) + '</b><span>' + esc(g.rows.filter(r => !r[0].undone).length === 1 ? t('sa_count1') : t('sa_count', {n:g.rows.filter(r => !r[0].undone).length})) + '</span></div><ul class="sa-list">' +
        g.rows.slice().reverse().map(([x, i]) => '<li class="' + (x.undone ? 'undone' : '') + '"><span class="sa-l-code">' + esc(x.code) + '</span><span class="sa-l-t">' + esc(x.company) + (x.from.code ? ' <small>' + esc(t('sa_was', {l:x.from.code})) + '</small>' : '') + '</span>' +
          (x.undone ? '' : '<button type="button" class="sa-undo sm" data-s="sa-undo" data-i="' + i + '" aria-label="' + esc(t('sa_undo')) + '">' + sic('undo') + '</button>') + '</li>').join('') + '</ul></div>').join('');
    }
    function saSeqUpdate(){ const h = document.getElementById('sa-seq-head'), l = document.getElementById('sa-seq-list'); if (h) h.innerHTML = saSeqHeadHTML(); if (l) l.innerHTML = saSeqListHTML(); }

    /* ---- sequence scanning (camera or typed) ---- */
    /** One scanned / typed text. Serialised: scans are handled one after the other, in order. */
    function saHandle(text, via){ SA.busy = SA.busy.then(() => saHandleOne(text, via)).catch(e => console.warn('assoc', e)); return SA.busy; }
    async function saHandleOne(text, via){
      if (!SC.user || !SC.P.auth.can('edit')){ SA.msg = {kind:'err', text:t('sa_ed_only')}; return saSeqUpdate(); }
      const p = assocParseCode(text);
      try {
        if (p.type === 'location'){
          const r = await SC.P.data.getLocationByQr(p.code);
          if (!r){ SA.msg = {kind:'err', text:t('sa_unknown', {c:p.code})}; dmScanFeedback('warn'); return saSeqUpdate(); }
          if (SA.st) saSetBox(r); else saStart(r);
          SA.msg = {kind:'switch', text:t('sa_switched', {l:SA.st.box.code})}; dmScanFeedback('switch'); return saSeqUpdate();
        }
        if (p.type === 'binder' || p.type === 'text'){
          if (!SA.st){ SA.msg = {kind:'warn', text:t('sa_nobox')}; dmScanFeedback('warn'); return saSeqUpdate(); }
          const box = SA.st.box;
          const rec = p.type === 'binder' ? await SC.P.data.getBinderByQr(p.code) : await SC.P.data.getBinderByCode(p.code);
          if (!rec){ SA.msg = {kind:'err', text:t('sa_unknown', {c:p.code})}; dmScanFeedback('warn'); return saSeqUpdate(); }
          if (SA.st.list.some(x => x.id === rec.binder.id && x.to.id === box.id && !x.undone) && rec.binder.location_id === box.id){ SA.msg = {kind:'warn', text:t('sa_dup', {b:rec.binder.speaking_code, l:box.code})}; dmScanFeedback('warn'); return saSeqUpdate(); }
          const res = await saAssign(rec, via);
          SA.msg = res.kind === 'ok' ? {kind:'ok', text:t('sa_assigned', {b:rec.binder.speaking_code, l:box.code}), last:true} : {kind:'warn', text:t('sa_already', {b:rec.binder.speaking_code, l:box.code})};
          dmScanFeedback(res.kind === 'ok' ? 'ok' : 'warn'); return saSeqUpdate();
        }
        SA.msg = {kind:'err', text:t('sa_unknown', {c:String(text || '').slice(0, 60)})}; dmScanFeedback('warn'); saSeqUpdate();
      } catch(e){ SA.msg = {kind:'err', text:saErrText(e)}; saSeqUpdate(); }
    }
    async function saCamToggle(){
      if (SA.cam){ saCamStop(); return scRender(); }
      const cam = new DMCamScanner({onCode:(txt) => (typeof onTagScanned === 'function' && onTagScanned(txt, 'qr')) || saHandle(txt, 'phone-camera')});   // v12: one pipeline (11e-nfc.js)
      SA.cam = cam;
      try { await cam.start(); scRender(); }
      catch(e){ SA.cam = null; try { cam.stop(); } catch(x){} SA.msg = {kind:'err', text:t('sa_cam_err', {m:e && e.message || e})}; scRender(); }
    }
    function saCamStop(){ if (SA.cam){ try { SA.cam.stop(); } catch(e){} SA.cam = null; } }
    function saGo(qr){
      const qs = new URLSearchParams(location.search); ['q', 'qr', 'code'].forEach(k => qs.delete(k)); qs.set('q', qr);
      history.pushState(null, '', 'scan.html?' + qs.toString()); SC.params = scParams(); SA.msg = null; return scRoute();
    }

    /* ---- card: show the location path under "Dov'è?" ---- */
    const scLoadPhotoBase = scLoadPhoto;
    scLoadPhoto = async function(){
      const p = scLoadPhotoBase();
      const r = SC.rec; if (!r || !r.binder.location_id || !SC.P.data.getLocationById) return p;
      try {
        const id = r.binder.location_id, x = await SC.P.data.getLocationById(id);
        if (!x || !SC.rec || SC.rec.binder.location_id !== id) return p;
        const el = document.getElementById('sc-loc-t'), txt = (x.path || []).map(saTitle).concat([saTitle(x.location)]).join(' › ');
        if (el && !document.getElementById('sa-wpath')) el.insertAdjacentHTML('beforebegin', '<div class="sc-loc-t sa-wpath" id="sa-wpath">' + esc(txt) + '</div>');
      } catch(e){}
      return p;
    };

    /* ---- events ---- */
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-s]'); if (!el) return;
      const a = el.dataset.s; if (!/^sa-/.test(a)) return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'sa-start'){ if (!SC.P.auth.can('edit') || !SC.loc) return; saStart(SC.loc); SA.msg = null; dmScanFeedback('switch'); return scRender(); }
      if (a === 'sa-stop'){ const n = SA.st ? SA.st.n : 0; saCamStop(); saClear(); SA.msg = null; SC.msg = {kind:'ok', text:t('sa_stopped', {n}), sa:true}; if (SC.view === 'seq') SC.view = SC.loc ? 'location' : (SC.rec ? 'card' : 'noqr'); return scRender(); }
      if (a === 'sa-undo') return saUndo(+el.dataset.i);
      if (a === 'sa-seq'){ SA.msg = null; SC.view = 'seq'; scRender(); window.scrollTo(0, 0); return; }
      if (a === 'sa-seq-close'){ saCamStop(); SA.msg = null; return SA.st && SA.st.box.short_code ? saGo(SA.st.box.short_code) : (SC.view = SC.rec ? 'card' : 'noqr', scRender()); }
      if (a === 'sa-cam') return saCamToggle();
      if (a === 'sa-open') return saGo(el.dataset.q);
      if (a === 'sa-open-loc'){ if (SC.view === 'location' && SC.loc && SA.st && SC.loc.location.id === SA.st.box.id) return; return saGo(SA.st.box.short_code); }
    }, true);
    document.addEventListener('submit', (e) => {
      const f = e.target; if (f.dataset.s !== 'sa-typed-form') return;
      e.preventDefault(); e.stopImmediatePropagation();
      const i = document.getElementById('sa-typed'), v = i ? i.value : ''; if (i) i.value = '';
      if (String(v).trim()) (typeof onTagScanned === 'function' && onTagScanned(v, 'keyboard')) || saHandle(v, 'phone-typed');
    }, true);
    window.addEventListener('popstate', () => { SC.params = scParams(); SA.msg = null; scRoute(); });
    window.addEventListener('pagehide', saCamStop);
    window.SA_API = {saHandle, saLoad, saClear, saAssign, SA_LS, SA_IDLE_MS};
  })();
}
