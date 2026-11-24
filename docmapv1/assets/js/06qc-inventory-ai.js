/* v12.17 — AI reading of the inventory on the PC (index.html only, after 06qb-inventory-tools.js):
   1. Tag vocabulary of the client (project page, under «Scatole»): one line per tag with its synonyms ("IVA = iva, i.v.a."),
      excluded words, and "nuovi tag suggeriti" = words that come back on many spines (invVocabSuggest, 02f).
      The phone and the PC send tags + synonyms to the AI and map the answer back to the canonical tag (invAiTags).
   2. Test bench: re-reads N confirmed binders (the right answers) with the server's AI or the local model and measures
      field by field how often the reading is right, the time and how trustworthy the confidence is (invBenchScore /
      invBenchSummary). Binders are never changed; each run is kept in inv.bench to compare providers and prompts.
   Format and rules: docs/RICONOSCIMENTO.md. */

Object.assign(I18N.it, {
  ivy_h:'Lettura AI: vocabolario e banco di prova', ivy_p:'Il vocabolario decide quali parole diventano tag; il banco di prova misura quanto legge bene l\'AI sui vostri faldoni.',
  ivy_voc_h:'Vocabolario dei tag', ivy_voc_p:'Una riga per tag; dopo «=» le parole che valgono lo stesso tag (es. IVA = iva, i.v.a., imposta valore aggiunto). L\'AI sceglie solo tra questi tag; le parole escluse non diventano mai tag.',
  ivy_syn:'Tag e sinonimi', ivy_stop:'Parole escluse (separate da virgole)', ivy_save:'Salva il vocabolario', ivy_saved:'Vocabolario salvato: {n} tag',
  ivy_sugg:'Nuovi tag suggeriti', ivy_sugg_p:'Parole lette su almeno 3 faldoni che non sono ancora tag (mai nomi di persone o ditte).', ivy_sugg_none:'Nessun suggerimento per ora.',
  ivy_add:'Aggiungi come tag', ivy_skip:'Escludi', ivy_added:'«{w}» è un tag', ivy_skipped:'«{w}» non diventerà un tag',
  ivy_b_h:'Banco di prova', ivy_b_p:'Rilegge i faldoni già confermati (la risposta giusta) e conta quante volte l\'AI legge giusto ogni campo. Non cambia nessun faldone.',
  ivy_b_n:'Faldoni da rileggere', ivy_b_src:'Chi legge', ivy_b_srv:'L\'AI del server', ivy_b_loc:'Il modello locale di questo PC', ivy_b_go:'Avvia la prova',
  ivy_b_none:'Servono faldoni confermati con la foto: conferma prima qualche faldone nella revisione.', ivy_b_noai:'Nessuna AI disponibile: collega il server con l\'AI o imposta il modello locale (Impostazioni › Inventario).',
  ivy_b_have:'{n} faldoni confermati con la foto.', ivy_b_run:'Prova in corso: {d} di {n}…', ivy_b_stop:'Ferma',
  ivy_b_done:'Prova finita: {ok} di {n} faldoni letti tutti giusti', ivy_b_hist:'Prove fatte',
  ivy_b_when:'Quando', ivy_b_who:'Chi ha letto', ivy_b_all:'Tutto giusto', ivy_b_ms:'Secondi', ivy_b_cal:'Affidabilità', ivy_b_cal_h:'Tra le letture che l\'AI dava per sicure, quante erano tutte giuste.',
  ivy_f_company:'Ditta', ivy_f_title:'Contenuto', ivy_f_years:'Anni', ivy_f_doc_type:'Tipo', ivy_f_tags:'Tag',
  'lga_inventory.vocab':'Vocabolario dei tag', 'lga_inventory.bench':'Banco di prova AI'
});
Object.assign(I18N.en, {
  ivy_h:'AI reading: vocabulary and test bench', ivy_p:'The vocabulary decides which words become tags; the test bench measures how well the AI reads your binders.',
  ivy_voc_h:'Tag vocabulary', ivy_voc_p:'One line per tag; after «=» the words that mean the same tag (e.g. VAT = vat, v.a.t., value added tax). The AI only chooses among these tags; excluded words never become tags.',
  ivy_syn:'Tags and synonyms', ivy_stop:'Excluded words (comma separated)', ivy_save:'Save the vocabulary', ivy_saved:'Vocabulary saved: {n} tags',
  ivy_sugg:'Suggested new tags', ivy_sugg_p:'Words read on at least 3 binders that are not tags yet (never names of people or companies).', ivy_sugg_none:'No suggestion for now.',
  ivy_add:'Add as a tag', ivy_skip:'Exclude', ivy_added:'«{w}» is a tag', ivy_skipped:'«{w}» will never become a tag',
  ivy_b_h:'Test bench', ivy_b_p:'Reads again the binders already confirmed (the right answer) and counts how often the AI gets each field right. No binder is changed.',
  ivy_b_n:'Binders to read again', ivy_b_src:'Who reads', ivy_b_srv:'The server\'s AI', ivy_b_loc:'The local model of this PC', ivy_b_go:'Start the test',
  ivy_b_none:'Confirmed binders with a photo are needed: confirm a few binders in the review first.', ivy_b_noai:'No AI available: connect the server with AI or set the local model (Settings › Inventory).',
  ivy_b_have:'{n} confirmed binders with a photo.', ivy_b_run:'Test running: {d} of {n}…', ivy_b_stop:'Stop',
  ivy_b_done:'Test finished: {ok} of {n} binders read all right', ivy_b_hist:'Tests run',
  ivy_b_when:'When', ivy_b_who:'Who read', ivy_b_all:'All right', ivy_b_ms:'Seconds', ivy_b_cal:'Reliability', ivy_b_cal_h:'Among the readings the AI was sure of, how many were all right.',
  ivy_f_company:'Company', ivy_f_title:'Content', ivy_f_years:'Years', ivy_f_doc_type:'Type', ivy_f_tags:'Tags',
  'lga_inventory.vocab':'Tag vocabulary', 'lga_inventory.bench':'AI test bench'
});

const IVY = {run:null};
const IVY_BENCH_N = 20;

/* ---------------- card ---------------- */
function ivyAiHTML(a){
  const inv = normalizeInv(a.inv), V = inv.vocab, sugg = invVocabSuggest(ivpBinders(a), inv);
  const chips = sugg.map(x => '<span class="ivy-chip"><b>' + esc(x.w) + '</b> <span class="tiny muted">×' + x.n + '</span>' +
    '<button class="btn btn-xs" data-a="ivy-add" data-id="' + esc(a.id) + '" data-w="' + esc(x.w) + '" title="' + esc(t('ivy_add')) + '">' + ic('plus') + '</button>' +
    '<button class="btn btn-xs" data-a="ivy-skip" data-id="' + esc(a.id) + '" data-w="' + esc(x.w) + '" title="' + esc(t('ivy_skip')) + '">' + ic('x') + '</button></span>').join('');
  return '<div class="card card-p ivy" style="margin-top:16px" id="ivy-card"><h2>' + esc(t('ivy_h')) + '</h2><p class="small muted">' + esc(t('ivy_p')) + '</p><div class="grid g2">' +
    '<div id="ivy-vocab"><h3>' + esc(t('ivy_voc_h')) + '</h3><p class="tiny muted">' + esc(t('ivy_voc_p')) + '</p>' +
      '<label class="field"><span class="small">' + esc(t('ivy_syn')) + '</span><textarea class="inp mono" rows="6" id="ivy-syn">' + esc(invVocabText(V)) + '</textarea></label>' +
      '<label class="field"><span class="small">' + esc(t('ivy_stop')) + '</span><input class="inp" id="ivy-stop" value="' + esc(V.stop.join(', ')) + '"></label>' +
      '<button class="btn btn-sm btn-primary" data-a="ivy-save" data-id="' + esc(a.id) + '" id="ivy-save">' + ic('check') + esc(t('ivy_save')) + '</button>' +
      '<h3 style="margin-top:14px">' + esc(t('ivy_sugg')) + '</h3><p class="tiny muted">' + esc(t('ivy_sugg_p')) + '</p><div class="ivy-sugg" id="ivy-sugg">' + (chips || '<span class="small muted">' + esc(t('ivy_sugg_none')) + '</span>') + '</div></div>' +
    '<div id="ivy-bench">' + ivyBenchHTML(a) + '</div></div></div>';
}
function ivyTruth(a){ return ivpBinders(a).filter(b => b.inv && (b.inv.ph || b.inv.ph2) && ivpState(b) === 'confirmed'); }
function ivySources(){
  const conf = typeof srvConf === 'function' ? srvConf() : null, local = typeof ivqAiLocal === 'function' ? ivqAiLocal() : null, o = [];
  if (conf) o.push(['server', t('ivy_b_srv')]); if (local) o.push(['local', t('ivy_b_loc') + ' (' + local.model + ')']);
  return o;
}
function ivyBenchHTML(a){
  const T = ivyTruth(a), src = ivySources(), R = IVY.run, H = normalizeInv(a.inv).bench.slice().reverse();
  const pc = (v) => v === null || v === undefined ? '—' : Math.round(v * 100) + '%';
  let body;
  if (R && R.id === a.id) body = '<p class="small" id="ivy-b-run">' + esc(t('ivy_b_run', {d:R.done, n:R.total})) + ' <button class="btn btn-sm" data-a="ivy-stop">' + esc(t('ivy_b_stop')) + '</button></p>';
  else if (!T.length) body = '<p class="small muted" id="ivy-b-none">' + esc(t('ivy_b_none')) + '</p>';
  else if (!src.length) body = '<p class="small muted" id="ivy-b-noai">' + esc(t('ivy_b_noai')) + '</p>';
  else body = '<p class="small">' + esc(t('ivy_b_have', {n:T.length})) + '</p><div class="row wrap">' +
    '<label class="field"><span class="small">' + esc(t('ivy_b_src')) + '</span><select class="inp inp-sm" id="ivy-src">' + src.map(s => '<option value="' + s[0] + '">' + esc(s[1]) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="small">' + esc(t('ivy_b_n')) + '</span><input class="inp inp-sm" type="number" min="1" max="500" id="ivy-n" value="' + Math.min(IVY_BENCH_N, T.length) + '"></label></div>' +
    '<button class="btn btn-sm btn-primary" data-a="ivy-bench" data-id="' + esc(a.id) + '" id="ivy-go">' + ic('play') + esc(t('ivy_b_go')) + '</button>';
  const hist = H.length ? '<h3 style="margin-top:14px">' + esc(t('ivy_b_hist')) + '</h3><div style="overflow-x:auto"><table class="ivx-boxes" id="ivy-hist"><thead><tr><th>' + esc(t('ivy_b_when')) + '</th><th>' + esc(t('ivy_b_who')) + '</th>' +
      INV_AI_FIELDS.map(f => '<th class="ivq-n">' + esc(t('ivy_f_' + f)) + '</th>').join('') + '<th class="ivq-n">' + esc(t('ivy_b_all')) + '</th><th class="ivq-n">' + esc(t('ivy_b_ms')) + '</th><th class="ivq-n" title="' + esc(t('ivy_b_cal_h')) + '">' + esc(t('ivy_b_cal')) + '</th></tr></thead><tbody>' +
      H.map(x => '<tr><td class="small">' + esc(fmtDate(x.at, true)) + '</td><td class="small">' + esc([x.provider, x.model].filter(Boolean).join(' · ') + ' · p' + x.prompt_v) + '</td>' +
        INV_AI_FIELDS.map(f => '<td class="ivq-n">' + pc(x.acc[f]) + '</td>').join('') + '<td class="ivq-n"><b>' + (x.n ? Math.round(100 * x.ok / x.n) + '%' : '—') + '</b> <span class="tiny muted">' + x.ok + '/' + x.n + '</span></td>' +
        '<td class="ivq-n">' + (x.ms ? (Math.round(x.ms / 100) / 10).toString().replace('.', S.lang === 'en' ? '.' : ',') : '—') + '</td><td class="ivq-n">' + pc(x.calib) + '</td></tr>').join('') + '</tbody></table></div>' : '';
  return '<h3>' + esc(t('ivy_b_h')) + '</h3><p class="tiny muted">' + esc(t('ivy_b_p')) + '</p>' + body + hist;
}
function ivyRefresh(a){ const el = $('#ivy-bench'); if (el && a) el.innerHTML = ivyBenchHTML(a); else ivpRefresh(); }

/* ---------------- vocabulary ---------------- */
/** Saves a vocabulary on the project; its tags join the quick tags of the phone. Returns the new vocabulary. */
function ivyVocabSet(a, vocab, why){
  const V = invVocabNorm(vocab), tags = invNormTags((a.inv.tags || []).concat(V.syn.map(x => x.tag)));
  a.inv = normalizeInv(Object.assign({}, a.inv, {vocab:V, tags})); ivpTouch(a);
  logAct('inventory.vocab', ivpTarget(a), why || ('Vocabolario dei tag del progetto ' + a.name + ': ' + V.syn.length + ' tag, ' + V.stop.length + ' parole escluse'), {tags:V.syn.length, stop:V.stop.length});
  commit();
  return V;
}
function ivySave(id){
  const a = ivpProj(id); if (!a) return;
  const V = ivyVocabSet(a, invVocabParse(($('#ivy-syn') || {}).value || '', ($('#ivy-stop') || {}).value || ''));
  toast(t('ivy_saved', {n:V.syn.length}), 'ok'); ivpRefresh();
}
function ivyAdd(id, w){
  const a = ivpProj(id); if (!a || !w) return;
  const V = invVocabNorm(a.inv.vocab), tag = w.charAt(0).toUpperCase() + w.slice(1);
  if (!V.syn.some(x => invFold(x.tag) === invFold(w))) V.syn.push({tag, words:[]});
  ivyVocabSet(a, V, 'Nuovo tag «' + tag + '» dai suggerimenti del progetto ' + a.name); toast(t('ivy_added', {w:tag}), 'ok'); ivpRefresh();
}
function ivySkip(id, w){
  const a = ivpProj(id); if (!a || !w) return;
  const V = invVocabNorm(a.inv.vocab); V.stop.push(w);
  ivyVocabSet(a, V, 'Parola «' + w + '» esclusa dai tag del progetto ' + a.name); toast(t('ivy_skipped', {w}), 'ok'); ivpRefresh();
}

/* ---------------- test bench ---------------- */
/** n confirmed binders spread over the whole project (not only the last ones): every k-th by capture time. */
function ivyBenchSample(T, n){
  const L = T.slice().sort((x, y) => String(x.inv.at || x.created_at || '').localeCompare(String(y.inv.at || y.created_at || '')));
  n = Math.max(1, Math.min(L.length, n || IVY_BENCH_N)); if (n >= L.length) return L;
  const out = []; for (let i = 0; i < n; i++) out.push(L[Math.floor(i * L.length / n)]);
  return out;
}
/** Runs the bench; o = {n, src:'server'|'local'}. Returns the saved run (also in a.inv.bench) or null. */
async function ivyBenchRun(id, o){
  const a = ivpProj(id); if (!a || IVY.run) return null;
  o = o || {};
  const conf = o.src === 'local' ? null : (typeof srvConf === 'function' ? srvConf() : null), local = o.src === 'server' ? null : ivqAiLocal();
  if (!conf && !local){ toast(t('ivy_b_noai'), 'warn', 8000); return null; }
  const list = ivyBenchSample(ivyTruth(a), parseInt(o.n, 10) || IVY_BENCH_N); if (!list.length){ toast(t('ivy_b_none'), 'warn'); return null; }
  const R = IVY.run = {id, total:list.length, done:0, stop:false}; ivyRefresh(a);
  const hints0 = {tags:invVocabHintTags(a.inv), year_from:a.inv.year_from, year_to:a.inv.year_to, client:a.inv.client};
  const rows = []; let err = 0, last = null;
  for (const b of list){
    if (R.stop) break;
    const t0 = Date.now();
    try {
      const r = await ivqAiCall(b, Object.assign({}, hints0, {kind:ivqAiKind(b)}), conf, local, {useSrv:!!conf});
      const res = Object.assign({}, r.result || {}); res.tags = invAiTags(res, a.inv); last = r;
      rows.push({id:b.id, score:invBenchScore(b, res, a.inv), conf:+res.confidence || 0, ms:+r.ms || (Date.now() - t0)});
    } catch(e){ err++; if (/ivq_ai_none|Nessuna AI|No AI/.test(String(e && e.message))) break; }
    R.done++; const el = $('#ivy-b-run'); if (el) el.firstChild.textContent = t('ivy_b_run', {d:R.done, n:R.total}) + ' ';
  }
  IVY.run = null;
  if (!rows.length){ toast(t('ivq_ai_err', {m:err ? String(err) : '—'}), 'warn', 8000); ivyRefresh(a); return null; }
  const Sm = invBenchSummary(rows, a.inv.auto_confirm);
  const run = {at:nowISO(), provider:(last && last.provider) || (conf ? 'server' : 'local'), model:(last && last.model) || '', prompt_v:(last && +last.prompt_v) || 1, n:Sm.n, ok:Sm.ok, ms:Sm.ms, err, acc:Sm.acc, calib:Sm.calib};
  a.inv = normalizeInv(Object.assign({}, a.inv, {bench:(a.inv.bench || []).concat([run])})); ivpTouch(a);
  logAct('inventory.bench', ivpTarget(a), 'Banco di prova AI sul progetto ' + a.name + ': ' + Sm.ok + ' di ' + Sm.n + ' faldoni letti tutti giusti (' + run.provider + (run.model ? ' ' + run.model : '') + ')', run);
  commit();
  toast(t('ivy_b_done', {ok:Sm.ok, n:Sm.n}), 'ok', 8000); ivpRefresh();
  return normalizeInv(a.inv).bench.slice(-1)[0];
}

const IVY_ACTIONS = {
  'ivy-save': (el) => ivySave(el.dataset.id), 'ivy-add': (el) => ivyAdd(el.dataset.id, el.dataset.w), 'ivy-skip': (el) => ivySkip(el.dataset.id, el.dataset.w),
  'ivy-bench': (el) => ivyBenchRun(el.dataset.id, {n:($('#ivy-n') || {}).value, src:($('#ivy-src') || {}).value}), 'ivy-stop': () => { if (IVY.run) IVY.run.stop = true; }
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVY_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, IVY_ACTIONS); });

/* ---------------- help topic ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'inventory-ai')) return;
  const inv = HELP_TOPICS.find(x => x.id === 'inventory'); if (inv && !inv.related.includes('inventory-ai')) inv.related.push('inventory-ai');
  HELP_TOPICS.push({ id:'inventory-ai', guide:null, tags:['start'], related:['inventory', 'inventory-pro', 'inventory-modes'],
    kw:{it:'lettura ai intelligenza artificiale vocabolario tag sinonimi parole escluse suggeriti banco di prova precisione fiducia campo da controllare giallo fornitore modello locale',
        en:'ai reading artificial intelligence vocabulary tags synonyms excluded words suggested test bench accuracy confidence field to check yellow provider local model'},
    title:{it:'Inventario: lettura AI, vocabolario dei tag e banco di prova', en:'Inventory: AI reading, tag vocabulary and test bench'},
    body:{it:'<p>La lettura AI <b>propone</b>, il QR e la persona <b>decidono</b>.</p><ul>' +
      '<li><b>Campi da controllare</b>: per ogni lettura l\'AI dice quanto è sicura di ogni campo (ditta, contenuto, anni, tipo, tag). Nella revisione i campi incerti sono in giallo con «Da controllare»; un faldone con un campo incerto va in «Da rivedere» e non si conferma mai in blocco.</li>' +
      '<li><b>Vocabolario dei tag</b> (pagina del progetto): una riga per tag con i sinonimi, per esempio <code>IVA = iva, i.v.a.</code>. L\'AI sceglie solo tra questi tag, e anche le parole dette a voce o lette sulla costa vengono riportate al tag giusto. Le parole escluse non diventano mai tag.</li>' +
      '<li><b>Nuovi tag suggeriti</b>: le parole che tornano su almeno 3 faldoni e non sono ancora tag. Un clic le aggiunge o le esclude per sempre. Nomi di persone e ditte non vengono mai suggeriti.</li>' +
      '<li><b>Banco di prova</b>: rilegge i faldoni già confermati e misura quante volte l\'AI legge giusto ogni campo, in quanti secondi e quanto ci si può fidare della sua sicurezza. Provate così il server, il modello locale o un prompt nuovo prima di usarli su un archivio intero. Nessun faldone viene cambiato.</li></ul>',
      en:'<p>The AI reading <b>proposes</b>; the QR and the person <b>decide</b>.</p><ul>' +
      '<li><b>Fields to check</b>: for each reading the AI says how sure it is of every field (company, content, years, type, tags). In the review the doubtful fields are yellow with «To check»; a binder with a doubtful field goes to «To review» and is never confirmed in bulk.</li>' +
      '<li><b>Tag vocabulary</b> (project page): one line per tag with its synonyms, e.g. <code>VAT = vat, v.a.t.</code>. The AI only chooses among these tags, and words said aloud or read on the spine are brought back to the right tag. Excluded words never become tags.</li>' +
      '<li><b>Suggested new tags</b>: words coming back on at least 3 binders that are not tags yet. One click adds or excludes them for good. Names of people and companies are never suggested.</li>' +
      '<li><b>Test bench</b>: reads the confirmed binders again and measures how often the AI gets each field right, in how many seconds and how far its confidence can be trusted. Try the server, the local model or a new prompt this way before using them on a whole archive. No binder is changed.</li></ul>'} });
});
