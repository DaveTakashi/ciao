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
        setTimeout(() => { const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); }; set('ivp-nb', E.labels.box); set('ivp-nf', E.labels.binder + E.labels.doc); set('ivp-tg', E.binders + E.docs); if (E.docs){ const d = document.getElementById('ivp-doc'); if (d) d.checked = true; } }, 0);
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

/* ---------------- v12.15: progress towards the expected total (Lavoro card) ---------------- */
Object.assign(I18N.it, {ivx_prog:'{d} di {t} faldoni previsti · {p}%', ivx_prog_eta:'al ritmo misurato mancano circa {m} di lavoro', ivx_prog_over:'{n} oltre il previsto: aggiorna l\'obiettivo o il preventivo', ivx_prog_done:'obiettivo raggiunto', ivx_prog_none:'Nessun obiettivo: scrivi i faldoni previsti in Modifica (o usa «Stima un lavoro»).'});
Object.assign(I18N.en, {ivx_prog:'{d} of {t} expected binders · {p}%', ivx_prog_eta:'at the measured pace about {m} of work left', ivx_prog_over:'{n} over the estimate: update the target or the quote', ivx_prog_done:'target reached', ivx_prog_none:'No target: type the expected binders in Edit (or use «Estimate a job»).'});
function ivxProgress(a){
  const R = invReport(a, S.binders || [], S.locations || [], (typeof LOG !== 'undefined' && LOG.entries) || [], S.settings || {}, 120000);
  return invProgress(a.inv.target, (R.binders || 0) + (R.docs || 0), R.median_ms || 0);
}
function ivxProgressHTML(a){
  const pr = ivxProgress(a);
  if (!pr) return '<p class="tiny muted" id="ivx-prog">' + esc(t('ivx_prog_none')) + '</p>';
  const tail = pr.over ? t('ivx_prog_over', {n:pr.over}) : !pr.left ? t('ivx_prog_done') : pr.mins ? t('ivx_prog_eta', {m:invMinsText(pr.mins)}) : '';
  return '<div class="ivx-prog" id="ivx-prog"><div class="iv-prog-bar"><i style="width:' + pr.pct + '%"></i></div><div class="small">' + esc(t('ivx_prog', {d:pr.done, t:pr.target, p:pr.pct})) + (tail ? ' · ' + esc(tail) : '') + '</div></div>';
}

/* ---------------- v12.16: boxes of the project (box level) + training data ---------------- */
Object.assign(I18N.it, {ivx_bx_h:'Scatole', ivx_bx_p:'Faldoni acquisiti e contati a mano, anni, tag, note e foto della scatola aperta (con la posizione di ogni etichetta).', ivx_bx_none:'Nessuna scatola ancora.',
  ivx_bx_c:'Scatola', ivx_bx_n:'Acquisiti', ivx_bx_nl:'senza etichetta', ivx_bx_cnt:'Contati', ivx_bx_y:'Anni', ivx_bx_t:'Tag e note', ivx_bx_sh:'Foto', ivx_bx_more:'… e altre {n}',
  ivx_train:'Dati per l\'addestramento', ivx_train_t:'Esporta i dati per addestrare un modello di lettura', ivx_train_p:'Un file JSON Lines con una riga per foto: cosa mostra la foto, i campi confermati da una persona (la risposta giusta) e, per le foto delle scatole, dove sta ogni etichetta. Contiene dati dei clienti: va condiviso solo con chi tratta i dati per lo studio (vedi le bozze per il legale).',
  ivx_train_ph:'Includi le foto (file più grande)', ivx_train_only:'Solo faldoni confermati', ivx_train_go:'Scarica il file', ivx_train_done:'{n} righe in {f}', ivx_train_none:'Nessuna foto da esportare in questo progetto.'});
Object.assign(I18N.en, {ivx_bx_h:'Boxes', ivx_bx_p:'Binders captured and counted by hand, years, tags, notes and photos of the open box (with where each label is).', ivx_bx_none:'No box yet.',
  ivx_bx_c:'Box', ivx_bx_n:'Captured', ivx_bx_nl:'without a label', ivx_bx_cnt:'Counted', ivx_bx_y:'Years', ivx_bx_t:'Tags and notes', ivx_bx_sh:'Photos', ivx_bx_more:'… and {n} more',
  ivx_train:'Training data', ivx_train_t:'Export the data to train a reading model', ivx_train_p:'A JSON Lines file with one row per photo: what the photo shows, the fields a person confirmed (the right answer) and, for box photos, where each label is. It holds client data: share it only with whoever processes data for the studio (see the drafts for the lawyer).',
  ivx_train_ph:'Include the photos (bigger file)', ivx_train_only:'Confirmed binders only', ivx_train_go:'Download the file', ivx_train_done:'{n} rows in {f}', ivx_train_none:'No photo to export in this project.'});
function ivxBoxesHTML(a){
  const R = invReport(a, S.binders || [], S.locations || [], [], S.settings || {}, 120000), L = R.perBox, MAX = 200;
  const rows = L.slice(0, MAX).map(x => '<tr><td class="mono">' + esc(x.code) + '</td><td class="ivq-n">' + x.n + (x.nolabel ? ' <span class="tiny muted">(' + x.nolabel + ' ' + esc(t('ivx_bx_nl')) + ')</span>' : '') + '</td><td class="ivq-n">' + (x.count === null ? '—' : x.count) + '</td>' +
    '<td>' + (x.y0 ? x.y0 + (x.y1 !== x.y0 ? '–' + x.y1 : '') : '—') + '</td><td class="small">' + esc([x.tags.join(', '), x.note].filter(Boolean).join(' · ') || '—') + '</td><td class="ivq-n">' + (x.shots || '—') + '</td></tr>').join('');
  return '<div class="card card-p" style="margin-top:16px" id="ivx-boxes-card"><div class="row" style="justify-content:space-between"><h2>' + esc(t('ivx_bx_h')) + ' <span class="tiny muted">' + L.length + '</span></h2>' +
      '<button class="btn btn-sm" data-a="ivx-train" data-id="' + esc(a.id) + '" id="ivx-train">' + ic('download') + esc(t('ivx_train')) + '</button></div><p class="small muted">' + esc(t('ivx_bx_p')) + '</p>' +
    (L.length ? '<div style="overflow-x:auto"><table class="ivx-boxes" id="ivx-boxes"><thead><tr><th>' + esc(t('ivx_bx_c')) + '</th><th class="ivq-n">' + esc(t('ivx_bx_n')) + '</th><th class="ivq-n">' + esc(t('ivx_bx_cnt')) + '</th><th>' + esc(t('ivx_bx_y')) + '</th><th>' + esc(t('ivx_bx_t')) + '</th><th class="ivq-n">' + esc(t('ivx_bx_sh')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (L.length > MAX ? '<p class="tiny muted">' + esc(t('ivx_bx_more', {n:L.length - MAX})) + '</p>' : '') : '<p class="small muted">' + esc(t('ivx_bx_none')) + '</p>') + '</div>';
}
function ivxOpenTrain(id){
  const a = ivpProj(id); if (!a) return;
  openModal({title:t('ivx_train_t'), body:'<div class="stack" id="ivx-train-m"><p class="small">' + esc(t('ivx_train_p')) + '</p>' +
      '<label class="row small"><input type="checkbox" id="ivx-train-only" checked> ' + esc(t('ivx_train_only')) + '</label><label class="row small"><input type="checkbox" id="ivx-train-ph"> ' + esc(t('ivx_train_ph')) + '</label></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('ivx_train_go'), cls:'btn btn-primary', icon:'download', fn:async () => {
      const only = !!($('#ivx-train-only') || {}).checked, ph = !!($('#ivx-train-ph') || {}).checked; closeModal(true);
      const r = await ivxTrainExport(a, {only, photos:ph}); toast(r.n ? t('ivx_train_done', {n:r.n, f:r.name}) : t('ivx_train_none'), r.n ? 'ok' : 'warn');
    }}]});
}
/** Rows of invTrainRows as JSON Lines (photos embedded as data URLs only when asked); logs inventory.train_export. */
async function ivxTrainExport(a, o){
  o = o || {};
  const rows = invTrainRows(a, S.binders || [], S.locations || []).filter(r => !o.only || r.t !== 'binder' || r.confirmed);
  if (!rows.length) return {n:0, name:''};
  if (o.photos) for (const r of rows){ const u = await ivpPhotoGet(r.photo); if (u) r.data = u; }
  const name = brandFile('addestramento_' + slugify(a.inv.code) + '_' + nowISO().slice(0, 10), 'jsonl');
  download(name, rows.map(r => JSON.stringify(Object.assign({format:'docmap-inv-train', v:1, project:a.inv.code}, r))).join('\n') + '\n', 'application/x-ndjson');
  logAct('inventory.train_export', ivpTarget(a), 'Esportati ' + rows.length + ' esempi per l\'addestramento dal progetto ' + a.name, {rows:rows.length, photos:!!o.photos, only:!!o.only});
  commit();
  return {n:rows.length, name};
}

const IVX_ACTIONS = { 'ivx-est': () => ivxOpenEstimate(), 'ivx-imp': (el) => ivxOpenRescue(el.dataset.id), 'ivx-train': (el) => ivxOpenTrain(el.dataset.id) };
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVX_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVX_ACTIONS); });

/* ---------------- help topic (v12.14) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'inventory-safe')) return;
  const inv = HELP_TOPICS.find(x => x.id === 'inventory'); if (inv && !inv.related.includes('inventory-safe')) inv.related.push('inventory-safe');
  HELP_TOPICS.push({ id:'inventory-safe', guide:null, tags:['start'], related:['inventory', 'inventory-pro'],
    kw:{it:'raffica fila coste più etichette obiettivo previsti fine prevista avanzamento stima preventivo metri scaffale scatole giornate etichette copia di sicurezza memoria piena telefono coda server occupato rete accesso scaduto importa',
        en:'burst row spines several labels target expected end time progress estimate quote metres shelf boxes days labels rescue copy safety copy memory full phone queue busy server network sign-in expired import'},
    title:{it:'Inventario: stima del lavoro e telefono sempre al sicuro', en:'Inventory: job estimate and a phone that never loses work'},
    body:{it:'<p><b>Stima un lavoro</b> (elenco dei progetti): scrivi i metri di scaffale o le scatole che vedi sul posto; ottieni faldoni, ore, giornate, etichette da stampare e importo con i prezzi di Impostazioni › Inventario. I secondi a faldone partono dal vostro ritmo misurato nei progetti passati. «Crea il progetto con questi numeri» prepara le etichette giuste.</p>' +
      '<ul><li><b>Server occupato o rete assente</b>: il telefono aspetta e riprova da solo, con pause sempre più lunghe (fino a 5 minuti). Niente si perde; ↻ riprova subito.</li>' +
      '<li><b>Accesso scaduto</b>: la coda si ferma e lo dice; rientra con il tuo utente e tocca ↻.</li>' +
      '<li><b>Lettura AI</b>: se non riesce dopo 3 tentativi si lascia stare; il faldone è comunque salvato.</li>' +
      '<li><b>Memoria del telefono piena</b>: le nuove acquisizioni si fermano con un messaggio chiaro, invece di perdersi. Le foto già inviate al server vengono tolte dal telefono da sole.</li>' +
      '<li><b>Raffica</b> (telefono, Chrome su Android): accendila sotto i tag e inquadra una fila di coste; ogni etichetta nuova diventa un faldone, in ordine di numero, con la foto della sua costa. Le etichette già fatte restano in silenzio; due scatole nella stessa inquadratura vengono ignorate.</li>' +
      '<li><b>Obiettivo</b>: i faldoni previsti del progetto (Modifica, o «Stima un lavoro»). Il telefono e la scheda Lavoro mostrano a che punto siete e, al vostro ritmo, quanto manca e l\'ora di fine.</li>' +
      '<li><b>Copia di sicurezza</b>: tocca lo stato della coda e poi «Salva copia di sicurezza»: un file con tutto quello che il telefono non ha ancora inviato. Sul PC, nella scheda Lavoro del progetto, «Importa dal telefono» lo carica (si può fare due volte senza doppioni).</li></ul>',
      en:'<p><b>Estimate a job</b> (project list): type the shelf metres or the boxes you see on site; you get binders, hours, days, labels to print and the amount with the prices of Settings › Inventory. Seconds per binder start from your pace measured in past projects. «Create the project with these numbers» prepares the right labels.</p>' +
      '<ul><li><b>Busy server or no network</b>: the phone waits and retries by itself, with longer and longer pauses (up to 5 minutes). Nothing is lost; ↻ retries now.</li>' +
      '<li><b>Sign-in expired</b>: the queue stops and says so; sign in again and tap ↻.</li>' +
      '<li><b>AI reading</b>: if it fails 3 times it is dropped; the binder is saved anyway.</li>' +
      '<li><b>Phone memory full</b>: new captures stop with a clear message instead of being lost. Photos the server already has are removed from the phone by themselves.</li>' +
      '<li><b>Burst</b> (phone, Chrome on Android): turn it on below the tags and frame a row of spines; each new label becomes a binder, in number order, with the photo of its own spine. Labels already done stay silent; two boxes in the same frame are ignored.</li>' +
      '<li><b>Target</b>: the expected binders of the project (Edit, or «Estimate a job»). The phone and the Work card show how far you are and, at your pace, the time left and the end time.</li>' +
      '<li><b>Rescue copy</b>: tap the queue status, then «Save rescue copy»: a file with everything the phone has not sent yet. On the PC, in the project Work card, «Import from phone» loads it (twice is fine, no duplicates).</li></ul>'} });
});

/* ---------------- help topic (v12.16): every way of labelling and working ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'inventory-modes')) return;
  const inv = HELP_TOPICS.find(x => x.id === 'inventory'); if (inv && !inv.related.includes('inventory-modes')) inv.related.unshift('inventory-modes');
  HELP_TOPICS.push({ id:'inventory-modes', guide:null, tags:['start'], related:['inventory', 'inventory-pro', 'inventory-safe'],
    kw:{it:'modalità etichette scatola dentro fuori faldone senza etichetta livello scatola contare conteggio foto scatola aperta codice leggibile grande nascosto addestramento modello riconoscimento',
        en:'modes labels box inside outside binder without label box level count photo open box readable code big hidden training model recognition'},
    title:{it:'Inventario: tutti i modi di etichettare e lavorare', en:'Inventory: every way of labelling and working'},
    body:{it:'<p>Nel progetto (Modifica) scegli <b>come è etichettato l\'archivio</b>; il telefono propone il lavoro giusto.</p>' +
      '<table class="help-t"><tr><th>Scatole</th><th>Faldoni</th><th>Come si lavora</th></tr>' +
      '<tr><td>un\'etichetta fuori</td><td>tutti</td><td>Scansiona la scatola, poi ogni faldone (anche in <b>Raffica</b>).</td></tr>' +
      '<tr><td>fuori e dentro</td><td>tutti</td><td>Due etichette uguali per scatola (FUORI e DENTRO): si legge sullo scaffale e da aperta.</td></tr>' +
      '<tr><td>fuori</td><td>alcuni</td><td>I faldoni con l\'etichetta si scansionano; gli altri con <b>Faldone senza etichetta</b> e la foto della costa.</td></tr>' +
      '<tr><td>fuori</td><td>nessuno</td><td><b>Livello scatola</b>: per ogni scatola il numero di faldoni, gli anni, i tag, una nota e la foto della scatola aperta.</td></tr>' +
      '<tr><td>nessuna</td><td>tutti</td><td>Modalità «Cattura ora, cataloga dopo»: i faldoni si catturano senza scatola.</td></tr></table>' +
      '<ul><li><b>Foto della scatola aperta</b>: salva la foto con la posizione di ogni etichetta; le etichette non ancora acquisite diventano faldoni subito, ognuno con la striscia della sua costa.</li>' +
      '<li><b>Codice leggibile</b> sull\'etichetta: grande (consigliato), normale o nascosto, e se scrivere anche il codice del QR. Si sceglie nel progetto o al momento di stampare.</li>' +
      '<li>Nella scheda Lavoro: l\'elenco delle <b>scatole</b> (acquisiti, contati, anni, tag, foto) e <b>Dati per l\'addestramento</b>, un file per allenare in futuro un modello di lettura specializzato.</li></ul>',
      en:'<p>In the project (Edit) choose <b>how the archive is labelled</b>; the phone proposes the right work.</p>' +
      '<table class="help-t"><tr><th>Boxes</th><th>Binders</th><th>How it works</th></tr>' +
      '<tr><td>one label outside</td><td>all</td><td>Scan the box, then each binder (also in <b>Burst</b>).</td></tr>' +
      '<tr><td>outside and inside</td><td>all</td><td>Two identical labels per box (OUT and IN): read on the shelf and when open.</td></tr>' +
      '<tr><td>outside</td><td>some</td><td>Labelled binders are scanned; the others with <b>Binder without a label</b> and a photo of the spine.</td></tr>' +
      '<tr><td>outside</td><td>none</td><td><b>Box level</b>: for each box the number of binders, years, tags, a note and a photo of the open box.</td></tr>' +
      '<tr><td>none</td><td>all</td><td>«Capture now, catalogue later» mode: binders are captured without a box.</td></tr></table>' +
      '<ul><li><b>Photo of the open box</b>: saves the photo with where each label is; labels not captured yet become binders at once, each with the strip of its own spine.</li>' +
      '<li><b>Readable code</b> on the label: big (recommended), normal or hidden, and whether to print the QR code too. Chosen in the project or when printing.</li>' +
      '<li>In the Work card: the list of <b>boxes</b> (captured, counted, years, tags, photos) and <b>Training data</b>, a file to train a specialised reading model later.</li></ul>'} });
});
