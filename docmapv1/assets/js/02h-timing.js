/* =====================================================================
   DocMap 2026 — v12.9 "Cronometro": real working times, measured where the work happens.

   Two kinds of sample, in milliseconds:
     find     from the first letter typed in the search (PC archive, phone «Cerca») to the binder card opened
     catalog  between two binders captured in a row in an inventory project (phone, scan.html?inv=…)
   A gap longer than DMT_PAUSE_MS is a pause (coffee, a phone call), never a sample.

   Privacy: only durations, the kind, the date and phone/PC are kept, in THIS browser only
   (localStorage 'docmap_timing_v1', last DMT_MAX samples). Nothing is synced or sent anywhere: the person copies the
   summary by hand (Impostazioni › Informazioni su DocMap on the PC, «Tempi misurati» on the phone page).
   Used by the real-device test (docs/COLLAUDO-REALE.md, rows T1–T3) and, later, by the «tempo risparmiato» counter.
   Shared by index.html and scan.html: needs only t() / I18N from 02-core.js.
   ===================================================================== */
'use strict';

const DMT_LS = 'docmap_timing_v1';
const DMT_MAX = 300;
const DMT_PAUSE_MS = 120000;
const DMT_KINDS = ['find', 'catalog'];
const DMT_TARGET = {find:15000, catalog:7000};   // the goals of the roadmap (wave 1 gate)
const DMT = {run:{}};

Object.assign(I18N.it, {
  dmt_h:'Tempi misurati', dmt_find:'Trovare un faldone', dmt_catalog:'Catalogare un faldone (inventario)',
  dmt_none:'nessuna misura', dmt_line:'{n} misure · mediana {m} s · 9 su 10 entro {p} s · obiettivo {g} s',
  dmt_note:'Restano solo su questo dispositivo: durate, mai nomi o codici. Servono al collaudo e a capire quanto tempo fa risparmiare.',
  dmt_copy:'Copia i tempi', dmt_copied:'Tempi copiati negli appunti', dmt_reset:'Azzera', dmt_reset_ok:'Tempi azzerati',
  dmt_dev_phone:'telefono', dmt_dev_pc:'PC',
});
Object.assign(I18N.en, {
  dmt_h:'Measured times', dmt_find:'Finding a binder', dmt_catalog:'Cataloguing a binder (inventory)',
  dmt_none:'no samples', dmt_line:'{n} samples · median {m} s · 9 in 10 within {p} s · goal {g} s',
  dmt_note:'They stay on this device only: durations, never names or codes. Used for the field test and to show the time saved.',
  dmt_copy:'Copy the times', dmt_copied:'Times copied to the clipboard', dmt_reset:'Reset', dmt_reset_ok:'Times reset',
  dmt_dev_phone:'phone', dmt_dev_pc:'PC',
});

function dmtNow(){ return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function dmtDevice(){ try { return window.matchMedia && matchMedia('(pointer:coarse)').matches ? 'phone' : 'pc'; } catch(e){ return 'pc'; } }
function dmtLoad(){
  try {
    const a = JSON.parse(localStorage.getItem(DMT_LS) || '[]');
    return Array.isArray(a) ? a.filter(x => x && DMT_KINDS.includes(x.k) && typeof x.ms === 'number' && x.ms > 0) : [];
  } catch(e){ return []; }
}
/** Store one sample. Returns false (and stores nothing) for an unknown kind, a non-positive time or a pause. */
function dmtAdd(kind, ms, via){
  if (!DMT_KINDS.includes(kind) || !(ms > 0) || ms > DMT_PAUSE_MS) return false;
  const a = dmtLoad();
  a.push({k:kind, ms:Math.round(ms), at:new Date().toISOString(), dev:dmtDevice(), via:String(via || '').slice(0, 20)});
  try { localStorage.setItem(DMT_LS, JSON.stringify(a.slice(-DMT_MAX))); } catch(e){ return false; }
  return true;
}
function dmtStart(kind){ DMT.run[kind] = dmtNow(); }
/** Start only if nothing is running (or what runs is older than a pause): typing more letters keeps the first start. */
function dmtStartIfIdle(kind){ const s = DMT.run[kind]; if (!s || dmtNow() - s > DMT_PAUSE_MS) dmtStart(kind); }
function dmtStop(kind, via){ const s = DMT.run[kind]; delete DMT.run[kind]; return s ? dmtAdd(kind, dmtNow() - s, via) : false; }
function dmtCancel(kind){ delete DMT.run[kind]; }
function dmtRunning(kind){ return !!DMT.run[kind]; }
function dmtReset(){ DMT.run = {}; try { localStorage.removeItem(DMT_LS); } catch(e){} }

/** Nearest-rank percentile of a sorted array (p in 0..1). */
function dmtPct(sorted, p){ return sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : 0; }
function dmtStats(kind, list){
  const v = (list || dmtLoad()).filter(x => x.k === kind).map(x => x.ms).sort((a, b) => a - b);
  return v.length ? {n:v.length, median:dmtPct(v, 0.5), p90:dmtPct(v, 0.9), best:v[0], target:DMT_TARGET[kind]} : {n:0, target:DMT_TARGET[kind]};
}
function dmtSec(ms){ const s = (ms / 1000).toFixed(1); return (typeof S !== 'undefined' && S && S.lang === 'en') ? s : s.replace('.', ','); }
function dmtLine(st){ return st.n ? t('dmt_line', {n:st.n, m:dmtSec(st.median), p:dmtSec(st.p90), g:dmtSec(st.target)}) : t('dmt_none'); }
/** Plain text for a message to support / to Dave (also inside «Copia dati per l'assistenza» on the PC). */
function dmtSummaryText(){
  const L = dmtLoad();
  return t('dmt_h') + ' (' + t(dmtDevice() === 'phone' ? 'dmt_dev_phone' : 'dmt_dev_pc') + ')\n' +
    DMT_KINDS.map(k => '- ' + t('dmt_' + k) + ': ' + dmtLine(dmtStats(k, L))).join('\n');
}
/** Small block (same markup on PC and phone; styled by .dmt-* in docmap.css and css-scan.css). */
function dmtHTML(){
  const L = dmtLoad();
  return '<div class="dmt" id="dmt"><ul class="dmt-list">' + DMT_KINDS.map(k => {
      const st = dmtStats(k, L), ok = st.n && st.median <= st.target;
      return '<li id="dmt-' + k + '"><b>' + esc(t('dmt_' + k)) + '</b><span class="dmt-v' + (st.n ? (ok ? ' ok' : ' slow') : '') + '">' + esc(dmtLine(st)) + '</span></li>';
    }).join('') + '</ul><p class="dmt-note">' + esc(t('dmt_note')) + '</p>' +
    '<div class="dmt-acts"><button type="button" class="dmt-btn" data-dmt="copy" id="dmt-copy">' + esc(t('dmt_copy')) + '</button>' +
    '<button type="button" class="dmt-btn" data-dmt="reset" id="dmt-reset">' + esc(t('dmt_reset')) + '</button></div></div>';
}
async function dmtCopy(){
  const txt = dmtSummaryText();
  try { await navigator.clipboard.writeText(txt); return true; }
  catch(e){
    try { const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch(x){ return false; }
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target && e.target.closest ? e.target.closest('[data-dmt]') : null; if (!b) return;
  const say = (m) => { if (typeof toast === 'function') toast(m); else { const n = b.closest('.dmt'); if (n){ let s = n.querySelector('.dmt-say'); if (!s){ s = document.createElement('p'); s.className = 'dmt-say'; s.setAttribute('role', 'status'); n.appendChild(s); } s.textContent = m; } } };
  if (b.dataset.dmt === 'copy'){ if (await dmtCopy()) say(t('dmt_copied')); }
  if (b.dataset.dmt === 'reset'){ dmtReset(); const d = document.getElementById('dmt'); if (d) d.outerHTML = dmtHTML(); say(t('dmt_reset_ok')); }
});

/* ---------------- where the stopwatch starts and stops ----------------
   find: PC archive search box (data-bind="q") and phone «Cerca» (#sr-ph-q, or opening the search) start it;
   opening a binder (editor, status sheet, QR on the PC; the card on the phone) stops it. An emptied box cancels it.
   catalog: recorded by the inventory page itself (11f-inventory.js, ivCapture). */
document.addEventListener('input', (e) => {
  const el = e.target; if (!el || !(el.id === 'sr-ph-q' || (el.dataset && el.dataset.bind === 'q'))) return;
  if (String(el.value || '').trim()) dmtStartIfIdle('find'); else dmtCancel('find');
}, true);
function dmtWrap(name, fn){
  const o = window[name]; if (typeof o !== 'function' || o.__dmt) return false;
  const w = fn(o); w.__dmt = true; window[name] = w; return true;
}
function dmtInstall(){
  const stopOn = (name, via, need) => dmtWrap(name, (o) => function(){ if (!need || arguments[0]) { if (dmtRunning('find')) dmtStop('find', via); } return o.apply(this, arguments); });
  stopOn('openEditor', 'pc-editor', true);      // a new binder (no id) is not a search result
  stopOn('sqOpenBinder', 'pc-status', true);
  stopOn('showQR', 'pc-qr', true);
  stopOn('srPhGo', 'phone', true);
  dmtWrap('srPhShow', (o) => function(){ dmtStartIfIdle('find'); return o.apply(this, arguments); });
}
document.addEventListener('DOMContentLoaded', dmtInstall);

/* help topic (PC only: HELP_TOPICS exists in index.html) */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'app-install')) return;
  HELP_TOPICS.push({ id:'app-install', guide:null, tags:['online', 'help'], related:['about', 'server', 'inventory'],
    kw:{it:'installa app icona schermata home telefono offline senza rete pwa tempi misurati cronometro velocità secondi', en:'install app icon home screen phone offline no network pwa measured times stopwatch speed seconds'},
    title:{it:'Installare DocMap come app e tempi misurati', en:'Install DocMap as an app, measured times'},
    body:{it:'<p>Dal sito <b>https://</b> DocMap si installa come un\'app, senza store: <b>Android</b> menu ⋮ › Installa app; <b>iPhone</b> Condividi › Aggiungi alla schermata Home; <b>PC</b> l\'icona ⊕ nella barra degli indirizzi di Chrome o Edge. Si apre anche senza rete (solo il programma: i dati del server arrivano quando torna la connessione). Da <b>index.html</b> aperto con doppio clic non si installa.</p>' +
      '<p><b>Tempi misurati</b>: quanto ci vuole a trovare un faldone (dalla prima lettera nella ricerca all\'apertura) e a catalogarlo nell\'inventario. Li vedi in <b>Impostazioni › Informazioni su DocMap › Dettagli e assistenza</b> e sul telefono sotto la casella del codice. Restano su questo dispositivo, solo durate.</p>' +
      '<p><button class="btn btn-sm" data-a="hx-about" type="button">Apri Informazioni su DocMap</button></p>',
      en:'<p>From the <b>https://</b> site DocMap installs as an app, no store: <b>Android</b> menu ⋮ › Install app; <b>iPhone</b> Share › Add to Home Screen; <b>PC</b> the ⊕ icon in the Chrome or Edge address bar. It opens without network too (the program only: server data arrives when the connection is back). From <b>index.html</b> opened with a double click it cannot be installed.</p>' +
      '<p><b>Measured times</b>: how long it takes to find a binder (from the first letter in the search to opening it) and to catalogue it in an inventory. See them in <b>Settings › About DocMap › Details and support</b> and on the phone under the code box. They stay on this device, durations only.</p>' +
      '<p><button class="btn btn-sm" data-a="hx-about" type="button">Open About DocMap</button></p>'} });
});
