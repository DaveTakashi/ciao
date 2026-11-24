/* =====================================================================
   v12.12 "Inventario rapido", phases 3 and 4 on the desktop (index.html). Model: 02f-inventory.js. Phone: 11f-inventory.js.
   Loaded after 06q-inventory.js; its project page calls ivpProHTML(a) and ivpAiButtonHTML(a) when they exist.

   - "Lavoro" card of a project: Report di fine lavoro (invReport: counts, boxes, operators, AI, labels, verifications,
     billing with the prices of the project or the studio defaults), print + CSV; "In diretta" (two-person chain: the
     page pulls from the server every few seconds and shows the newest captures with editable fields); "Salva come
     modello"; the box verifications done with the phone (activity-log lines inventory.verify).
   - "Leggi con l'AI": spine photos never read (AI off at capture, local mode, network down) are read from the PC in the
     background, one after the other, never blocking anything. Server online → route ai_spine (the provider configured
     on the server: Claude, any OpenAI-compatible service, local Ollama). Otherwise, if the studio switched it on,
     a LOCAL model on this PC or in the office network (Ollama, LM Studio: OpenAI-compatible URL, no key, nothing leaves
     the office). The answer fills only the empty fields and never sets a Codice Multi.
   - Impostazioni › Inventario: default prices (single source; a project overrides them only for its quote), the local
     AI of this PC (URL, model, test), the studio's project templates.
   ===================================================================== */
'use strict';

const IVQ = { live:'', liveTimer:0, liveSeen:new Set(), ai:null };
const IVQ_LIVE_MS = 4000, IVQ_LIVE_N = 12, IVQ_AI_LOCAL_DEFAULT = 'http://127.0.0.1:11434/v1';

Object.assign(I18N.it, {
  ivq_work:'Lavoro', ivq_report:'Report di fine lavoro', ivq_live:'In diretta', ivq_live_off:'Ferma la diretta', ivq_tpl_save:'Salva come modello',
  ivq_live_h:'In diretta: gli ultimi faldoni acquisiti', ivq_live_p:'Per la catena a due persone: chi scansiona va avanti, tu correggi qui. La pagina si aggiorna da sola ogni pochi secondi.',
  ivq_live_local:'Senza server online la diretta vede solo le scansioni fatte da questo stesso browser.', ivq_live_none:'Ancora nessun faldone: aspetto la prima scansione…', ivq_live_new:'nuovo',
  ivq_ver_h:'Verifiche delle scatole', ivq_ver_none:'Nessuna verifica. Sul telefono: Inventario › Verifica una scatola.', ivq_ver_row:'{b}: {f} su {e} trovati', ivq_ver_mis:'{n} mancanti', ivq_ver_x:'{n} fuori posto',
  ivq_ai_btn:'Leggi con l\'AI ({n})', ivq_ai_run:'Lettura AI: {d} su {n}…', ivq_ai_stop:'Ferma', ivq_ai_done:'Lettura AI finita: {d} letti, {e} non letti', ivq_ai_none:'Nessuna AI disponibile: serve il server online con l\'AI accesa, oppure un modello locale in Impostazioni › Inventario.',
  ivq_ai_err:'Lettura AI non riuscita: {m}',
  ivq_tpl_t:'Salva come modello', ivq_tpl_p:'Il modello tiene modalità, tag rapidi, anni, livello documento, AI e prezzi. Non tiene cliente, etichette e numeri.', ivq_tpl_name:'Nome del modello', ivq_tpl_done:'Modello salvato: {n}',
  ivq_set_h:'Inventario', ivq_set_p:'Prezzi predefiniti dei lavori di inventario (IVA esclusa). Valgono per ogni progetto che non ha prezzi suoi: un preventivo diverso si scrive nel progetto.',
  ivq_set_ai_h:'Lettura AI su questo PC (modello locale)', ivq_set_ai_p:'Facoltativa. Legge le foto delle coste con un modello che gira su questo PC o nella rete dello studio (Ollama, LM Studio o un altro servizio compatibile OpenAI): nessuna foto esce dallo studio. Si usa solo quando il server online non c\'è o non ha l\'AI.',
  ivq_set_ai_on:'Usa il modello locale', ivq_set_ai_url:'Indirizzo del servizio', ivq_set_ai_model:'Modello (con la vista, es. qwen2.5vl:7b)', ivq_set_ai_test:'Prova', ivq_set_ai_ok:'Risponde: {m}', ivq_set_ai_ko:'Non risponde: {m}',
  ivq_set_ai_h2:'Ollama: avvialo con OLLAMA_ORIGINS=* perché accetti le richieste di questa pagina. LM Studio: attiva «CORS» nel server locale.',
  ivq_set_tpl_h:'Modelli di progetto dello studio', ivq_set_tpl_none:'Nessun modello tuo: aprine un progetto e usa «Salva come modello».', ivq_tpl_del:'Elimina',
  ivq_r_title:'Report di fine lavoro — {p}', ivq_r_period:'Periodo', ivq_r_client:'Cliente', ivq_r_mode:'Modalità', ivq_r_tot:'Totali', ivq_r_states:'Stato della catalogazione', ivq_r_boxes:'Scatole', ivq_r_box:'Scatola', ivq_r_n:'Faldoni', ivq_r_years:'Anni', ivq_r_counted:'Contati',
  ivq_r_ops:'Operatori', ivq_r_op:'Operatore', ivq_r_pace:'Tempo a faldone (mediana)', ivq_r_first:'Primo', ivq_r_last:'Ultimo', ivq_r_ai:'Lettura AI', ivq_r_ai_v:'{r} letti, fiducia media {c}%, {v} da rivedere', ivq_r_labels:'Etichette',
  ivq_r_labels_v:'{b} scatole e {f} faldoni/documenti generati, {p} stampate; non usate: {ub} scatole, {uf} faldoni/documenti', ivq_r_ver:'Verifiche', ivq_r_bill:'Fatturazione', ivq_r_item:'Voce', ivq_r_qty:'Quantità', ivq_r_unit:'Prezzo', ivq_r_total:'Totale',
  ivq_r_net:'Imponibile', ivq_r_vat:'IVA {p}%', ivq_r_gross:'Totale', ivq_r_note:'Prezzi indicativi: quelli del progetto o, se mancano, quelli di Impostazioni › Inventario. Il documento non è una fattura.',
  ivq_r_print:'Stampa', ivq_r_csv:'Scarica CSV', ivq_r_none:'—', ivq_r_secs:'{s} s', ivq_bill_binder:'Faldoni inventariati', ivq_bill_box:'Scatole', ivq_bill_doc:'Documenti', ivq_bill_fixed:'Quota fissa'
});
Object.assign(I18N.en, {
  ivq_work:'Job', ivq_report:'End-of-job report', ivq_live:'Live', ivq_live_off:'Stop live', ivq_tpl_save:'Save as template',
  ivq_live_h:'Live: the latest captured binders', ivq_live_p:'For the two-person chain: whoever scans keeps going, you correct here. The page refreshes by itself every few seconds.',
  ivq_live_local:'Without the online server, live shows only the scans made by this same browser.', ivq_live_none:'No binder yet: waiting for the first scan…', ivq_live_new:'new',
  ivq_ver_h:'Box checks', ivq_ver_none:'No check yet. On the phone: Inventory › Check a box.', ivq_ver_row:'{b}: {f} of {e} found', ivq_ver_mis:'{n} missing', ivq_ver_x:'{n} misplaced',
  ivq_ai_btn:'Read with AI ({n})', ivq_ai_run:'AI reading: {d} of {n}…', ivq_ai_stop:'Stop', ivq_ai_done:'AI reading done: {d} read, {e} not read', ivq_ai_none:'No AI available: the online server with AI on is needed, or a local model in Settings › Inventory.',
  ivq_ai_err:'AI reading failed: {m}',
  ivq_tpl_t:'Save as template', ivq_tpl_p:'The template keeps mode, quick tags, years, document level, AI and prices. It does not keep client, labels and numbers.', ivq_tpl_name:'Template name', ivq_tpl_done:'Template saved: {n}',
  ivq_set_h:'Inventory', ivq_set_p:'Default prices of inventory jobs (VAT excluded). They apply to every project without its own prices: a different quote is written in the project.',
  ivq_set_ai_h:'AI reading on this PC (local model)', ivq_set_ai_p:'Optional. Reads the spine photos with a model running on this PC or in the office network (Ollama, LM Studio or another OpenAI-compatible service): no photo leaves the office. Used only when the online server is missing or has no AI.',
  ivq_set_ai_on:'Use the local model', ivq_set_ai_url:'Service address', ivq_set_ai_model:'Model (with vision, e.g. qwen2.5vl:7b)', ivq_set_ai_test:'Test', ivq_set_ai_ok:'It answers: {m}', ivq_set_ai_ko:'No answer: {m}',
  ivq_set_ai_h2:'Ollama: start it with OLLAMA_ORIGINS=* so it accepts the requests of this page. LM Studio: turn on "CORS" in the local server.',
  ivq_set_tpl_h:'Studio project templates', ivq_set_tpl_none:'No template of yours: open a project and use "Save as template".', ivq_tpl_del:'Delete',
  ivq_r_title:'End-of-job report — {p}', ivq_r_period:'Period', ivq_r_client:'Client', ivq_r_mode:'Mode', ivq_r_tot:'Totals', ivq_r_states:'Cataloguing status', ivq_r_boxes:'Boxes', ivq_r_box:'Box', ivq_r_n:'Binders', ivq_r_years:'Years', ivq_r_counted:'Counted',
  ivq_r_ops:'Operators', ivq_r_op:'Operator', ivq_r_pace:'Time per binder (median)', ivq_r_first:'First', ivq_r_last:'Last', ivq_r_ai:'AI reading', ivq_r_ai_v:'{r} read, average confidence {c}%, {v} to review', ivq_r_labels:'Labels',
  ivq_r_labels_v:'{b} boxes and {f} binders/documents generated, {p} printed; unused: {ub} boxes, {uf} binders/documents', ivq_r_ver:'Checks', ivq_r_bill:'Billing', ivq_r_item:'Item', ivq_r_qty:'Quantity', ivq_r_unit:'Price', ivq_r_total:'Total',
  ivq_r_net:'Net', ivq_r_vat:'VAT {p}%', ivq_r_gross:'Total', ivq_r_note:'Indicative prices: those of the project or, when missing, those of Settings › Inventory. This document is not an invoice.',
  ivq_r_print:'Print', ivq_r_csv:'Download CSV', ivq_r_none:'—', ivq_r_secs:'{s} s', ivq_bill_binder:'Binders inventoried', ivq_bill_box:'Boxes', ivq_bill_doc:'Documents', ivq_bill_fixed:'Fixed fee'
});

/* ---------------- project page: "Lavoro" card ---------------- */
function ivqVerifications(a){
  return (LOG.entries || []).filter(e => e && e.action === 'inventory.verify' && e.details && e.details.project === a.id).sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
function ivpProHTML(a){
  const V = ivqVerifications(a).slice(0, 6), live = IVQ.live === a.id;
  const ver = V.length ? '<ul class="ivq-ver" id="ivq-ver">' + V.map(e => { const d = e.details;
      return '<li><b class="mono">' + esc(t('ivq_ver_row', {b:d.box, f:d.found, e:d.expected})) + '</b>' + ((d.missing || []).length ? ' <span class="ivq-w">' + esc(t('ivq_ver_mis', {n:d.missing.length})) + '</span>' : '') +
        ((d.misplaced || []).length ? ' <span class="ivq-e">' + esc(t('ivq_ver_x', {n:d.misplaced.length})) + '</span>' : '') + '<span class="tiny muted"> · ' + esc((e.who || '') + ' · ' + fmtDate(e.at, true)) + '</span></li>'; }).join('') + '</ul>'
    : '<div class="small muted">' + esc(t('ivq_ver_none')) + '</div>';
  return '<div class="grid g2 ivq-top" style="margin-top:16px"><div class="card card-p"><h2>' + esc(t('ivq_work')) + '</h2><div class="row wrap">' +
      '<button class="btn btn-primary" data-a="ivq-report" data-id="' + esc(a.id) + '" id="ivq-report">' + ic('file') + esc(t('ivq_report')) + '</button>' +
      '<button class="btn' + (live ? ' on' : '') + '" data-a="ivq-live" data-id="' + esc(a.id) + '" id="ivq-live">' + ic('refresh') + esc(live ? t('ivq_live_off') : t('ivq_live')) + '</button>' +
      '<button class="btn" data-a="ivq-tpl" data-id="' + esc(a.id) + '" id="ivq-tpl">' + ic('copy') + esc(t('ivq_tpl_save')) + '</button>' +
      (typeof ivxRescueButtonHTML === 'function' ? ivxRescueButtonHTML(a) : '') + '</div>' + (typeof ivxProgressHTML === 'function' ? ivxProgressHTML(a) : '') + '</div>' +
    '<div class="card card-p"><h2>' + esc(t('ivq_ver_h')) + '</h2>' + ver + '</div></div>' +
    (live ? '<div class="card card-p ivq-live" style="margin-top:16px" id="ivq-live-card">' + ivqLiveHTML(a) + '</div>' : '') +
    (typeof ivxBoxesHTML === 'function' ? ivxBoxesHTML(a) : '');
}

/* ---------------- "In diretta" (two-person chain) ---------------- */
function ivqLiveHTML(a){
  const L = ivpBinders(a).filter(b => b.inv && b.inv.at).sort((x, y) => String(y.inv.at).localeCompare(String(x.inv.at))).slice(0, IVQ_LIVE_N);
  const inp = (b, k, lab) => '<label class="ivp-fd"><span>' + esc(t(lab)) + '</span><input class="inp inp-sm" data-ivf="' + k + '" data-id="' + esc(b.id) + '" value="' + esc(b[k] || '') + '"></label>';
  const local = !(typeof srvConf === 'function' && srvConf());
  const rows = L.map(b => {
    const st = ivpState(b), fresh = !IVQ.liveSeen.has(b.id) && Date.now() - Date.parse(b.inv.at) < 120000;
    return '<div class="ivq-row st-' + st + (fresh ? ' fresh' : '') + '" data-id="' + esc(b.id) + '"><div class="ivp-ph" data-ivph="' + esc(b.inv.ph || '') + '" data-a="ivp-photo" data-id="' + esc(b.id) + '">' + ivpPhotoHTML(b.inv.ph) + '</div>' +
      '<div class="ivp-body"><div class="row between"><b class="mono">' + esc(b.speaking_code) + '</b>' + (fresh ? '<span class="ivq-new">' + esc(t('ivq_live_new')) + '</span>' : '') + '<span class="ivp-st st-' + st + '">' + esc(t('ivp_s_' + st)) + '</span></div>' +
      '<div class="tiny muted">' + esc([invLevel(b) === 'doc' ? t('ivp_doc_in', {f:b.inv.folder || ''}) : (b.inv.box ? t('ivp_box', {b:b.inv.box}) : ''), b.inv.by || '', fmtDate(b.inv.at, true), b.inv.ai ? t('ivp_ai', {c:Math.round((+b.inv.ai.confidence || 0) * 100)}) : ''].filter(Boolean).join(' · ')) + '</div>' +
      '<div class="ivq-f">' + inp(b, 'company_name', 'ivp_fd_company') + inp(b, 'binder_title', 'ivp_fd_title') + inp(b, 'ref_year', 'ivp_fd_year') + inp(b, 'tags', 'ivp_fd_tags') + '</div>' +
      '<button class="btn btn-sm' + (st === 'confirmed' ? '' : ' btn-primary') + '" data-a="ivp-confirm" data-id="' + esc(b.id) + '"' + (st === 'confirmed' ? ' disabled' : '') + '>' + ic('check') + esc(st === 'confirmed' ? t('ivp_confirmed') : t('ivp_confirm')) + '</button></div></div>';
  }).join('');
  return '<div class="row between"><h2 style="margin:0">' + esc(t('ivq_live_h')) + '</h2><span class="ivq-dot" aria-hidden="true"></span></div><p class="small muted">' + esc(t('ivq_live_p')) + (local ? ' ' + esc(t('ivq_live_local')) : '') + '</p>' +
    '<div id="ivq-live-list">' + (rows || '<div class="empty small">' + esc(t('ivq_live_none')) + '</div>') + '</div>';
}
function ivqLiveRefresh(){
  const a = IVQ.live && ivpProj(IVQ.live), card = $('#ivq-live-card');
  if (!a || !card || S.view !== 'inv' || IVP.open !== a.id){ ivqLiveStop(); return; }
  if (card.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;   // never under the cursor
  card.innerHTML = ivqLiveHTML(a); ivpMountPhotos();
  setTimeout(() => ivpBinders(a).forEach(b => IVQ.liveSeen.add(b.id)), 30000);
}
async function ivqLiveTick(){
  if (!IVQ.live) return;
  try { if (typeof srvConf === 'function' && srvConf() && typeof SRV === 'object' && !SRV.busy) await srvSync(); } catch(e){}
  ivqLiveRefresh();
}
function ivqLiveStart(id){ IVQ.live = id; clearInterval(IVQ.liveTimer); IVQ.liveTimer = setInterval(ivqLiveTick, IVQ_LIVE_MS); ivpRefresh(); ivqLiveTick(); }
function ivqLiveStop(){ IVQ.live = ''; clearInterval(IVQ.liveTimer); IVQ.liveTimer = 0; }

/* ---------------- AI reading from the PC ---------------- */
function ivqAiLocal(){ const c = S.settings.invAi || {}; return c.on && /^https?:\/\/\S+$/i.test(c.url || '') && String(c.model || '').trim() ? {url:String(c.url).replace(/\/+$/, ''), model:String(c.model).trim()} : null; }
function ivqAiTodo(a){ return ivpBinders(a).filter(b => b.inv && b.inv.ph && !b.inv.ai && ivpState(b) !== 'confirmed'); }
function ivpAiButtonHTML(a){
  const R = IVQ.ai;
  if (R && R.id === a.id) return '<span class="ivq-ai small" id="ivq-ai">' + esc(t('ivq_ai_run', {d:R.done + R.err, n:R.total})) + ' <button class="btn btn-sm" data-a="ivq-ai-stop">' + esc(t('ivq_ai_stop')) + '</button></span>';
  const n = ivqAiTodo(a).length;
  return n ? '<button class="btn btn-sm" data-a="ivq-ai" data-id="' + esc(a.id) + '" id="ivq-ai-btn">' + ic('sparkles') + esc(t('ivq_ai_btn', {n})) + '</button>' : '';
}
/** Calls a local OpenAI-compatible model from this page (no key: it is meant for a service in the office). */
async function ivqAiLocalCall(conf, dataUrl, voice, hints){
  const h = invAiHints(hints), content = [{type:'text', text:invAiPrompt(String(voice || '').slice(0, 500), h) + INV_AI_JSON_HINT}];
  if (dataUrl) content.push({type:'image_url', image_url:{url:dataUrl}});
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, tm = ctl ? setTimeout(() => ctl.abort(), 120000) : 0;
  let r;
  try { r = await fetch(conf.url + '/chat/completions', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:conf.model, messages:[{role:'user', content}], response_format:{type:'json_object'}, max_tokens:1500}), signal:ctl ? ctl.signal : undefined}); }
  finally { clearTimeout(tm); }
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error((j && j.error && (j.error.message || j.error)) || ('HTTP ' + r.status));
  const msg = j.choices && j.choices[0] && j.choices[0].message, res = invAiParseText(msg && typeof msg.content === 'string' ? msg.content : '');
  if (!res) throw new Error('answer not readable');
  return {enabled:true, provider:'local', model:String(j.model || conf.model), result:invAiNorm(res, h)};
}
/** Applies one AI result to a binder (same rules as the phone: empty fields only, never a Codice Multi). */
function ivqAiApply(a, b, r){
  const res = r.result || {};
  Object.assign(b, invFieldsFromAi(res, b));
  if (res.tags && res.tags.length) b.tags = invTagsJoin(b.tags, res.tags);
  const st = ivpState(b);
  b.inv = Object.assign({}, b.inv, {ai:Object.assign({}, res, {model:r.model || '', provider:r.provider || '', at:nowISO(), via:'pc'}),
    st:st === 'confirmed' ? 'confirmed' : (res.confidence >= a.inv.auto_confirm && !res.empty_spine) || b.inv.voice ? 'proposed' : 'review'});
  ivpTouch(b);
}
async function ivqAiRun(id){
  const a = ivpProj(id); if (!a || IVQ.ai) return;
  const conf = typeof srvConf === 'function' ? srvConf() : null, local = ivqAiLocal();
  if (!conf && !local){ toast(t('ivq_ai_none'), 'warn', 8000); return; }
  const todo = ivqAiTodo(a); if (!todo.length) return;
  const R = IVQ.ai = {id, total:todo.length, done:0, err:0, stop:false, last:''}; ivpRefresh();
  const hints0 = {tags:a.inv.tags, year_from:a.inv.year_from, year_to:a.inv.year_to, client:a.inv.client};
  let useSrv = !!conf;
  for (const b0 of todo){
    if (R.stop) break;
    const b = S.binders.find(x => x.id === b0.id); if (!b || !b.inv || b.inv.ai) continue;
    const hints = Object.assign({}, hints0, {kind:invLevel(b) === 'doc' ? 'doc' : b.inv.ph2 ? 'page' : 'spine'}), ph = b.inv.ph2 || b.inv.ph;
    try {
      let r = null;
      if (useSrv){
        try {
          r = await srvClient(conf).call('ai_spine', {method:'POST', body:{photo_id:ph, voice:b.inv.voice || '', hints}, timeout:120000});
          if (r && !r.enabled) r = null;
        } catch(e){
          if (e.code === 'not_found'){   // the photo is only on this PC: send it with the request
            const u = await ivpPhotoGet(ph), m = String(u || '').match(/^data:([^;]+);base64,(.*)$/);
            if (m) r = await srvClient(conf).call('ai_spine', {method:'POST', body:{data:m[2], mime:m[1], voice:b.inv.voice || '', hints}, timeout:120000});
            if (r && !r.enabled) r = null;
          } else throw e;
        }
        if (!r){ useSrv = false; if (!local) throw new Error(t('ivq_ai_none')); }
      }
      if (!r && local){ const u = await ivpPhotoGet(ph); r = await ivqAiLocalCall(local, typeof u === 'string' ? u : '', b.inv.voice || '', hints); }
      if (!r) throw new Error(t('ivq_ai_none'));
      ivqAiApply(a, b, r); R.done++;
      if (R.done % 5 === 0) commit();
    } catch(e){ R.err++; R.last = String(e && (e.message || e.code) || e).slice(0, 160); if (/ivq_ai_none|Nessuna AI|No AI/.test(R.last)) break; }
    const el = $('#ivq-ai'); if (el) el.outerHTML = ivpAiButtonHTML(a);
  }
  if (R.done){ logAct('inventory.ai', ivpTarget(a), 'Lettura AI dal PC: ' + R.done + ' faldoni letti nel progetto ' + a.name, {read:R.done, failed:R.err, via:useSrv ? 'server' : 'local'}); commit(); }
  IVQ.ai = null;
  toast(R.err && !R.done ? t('ivq_ai_err', {m:R.last}) : t('ivq_ai_done', {d:R.done, e:R.err}), R.err ? 'warn' : 'ok', 8000);
  ivpRefresh();
}

/* ---------------- templates ---------------- */
function ivqTplSave(id){
  const a = ivpProj(id); if (!a) return;
  openModal({title:t('ivq_tpl_t'), body:'<div class="stack"><p class="small">' + esc(t('ivq_tpl_p')) + '</p><div class="field"><label for="ivq-tpl-n">' + esc(t('ivq_tpl_name')) + '</label><input class="inp" id="ivq-tpl-n" maxlength="80" value="' + esc(a.name) + '"></div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'check', fn:() => {
      const n = String(($('#ivq-tpl-n') || {}).value || '').replace(/\s+/g, ' ').trim(); if (!n) return;
      const tp = invTplFromProject(a, n);
      S.settings.invTemplates = (Array.isArray(S.settings.invTemplates) ? S.settings.invTemplates : []).concat([tp]);
      logAct('inventory.template', ivpTarget(a), 'Salvato il modello di progetto ' + n, {template:tp.id});
      commit(); closeModal(true); toast(t('ivq_tpl_done', {n}));
    }}]});
}

/* ---------------- end-of-job report ---------------- */
function ivqReport(a){ return invReport(a, S.binders, S.locations || [], LOG.entries || [], S.settings, typeof DMT_PAUSE_MS !== 'undefined' ? DMT_PAUSE_MS : 120000); }
const ivqMoney = (n) => '€ ' + fmtMoneyPlain(n);
const ivqSecs = (ms) => ms ? t('ivq_r_secs', {s:typeof dmtSec === 'function' ? dmtSec(ms) : (ms / 1000).toFixed(1)}) : t('ivq_r_none');
function ivqReportHTML(a, R){
  const kv = (k, v) => '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>', d = (x) => x ? esc(fmtDate(x, true)) : '—';
  const bill = R.bill.lines.map(l => '<tr><td>' + esc(t('ivq_bill_' + l.k)) + '</td><td class="ivq-n">' + l.qty + '</td><td class="ivq-n">' + ivqMoney(l.unit) + '</td><td class="ivq-n">' + ivqMoney(l.total) + '</td></tr>').join('');
  return '<div class="ivq-r" id="ivq-r"><h1>' + esc(t('ivq_r_title', {p:R.name})) + '</h1><table class="ivq-kv">' +
      kv(t('ivq_r_client'), esc(R.client || '—')) + kv(t('ivq_r_mode'), esc(t('ivp_mode_' + R.mode))) + kv(t('ivq_r_period'), d(R.first) + ' – ' + d(R.last)) +
      kv(t('ivq_r_tot'), '<b>' + R.boxes + '</b> ' + esc(t('ivp_k_boxes').toLowerCase()) + ' · <b>' + R.binders + '</b> ' + esc(t('ivp_k_binders').toLowerCase()) + (R.docs ? ' · <b>' + R.docs + '</b> ' + esc(t('ivp_k_docs').toLowerCase()) : '')) +
      kv(t('ivq_r_states'), ['confirmed', 'proposed', 'review', 'captured'].map(k => esc(t('ivp_s_' + k)) + ' <b>' + R.states[k] + '</b>').join(' · ')) +
      kv(t('ivq_r_pace'), esc(ivqSecs(R.median_ms))) + kv(t('ivq_r_ai'), esc(t('ivq_r_ai_v', {r:R.ai.read, c:Math.round(R.ai.avg * 100), v:R.ai.review})) + (R.ai.models.length ? ' <span class="muted">(' + esc(R.ai.models.join(', ')) + ')</span>' : '')) +
      kv(t('ivq_r_labels'), esc(t('ivq_r_labels_v', {b:R.labels.box, f:R.labels.binder, p:R.labels.printed, ub:R.labels.unusedBox, uf:R.labels.unusedBin}))) + '</table>' +
    '<h2>' + esc(t('ivq_r_bill')) + '</h2><table class="ivq-t"><thead><tr><th>' + esc(t('ivq_r_item')) + '</th><th class="ivq-n">' + esc(t('ivq_r_qty')) + '</th><th class="ivq-n">' + esc(t('ivq_r_unit')) + '</th><th class="ivq-n">' + esc(t('ivq_r_total')) + '</th></tr></thead><tbody>' + (bill || '<tr><td colspan="4">—</td></tr>') + '</tbody>' +
      '<tfoot><tr><td colspan="3">' + esc(t('ivq_r_net')) + '</td><td class="ivq-n">' + ivqMoney(R.bill.net) + '</td></tr><tr><td colspan="3">' + esc(t('ivq_r_vat', {p:R.bill.vatPct})) + '</td><td class="ivq-n">' + ivqMoney(R.bill.vat) + '</td></tr><tr><td colspan="3"><b>' + esc(t('ivq_r_gross')) + '</b></td><td class="ivq-n"><b>' + ivqMoney(R.bill.gross) + '</b></td></tr></tfoot></table>' +
      '<p class="ivq-note">' + esc(t('ivq_r_note')) + '</p>' +
    '<h2>' + esc(t('ivq_r_ops')) + '</h2><table class="ivq-t"><thead><tr><th>' + esc(t('ivq_r_op')) + '</th><th class="ivq-n">' + esc(t('ivq_r_n')) + '</th><th class="ivq-n">' + esc(t('ivp_k_docs')) + '</th><th class="ivq-n">' + esc(t('ivp_f_review')) + '</th><th class="ivq-n">' + esc(t('ivq_r_pace')) + '</th><th>' + esc(t('ivq_r_first')) + '</th><th>' + esc(t('ivq_r_last')) + '</th></tr></thead><tbody>' +
      (R.operators.map(o => '<tr><td>' + esc(o.who) + '</td><td class="ivq-n">' + o.n + '</td><td class="ivq-n">' + o.docs + '</td><td class="ivq-n">' + o.review + '</td><td class="ivq-n">' + esc(ivqSecs(o.median_ms)) + '</td><td>' + d(o.first) + '</td><td>' + d(o.last) + '</td></tr>').join('') || '<tr><td colspan="7">—</td></tr>') + '</tbody></table>' +
    '<h2>' + esc(t('ivq_r_boxes')) + '</h2><table class="ivq-t"><thead><tr><th>' + esc(t('ivq_r_box')) + '</th><th class="ivq-n">' + esc(t('ivq_r_n')) + '</th><th class="ivq-n">' + esc(t('ivq_r_counted')) + '</th><th>' + esc(t('ivq_r_years')) + '</th></tr></thead><tbody>' +
      (R.perBox.map(x => '<tr><td class="mono">' + esc(x.code) + '</td><td class="ivq-n">' + x.n + '</td><td class="ivq-n">' + x.counted + '</td><td>' + (x.y0 ? x.y0 + (x.y1 !== x.y0 ? '–' + x.y1 : '') : '—') + '</td></tr>').join('') || '<tr><td colspan="3">—</td></tr>') + '</tbody></table>' +
    (R.verifications.length ? '<h2>' + esc(t('ivq_r_ver')) + '</h2><table class="ivq-t"><tbody>' + R.verifications.map(v => '<tr><td class="mono">' + esc(v.box) + '</td><td>' + esc(t('ivq_ver_row', {b:'', f:v.found, e:v.expected}).replace(/^:\s*/, '')) + '</td><td>' + esc(t('ivq_ver_mis', {n:v.missing})) + ', ' + esc(t('ivq_ver_x', {n:v.misplaced})) + '</td><td>' + d(v.at) + '</td></tr>').join('') + '</tbody></table>' : '') +
    '</div>';
}
function ivqReportCSV(R){
  const q = (v) => { v = String(v == null ? '' : v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, n = (x) => String(x).replace('.', S.lang === 'en' ? '.' : ',');
  const rows = [['sezione', 'voce', 'valore', 'quantita', 'prezzo', 'totale'],
    ['progetto', 'nome', R.name], ['progetto', 'codice', R.code], ['progetto', 'cliente', R.client], ['progetto', 'modalita', R.mode], ['progetto', 'dal', R.first], ['progetto', 'al', R.last],
    ['totali', 'scatole', R.boxes], ['totali', 'faldoni', R.binders], ['totali', 'faldoni_contati', R.counted], ['totali', 'faldoni_senza_etichetta', R.nolabel], ['totali', 'documenti', R.docs]];
  Object.keys(R.states).forEach(k => rows.push(['stato', k, R.states[k]]));
  rows.push(['tempi', 'mediana_secondi_a_faldone', n((R.median_ms / 1000).toFixed(1))], ['ai', 'letti', R.ai.read], ['ai', 'fiducia_media', n(R.ai.avg)], ['ai', 'da_rivedere', R.ai.review]);
  rows.push(['etichette', 'scatole_generate', R.labels.box], ['etichette', 'faldoni_documenti_generati', R.labels.binder], ['etichette', 'stampate', R.labels.printed], ['etichette', 'scatole_non_usate', R.labels.unusedBox], ['etichette', 'faldoni_documenti_non_usati', R.labels.unusedBin]);
  R.bill.lines.forEach(l => rows.push(['fattura', l.k, '', l.qty, n(l.unit), n(l.total)]));
  rows.push(['fattura', 'imponibile', '', '', '', n(R.bill.net)], ['fattura', 'iva_' + R.bill.vatPct, '', '', '', n(R.bill.vat)], ['fattura', 'totale', '', '', '', n(R.bill.gross)]);
  R.operators.forEach(o => rows.push(['operatore', o.who, o.n, o.docs, n((o.median_ms / 1000).toFixed(1)), o.review]));
  R.perBox.forEach(x => rows.push(['scatola', x.code, x.n, x.counted, x.y0 || '', x.y1 || '']));
  R.verifications.forEach(v => rows.push(['verifica', v.box, v.found + '/' + v.expected, v.missing, v.misplaced, v.at]));
  return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}
const IVQ_PRINT_CSS = '.ivq-r{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#000;background:#fff;font-size:9.5pt;line-height:1.35;max-width:190mm;margin:0 auto}' +
  '.ivq-r h1{font-size:15pt;margin:0 0 8pt}.ivq-r h2{font-size:11pt;margin:12pt 0 4pt;border-bottom:1px solid #000;padding-bottom:2pt}' +
  '.ivq-r table{width:100%;border-collapse:collapse}.ivq-r th,.ivq-r td{text-align:left;padding:2pt 4pt;border-bottom:.5pt solid #bbb;vertical-align:top}.ivq-r .ivq-n{text-align:right;font-variant-numeric:tabular-nums}' +
  '.ivq-kv th{width:38%;font-weight:600}.ivq-r tfoot td{border-bottom:0}.ivq-r .mono{font-family:"DM Mono",monospace}.ivq-note{font-size:8pt;color:#444}.ivq-r .muted{color:#555}';
function ivqOpenReport(id){
  const a = ivpProj(id); if (!a) return;
  const R = ivqReport(a);
  openModal({title:t('ivq_report'), size:'lg', body:'<style>' + IVQ_PRINT_CSS + '</style>' + ivqReportHTML(a, R),
    buttons:[{label:t('close'), cls:'btn', action:'modal-close'},
      {label:t('ivq_r_csv'), cls:'btn', icon:'download', fn:() => { const nm = brandFile('report_inventario_' + slugify(a.inv.code), 'csv'); download(nm, ivqReportCSV(ivqReport(a)), 'text/csv'); toast(t('ex_done', {f:nm})); }},
      {label:t('ivq_r_print'), cls:'btn btn-primary', icon:'printer', fn:() => { const html = '<style>' + IVQ_PRINT_CSS + '</style>' + ivqReportHTML(a, ivqReport(a)); closeModal(true); doPrint('register', html); }}]});
}

/* ---------------- Impostazioni › Inventario ---------------- */
function ivqSettingsHTML(){
  const def = invPriceDefaults(S.settings), own = invPriceNorm(S.settings.invPrices), ai = S.settings.invAi || {};
  const tpl = (Array.isArray(S.settings.invTemplates) ? S.settings.invTemplates : []).map(invTplNorm);
  return '<div class="card card-p stack" style="margin-top:16px" id="ivq-set"><h2>' + esc(t('ivq_set_h')) + '</h2><p class="small muted">' + esc(t('ivq_set_p')) + '</p>' +
    '<div class="ivp-prices">' + INV_PRICE_KEYS.map(k => '<label class="ivp-pr"><span class="small">' + esc(t('ivp_pr_' + k)) + '</span><input class="inp inp-sm" data-ivq-price="' + k + '" inputmode="decimal" value="' + (own[k] === null ? '' : esc(String(own[k]))) + '" placeholder="' + esc(fmtMoneyPlain(def[k])) + '"></label>').join('') + '</div>' +
    '<h3>' + esc(t('ivq_set_ai_h')) + '</h3><p class="small muted">' + esc(t('ivq_set_ai_p')) + '</p>' +
    '<label class="row small"><input type="checkbox" data-ivq-ai="on" id="ivq-ai-on"' + (ai.on ? ' checked' : '') + '> ' + esc(t('ivq_set_ai_on')) + '</label>' +
    '<div class="grid g2"><div class="field"><label for="ivq-ai-url">' + esc(t('ivq_set_ai_url')) + '</label><input class="inp mono small" id="ivq-ai-url" data-ivq-ai="url" value="' + esc(ai.url || '') + '" placeholder="' + esc(IVQ_AI_LOCAL_DEFAULT) + '"></div>' +
      '<div class="field"><label for="ivq-ai-model">' + esc(t('ivq_set_ai_model')) + '</label><input class="inp mono small" id="ivq-ai-model" data-ivq-ai="model" value="' + esc(ai.model || '') + '" placeholder="qwen2.5vl:7b"></div></div>' +
    '<div class="row"><button class="btn btn-sm" data-a="ivq-ai-test" id="ivq-ai-test">' + esc(t('ivq_set_ai_test')) + '</button><span class="small" id="ivq-ai-test-r"></span></div><div class="hint">' + esc(t('ivq_set_ai_h2')) + '</div>' +
    '<h3>' + esc(t('ivq_set_tpl_h')) + '</h3>' + (tpl.length ? '<ul class="ivq-tpls">' + tpl.map(x => '<li><span>' + esc(S.lang === 'en' ? x.en : x.it) + ' <span class="tiny muted">' + esc(t('ivp_mode_' + x.mode) + ' · ' + x.tags.slice(0, 4).join(', ')) + '</span></span><button class="btn btn-sm" data-a="ivq-tpl-del" data-id="' + esc(x.id) + '">' + esc(t('ivq_tpl_del')) + '</button></li>').join('') + '</ul>' : '<div class="small muted">' + esc(t('ivq_set_tpl_none')) + '</div>') +
    '</div>';
}
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.ivqPrice){ const p = invPriceNorm(S.settings.invPrices); p[el.dataset.ivqPrice] = invPriceNum(el.value); S.settings.invPrices = p; commit({dirty:false}); }
  if (el.dataset.ivqAi){ const c = Object.assign({}, S.settings.invAi || {}), k = el.dataset.ivqAi; c[k] = k === 'on' ? !!el.checked : String(el.value || '').trim(); if (k === 'on' && c.on && !c.url) c.url = IVQ_AI_LOCAL_DEFAULT; S.settings.invAi = c; commit({dirty:false}); if (k === 'on'){ const u = $('#ivq-ai-url'); if (u && !u.value) u.value = c.url || ''; } }
});

/* ---------------- actions ---------------- */
const IVQ_ACTIONS = {
  'ivq-report': (el) => ivqOpenReport(el.dataset.id),
  'ivq-live': (el) => { if (IVQ.live === el.dataset.id){ ivqLiveStop(); ivpRefresh(); } else ivqLiveStart(el.dataset.id); },
  'ivq-tpl': (el) => ivqTplSave(el.dataset.id),
  'ivq-ai': (el) => ivqAiRun(el.dataset.id),
  'ivq-ai-stop': () => { if (IVQ.ai) IVQ.ai.stop = true; },
  'ivq-tpl-del': (el) => { S.settings.invTemplates = (S.settings.invTemplates || []).filter(x => x && x.id !== el.dataset.id); commit({dirty:false}); renderView(); },
  'ivq-ai-test': async () => {
    const out = $('#ivq-ai-test-r'), c = S.settings.invAi || {}, conf = {url:String(c.url || IVQ_AI_LOCAL_DEFAULT).replace(/\/+$/, ''), model:String(c.model || '').trim()};
    if (out) out.textContent = '…';
    try { const r = await ivqAiLocalCall(conf, '', 'fatture acquisti 2019', {tags:['Fatture']}); if (out) out.textContent = t('ivq_set_ai_ok', {m:r.model + ' → ' + (r.result.title || '—')}); }
    catch(e){ if (out) out.textContent = t('ivq_set_ai_ko', {m:String(e && e.message || e).slice(0, 160)}); }
  }
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVQ_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVQ_ACTIONS); });

(function ivqWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('viewSettings', (o) => function(){ return o.apply(this, arguments) + ivqSettingsHTML(); });
  // leaving the project page stops the live refresh
  wrap('renderView', (o) => function(){ const r = o.apply(this, arguments); if (IVQ.live && (S.view !== 'inv' || IVP.open !== IVQ.live)) ivqLiveStop(); return r; });
})();

/* ---------------- help topic (v12.12) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'inventory-pro')) return;
  const inv = HELP_TOPICS.find(x => x.id === 'inventory'); if (inv && !inv.related.includes('inventory-pro')) inv.related.unshift('inventory-pro');
  HELP_TOPICS.push({ id:'inventory-pro', guide:null, tags:['start'], related:['inventory', 'server'],
    kw:{it:'stazione fissa catena due persone verifica scatola scanner bluetooth pistola documenti pagina modelli prezzi preventivo report fine lavoro fatturazione operatori ai locale ollama lm studio',
        en:'fixed station chain two people verify box bluetooth scanner gun documents page templates prices quote report end of job billing operators local ai ollama lm studio'},
    title:{it:'Inventario: stazione, catena, verifica, report e prezzi', en:'Inventory: station, chain, verify, report and prices'},
    body:{it:'<p>Quattro <b>modalità</b> nel progetto (Modifica): <b>Scatola → faldoni</b> e <b>Cattura ora, cataloga dopo</b> come prima; <b>Stazione fissa</b> (telefono sul supporto, la persona passa i faldoni davanti alla fotocamera: conferma grande, comandi nascosti); <b>Catena a due persone</b> (uno scansiona, l\'altro corregge sul PC nel pannello <b>In diretta</b>, che si aggiorna da solo).</p>' +
      '<ul><li><b>Scanner Bluetooth o USB</b>: collegalo al telefono o al PC come tastiera; ogni lettura vale come una scansione con la fotocamera.</li>' +
      '<li><b>Documenti</b>: con «Livello documento» attivo nel progetto, scansiona il faldone e poi le etichette dei documenti che contiene; rileggere il faldone chiude la cartella. Le etichette <b>Jolly</b> valgono per scatole, faldoni o documenti.</li>' +
      '<li><b>Verifica una scatola</b> (telefono): scansiona la scatola e poi tutto quello che c\'è dentro; vedi cosa manca, cosa è fuori posto e lo sposti con un tocco. Il risultato resta nel registro e nel report.</li>' +
      '<li><b>Modelli</b>: un nuovo progetto parte da un modello (commercialista, ente, legale…) con tag, anni e modalità; <b>Salva come modello</b> ne crea uno tuo.</li>' +
      '<li><b>Prezzi</b>: quelli generali in Impostazioni › Inventario; quelli del preventivo nel progetto (vuoti = generali).</li>' +
      '<li><b>Report di fine lavoro</b>: totali, tempi, lettura AI, etichette usate, fatturazione indicativa, operatori; stampa o CSV.</li>' +
      '<li><b>AI locale</b>: in Impostazioni › Inventario puoi usare un modello sul PC (Ollama o LM Studio) per leggere dal PC le foto che il server online non ha letto: le foto non escono dall\'ufficio. Sul server la scelta del fornitore è nella configurazione.</li></ul>',
      en:'<p>Four <b>modes</b> in the project (Edit): <b>Box → binders</b> and <b>Capture now, catalogue later</b> as before; <b>Fixed station</b> (phone on a stand, the person moves binders past the camera: big confirmation, controls hidden); <b>Two-person chain</b> (one scans, the other fixes on the PC in the <b>Live</b> panel, which refreshes by itself).</p>' +
      '<ul><li><b>Bluetooth or USB scanner</b>: pair it with the phone or PC as a keyboard; each reading counts as a camera scan.</li>' +
      '<li><b>Documents</b>: with «Document level» on in the project, scan the binder then the labels of the documents inside; scanning the binder again closes the folder. <b>Jolly</b> labels work for boxes, binders or documents.</li>' +
      '<li><b>Check a box</b> (phone): scan the box then everything in it; see what is missing or misplaced and move it with one tap. The result stays in the log and in the report.</li>' +
      '<li><b>Templates</b>: a new project starts from a template (accountant, public body, legal…) with tags, years and mode; <b>Save as template</b> makes your own.</li>' +
      '<li><b>Prices</b>: general ones in Settings › Inventory; the quote ones in the project (empty = general).</li>' +
      '<li><b>End-of-job report</b>: totals, times, AI reading, labels used, indicative billing, operators; print or CSV.</li>' +
      '<li><b>Local AI</b>: in Settings › Inventory you can use a model on the PC (Ollama or LM Studio) to read from the PC the photos the online server did not read: photos never leave the office. On the server the provider is chosen in the configuration.</li></ul>'} });
});
