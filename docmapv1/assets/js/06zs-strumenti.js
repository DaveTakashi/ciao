/* =====================================================================
   DocMap 2026 — v12.18 «Strumenti» (index.html, after 06z-voice.js). View 'strumenti', administrators only.

   The Strumenti (recipes for folders of documents: split, convert, OCR, fields, AI, sort into folders, fast review)
   are a separate local program (`strumenti/`, Python, http://127.0.0.1:8091). This page is the door to it from the
   app: it says whether it is running on this PC, opens it (with its local key, so no second sign-in), shows the
   jobs waiting for a person to check, and explains how to start it.

   - Cross-origin calls go only to /api/ping (no key) and /api/summary (local key); the Strumenti server answers
     CORS only for those two.
   - The link with the key is kept only on this device (localStorage `docmap_strumenti`), never in the shared
     settings, backups or the server.
   - On the studio's web site the browser blocks the status check (CSP connect-src 'self'): the page says so and
     the «Open» button still works.
   ===================================================================== */
'use strict';

const STR_LS = 'docmap_strumenti';
const STR_DEF_BASE = 'http://127.0.0.1:8091/';
const STR = {state:'idle', info:null, sum:null, err:'', at:0};

Object.assign(I18N.it, {
  nav_strumenti:'Strumenti', nd_strumenti:'Ricette per cartelle di documenti: dividere, convertire, leggere (OCR, AI), smistare, verificare',
  st2_h:'Strumenti', st2_p:'Lavori su cartelle di documenti con le ricette: dividere PDF e TIFF, convertire, leggere il testo, trovare numeri e date, mettere ogni file nella cartella giusta, controllare a mano solo i casi incerti.',
  st2_admin_only:'Gli Strumenti sono riservati all\'amministratore.',
  st2_checking:'Controllo in corso…', st2_on:'Gli Strumenti sono avviati su questo PC (versione {v}).',
  st2_off:'Gli Strumenti non rispondono.',
  st2_off_how:'Per avviarli: nella cartella del programma, doppio clic su strumenti\\AVVIA-STRUMENTI.bat (la prima volta prepara tutto in qualche minuto). Poi premi «Controlla di nuovo».',
  st2_off_web:'Dal sito online il browser non permette il controllo: aprili dal PC dove sono installati, oppure premi «Apri gli Strumenti».',
  st2_open:'Apri gli Strumenti', st2_open_review:'Apri la verifica', st2_retry:'Controlla di nuovo',
  st2_review:'{n} lavori aspettano una verifica ({d} documenti da controllare).', st2_review0:'Nessun lavoro aspetta una verifica.',
  st2_running:'{n} lavori in corso o in coda.', st2_credits:'Crediti usati questo mese: {n}.',
  st2_jobs_h:'Ultimi lavori', st2_job_docs:'{n} documenti',
  st2_nokey:'Per vedere qui i lavori da verificare e aprire gli Strumenti senza chiave, incolla qui sotto il collegamento con la chiave.',
  st2_link_h:'Collegamento', st2_link_l:'Indirizzo degli Strumenti (con la chiave, se ce l\'hai)',
  st2_link_hint:'Il collegamento con la chiave è quello che si apre con AVVIA-STRUMENTI.bat (barra degli indirizzi, prima dell\'avvio) oppure quello scritto da «python -m docmap_strumenti url». Resta solo su questo PC.',
  st2_save:'Salva', st2_saved:'Collegamento salvato su questo PC', st2_forget:'Dimentica la chiave', st2_bad:'Indirizzo non valido: deve iniziare con http:// o https://',
  st2_key_on:'chiave salvata', st2_key_off:'senza chiave',
  st2_what_h:'Cosa si può fare', st2_guide:'Guida completa: docs/STRUMENTI.md (nello zip: STRUMENTI.html).',
  st2_ex1:'Fatture TIFF in una cartella per numero di fattura, con report Excel',
  st2_ex2:'PDF o TIFF di molte pagine divisi in pagine o in documenti (anche dove cambia il numero)',
  st2_ex3:'Scansioni raddrizzate, in bianco e nero, leggere (TIFF G4) o in PDF',
  st2_ex4:'Documenti divisi per tipo (fattura, contratto, F24…) e cercati per parole, anche dattiloscritti',
  st2_ex5:'Verifica veloce da tastiera: Invio certifica, frecce per scorrere, 1–9 per scegliere',
  st2_ex6:'Lavori pesanti mandati al vostro server, con i crediti per cliente',
  st2_s_queued:'in coda', st2_s_running:'in corso', st2_s_waiting_review:'da verificare', st2_s_done:'finito',
  st2_s_failed:'non riuscito', st2_s_cancelled:'annullato', st2_s_uploading:'in invio'
});
Object.assign(I18N.en, {
  nav_strumenti:'Tools', nd_strumenti:'Recipes for folders of documents: split, convert, read (OCR, AI), sort, check',
  st2_h:'Tools', st2_p:'Work on folders of documents with recipes: split PDFs and TIFFs, convert, read the text, find numbers and dates, put each file in the right folder, check by hand only the doubtful cases.',
  st2_admin_only:'The Tools are for the administrator only.',
  st2_checking:'Checking…', st2_on:'The Tools are running on this PC (version {v}).',
  st2_off:'The Tools do not answer.',
  st2_off_how:'To start them: in the program folder, double-click strumenti\\AVVIA-STRUMENTI.bat (the first time it sets everything up in a few minutes). Then press «Check again».',
  st2_off_web:'From the online site the browser does not allow the check: open them from the PC where they are installed, or press «Open the Tools».',
  st2_open:'Open the Tools', st2_open_review:'Open the review', st2_retry:'Check again',
  st2_review:'{n} jobs are waiting for a review ({d} documents to check).', st2_review0:'No job is waiting for a review.',
  st2_running:'{n} jobs running or queued.', st2_credits:'Credits used this month: {n}.',
  st2_jobs_h:'Latest jobs', st2_job_docs:'{n} documents',
  st2_nokey:'To see here the jobs to review and open the Tools without a key, paste the link with the key below.',
  st2_link_h:'Link', st2_link_l:'Address of the Tools (with the key, if you have it)',
  st2_link_hint:'The link with the key is the one AVVIA-STRUMENTI.bat opens (address bar, before it starts) or the one printed by «python -m docmap_strumenti url». It stays on this PC only.',
  st2_save:'Save', st2_saved:'Link saved on this PC', st2_forget:'Forget the key', st2_bad:'Invalid address: it must start with http:// or https://',
  st2_key_on:'key saved', st2_key_off:'no key',
  st2_what_h:'What you can do', st2_guide:'Full guide: docs/STRUMENTI.md (in the zip: STRUMENTI.html).',
  st2_ex1:'Invoice TIFFs into one folder per invoice number, with an Excel report',
  st2_ex2:'Multi-page PDFs or TIFFs split into pages or documents (also where the number changes)',
  st2_ex3:'Scans straightened, black and white, light (TIFF G4) or as PDF',
  st2_ex4:'Documents split by type (invoice, contract, F24…) and searched by words, typewritten too',
  st2_ex5:'Fast keyboard review: Enter certifies, arrows to move, 1–9 to choose',
  st2_ex6:'Heavy jobs sent to your server, with credits per customer',
  st2_s_queued:'queued', st2_s_running:'running', st2_s_waiting_review:'to review', st2_s_done:'done',
  st2_s_failed:'failed', st2_s_cancelled:'cancelled', st2_s_uploading:'uploading'
});
if (typeof ICONS !== 'undefined' && !ICONS.wrench) ICONS.wrench = '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>';

/* ---------- pure helpers (unit-tested) ---------- */
/** Splits a pasted link into {base, key}: "http://127.0.0.1:8091/#k=abc" → base "http://127.0.0.1:8091/", key "abc". */
function strParseLink(s){
  const raw = String(s == null ? '' : s).trim();
  if (!raw) return {base:STR_DEF_BASE, key:''};
  let u;
  try { u = new URL(raw); } catch(e){ return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const m = (u.hash || '').match(/[#&]k=([^&]+)/);
  let key = '';
  if (m){ try { key = decodeURIComponent(m[1]); } catch(e){ key = m[1]; } }
  if (!/^[A-Za-z0-9_-]{0,200}$/.test(key)) key = '';
  return {base:u.protocol + '//' + u.host + '/', key};
}
/** Address that opens the Strumenti page, with the key in the fragment (never sent to a server) and the view. */
function strOpenUrl(link, view){
  const l = link || {base:STR_DEF_BASE, key:''};
  const v = /^[a-z]+$/.test(view || '') ? view : '';
  if (!l.key) return l.base + (v ? '#' + v : '');
  return l.base + '#k=' + encodeURIComponent(l.key) + (v ? '&v=' + v : '');
}
function strLink(){
  try { const j = JSON.parse(localStorage.getItem(STR_LS) || 'null'); if (j && typeof j.base === 'string') return {base:j.base, key:String(j.key || '')}; } catch(e){}
  return {base:STR_DEF_BASE, key:''};
}
function strSaveLink(l){ try { localStorage.setItem(STR_LS, JSON.stringify({base:l.base, key:l.key || ''})); return true; } catch(e){ return false; } }
function strIsAdmin(){ return typeof w1Role === 'function' ? w1Role() === 'admin' : true; }

async function strFetch(path, key){
  const l = strLink(), ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const tm = setTimeout(() => { if (ctl) ctl.abort(); }, 2500);
  try {
    const r = await fetch(l.base + path, {headers:key ? {'X-Key':key} : {}, signal:ctl ? ctl.signal : undefined, cache:'no-store'});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  } finally { clearTimeout(tm); }
}
async function strCheck(){
  STR.state = 'checking'; STR.err = ''; strPaint();
  try {
    STR.info = await strFetch('api/ping');
    STR.state = 'on'; STR.sum = null;
    const l = strLink();
    if (l.key){ try { STR.sum = await strFetch('api/summary', l.key); } catch(e){ STR.err = String(e.message || e); } }
  } catch(e){ STR.state = 'off'; STR.info = null; STR.sum = null; }
  STR.at = Date.now(); strPaint();
}

/* ---------- view ---------- */
function strStatusHTML(){
  if (STR.state === 'idle' || STR.state === 'checking') return '<p class="muted" id="st2-status" data-s="checking">' + esc(t('st2_checking')) + '</p>';
  const l = strLink();
  if (STR.state === 'off'){
    const web = location.protocol === 'http:' || location.protocol === 'https:';
    return '<div id="st2-status" data-s="off"><p><b>' + esc(t('st2_off')) + '</b></p><p class="small">' + esc(t(web ? 'st2_off_web' : 'st2_off_how')) + '</p>' +
      '<div class="row"><button class="btn" data-a="st2-check">' + ic('refresh') + esc(t('st2_retry')) + '</button>' +
      '<button class="btn" data-a="st2-open">' + ic('link') + esc(t('st2_open')) + '</button></div></div>';
  }
  const s = STR.sum;
  let body = '<p><b>' + esc(t('st2_on', {v:(STR.info && STR.info.version) || '?'})) + '</b></p>';
  if (s){
    body += '<p id="st2-review">' + esc(s.waiting_review ? t('st2_review', {n:s.waiting_review, d:s.review_items || 0}) : t('st2_review0')) + '</p>' +
      (s.running ? '<p class="small">' + esc(t('st2_running', {n:s.running})) + '</p>' : '') +
      '<p class="small muted">' + esc(t('st2_credits', {n:s.credits_month || 0})) + '</p>';
    if ((s.jobs || []).length) body += '<h3>' + esc(t('st2_jobs_h')) + '</h3><div class="st2-jobs">' + s.jobs.map(j =>
      '<div class="st2-job"><span class="badge">' + esc(I18N.it['st2_s_' + j.status] ? t('st2_s_' + j.status) : j.status) + '</span> <b>' + esc(j.name || j.id) + '</b> <span class="small muted">' +
      esc(t('st2_job_docs', {n:(j.totals && j.totals.items) || 0})) + ' · ' + esc(String(j.created || '').slice(0, 16).replace('T', ' ')) + '</span></div>').join('') + '</div>';
  } else if (!l.key){
    body += '<p class="small">' + esc(t('st2_nokey')) + '</p>';
  } else if (STR.err){
    body += '<p class="small" style="color:var(--red)">' + esc(STR.err) + '</p>';
  }
  return '<div id="st2-status" data-s="on">' + body + '<div class="row">' +
    '<button class="btn btn-primary" data-a="st2-open">' + ic('link') + esc(t('st2_open')) + '</button>' +
    (s && s.waiting_review ? '<button class="btn" data-a="st2-open" data-v="lavori">' + ic('check') + esc(t('st2_open_review')) + '</button>' : '') +
    '<button class="btn" data-a="st2-check">' + ic('refresh') + esc(t('st2_retry')) + '</button></div></div>';
}
function viewStrumenti(){
  const head = '<div class="page-h"><div><h1>' + ic('wrench') + ' ' + esc(t('st2_h')) + helpDot('strumenti') + '</h1><p class="muted">' + esc(t('st2_p')) + '</p></div></div>';
  if (!strIsAdmin()) return '<div class="stack" id="st2-page">' + head + '<div class="card card-p" id="st2-denied">' + esc(t('st2_admin_only')) + '</div></div>';
  const l = strLink();
  return '<div class="stack" id="st2-page">' + head +
    '<section class="card card-p stack" id="st2-card">' + strStatusHTML() + '</section>' +
    '<section class="card card-p stack" id="st2-link"><h2>' + esc(t('st2_link_h')) + ' <span class="badge">' + esc(t(l.key ? 'st2_key_on' : 'st2_key_off')) + '</span></h2>' +
      '<label class="small" for="st2-url">' + esc(t('st2_link_l')) + '</label>' +
      '<input id="st2-url" class="inp" type="url" autocomplete="off" spellcheck="false" value="' + esc(l.base) + '" placeholder="' + esc(STR_DEF_BASE) + '#k=…">' +
      '<p class="small muted">' + esc(t('st2_link_hint')) + '</p>' +
      '<div class="row"><button class="btn" data-a="st2-save">' + ic('save') + esc(t('st2_save')) + '</button>' +
      (l.key ? '<button class="btn btn-danger" data-a="st2-forget">' + esc(t('st2_forget')) + '</button>' : '') + '</div></section>' +
    '<section class="card card-p" id="st2-what"><h2>' + esc(t('st2_what_h')) + '</h2><ul>' +
      ['st2_ex1', 'st2_ex2', 'st2_ex3', 'st2_ex4', 'st2_ex5', 'st2_ex6'].map(k => '<li>' + esc(t(k)) + '</li>').join('') +
      '</ul><p class="small muted">' + esc(t('st2_guide')) + '</p></section></div>';
}
function strPaint(){
  if (S.view !== 'strumenti') return;
  const c = document.getElementById('st2-card');
  if (c) c.innerHTML = strStatusHTML();
}

const STR_ACTIONS = {
  'st2-check': () => strCheck(),
  'st2-open': (el) => {
    const w = window.open(strOpenUrl(strLink(), el && el.dataset.v), '_blank', 'noopener');
    if (w) try { w.opener = null; } catch(e){}
  },
  'st2-save': () => {
    const inp = document.getElementById('st2-url'), l = strParseLink(inp ? inp.value : '');
    if (!l) return toast(t('st2_bad'), 'warn');
    const cur = strLink();
    if (!l.key && l.base === cur.base) l.key = cur.key;          // the field shows only the address: keep the key
    strSaveLink(l); toast(t('st2_saved'), 'ok'); renderView(); strCheck();
  },
  'st2-forget': () => { const l = strLink(); strSaveLink({base:l.base, key:''}); renderView(); strCheck(); }
};

(function strWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, STR_ACTIONS);
  else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, STR_ACTIONS); });
  const entry = ['strumenti', 'wrench', 'nav_strumenti', 'nd_strumenti'];
  if (typeof NAV_MORE !== 'undefined'){ const g = NAV_MORE.find(x => x[0] === 'nm_tools'); if (g && !g[1].some(x => x[0] === 'strumenti')) g[1].splice(Math.max(0, g[1].length - 1), 0, entry); }
  if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('strumenti')) ADV_VIEWS.push('strumenti');
  // only administrators see the menu entry: hide it while the top bar is drawn for anyone else
  wrap('topbarHTML', (o) => function(){
    const g = typeof NAV_MORE !== 'undefined' ? NAV_MORE.find(x => x[0] === 'nm_tools') : null;
    const i = g ? g[1].findIndex(x => x[0] === 'strumenti') : -1;
    if (i < 0 || strIsAdmin()) return o.apply(this, arguments);
    const it = g[1].splice(i, 1)[0];
    try { return o.apply(this, arguments); } finally { g[1].splice(i, 0, it); }
  });
  wrap('renderView', (o) => function(){
    if (S.view === 'strumenti'){
      document.documentElement.lang = S.lang; $('#view').innerHTML = viewStrumenti();
      if (strIsAdmin() && (STR.state === 'idle' || Date.now() - STR.at > 15000)) strCheck(); else strPaint();
      return;
    }
    return o.apply(this, arguments);
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'strumenti')) return;
  HELP_TOPICS.push({ id:'strumenti', guide:null, tags:['other'], acts:['how'], pop:40, related:['ai'],
    title:{it:'Come uso gli Strumenti (ricette per i documenti)?', en:'How do I use the Tools (recipes for documents)?'},
    body:{
      it:'<p>Gli <b>Strumenti</b> sono un programma a parte, sul PC dell\'amministratore, per lavorare su cartelle di documenti: dividere PDF e TIFF, convertire, leggere il testo (OCR, anche dattiloscritti), trovare numeri, date, P.IVA e importi, mettere ogni file nella cartella giusta, fare un report Excel.</p>' +
        '<p>Si avviano con un doppio clic su <code>strumenti\\AVVIA-STRUMENTI.bat</code>. Da ⚙ › <b>Strumenti</b> vedi se sono avviati, li apri e vedi quanti lavori aspettano una <b>verifica</b>: lì una persona controlla solo i documenti incerti, con la tastiera (Invio certifica, frecce per scorrere, 1–9 per scegliere).</p>' +
        '<p>Ogni lavoro si descrive con una <b>ricetta</b>: ce ne sono 11 pronte da copiare. I lavori pesanti si possono mandare al vostro server. Guida completa: <code>STRUMENTI.html</code> nello zip.</p>',
      en:'<p>The <b>Tools</b> are a separate program, on the administrator\'s PC, to work on folders of documents: split PDFs and TIFFs, convert, read the text (OCR, typewritten too), find numbers, dates, VAT numbers and amounts, put each file in the right folder, make an Excel report.</p>' +
        '<p>Start them by double-clicking <code>strumenti\\AVVIA-STRUMENTI.bat</code>. From ⚙ › <b>Tools</b> you see whether they are running, open them and see how many jobs wait for a <b>review</b>: there a person checks only the doubtful documents, with the keyboard (Enter certifies, arrows to move, 1–9 to choose).</p>' +
        '<p>Each job is described by a <b>recipe</b>: 11 are ready to copy. Heavy jobs can be sent to your server. Full guide: <code>STRUMENTI.html</code> in the zip.</p>'
    }});
});
