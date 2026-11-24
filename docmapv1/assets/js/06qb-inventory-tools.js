/* v12.14 — inventory tools on the PC (index.html only, after 06qa-inventory-pro.js):
   1. Quick estimate of a job (K3): metres of shelf or boxes → binders, labels, hours, days and price (invEstimate in
      02f-inventory.js), with the studio's measured pace; «Crea il progetto» opens the new-project form already filled.
   2. Import from the phone: the rescue file a phone saves when it cannot send (memory full, no network for days, phone
      to be returned). Records keep their ids (inv-<short code>): the newer updated_at wins, nothing is duplicated;
      photos go to this PC (and to the server when there is one). */

Object.assign(I18N.it, {
  ivx_est:'Stima un lavoro', ivx_est_t:'Stima rapida di un lavoro di inventario', ivx_est_p:'Da quello che vedi sul posto: metri di scaffale o scatole. I prezzi sono quelli di Impostazioni › Inventario.',
  ivx_metres:'Metri lineari di scaffale', ivx_per_m:'Faldoni per metro', ivx_boxes:'Scatole', ivx_per_box:'Faldoni per scatola', ivx_docs:'Documenti per faldone (livello documento)',
  ivx_sec:'Secondi a faldone', ivx_sec_h:'Il vostro ritmo misurato: {s} s (mediana dei progetti passati).', ivx_sec_none:'Nessun progetto passato misurato: valore di partenza {s} s.',
  ivx_people:'Persone che scansionano', ivx_setup:'Ore di preparazione', ivx_day:'Ore di lavoro al giorno', ivx_spare:'Etichette di scorta (%)',
  ivx_k_binders:'faldoni stimati', ivx_k_docs:'documenti', ivx_k_hours:'ore di lavoro', ivx_k_days:'giornate', ivx_k_rate:'faldoni all\'ora', ivx_k_net:'imponibile', ivx_k_gross:'totale IVA compresa',
  ivx_labels:'Etichette da stampare: {f} per i faldoni, {b} per le scatole{d}.', ivx_labels_d:', {n} per i documenti',
  ivx_note:'Stima indicativa: cambia con lo stato dell\'archivio (faldoni rovinati, coste senza scritte, spostamenti). Non è un preventivo vincolante.',
  ivx_copy:'Copia il testo', ivx_copied:'Stima copiata', ivx_create:'Crea il progetto con questi numeri', ivx_txt:'Stima per l\'inventario: circa {f} faldoni{d}, {b} scatole. Tempo: {h} ore ({g} giornate) con {p} persone. Importo indicativo: {n} + IVA ({t} IVA compresa).',
  ivx_imp:'Importa dal telefono', ivx_imp_t:'Importa la copia salvata da un telefono', ivx_imp_p:'Scegli il file che il telefono ha salvato con «Salva copia di sicurezza». Si può importare due volte: un faldone già presente si aggiorna solo se la copia è più recente.',
  ivx_imp_pick:'Scegli il file…', ivx_imp_bad:'Il file non è una copia dell\'inventario.', ivx_imp_other:'La copia è del progetto {p}, non di questo.',
  ivx_imp_prev:'{n} record ({b} faldoni, {l} scatole) e {f} foto, salvati da {w} il {d}.', ivx_imp_go:'Importa', ivx_imp_done:'Importati {a} nuovi, {u} aggiornati, {s} già presenti; {f} foto',
  'lga_inventory.rescue':'Copia del telefono importata'
});
Object.assign(I18N.en, {
  ivx_est:'Estimate a job', ivx_est_t:'Quick estimate of an inventory job', ivx_est_p:'From what you see on site: metres of shelf or boxes. Prices come from Settings › Inventory.',
  ivx_metres:'Linear metres of shelf', ivx_per_m:'Binders per metre', ivx_boxes:'Boxes', ivx_per_box:'Binders per box', ivx_docs:'Documents per binder (document level)',
  ivx_sec:'Seconds per binder', ivx_sec_h:'Your measured pace: {s} s (median of past projects).', ivx_sec_none:'No past project measured yet: starting value {s} s.',
  ivx_people:'People scanning', ivx_setup:'Preparation hours', ivx_day:'Working hours per day', ivx_spare:'Spare labels (%)',
  ivx_k_binders:'estimated binders', ivx_k_docs:'documents', ivx_k_hours:'working hours', ivx_k_days:'days', ivx_k_rate:'binders per hour', ivx_k_net:'net', ivx_k_gross:'total incl. VAT',
  ivx_labels:'Labels to print: {f} for binders, {b} for boxes{d}.', ivx_labels_d:', {n} for documents',
  ivx_note:'Indicative estimate: it changes with the state of the archive (damaged binders, blank spines, moves). Not a binding quote.',
  ivx_copy:'Copy the text', ivx_copied:'Estimate copied', ivx_create:'Create the project with these numbers', ivx_txt:'Inventory estimate: about {f} binders{d}, {b} boxes. Time: {h} hours ({g} days) with {p} people. Indicative amount: {n} + VAT ({t} incl. VAT).',
  ivx_imp:'Import from the phone', ivx_imp_t:'Import the copy saved by a phone', ivx_imp_p:'Pick the file the phone saved with «Save rescue copy». Importing twice is fine: a binder already here is updated only if the copy is newer.',
  ivx_imp_pick:'Choose the file…', ivx_imp_bad:'The file is not an inventory copy.', ivx_imp_other:'The copy belongs to project {p}, not this one.',
  ivx_imp_prev:'{n} records ({b} binders, {l} boxes) and {f} photos, saved by {w} on {d}.', ivx_imp_go:'Import', ivx_imp_done:'Imported {a} new, {u} updated, {s} already here; {f} photos',
  'lga_inventory.rescue':'Phone copy imported'
});

/* ---------------- 1. quick estimate ---------------- */
function ivxEstButtonHTML(){ return '<button class="btn" data-a="ivx-est" id="ivx-est">' + ic('sliders') + esc(t('ivx_est')) + '</button>'; }
function ivxPace(){ try { return invPaceHistory(invProjects(), S.binders, LOG.entries || [], S.settings, 20); } catch(e){ return 0; } }
const IVX = {q:null};
function ivxEstRead(){
  const v = (id) => ($('#' + id) || {}).value;
  return {metres:v('ivx-m'), perMetre:v('ivx-pm'), boxes:v('ivx-b'), perBox:v('ivx-pb'), docsPerBinder:v('ivx-d'), secPerBinder:v('ivx-s'), people:v('ivx-p'), setupHours:v('ivx-su'), hoursPerDay:v('ivx-hd'), spare:v('ivx-sp')};
}
function ivxEstOutHTML(E){
  const k = (n, l) => '<div class="kpi"><b>' + esc(n) + '</b><small>' + esc(l) + '</small></div>', fm = (x) => '€ ' + fmtMoneyPlain(x);
  return '<div class="kpis">' + k(String(E.binders), t('ivx_k_binders')) + (E.docs ? k(String(E.docs), t('ivx_k_docs')) : '') + k(String(E.hours).replace('.', S.lang === 'en' ? '.' : ','), t('ivx_k_hours')) +
      k(String(E.days).replace('.', S.lang === 'en' ? '.' : ','), t('ivx_k_days')) + k(String(E.perHourBinders), t('ivx_k_rate')) + (E.bill ? k(fm(E.bill.net), t('ivx_k_net')) + k(fm(E.bill.gross), t('ivx_k_gross')) : '') + '</div>' +
    '<p class="small" id="ivx-labels">' + esc(t('ivx_labels', {f:E.labels.binder, b:E.labels.box, d:E.labels.doc ? t('ivx_labels_d', {n:E.labels.doc}) : ''})) + '</p><p class="tiny muted">' + esc(t('ivx_note')) + '</p>';
}
function ivxEstCalc(){ IVX.q = invEstimate(ivxEstRead(), invPrices(null, S.settings)); const o = $('#ivx-out'); if (o) o.innerHTML = ivxEstOutHTML(IVX.q); return IVX.q; }
function ivxEstText(E){
  const fm = (x) => '€ ' + fmtMoneyPlain(x);
  return t('ivx_txt', {f:E.binders, d:E.docs ? ' (' + E.docs + ' ' + t('ivx_k_docs') + ')' : '', b:E.boxes, h:String(E.hours).replace('.', S.lang === 'en' ? '.' : ','), g:String(E.days).replace('.', S.lang === 'en' ? '.' : ','), p:E.people, n:E.bill ? fm(E.bill.net) : '—', t:E.bill ? fm(E.bill.gross) : '—'});
}
function ivxOpenEstimate(){
  const pace = ivxPace(), D = INV_EST_DEFAULT, sec = pace ? Math.round(pace / 100) / 10 : D.sec;
  const f = (id, label, val, step) => '<div class="field"><label for="' + id + '">' + esc(t(label)) + '</label><input class="inp" type="number" min="0" step="' + (step || 1) + '" id="' + id + '" value="' + esc(String(val)) + '"></div>';
  openModal({title:t('ivx_est_t'), size:'lg', body:'<p class="small">' + esc(t('ivx_est_p')) + '</p><div class="ivq-est" id="ivx-form">' +
      f('ivx-m', 'ivx_metres', '', 0.5) + f('ivx-pm', 'ivx_per_m', D.perMetre) + f('ivx-b', 'ivx_boxes', '') + f('ivx-pb', 'ivx_per_box', D.perBox) + f('ivx-d', 'ivx_docs', 0, 0.5) +
      f('ivx-s', 'ivx_sec', sec, 0.5) + f('ivx-p', 'ivx_people', D.people) + f('ivx-su', 'ivx_setup', D.setupHours, 0.5) + f('ivx-hd', 'ivx_day', D.hoursPerDay, 0.5) + f('ivx-sp', 'ivx_spare', D.spare) + '</div>' +
      '<div class="hint" id="ivx-sec-h">' + esc(pace ? t('ivx_sec_h', {s:String(sec).replace('.', ',')}) : t('ivx_sec_none', {s:D.sec})) + '</div><div class="ivq-est-out" id="ivx-out"></div>',
    onMount:(ov) => { ov.querySelectorAll('#ivx-form input').forEach(i => i.addEventListener('input', ivxEstCalc)); ivxEstCalc(); },
    buttons:[{label:t('ivx_copy'), cls:'btn', icon:'copy', fn:() => { const E = ivxEstCalc(), txt = ivxEstText(E); try { navigator.clipboard.writeText(txt); } catch(e){} toast(t('ivx_copied')); }},
      {label:t('ivx_create'), cls:'btn btn-primary', icon:'plus', fn:() => {
        const E = ivxEstCalc(); closeModal(true); ivpOpenForm();
        setTimeout(() => { const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); }; set('ivp-nb', E.labels.box); set('ivp-nf', E.labels.binder + E.labels.doc); if (E.docs){ const d = document.getElementById('ivp-doc'); if (d) d.checked = true; } }, 0);
      }}]});
}

/* ---------------- 2. import from the phone (rescue file) ---------------- */
function ivxRescueButtonHTML(a){ return '<button class="btn" data-a="ivx-imp" data-id="' + esc(a.id) + '" id="ivx-imp">' + ic('upload') + esc(t('ivx_imp')) + '</button>'; }
/** Applies a parsed rescue file to the project a. Returns counts. Pure on S (no UI), used by the modal and the tests. */
async function ivxRescueApply(a, d){
  const out = {added:0, updated:0, same:0, photos:0};
  d.recs.forEach(r0 => {
    const r = Object.assign({}, r0), type = r._type; delete r._type;
    if (r.archive_id !== a.id) r.archive_id = a.id;
    if (type === 'location'){
      const cur = S.locations.find(x => x.id === r.id);
      if (!cur){ S.locations.push(normalizeLocation(r)); out.added++; }
      else if (String(r.updated_at || '') > String(cur.updated_at || '')){ Object.assign(cur, normalizeLocation(r)); out.updated++; }
      else out.same++;
      return;
    }
    const i = S.binders.findIndex(x => x.id === r.id), nb = normalizeBinder(r);
    nb.id = r.id; nb.updated_at = r.updated_at || nowISO(); if (r.created_at) nb.created_at = r.created_at;
    if (i < 0){ S.binders.push(nb); out.added++; }
    else if (String(nb.updated_at) > String(S.binders[i].updated_at || '')){ S.binders[i] = nb; out.updated++; }
    else out.same++;
  });
  const conf = typeof srvConf === 'function' ? srvConf() : null;
  for (const id of Object.keys(d.photos)){
    const u = d.photos[id], m = u.match(/^data:([^;]+);base64,(.*)$/), rec = d.recs.find(x => x.inv && (x.inv.ph === id || x.inv.ph2 === id));
    try { await IVDB.put(id, {id, mime:m[1], data:u, at:nowISO(), binder_id:rec ? rec.id : '', project:a.id, sent:false}); out.photos++; if (typeof IVP !== 'undefined') IVP.photos.set(id, u); } catch(e){}
    if (conf && rec) try { await srvClient(conf).call('photo_put', {method:'POST', body:{id, binder_id:rec.id, mime:m[1], data:m[2]}}); } catch(e){}
  }
  if (out.added || out.updated){
    if (typeof archTouch === 'function') archTouch(a);
    logAct('inventory.rescue', ivpTarget(a), 'Importata la copia di un telefono nel progetto ' + a.name + ': ' + out.added + ' nuovi, ' + out.updated + ' aggiornati', {project:a.id, who:d.who, device:d.device, at:d.at, added:out.added, updated:out.updated, same:out.same, photos:out.photos});
    commit();
  }
  return out;
}
function ivxOpenRescue(id){
  const a = ivpProj(id); if (!a) return; IVX.res = null;
  openModal({title:t('ivx_imp_t'), body:'<p class="small">' + esc(t('ivx_imp_p')) + '</p><div class="row"><button class="btn" type="button" id="ivx-pick">' + ic('upload') + esc(t('ivx_imp_pick')) + '</button><input type="file" id="ivx-file" accept=".json,application/json" hidden></div><p class="small" id="ivx-prev" role="status"></p>',
    onMount:(ov) => {
      const inp = ov.querySelector('#ivx-file'), prev = ov.querySelector('#ivx-prev');
      ov.querySelector('#ivx-pick').addEventListener('click', () => inp.click());
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => ivxRescueLoad(a, String(rd.result || ''), prev); rd.readAsText(f); });
    },
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ivx_imp_go'), cls:'btn btn-primary', icon:'check', fn:async () => {
      if (!IVX.res) return; const r = await ivxRescueApply(a, IVX.res); closeModal(true); ivpRefresh();
      toast(t('ivx_imp_done', {a:r.added, u:r.updated, s:r.same, f:r.photos}));
    }}]});
}
function ivxRescueLoad(a, text, prev){
  const d = invRescueParse(text); IVX.res = null;
  if (!d){ if (prev) prev.textContent = t('ivx_imp_bad'); return null; }
  if (d.project.id && d.project.id !== a.id){ if (prev) prev.textContent = t('ivx_imp_other', {p:d.project.name || d.project.code}); return null; }
  IVX.res = d;
  if (prev) prev.textContent = t('ivx_imp_prev', {n:d.recs.length, b:d.recs.filter(r => r._type === 'binder').length, l:d.recs.filter(r => r._type === 'location').length, f:Object.keys(d.photos).length, w:d.who || d.device || '—', d:d.at ? fmtDate(d.at, true) : '—'});
  return d;
}

const IVX_ACTIONS = { 'ivx-est': () => ivxOpenEstimate(), 'ivx-imp': (el) => ivxOpenRescue(el.dataset.id) };
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVX_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVX_ACTIONS); });

/* ---------------- help topic (v12.14) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'inventory-safe')) return;
  const inv = HELP_TOPICS.find(x => x.id === 'inventory'); if (inv && !inv.related.includes('inventory-safe')) inv.related.push('inventory-safe');
  HELP_TOPICS.push({ id:'inventory-safe', guide:null, tags:['start'], related:['inventory', 'inventory-pro'],
    kw:{it:'stima preventivo metri scaffale scatole giornate etichette copia di sicurezza memoria piena telefono coda server occupato rete accesso scaduto importa',
        en:'estimate quote metres shelf boxes days labels rescue copy safety copy memory full phone queue busy server network sign-in expired import'},
    title:{it:'Inventario: stima del lavoro e telefono sempre al sicuro', en:'Inventory: job estimate and a phone that never loses work'},
    body:{it:'<p><b>Stima un lavoro</b> (elenco dei progetti): scrivi i metri di scaffale o le scatole che vedi sul posto; ottieni faldoni, ore, giornate, etichette da stampare e importo con i prezzi di Impostazioni › Inventario. I secondi a faldone partono dal vostro ritmo misurato nei progetti passati. «Crea il progetto con questi numeri» prepara le etichette giuste.</p>' +
      '<ul><li><b>Server occupato o rete assente</b>: il telefono aspetta e riprova da solo, con pause sempre più lunghe (fino a 5 minuti). Niente si perde; ↻ riprova subito.</li>' +
      '<li><b>Accesso scaduto</b>: la coda si ferma e lo dice; rientra con il tuo utente e tocca ↻.</li>' +
      '<li><b>Lettura AI</b>: se non riesce dopo 3 tentativi si lascia stare; il faldone è comunque salvato.</li>' +
      '<li><b>Memoria del telefono piena</b>: le nuove acquisizioni si fermano con un messaggio chiaro, invece di perdersi. Le foto già inviate al server vengono tolte dal telefono da sole.</li>' +
      '<li><b>Copia di sicurezza</b>: tocca lo stato della coda e poi «Salva copia di sicurezza»: un file con tutto quello che il telefono non ha ancora inviato. Sul PC, nella scheda Lavoro del progetto, «Importa dal telefono» lo carica (si può fare due volte senza doppioni).</li></ul>',
      en:'<p><b>Estimate a job</b> (project list): type the shelf metres or the boxes you see on site; you get binders, hours, days, labels to print and the amount with the prices of Settings › Inventory. Seconds per binder start from your pace measured in past projects. «Create the project with these numbers» prepares the right labels.</p>' +
      '<ul><li><b>Busy server or no network</b>: the phone waits and retries by itself, with longer and longer pauses (up to 5 minutes). Nothing is lost; ↻ retries now.</li>' +
      '<li><b>Sign-in expired</b>: the queue stops and says so; sign in again and tap ↻.</li>' +
      '<li><b>AI reading</b>: if it fails 3 times it is dropped; the binder is saved anyway.</li>' +
      '<li><b>Phone memory full</b>: new captures stop with a clear message instead of being lost. Photos the server already has are removed from the phone by themselves.</li>' +
      '<li><b>Rescue copy</b>: tap the queue status, then «Save rescue copy»: a file with everything the phone has not sent yet. On the PC, in the project Work card, «Import from phone» loads it (twice is fine, no duplicates).</li></ul>'} });
});
