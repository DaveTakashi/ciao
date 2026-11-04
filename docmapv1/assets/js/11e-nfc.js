/* =====================================================================
   DocMap 2026 — v12 (stream C): one pipeline for every scanned tag (QR / NFC / keyboard) + Web NFC on scan.html

   1. onTagScanned(text, via) — both pages. `text` is what the tag holds (usually the QR URL
      https://qr7.it/<short_code>, or a short code / speaking code typed by a USB scanner); `via` is
      'qr' (camera) | 'nfc' (NFC tag) | 'keyboard' (USB scanner / typed). The handlers registered in
      TAG_SCAN_HANDLERS are tried in order; the first whose active() is true gets the tag:
          TAG_SCAN_HANDLERS.unshift({id:'status', active:() => …, handle:(text, via) => …});   // e.g. a status mode
      Built-in handlers:
        - scan.html  'assoc' — sequence view of 11b ("Scansiona in sequenza"): SA_API.saHandle(text, via) with
                     via mapped to the activity-log values 'phone-camera' | 'phone-nfc' | 'phone-typed';
                     'open' (fallback) — any other view: opens the scanned binder / location page.
        - index.html 'assoc' — desktop Modalità associazione (06h locAssocInput) with via 'camera' | 'nfc' | 'scanner'.
      Returns the id of the handler that took the tag ('' when none). 11b's phone camera + typed form and
      06h's desktop camera call it, so a future reader (NFC, RFID gate…) only has to call onTagScanned too.

   2. Web NFC (scan.html, Chrome on Android only: `'NDEFReader' in window`; hidden everywhere else):
      - "Scrivi su tag NFC" for editors on the binder card and on the location page: writes ONE NDEF URL record
        whose data is the same short_url printed in the QR (`NDEFReader.write({records:[{recordType:'url', data}]})`).
        No new id: a tag is just another carrier of short_code (see docs/RFID-NFC.md).
      - "Leggi tag NFC": continuous NDEFReader.scan(); every tag read goes to onTagScanned(text, 'nfc').
        The same tag is ignored for NFC_DEDUPE_MS. A blank / foreign tag shows a message.
      - iPhone: Safari has no Web NFC, but iOS reads NDEF URL tags natively and opens the URL, exactly like a QR.
   State: NFC = {reader, ctrl (AbortController of the scan), writing, msg, last:{key, at}} (memory only).
   ===================================================================== */
'use strict';

const TAG_SCAN_HANDLERS = [];   // [{id, active():bool, handle(text, via)}] — first active one wins
const NFC_DEDUPE_MS = 1500;
const NFC = { reader:null, ctrl:null, writing:null, msg:null, last:null };
window.TAG_SCAN_HANDLERS = TAG_SCAN_HANDLERS;
window.NFC = NFC;   // tests and debugging

function nfcSupported(){ return typeof window !== 'undefined' && typeof window.NDEFReader === 'function'; }

/** Dispatch one scanned tag. via: 'qr' | 'nfc' | 'keyboard'. */
function onTagScanned(text, via){
  const s = String(text == null ? '' : text).trim(); if (!s) return '';
  via = ['qr', 'nfc', 'keyboard'].includes(via) ? via : 'qr';
  for (const h of TAG_SCAN_HANDLERS){
    let on = false; try { on = !!(h && h.active && h.active()); } catch(e){ on = false; }
    if (!on) continue;
    try { h.handle(s, via); } catch(e){ console.warn('tag', h.id, e); }
    return h.id;
  }
  return '';
}
window.onTagScanned = onTagScanned;

/** Text of an NDEF message: the first url / absolute-url / text record ('' when none). */
function nfcRecordsText(records){
  for (const r of (records || [])){
    if (!r || !['url', 'absolute-url', 'text'].includes(r.recordType) || r.data == null) continue;
    try {
      const txt = typeof r.data === 'string' ? r.data : new TextDecoder(r.encoding || 'utf-8').decode(r.data);
      if (String(txt).trim()) return String(txt).trim();
    } catch(e){}
  }
  return '';
}

/* ---------------- i18n ---------------- */
Object.assign(I18N.it, {
  nfc_write:'Scrivi su tag NFC', nfc_write_wait:'Avvicina il tag NFC al retro del telefono…', nfc_written:'Tag NFC scritto: {c}', nfc_write_err:'Tag non scritto: {m}',
  nfc_read:'Leggi tag NFC', nfc_read_stop:'Ferma lettura NFC', nfc_read_on:'Lettura NFC attiva: avvicina un tag.', nfc_read_err:'NFC non disponibile: {m}', nfc_blank:'Tag NFC vuoto o di un altro sistema.',
  nfc_cancel:'Annulla', nfc_hint:'Il tag NFC contiene lo stesso indirizzo del QR: un iPhone lo apre da solo avvicinandolo.', nfc_h:'Tag NFC'
});
Object.assign(I18N.en, {
  nfc_write:'Write to NFC tag', nfc_write_wait:'Hold the NFC tag against the back of the phone…', nfc_written:'NFC tag written: {c}', nfc_write_err:'Tag not written: {m}',
  nfc_read:'Read NFC tags', nfc_read_stop:'Stop NFC reading', nfc_read_on:'NFC reading on: hold a tag near the phone.', nfc_read_err:'NFC not available: {m}', nfc_blank:'Blank NFC tag or tag of another system.',
  nfc_cancel:'Cancel', nfc_hint:'The NFC tag holds the same address as the QR: an iPhone opens it by itself when held near it.', nfc_h:'NFC tag'
});

/* ---------------- desktop (index.html): Modalità associazione ---------------- */
if (typeof LUI !== 'undefined' && typeof locAssocInput === 'function'){
  TAG_SCAN_HANDLERS.push({ id:'assoc', active:() => !!(LUI.assoc && LUI.assoc.on),
    handle:(text, via) => locAssocInput(text, via === 'keyboard' ? 'scanner' : via === 'nfc' ? 'nfc' : 'camera') });
}

/* ---------------- phone (scan.html) ---------------- */
if (typeof SC !== 'undefined' && typeof scRender === 'function'){
  (function(){
    Object.assign(SC_ICONS, {
      nfc:'<path d="M6 8.3a6 6 0 0 1 0 7.4"/><path d="M9.5 6a10 10 0 0 1 0 12"/><path d="M13 3.6a14 14 0 0 1 0 16.8"/><circle cx="3" cy="12" r="1"/>'
    });
    const PHONE_VIA = {qr:'phone-camera', nfc:'phone-nfc', keyboard:'phone-typed'};
    const canEdit = () => !!(SC.user && SC.P && SC.P.auth.can('edit'));

    // association sequence view (11b): every tag goes into the active box
    TAG_SCAN_HANDLERS.push({ id:'assoc', active:() => SC.view === 'seq' && !!window.SA_API,
      handle:(text, via) => window.SA_API.saHandle(text, PHONE_VIA[via] || 'phone-camera') });
    // anywhere else: open the page of the scanned binder / location
    TAG_SCAN_HANDLERS.push({ id:'open', active:() => !!SC.P && !['boot', 'login', 'setup', 'token', 'edit'].includes(SC.view), handle:(text, via) => nfcOpen(text, via) });

    function nfcOpen(text, via){
      const p = assocParseCode(text); if (!p.type) { NFC.msg = {kind:'warn', text:t('nfc_blank')}; return scRender(); }
      const qs = new URLSearchParams(location.search); ['q', 'qr', 'code'].forEach(k => qs.delete(k)); qs.set(p.type === 'text' ? 'code' : 'q', p.code);
      history.pushState(null, '', 'scan.html?' + qs.toString()); SC.params = scParams(); SC.msg = null;
      if (via === 'nfc') SC.via = 'nfc';   // v12: the access log (06k-access.js) records how the page was reached
      return scRoute();
    }

    /* ---- write ---- */
    function nfcTarget(){
      if (SC.view === 'card' && SC.rec) { const b = SC.rec.binder; return b.short_code ? {code:b.speaking_code, url:b.short_url || shortUrl(b.short_code)} : null; }
      if (SC.view === 'location' && SC.loc) { const l = SC.loc.location; return l.short_code ? {code:l.code, url:l.short_url || shortUrl(l.short_code)} : null; }
      return null;
    }
    async function nfcWrite(){
      const tg = nfcTarget(); if (!tg || !nfcSupported() || NFC.writing) return;
      const ctrl = new AbortController(); NFC.writing = ctrl; NFC.msg = {kind:'warn', text:t('nfc_write_wait')}; nfcPaint();
      try {
        const w = new NDEFReader();
        await w.write({records:[{recordType:'url', data:tg.url}]}, {signal:ctrl.signal, overwrite:true});
        NFC.msg = {kind:'ok', text:t('nfc_written', {c:tg.code})}; if (typeof dmScanFeedback === 'function') dmScanFeedback('ok');
      } catch(e){
        NFC.msg = ctrl.signal.aborted ? null : {kind:'err', text:t('nfc_write_err', {m:e && (e.message || e.name) || e})};
      }
      NFC.writing = null; nfcPaint();
    }

    /* ---- continuous read ---- */
    async function nfcReadStart(){
      if (NFC.reader || !nfcSupported()) return;
      const ctrl = new AbortController(), r = new NDEFReader();
      NFC.reader = r; NFC.ctrl = ctrl; NFC.msg = {kind:'ok', text:t('nfc_read_on')};
      r.onreading = (ev) => {
        const txt = nfcRecordsText(ev && ev.message && ev.message.records), key = (ev && ev.serialNumber || '') + '|' + txt, now = Date.now();
        if (NFC.last && NFC.last.key === key && now - NFC.last.at < NFC_DEDUPE_MS) return;
        NFC.last = {key, at:now};
        if (!txt || !assocParseCode(txt).type){ NFC.msg = {kind:'warn', text:t('nfc_blank')}; if (typeof dmScanFeedback === 'function') dmScanFeedback('warn'); return nfcPaint(); }
        NFC.msg = null; onTagScanned(txt, 'nfc');
      };
      r.onreadingerror = () => { NFC.msg = {kind:'warn', text:t('nfc_blank')}; nfcPaint(); };
      try { await r.scan({signal:ctrl.signal}); }
      catch(e){ NFC.reader = null; NFC.ctrl = null; NFC.msg = {kind:'err', text:t('nfc_read_err', {m:e && (e.message || e.name) || e})}; }
      nfcPaint();
    }
    function nfcReadStop(){ if (NFC.ctrl){ try { NFC.ctrl.abort(); } catch(e){} } NFC.reader = null; NFC.ctrl = null; }

    /* ---- UI ---- */
    function nfcMsgHTML(){ const m = NFC.msg; return m ? '<div class="sc-msg ' + esc(m.kind) + ' nfc-msg" role="status" id="nfc-msg">' + sic(m.kind === 'ok' ? 'check' : 'nfc') + '<span>' + esc(m.text) + '</span></div>' : ''; }
    function nfcReadBtnHTML(){
      return '<button type="button" class="sc-btn sc-block nfc-read' + (NFC.reader ? ' on' : '') + '" data-s="nfc-read" id="nfc-read" aria-pressed="' + !!NFC.reader + '">' + sic('nfc') + esc(NFC.reader ? t('nfc_read_stop') : t('nfc_read')) + '</button>';
    }
    function nfcBoxHTML(){
      const tg = nfcTarget(), ed = canEdit() && tg;
      return '<section class="sc-card nfc-box" id="nfc-box"><h2>' + sic('nfc') + esc(t('nfc_h')) + '</h2>' + nfcMsgHTML() +
        '<div class="nfc-btns">' + (ed ? (NFC.writing ? '<button type="button" class="sc-btn sc-block" data-s="nfc-cancel" id="nfc-cancel">' + esc(t('nfc_cancel')) + '</button>'
          : '<button type="button" class="sc-btn sc-primary sc-block" data-s="nfc-write" id="nfc-write">' + sic('nfc') + esc(t('nfc_write')) + '</button>') : '') + nfcReadBtnHTML() + '</div>' +
        '<p class="sc-hint">' + esc(t('nfc_hint')) + '</p></section>';
    }
    /** Inject (or refresh) the NFC block of the current view. Nothing at all without Web NFC. */
    function nfcPaint(){
      if (!nfcSupported()) return;
      const old = document.getElementById('nfc-box'); if (old) old.remove();
      const main = document.querySelector('#app .sc-main'); if (!main) return;
      if (SC.view === 'seq'){
        const cam = main.querySelector('.sa-cam'); if (cam) cam.insertAdjacentHTML('afterend', '<div class="nfc-box nfc-seq" id="nfc-box">' + nfcReadBtnHTML() + nfcMsgHTML() + '</div>');
        return;
      }
      if (!['card', 'location', 'noqr', 'notfound', 'locnf'].includes(SC.view) || !SC.user) return;
      const html = nfcBoxHTML(), foot = main.querySelector('.sc-foot');
      if (foot) foot.insertAdjacentHTML('beforebegin', html); else main.insertAdjacentHTML('beforeend', html);
    }
    const scRenderBase = scRender;
    scRender = function(){
      if (SC.view === 'edit' || SC.view === 'login') { if (NFC.writing){ try { NFC.writing.abort(); } catch(e){} NFC.writing = null; } }
      const r = scRenderBase.apply(this, arguments);
      nfcPaint();
      return r;
    };
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-s]'); if (!el) return;
      const a = el.dataset.s; if (!/^nfc-/.test(a)) return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'nfc-write') return nfcWrite();
      if (a === 'nfc-cancel'){ if (NFC.writing){ try { NFC.writing.abort(); } catch(x){} } return; }
      if (a === 'nfc-read'){ if (NFC.reader){ nfcReadStop(); NFC.msg = null; return nfcPaint(); } return nfcReadStart(); }
    }, true);
    window.addEventListener('pagehide', nfcReadStop);
    window.NFC_API = {nfcWrite, nfcReadStart, nfcReadStop, nfcPaint, nfcRecordsText, PHONE_VIA};
  })();
}

/* ---------------- help topic (index.html) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'nfc')) return;
  HELP_TOPICS.push({ id:'nfc', tags:['qr', 'archive'], acts:['how'], pop:30, related:['archives', 'locations', 'mobile'],
    kw:{it:'nfc tag rfid adesivo chip android iphone avvicina scrivi leggi varco', en:'nfc tag rfid sticker chip android iphone tap write read gate'},
    title:{it:'Posso usare tag NFC al posto (o insieme) dei QR?', en:'Can I use NFC tags instead of (or with) QR codes?'},
    body:{
      it:'<p>Sì. Un tag NFC contiene <b>lo stesso indirizzo del QR</b> (<span class="kbd">https://qr7.it/…</span>): niente codici nuovi, stesso faldone o stessa ubicazione.</p>' +
        '<p><b>Scrivere il tag (Android, Chrome).</b> Apri la pagina del faldone o dell\'ubicazione dal telefono (scansionando il QR) e premi <b>Scrivi su tag NFC</b>, poi avvicina il tag al retro del telefono. Serve un utente che può modificare.</p>' +
        '<p><b>Leggere.</b> Su Android premi <b>Leggi tag NFC</b>: ogni tag avvicinato apre la sua scheda, e in <b>Scansiona in sequenza</b> (Modalità associazione) finisce nella scatola attiva come un QR. Su <b>iPhone</b> non serve nulla: iOS legge i tag NFC da solo e apre l\'indirizzo come quando inquadri un QR (Safari non permette di scrivere i tag).</p>' +
        '<p>Su PC e su iPhone i pulsanti NFC non compaiono. In futuro varchi RFID potranno registrare i passaggi tra stanze e uscite con lo stesso codice (vedi docs/RFID-NFC.md).</p>',
      en:'<p>Yes. An NFC tag holds <b>the same address as the QR</b> (<span class="kbd">https://qr7.it/…</span>): no new codes, same binder or same location.</p>' +
        '<p><b>Writing the tag (Android, Chrome).</b> Open the binder or location page on the phone (by scanning the QR) and press <b>Write to NFC tag</b>, then hold the tag against the back of the phone. A user who can edit is needed.</p>' +
        '<p><b>Reading.</b> On Android press <b>Read NFC tags</b>: every tag held near the phone opens its page, and in <b>Scan in sequence</b> (Association mode) it goes into the active box like a QR. On <b>iPhone</b> nothing is needed: iOS reads NFC tags by itself and opens the address as when you point at a QR (Safari cannot write tags).</p>' +
        '<p>On PCs and iPhones the NFC buttons do not appear. In the future RFID gates may record passages between rooms and exits with the same code (see docs/RFID-NFC.md).</p>'
    }});
});
