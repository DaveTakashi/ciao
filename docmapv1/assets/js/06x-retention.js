/* =====================================================================
   DocMap 2026 — v12.11 «Scarto proposto» (index.html, after 06w-newyear.js). Roadmap K2.
   Every January DocMap proposes which binders have passed their retention time, with the rules the studio sets
   per kind of document, and prepares the «verbale di scarto». DocMap NEVER decides or destroys anything by itself:
   it is a proposal to check (legal duties, open audits or disputes, agreements with the client) and it is not
   «conservazione a norma».

   - Rules (S.settings.retention, ⚙ › Lavoro › Scarto › Regole; travel with the shared settings, newer rulesAt wins):
       {on, month (1-12, when the yearly proposal appears), defYears, holdTag, publicBody, rules:[{id, cat, kw, years,
       keep, note}], rulesAt}. First matching rule wins: `cat` = category (same text), `kw` = words separated by
       commas looked for in title, tags and contents; keep = never proposed. No rule → defYears.
   - A binder is proposed in year Y when Y > last year it covers (yrMax) + years. Not proposed: no year (listed to
     fix), «conserva sempre», the hold tag (default «non-scartare», e.g. an audit in progress), currently out
     (status «fuori» / «smarrito»: wait for it), already in a verbale not cancelled.
   - Verbale (S.disposals[], in the backups): {id, year, n, created_at, created_by, approver, role, authority,
     authority_date, note, items:[snapshot], hash, executed_at, executed_by, destroyer, certificate, destroyed_on,
     cancelled_at}. hash = SHA-256 of the canonical text (dsCanon), checked when printed. Steps: proposal →
     «Prepara il verbale» (who approves; for a public body the Soprintendenza authorisation, art. 21 D.Lgs. 42/2004)
     → print and sign → after the physical destruction «Segna come distrutti»: the binders leave the archive
     (tombstones, synced), their snapshot stays in the verbale. One undo step each.
   - Printed codes are never reused: short codes and speaking codes of destroyed binders stay taken
     (allShortCodes / suggestSpeakingCode wraps).
   - «Oggi»: from the rule month (January) the proposal of the year shows while there is something to check; a toast
     once, during the rule month only.
   ===================================================================== */
'use strict';

const RT_HOLD_DEF = 'non-scartare';
const RT_DEF_RULES = [
  {id:'r-soc', cat:'Societario', kw:'', years:0, keep:true, note:'Atti e libri sociali, verbali, statuto: si tengono sempre (da verificare caso per caso).'},
  {id:'r-atti', cat:'', kw:'verbal, statut, atto costitutivo, libro soci, libri sociali, atti societari, rogit, successione', years:0, keep:true, note:'Atti e documenti permanenti: si tengono sempre.'},
  {id:'r-lav', cat:'Lavoro', kw:'paghe, cedolin, libro unico, lul, personale, contributi', years:10, keep:false, note:'Lavoro: il LUL si tiene almeno 5 anni dall\'ultima registrazione; molti studi tengono 10 anni (verificare gli obblighi previdenziali).'}
];
const RT_DEF = {on:true, month:1, defYears:10, holdTag:RT_HOLD_DEF, publicBody:false, rules:null, rulesAt:''};
const RT_TOAST_LS = 'docmap_disposal_toast_year';

Object.assign(I18N.it, {
  nav_rt:'Scarto', nd_rt:'Proposta annuale di scarto con le regole di conservazione e il verbale da firmare',
  rt_h:'Scarto proposto', rt_p:'Ogni anno DocMap propone i faldoni che hanno superato il tempo di conservazione, secondo le regole dello studio. È una proposta da verificare: la decisione è di chi firma il verbale. Lo scarto non è «conservazione a norma».',
  rt_warn:'Prima di scartare verifica: accertamenti o contenziosi aperti, obblighi di legge del tipo di documento, accordi con il cliente. Per un ente pubblico serve l\'autorizzazione della Soprintendenza archivistica (art. 21 D.Lgs. 42/2004).',
  rt_year:'Proposta per l\'anno', rt_k_prop:'proposti', rt_k_keep:'da tenere ancora', rt_k_noyear:'senza anno', rt_k_blocked:'bloccati o fuori',
  rt_s_prop:'Faldoni proposti per lo scarto', rt_s_none:'Nessun faldone da proporre per lo scarto nel {y}.', rt_rule:'Regola', rt_kept_until:'conservato fino al {y}', rt_years:'Anni', rt_loc:'Posizione',
  rt_r_def:'Regola generale ({n} anni)', rt_r_keep:'si tiene sempre', rt_r_years:'{n} anni',
  rt_noyear_h:'Faldoni senza anno ({n})', rt_noyear_p:'Senza un anno (nel titolo, nell\'anno di riferimento o nel contenuto) DocMap non può proporli: aggiungilo nella scheda.', rt_open_arch:'Mostrali nell\'archivio',
  rt_blk_h:'Esclusi ({n})', rt_why_hold:'bloccato (tag «{t}»)', rt_why_out:'fuori archivio: aspetta il rientro', rt_why_inv:'già nel verbale {v}',
  rt_all:'Tutti', rt_nothing:'Nessuno', rt_make:'Prepara il verbale ({n} faldoni)', rt_make_h:'Verbale di scarto {y}', rt_approver:'Chi approva lo scarto (nome e cognome)', rt_role:'Ruolo (es. titolare dello studio, responsabile archivio)',
  rt_auth:'Autorizzazione della Soprintendenza: numero', rt_auth_d:'del (data)', rt_note:'Note (facoltative)', rt_need_approver:'Scrivi chi approva lo scarto.', rt_need_auth:'Per un ente pubblico serve il numero dell\'autorizzazione.',
  rt_made:'Verbale {v} preparato: stampalo e fallo firmare. Dopo la distruzione premi «Segna come distrutti».',
  rt_v_h:'Verbali di scarto', rt_v_none:'Nessun verbale.', rt_v_n:'Verbale {v}', rt_v_st_approved:'da eseguire', rt_v_st_executed:'eseguito il {d}', rt_v_st_cancelled:'annullato',
  rt_v_print:'Stampa il verbale', rt_v_csv:'CSV', rt_v_exec:'Segna come distrutti', rt_v_cancel:'Annulla il verbale', rt_v_items:'{n} faldoni',
  rt_x_h:'Distruzione eseguita — verbale {v}', rt_x_p:'Fallo solo dopo la distruzione fisica (o la consegna alla ditta). I {n} faldoni escono dall\'archivio di DocMap; restano descritti nel verbale. Si può annullare subito con «Annulla».',
  rt_x_who:'Ditta o persona che ha distrutto', rt_x_cert:'Numero del certificato di distruzione (facoltativo)', rt_x_date:'Data della distruzione', rt_x_ok:'Segna come distrutti',
  rt_x_done:'{n} faldoni segnati come distrutti (verbale {v}).', rt_x_gone:'{n} faldoni del verbale non c\'erano più nell\'archivio.',
  rt_c_t:'Annullare il verbale {v}?', rt_c_d:'I faldoni tornano a essere proposti. Il verbale resta nell\'elenco come annullato.', rt_c_done:'Verbale {v} annullato',
  rt_rules:'Regole di conservazione', rt_rules_p:'La prima regola che vale per un faldone decide. Categoria = stesso testo della categoria; parole = cercate in titolo, tag e contenuto (separate da virgole). Gli anni contano dall\'ultimo anno del faldone. I valori proposti sono indicativi: verificali con il tuo consulente.',
  rt_f_on:'Proposta annuale attiva', rt_f_month:'Mese in cui compare la proposta', rt_f_def:'Anni di conservazione se nessuna regola vale', rt_f_hold:'Tag che blocca lo scarto', rt_f_pub:'Siamo un ente pubblico (serve l\'autorizzazione della Soprintendenza)',
  rt_f_cat:'Categoria', rt_f_kw:'Parole', rt_f_years:'Anni', rt_f_keep:'Tieni sempre', rt_f_note:'Nota', rt_f_add:'Aggiungi una regola', rt_f_del:'Togli', rt_f_reset:'Ripristina le regole proposte',
  rt_todo:'Proposta di scarto {y}: {n} faldoni da valutare', rt_toast:'Pronta la proposta di scarto {y}: {n} faldoni da valutare', rt_open:'Apri',
  rt_log_make:'Preparato il verbale di scarto {v} ({n} faldoni)', rt_log_exec:'Eseguito lo scarto del verbale {v}: {n} faldoni distrutti', rt_log_cancel:'Annullato il verbale di scarto {v}',
  rt_pr_title:'Verbale di scarto', rt_pr_intro:'Si dà atto che i documenti elencati hanno superato il tempo di conservazione previsto dalle regole dello studio riportate sotto e che, verificata l\'assenza di accertamenti, contenziosi o altri motivi per conservarli, se ne dispone lo scarto.',
  rt_pr_rules:'Regole applicate', rt_pr_list:'Elenco dei faldoni', rt_pr_tot:'Totale: {n} faldoni', rt_pr_sign_a:'Approvato da', rt_pr_sign_x:'Distruzione eseguita da', rt_pr_date:'Data', rt_pr_cert:'Certificato n.',
  rt_pr_auth:'Autorizzazione della Soprintendenza archivistica n. {n} del {d} (art. 21 D.Lgs. 42/2004)', rt_pr_auth_blank:'Autorizzazione della Soprintendenza archivistica n. ________ del ________ (art. 21 D.Lgs. 42/2004)',
  rt_pr_note:'Proposta generata da DocMap con le regole impostate dallo studio: la verifica degli obblighi di legge e la decisione spettano a chi firma. Non è conservazione a norma.',
  rt_pr_fp:'Impronta del verbale (SHA-256)', rt_pr_ok:'Verbale integro: impronta verificata', rt_pr_bad:'Attenzione: il verbale è stato modificato dopo la preparazione (impronta diversa)',
  rt_c_n:'N.', rt_c_code:'Codice', rt_c_client:'Cliente', rt_c_title:'Titolo', rt_c_years:'Anni', rt_c_loc:'Posizione', rt_c_rule:'Regola', rt_c_until:'Fino al'
});
Object.assign(I18N.en, {
  nav_rt:'Disposal', nd_rt:'Yearly disposal proposal from the retention rules, with the record to sign',
  rt_h:'Disposal proposal', rt_p:'Every year DocMap proposes the binders past their retention time, using the studio\'s rules. It is a proposal to check: whoever signs the record decides. Disposal is not legally compliant digital preservation.',
  rt_warn:'Before disposing check: open audits or disputes, legal duties for the kind of document, agreements with the client. A public body needs the archival authority\'s permission.',
  rt_year:'Proposal for year', rt_k_prop:'proposed', rt_k_keep:'to keep for now', rt_k_noyear:'no year', rt_k_blocked:'on hold or out',
  rt_s_prop:'Binders proposed for disposal', rt_s_none:'No binder to propose for disposal in {y}.', rt_rule:'Rule', rt_kept_until:'kept until {y}', rt_years:'Years', rt_loc:'Location',
  rt_r_def:'General rule ({n} years)', rt_r_keep:'always kept', rt_r_years:'{n} years',
  rt_noyear_h:'Binders with no year ({n})', rt_noyear_p:'Without a year (title, reference year or contents) DocMap cannot propose them: add it in the form.', rt_open_arch:'Show them in the archive',
  rt_blk_h:'Left out ({n})', rt_why_hold:'on hold (tag «{t}»)', rt_why_out:'checked out: wait for the return', rt_why_inv:'already in record {v}',
  rt_all:'All', rt_nothing:'None', rt_make:'Prepare the record ({n} binders)', rt_make_h:'Disposal record {y}', rt_approver:'Who approves the disposal (full name)', rt_role:'Role (e.g. studio owner, archive manager)',
  rt_auth:'Archival authority permission: number', rt_auth_d:'dated', rt_note:'Notes (optional)', rt_need_approver:'Write who approves the disposal.', rt_need_auth:'A public body needs the permission number.',
  rt_made:'Record {v} prepared: print it and have it signed. After the destruction press «Mark as destroyed».',
  rt_v_h:'Disposal records', rt_v_none:'No record.', rt_v_n:'Record {v}', rt_v_st_approved:'to carry out', rt_v_st_executed:'carried out on {d}', rt_v_st_cancelled:'cancelled',
  rt_v_print:'Print the record', rt_v_csv:'CSV', rt_v_exec:'Mark as destroyed', rt_v_cancel:'Cancel the record', rt_v_items:'{n} binders',
  rt_x_h:'Destruction carried out — record {v}', rt_x_p:'Only after the physical destruction (or hand-over to the shredding company). The {n} binders leave the DocMap archive; they stay described in the record. Undo is available right after.',
  rt_x_who:'Company or person who destroyed them', rt_x_cert:'Destruction certificate number (optional)', rt_x_date:'Date of destruction', rt_x_ok:'Mark as destroyed',
  rt_x_done:'{n} binders marked as destroyed (record {v}).', rt_x_gone:'{n} binders of the record were no longer in the archive.',
  rt_c_t:'Cancel record {v}?', rt_c_d:'The binders are proposed again. The record stays in the list as cancelled.', rt_c_done:'Record {v} cancelled',
  rt_rules:'Retention rules', rt_rules_p:'The first rule that applies decides. Category = same text as the category; words = looked for in title, tags and contents (comma separated). Years count from the binder\'s last year. Suggested values are indicative: check them with your adviser.',
  rt_f_on:'Yearly proposal on', rt_f_month:'Month when the proposal appears', rt_f_def:'Retention years when no rule applies', rt_f_hold:'Tag that blocks disposal', rt_f_pub:'We are a public body (archival authority permission needed)',
  rt_f_cat:'Category', rt_f_kw:'Words', rt_f_years:'Years', rt_f_keep:'Always keep', rt_f_note:'Note', rt_f_add:'Add a rule', rt_f_del:'Remove', rt_f_reset:'Restore the suggested rules',
  rt_todo:'Disposal proposal {y}: {n} binders to check', rt_toast:'The {y} disposal proposal is ready: {n} binders to check', rt_open:'Open',
  rt_log_make:'Disposal record {v} prepared ({n} binders)', rt_log_exec:'Disposal record {v} carried out: {n} binders destroyed', rt_log_cancel:'Disposal record {v} cancelled',
  rt_pr_title:'Disposal record', rt_pr_intro:'The documents listed have passed the retention time set by the studio\'s rules below; having checked that no audit, dispute or other reason requires keeping them, their disposal is ordered.',
  rt_pr_rules:'Rules applied', rt_pr_list:'Binders', rt_pr_tot:'Total: {n} binders', rt_pr_sign_a:'Approved by', rt_pr_sign_x:'Destruction carried out by', rt_pr_date:'Date', rt_pr_cert:'Certificate no.',
  rt_pr_auth:'Archival authority permission no. {n} dated {d}', rt_pr_auth_blank:'Archival authority permission no. ________ dated ________',
  rt_pr_note:'Proposal generated by DocMap with the rules set by the studio: checking legal duties and deciding is up to the signer. Not legally compliant preservation.',
  rt_pr_fp:'Record fingerprint (SHA-256)', rt_pr_ok:'Record intact: fingerprint verified', rt_pr_bad:'Warning: the record was changed after it was prepared (different fingerprint)',
  rt_c_n:'No.', rt_c_code:'Code', rt_c_client:'Client', rt_c_title:'Title', rt_c_years:'Years', rt_c_loc:'Location', rt_c_rule:'Rule', rt_c_until:'Until'
});
if (typeof ICONS === 'object' && !ICONS.shred) ICONS.shred = '<path d="M4 3h16v8H4z"/><path d="M2 11h20"/><path d="M6 14v7M10 14v5M14 14v7M18 14v5"/>';

/* ---------------- rules ---------------- */
function rtNormRule(r){
  r = r || {};
  return {id:String(r.id || ('r-' + randChars(6))).slice(0, 40), cat:String(r.cat || '').trim().slice(0, 80), kw:String(r.kw || '').trim().slice(0, 300),
    years:Math.max(0, Math.min(200, Math.round(+r.years || 0))), keep:r.keep === true, note:String(r.note || '').trim().slice(0, 300)};
}
function rtSet(){
  const raw = (S.settings && S.settings.retention) || {}, s = Object.assign({}, RT_DEF, raw);
  s.on = s.on !== false; s.month = Math.max(1, Math.min(12, Math.round(+s.month || 1))); s.defYears = Math.max(1, Math.min(200, Math.round(+s.defYears || 10)));
  s.holdTag = String(s.holdTag == null ? RT_HOLD_DEF : s.holdTag).trim().slice(0, 40); s.publicBody = s.publicBody === true;
  s.rules = (Array.isArray(raw.rules) ? raw.rules : RT_DEF_RULES).map(rtNormRule);
  return s;
}
function rtSave(patch){ S.settings.retention = Object.assign({}, rtSet(), patch, {rulesAt:nowISO()}); }
const rtWords = (kw) => String(kw || '').split(/[,;|\n]/).map(x => yrFold(x).trim()).filter(Boolean);
function rtHay(b){ return yrFold([b.binder_title, b.tags, (b.contents_items || []).map(i => i.description).join(' ')].join(' ')); }
/** The rule that decides for binder b: a rule of the list or the general one {id:'def'}. */
function rtRuleFor(b, set){
  set = set || rtSet();
  const cat = yrFold(b.category).trim(); let hay = null;
  for (const r of set.rules){
    const okCat = !r.cat || yrFold(r.cat).trim() === cat;
    if (!okCat) continue;
    const W = rtWords(r.kw);
    if (W.length){ if (hay === null) hay = rtHay(b); if (!W.some(w => hay.indexOf(w) >= 0)) continue; }
    if (!r.cat && !W.length) continue;   // an empty rule never matches
    return r;
  }
  return {id:'def', cat:'', kw:'', years:set.defYears, keep:false, note:''};
}
const rtRuleLabel = (r, set) => r.id === 'def' ? t('rt_r_def', {n:(set || rtSet()).defYears}) : [r.cat, r.kw ? '«' + rtWords(r.kw).slice(0, 3).join(', ') + (rtWords(r.kw).length > 3 ? '…' : '') + '»' : ''].filter(Boolean).join(' · ') + ' — ' + (r.keep ? t('rt_r_keep') : t('rt_r_years', {n:r.years}));

/* ---------------- verbali ---------------- */
function dsList(){ if (!Array.isArray(S.disposals)) S.disposals = []; return S.disposals; }
const dsNum = (d) => d.year + '/' + d.n;
const dsStatus = (d) => d.cancelled_at ? 'cancelled' : d.executed_at ? 'executed' : 'approved';
function dsCanon(d){
  return ['docmap-disposal-v1', d.id, d.year, d.n, d.created_at, d.approver || '', d.role || '', d.authority || '', d.authority_date || '',
    (d.items || []).map(x => x.id + '=' + (x.speaking_code || '') + '=' + (x.short_code || '') + '=' + (x.years || '')).sort().join(',')].join('\n');
}
function dsOpenIds(){ const m = new Map(); dsList().forEach(d => { if (dsStatus(d) === 'approved') (d.items || []).forEach(x => m.set(x.id, d)); }); return m; }
function dsGoneCodes(){ const sc = new Set(), sp = new Set(); dsList().forEach(d => { if (dsStatus(d) === 'executed') (d.items || []).forEach(x => { if (x.short_code) sc.add(x.short_code); if (x.speaking_code) sp.add(String(x.speaking_code).toUpperCase()); }); }); return {sc, sp}; }

/* ---------------- proposal ---------------- */
function rtYearsText(b){ const l = yrList(b); return l.length ? (l[0] === l[l.length - 1] ? String(l[0]) : l[0] + '–' + l[l.length - 1]) : ''; }
function rtIsOut(b, ty){
  try { const cur = sqCurrent(sqEv(), 'binder', b.id); if (!cur) return false; const x = sqType(ty, cur.status_id); return !!x && (x.presence === 'out' || x.presence === 'missing'); } catch(e){ return false; }
}
/** Proposal for year Y: {Y, prop:[{b, rule, until}], keep, noyear:[b], blocked:[{b, why}], rules used}. Pure on S. */
function rtProposal(Y){
  Y = +Y || new Date().getFullYear();
  const set = rtSet(), hold = yrFold(set.holdTag), ty = typeof sqTypes === 'function' ? sqTypes(S.settings) : [], open = dsOpenIds();
  const R = {Y, prop:[], keep:0, noyear:[], blocked:[]};
  yrLive().forEach(b => {
    if (typeof isDemo === 'function' && S.settings.hideDemo && isDemo(b)) return;
    const rule = rtRuleFor(b, set);
    if (rule.keep){ R.keep++; return; }
    const L = yrMax(b); if (!L){ R.noyear.push(b); return; }
    const until = L + rule.years;
    if (Y <= until){ R.keep++; return; }
    if (hold && String(b.tags || '').split(',').some(x => yrFold(x).trim() === hold)){ R.blocked.push({b, why:t('rt_why_hold', {t:set.holdTag})}); return; }
    if (rtIsOut(b, ty)){ R.blocked.push({b, why:t('rt_why_out')}); return; }
    const inv = open.get(b.id); if (inv){ R.blocked.push({b, why:t('rt_why_inv', {v:dsNum(inv)})}); return; }
    R.prop.push({b, rule, until});
  });
  R.prop.sort((a, b) => a.until - b.until || naturalCmp(a.b.company_name || '', b.b.company_name || '') || naturalCmp(a.b.speaking_code, b.b.speaking_code));
  return R;
}
function rtSnapshot(x){
  const b = x.b;
  return {id:b.id, speaking_code:b.speaking_code, short_code:b.short_code, multi_code:b.multi_code, company_name:b.company_name, binder_title:b.binder_title, category:b.category,
    years:rtYearsText(b), location:binderLocCode(b), rule:rtRuleLabel(x.rule), until:x.until, binder:clone(b)};
}
async function dsMake(Y, prop, f){
  const L = dsList(), n = L.filter(d => d.year === Y).length + 1;
  const d = {id:'ds-' + Y + '-' + randChars(8), year:Y, n, created_at:nowISO(), created_by:logWho(), approver:String(f.approver || '').trim(), role:String(f.role || '').trim(),
    authority:String(f.authority || '').trim(), authority_date:String(f.authority_date || '').trim(), note:String(f.note || '').trim(), public_body:rtSet().publicBody,
    rules:rtSet().rules.map(r => rtRuleLabel(r) + (r.note ? ' — ' + r.note : '')).concat(t('rt_r_def', {n:rtSet().defYears})), items:prop.map(rtSnapshot),
    hash:'', executed_at:'', executed_by:'', destroyer:'', certificate:'', destroyed_on:'', cancelled_at:''};
  d.hash = await pkSha256Hex(dsCanon(d));
  undoPoint();
  L.unshift(d);
  logAct('disposal.prepare', null, t('rt_log_make', {v:dsNum(d), n:d.items.length}), {id:d.id, year:Y, approver:d.approver, binders:d.items.slice(0, 500).map(x => x.speaking_code), hash:d.hash}, 'ui');
  commit();
  return d;
}
function dsExecute(d, f){
  if (!d || dsStatus(d) !== 'approved') return 0;
  undoPoint();
  const ids = new Set(d.items.map(x => x.id)), before = S.binders.length;
  S.binders = S.binders.filter(b => !ids.has(b.id));
  const gone = before - S.binders.length;
  d.executed_at = nowISO(); d.executed_by = logWho(); d.destroyer = String(f.destroyer || '').trim(); d.certificate = String(f.certificate || '').trim(); d.destroyed_on = String(f.destroyed_on || '').trim();
  logAct('disposal.execute', null, t('rt_log_exec', {v:dsNum(d), n:gone}), {id:d.id, destroyer:d.destroyer, certificate:d.certificate, binders:d.items.slice(0, 500).map(x => ({id:x.id, code:x.speaking_code, short:x.short_code}))}, 'ui');
  commit();
  return gone;
}

/* ---------------- printed record ---------------- */
const RT_PRINT_CSS = '.dsr{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#000;background:#fff;font-size:9.5pt;line-height:1.35;max-width:190mm;margin:0 auto}' +
  '.dsr h1{font-size:16pt;margin:0}.dsr h2{font-size:10.5pt;margin:5mm 0 2mm}.dsr-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5pt solid #000;padding-bottom:3mm;margin-bottom:3mm}' +
  '.dsr-k{font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#991B1B}.dsr table{border-collapse:collapse;width:100%}.dsr-l th,.dsr-l td{border:.5pt solid #999;padding:1mm 1.5mm;text-align:left;vertical-align:top;font-size:8.5pt}' +
  '.dsr-l th{background:#eee}.dsr-l tr{break-inside:avoid}.dsr ul{margin:1mm 0 0 5mm;padding:0}.dsr-sign{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:8mm}.dsr-sign div{border-top:.6pt solid #000;padding-top:1.5mm;min-height:18mm}' +
  '.dsr-fp{margin-top:5mm;font-size:7.5pt;word-break:break-all}.dsr-mono{font-family:"DM Mono",ui-monospace,Consolas,monospace}.dsr-note{font-size:8pt;color:#333;margin-top:3mm}.dsr-bad{color:#B91C1C;font-weight:700}';
function dsPrintHTML(d, ok){
  const studio = S.settings.studioName || '';
  const meta = [[t('rt_pr_date'), fmtDate(d.created_at)], [t('rt_pr_sign_a'), [d.approver, d.role].filter(Boolean).join(' — ')]].concat(d.note ? [[t('rt_note'), d.note]] : []);
  return '<div class="dsr"><div class="dsr-h"><div><div class="dsr-k">' + esc(t('rt_pr_title')) + '</div><h1>' + esc(t('rt_v_n', {v:dsNum(d)})) + '</h1></div><div style="text-align:right"><b>' + esc(studio) + '</b><div>' + esc(fmtDate(d.created_at)) + '</div></div></div>' +
    '<p>' + esc(t('rt_pr_intro')) + '</p>' +
    (d.public_body ? '<p><b>' + esc(d.authority ? t('rt_pr_auth', {n:d.authority, d:d.authority_date || '________'}) : t('rt_pr_auth_blank')) + '</b></p>' : '') +
    '<table>' + meta.map(([k, v]) => '<tr><th style="text-align:left;width:40mm;padding:1mm 0">' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table>' +
    '<h2>' + esc(t('rt_pr_rules')) + '</h2><ul>' + (d.rules || []).map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' +
    '<h2>' + esc(t('rt_pr_list')) + '</h2><table class="dsr-l"><thead><tr><th>' + [t('rt_c_n'), t('rt_c_code'), t('rt_c_client'), t('rt_c_title'), t('rt_c_years'), t('rt_c_loc'), t('rt_c_until')].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' +
      d.items.map((x, i) => '<tr><td>' + (i + 1) + '</td><td class="dsr-mono">' + esc(x.speaking_code) + '</td><td>' + esc([x.company_name, x.multi_code].filter(Boolean).join(' · ')) + '</td><td>' + esc([x.binder_title, x.category].filter(Boolean).join(' · ')) + '</td><td>' + esc(x.years) + '</td><td class="dsr-mono">' + esc(x.location || '') + '</td><td>' + esc(x.until) + '</td></tr>').join('') +
    '</tbody></table><p><b>' + esc(t('rt_pr_tot', {n:d.items.length})) + '</b></p>' +
    '<div class="dsr-sign"><div>' + esc(t('rt_pr_sign_a')) + '<br>' + esc(d.approver) + '</div><div>' + esc(t('rt_pr_sign_x')) + (d.destroyer ? '<br>' + esc(d.destroyer) : '') + '<br>' + esc(t('rt_pr_date')) + ': ' + esc(d.destroyed_on || '____________') + ' · ' + esc(t('rt_pr_cert')) + ' ' + esc(d.certificate || '________') + '</div></div>' +
    '<p class="dsr-note">' + esc(t('rt_pr_note')) + '</p>' +
    '<div class="dsr-fp">' + esc(t('rt_pr_fp')) + ': <span class="dsr-mono">' + esc(d.hash) + '</span><br>' + (ok ? esc(t('rt_pr_ok')) : '<span class="dsr-bad">' + esc(t('rt_pr_bad')) + '</span>') + '</div></div>';
}
async function dsVerify(d){ return !!d.hash && (await pkSha256Hex(dsCanon(d))) === d.hash; }
async function dsPrint(d){ const ok = await dsVerify(d); RTV.lastPrint = {id:d.id, ok}; return doPrint('register', '<style>' + RT_PRINT_CSS + '</style>' + dsPrintHTML(d, ok)); }
function dsCsv(d){
  const rows = [['verbale', 'n', 'speaking_code', 'short_code', 'multi_code', 'company_name', 'binder_title', 'category', 'years', 'location', 'rule', 'kept_until', 'binder_id']]
    .concat(d.items.map((x, i) => [dsNum(d), i + 1, x.speaking_code, x.short_code, x.multi_code, x.company_name, x.binder_title, x.category, x.years, x.location, x.rule, x.until, x.id].map(v => safeCell(v))));
  download('verbale-scarto-' + d.year + '-' + d.n + '.csv', '﻿' + toCSV(rows, ';'), 'text/csv;charset=utf-8');
}

/* ---------------- view ---------------- */
const RTV = {year:0, excl:new Set(), lastPrint:null, rulesOpen:false};
const rtYear = () => RTV.year || new Date().getFullYear();
function rtPropRowHTML(x){
  const b = x.b, on = !RTV.excl.has(b.id);
  return '<tr class="' + (on ? '' : 'ny-off') + '"><td><input type="checkbox" data-rt-row="' + esc(b.id) + '"' + (on ? ' checked' : '') + ' aria-label="' + esc(b.speaking_code) + '"></td>' +
    '<td><b class="mono">' + esc(b.speaking_code) + '</b></td><td>' + esc(b.company_name || '—') + (b.multi_code ? '<small class="mono muted">' + esc(b.multi_code) + '</small>' : '') + '</td>' +
    '<td>' + esc(b.binder_title || '') + '<small class="muted">' + esc(b.category || '') + '</small></td><td class="mono">' + esc(rtYearsText(b)) + '</td>' +
    '<td><small>' + esc(rtRuleLabel(x.rule)) + '</small><small class="muted">' + esc(t('rt_kept_until', {y:x.until})) + '</small></td><td class="mono">' + esc(binderLocCode(b) || '—') + '</td></tr>';
}
function rtDsHTML(d){
  const st = dsStatus(d), stTxt = st === 'executed' ? t('rt_v_st_executed', {d:fmtDate(d.executed_at)}) : t('rt_v_st_' + st);
  return '<article class="card card-p rt-ds rt-' + st + '" data-ds="' + esc(d.id) + '"><div class="rm-gh"><div><h3>' + esc(t('rt_v_n', {v:dsNum(d)})) + ' <span class="rt-st">' + esc(stTxt) + '</span></h3>' +
    '<small class="muted">' + esc([t('rt_v_items', {n:d.items.length}), d.approver, fmtDate(d.created_at)].filter(Boolean).join(' · ')) + ' · <span class="mono">' + esc(String(d.hash || '').slice(0, 12)) + '…</span></small></div>' +
    '<div class="rm-acts"><button class="btn btn-sm" data-a="rt-print" data-id="' + esc(d.id) + '">' + ic('printer') + esc(t('rt_v_print')) + '</button><button class="btn btn-sm" data-a="rt-csv" data-id="' + esc(d.id) + '">' + ic('download') + esc(t('rt_v_csv')) + '</button>' +
    (st === 'approved' ? '<button class="btn btn-sm btn-dark" data-a="rt-exec" data-id="' + esc(d.id) + '">' + ic('shred') + esc(t('rt_v_exec')) + '</button><button class="btn btn-sm btn-ghost" data-a="rt-cancel" data-id="' + esc(d.id) + '">' + esc(t('rt_v_cancel')) + '</button>' : '') + '</div></div></article>';
}
function rtRulesHTML(){
  const s = rtSet();
  const rule = (r, i) => '<tr data-rt-rule="' + i + '"><td><input class="inp" data-rt-rf="cat" value="' + esc(r.cat) + '" aria-label="' + esc(t('rt_f_cat')) + '"></td><td><input class="inp" data-rt-rf="kw" value="' + esc(r.kw) + '" aria-label="' + esc(t('rt_f_kw')) + '"></td>' +
    '<td><input class="inp" type="number" min="0" max="200" data-rt-rf="years" value="' + r.years + '"' + (r.keep ? ' disabled' : '') + ' aria-label="' + esc(t('rt_f_years')) + '" style="width:80px"></td><td><input type="checkbox" data-rt-rf="keep"' + (r.keep ? ' checked' : '') + ' aria-label="' + esc(t('rt_f_keep')) + '"></td>' +
    '<td><input class="inp" data-rt-rf="note" value="' + esc(r.note) + '" aria-label="' + esc(t('rt_f_note')) + '"></td><td><button type="button" class="btn btn-sm btn-ghost" data-a="rt-rule-del" data-i="' + i + '">' + esc(t('rt_f_del')) + '</button></td></tr>';
  return '<details class="card card-p" id="rt-rules"' + (RTV.rulesOpen ? ' open' : '') + '><summary><b>' + esc(t('rt_rules')) + '</b></summary><div class="stack" style="margin-top:10px"><p class="small muted">' + esc(t('rt_rules_p')) + '</p>' +
    '<label class="chk"><input type="checkbox" data-rt-set="on"' + (s.on ? ' checked' : '') + '>' + esc(t('rt_f_on')) + '</label>' +
    '<div class="g2"><div class="field"><label for="rt-month">' + esc(t('rt_f_month')) + '</label><select class="inp" id="rt-month" data-rt-set="month">' + Array.from({length:12}, (_, i) => '<option value="' + (i + 1) + '"' + (s.month === i + 1 ? ' selected' : '') + '>' + esc(new Date(2026, i, 1).toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'it-IT', {month:'long'})) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="rt-def">' + esc(t('rt_f_def')) + '</label><input class="inp" type="number" min="1" max="200" id="rt-def" data-rt-set="defYears" value="' + s.defYears + '"></div>' +
      '<div class="field"><label for="rt-hold">' + esc(t('rt_f_hold')) + '</label><input class="inp" id="rt-hold" data-rt-set="holdTag" value="' + esc(s.holdTag) + '"></div></div>' +
    '<label class="chk"><input type="checkbox" data-rt-set="publicBody"' + (s.publicBody ? ' checked' : '') + '>' + esc(t('rt_f_pub')) + '</label>' +
    '<div class="tbl-wrap"><table class="tbl rt-rtbl" id="rt-rtbl"><thead><tr><th>' + [t('rt_f_cat'), t('rt_f_kw'), t('rt_f_years'), t('rt_f_keep'), t('rt_f_note'), ''].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' + s.rules.map(rule).join('') + '</tbody></table></div>' +
    '<div class="row" style="gap:8px"><button type="button" class="btn btn-sm" data-a="rt-rule-add">' + ic('plus') + esc(t('rt_f_add')) + '</button><button type="button" class="btn btn-sm btn-ghost" data-a="rt-rule-reset">' + esc(t('rt_f_reset')) + '</button></div></div></details>';
}
function viewDisposal(){
  const Y = rtYear(), R = rtProposal(Y), now = new Date().getFullYear(), on = R.prop.filter(x => !RTV.excl.has(x.b.id)).length;
  const kpi = (v, k) => '<div class="card kpi"><div class="v">' + v + '</div><div class="k">' + esc(t(k)) + '</div></div>';
  const yrOpt = [now - 1, now, now + 1].concat(Y < now - 1 || Y > now + 1 ? [Y] : []).map(y => '<option value="' + y + '"' + (y === Y ? ' selected' : '') + '>' + y + '</option>').join('');
  const L = dsList();
  return '<div class="stack" id="rt-page"><div class="page-h"><h1>' + ic('shred') + esc(t('rt_h')) + helpDot('disposal') + '</h1><p class="muted">' + esc(t('rt_p')) + '</p></div>' +
    '<div class="warn-box">' + ic('alert') + '<div class="small">' + esc(t('rt_warn')) + '</div></div>' +
    '<div class="card card-p"><div class="field" style="max-width:220px"><label for="rt-year">' + esc(t('rt_year')) + '</label><select class="inp" id="rt-year" data-rt-year>' + yrOpt + '</select></div></div>' +
    '<div class="kpis" id="rt-kpis">' + kpi(R.prop.length, 'rt_k_prop') + kpi(R.keep, 'rt_k_keep') + kpi(R.noyear.length, 'rt_k_noyear') + kpi(R.blocked.length, 'rt_k_blocked') + '</div>' +
    (!R.prop.length ? '<div class="card empty" id="rt-empty">' + ic('check', 'lg') + '<p>' + esc(t('rt_s_none', {y:Y})) + '</p></div>' :
      '<section class="card" id="rt-prop"><div class="toolbar"><h2 style="margin:0">' + esc(t('rt_s_prop')) + '</h2><div class="row" style="gap:8px"><button class="btn btn-sm" data-a="rt-all">' + esc(t('rt_all')) + '</button><button class="btn btn-sm" data-a="rt-none">' + esc(t('rt_nothing')) + '</button>' +
        '<button class="btn btn-primary" data-a="rt-make" id="rt-make"' + (on ? '' : ' disabled') + '>' + ic('file') + esc(t('rt_make', {n:on})) + '</button></div></div>' +
      '<div class="tbl-wrap"><table class="tbl rt-tbl" id="rt-tbl"><thead><tr><th></th><th>' + [t('rt_c_code'), t('rt_c_client'), t('rt_c_title'), t('rt_c_years'), t('rt_c_rule'), t('rt_c_loc')].map(esc).join('</th><th>') + '</th></tr></thead><tbody>' + R.prop.map(rtPropRowHTML).join('') + '</tbody></table></div></section>') +
    (R.noyear.length ? '<details class="card card-p" id="rt-noyear"><summary><b>' + esc(t('rt_noyear_h', {n:R.noyear.length})) + '</b></summary><p class="small muted">' + esc(t('rt_noyear_p')) + '</p><p class="small mono">' + R.noyear.slice(0, 60).map(b => esc(b.speaking_code)).join(', ') + (R.noyear.length > 60 ? '…' : '') + '</p></details>' : '') +
    (R.blocked.length ? '<details class="card card-p" id="rt-blocked"><summary><b>' + esc(t('rt_blk_h', {n:R.blocked.length})) + '</b></summary><ul class="small">' + R.blocked.slice(0, 100).map(x => '<li><b class="mono">' + esc(x.b.speaking_code) + '</b> ' + esc(x.b.company_name || '') + ' — ' + esc(x.why) + '</li>').join('') + '</ul></details>' : '') +
    '<section class="stack" id="rt-ds"><h2>' + esc(t('rt_v_h')) + '</h2>' + (L.length ? L.map(rtDsHTML).join('') : '<p class="muted small">' + esc(t('rt_v_none')) + '</p>') + '</section>' +
    rtRulesHTML() + '</div>';
}
function rtRefresh(){ if (S.view !== 'disposal') return; const y = window.scrollY; renderView(); window.scrollTo(0, y); }
const dsGet = (id) => dsList().find(d => d.id === id);

function rtOpenMake(){
  const Y = rtYear(), R = rtProposal(Y), prop = R.prop.filter(x => !RTV.excl.has(x.b.id)); if (!prop.length) return;
  const pub = rtSet().publicBody;
  const body = '<div class="stack"><div class="warn-box">' + ic('alert') + '<div class="small">' + esc(t('rt_warn')) + '</div></div>' +
    '<div class="field"><label for="rt-f-appr">' + esc(t('rt_approver')) + '</label><input class="inp" id="rt-f-appr" value="' + esc(S.settings.operator || '') + '"><div class="err-t" id="rt-f-err"></div></div>' +
    '<div class="field"><label for="rt-f-role">' + esc(t('rt_role')) + '</label><input class="inp" id="rt-f-role"></div>' +
    (pub ? '<div class="g2"><div class="field"><label for="rt-f-auth">' + esc(t('rt_auth')) + '</label><input class="inp" id="rt-f-auth"></div><div class="field"><label for="rt-f-authd">' + esc(t('rt_auth_d')) + '</label><input class="inp" type="date" id="rt-f-authd"></div></div>' : '') +
    '<div class="field"><label for="rt-f-note">' + esc(t('rt_note')) + '</label><input class="inp" id="rt-f-note"></div></div>';
  openModal({title:t('rt_make_h', {y:Y}) + ' — ' + t('rt_v_items', {n:prop.length}), body, buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('rt_make', {n:prop.length}), cls:'btn btn-primary', icon:'file', fn:async () => {
    const f = {approver:($('#rt-f-appr') || {}).value, role:($('#rt-f-role') || {}).value, authority:($('#rt-f-auth') || {}).value || '', authority_date:($('#rt-f-authd') || {}).value || '', note:($('#rt-f-note') || {}).value};
    const err = $('#rt-f-err');
    if (!String(f.approver || '').trim()){ if (err) err.textContent = t('rt_need_approver'); return; }
    if (pub && !String(f.authority || '').trim()){ if (err) err.textContent = t('rt_need_auth'); return; }
    closeModal();
    const d = await dsMake(Y, prop, f);
    RTV.excl = new Set(); rtRefresh(); undoToast(t('rt_made', {v:dsNum(d)}));
  }}]});
}
function rtOpenExec(d){
  const body = '<div class="stack"><div class="danger-box">' + ic('alert') + '<div class="small">' + esc(t('rt_x_p', {n:d.items.length})) + '</div></div>' +
    '<div class="field"><label for="rt-x-who">' + esc(t('rt_x_who')) + '</label><input class="inp" id="rt-x-who"></div>' +
    '<div class="g2"><div class="field"><label for="rt-x-cert">' + esc(t('rt_x_cert')) + '</label><input class="inp" id="rt-x-cert"></div><div class="field"><label for="rt-x-date">' + esc(t('rt_x_date')) + '</label><input class="inp" type="date" id="rt-x-date" value="' + sqToday() + '"></div></div></div>';
  openModal({title:t('rt_x_h', {v:dsNum(d)}), body, buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('rt_x_ok'), cls:'btn btn-danger-solid', icon:'shred', fn:() => {
    const f = {destroyer:($('#rt-x-who') || {}).value, certificate:($('#rt-x-cert') || {}).value, destroyed_on:($('#rt-x-date') || {}).value};
    closeModal();
    const gone = dsExecute(d, f), miss = d.items.length - gone;
    rtRefresh(); undoToast(t('rt_x_done', {n:gone, v:dsNum(d)}) + (miss ? ' ' + t('rt_x_gone', {n:miss}) : ''));
  }}]});
}
const RT_ACTIONS = {
  'rt-all': () => { RTV.excl = new Set(); rtRefresh(); },
  'rt-none': () => { RTV.excl = new Set(rtProposal(rtYear()).prop.map(x => x.b.id)); rtRefresh(); },
  'rt-make': () => rtOpenMake(),
  'rt-print': (el) => { const d = dsGet(el.dataset.id); if (d) dsPrint(d); },
  'rt-csv': (el) => { const d = dsGet(el.dataset.id); if (d) dsCsv(d); },
  'rt-exec': (el) => { const d = dsGet(el.dataset.id); if (d) rtOpenExec(d); },
  'rt-cancel': (el) => {
    const d = dsGet(el.dataset.id); if (!d || dsStatus(d) !== 'approved') return;
    confirmAction({plain:true, title:t('rt_c_t', {v:dsNum(d)}), detail:t('rt_c_d'), okLabel:t('rt_v_cancel'), onOk:() => {
      undoPoint(); d.cancelled_at = nowISO();
      logAct('disposal.cancel', null, t('rt_log_cancel', {v:dsNum(d)}), {id:d.id}, 'ui'); commit(); rtRefresh(); undoToast(t('rt_c_done', {v:dsNum(d)}));
    }});
  },
  'rt-rule-add': () => { const s = rtSet(); s.rules.push(rtNormRule({years:s.defYears})); rtSave({rules:s.rules}); commit({dirty:false}); RTV.rulesOpen = true; rtRefresh(); },
  'rt-rule-del': (el) => { const s = rtSet(); s.rules.splice(+el.dataset.i, 1); rtSave({rules:s.rules}); commit({dirty:false}); RTV.rulesOpen = true; rtRefresh(); },
  'rt-rule-reset': () => { rtSave({rules:RT_DEF_RULES.map(rtNormRule)}); commit({dirty:false}); RTV.rulesOpen = true; rtRefresh(); },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, RT_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, RT_ACTIONS); });
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.rtRow != null){ const id = el.dataset.rtRow; if (el.checked) RTV.excl.delete(id); else RTV.excl.add(id); rtRefresh(); return; }
  if (el.dataset.rtYear != null){ RTV.year = +el.value || 0; RTV.excl = new Set(); rtRefresh(); return; }
  if (el.dataset.rtSet){ const k = el.dataset.rtSet; rtSave({[k]:el.type === 'checkbox' ? !!el.checked : (k === 'holdTag' ? String(el.value || '').trim() : +el.value || 0)}); commit({dirty:false}); RTV.rulesOpen = true; rtRefresh(); return; }
  if (el.dataset.rtRf){
    const tr = el.closest('[data-rt-rule]'); if (!tr) return;
    const s = rtSet(), r = s.rules[+tr.dataset.rtRule]; if (!r) return;
    const k = el.dataset.rtRf; r[k] = el.type === 'checkbox' ? !!el.checked : k === 'years' ? Math.max(0, +el.value || 0) : String(el.value || '').trim();
    s.rules[+tr.dataset.rtRule] = rtNormRule(r); rtSave({rules:s.rules}); commit({dirty:false}); RTV.rulesOpen = true; rtRefresh();
  }
});

/* ---------------- yearly: «Oggi» + one toast a year ---------------- */
function rtDue(d){
  d = d || new Date(); const s = rtSet(); if (!s.on || d.getMonth() + 1 < s.month) return null;
  const Y = d.getFullYear(); if (dsList().some(x => x.year === Y && dsStatus(x) !== 'cancelled')) return null;
  const n = rtProposal(Y).prop.length; return n ? {Y, n} : null;
}
function rtAutoCheck(d){
  try {
    d = d || new Date();
    if (d.getMonth() + 1 !== rtSet().month) return 0;   // the toast only in the rule month («ogni gennaio»); «Oggi» keeps it after
    const x = rtDue(d); if (!x) return 0;
    let seen = ''; try { seen = localStorage.getItem(RT_TOAST_LS) || ''; } catch(e){}
    if (seen === String(x.Y)) return x.n;
    try { localStorage.setItem(RT_TOAST_LS, String(x.Y)); } catch(e){}
    toast(t('rt_toast', {y:x.Y, n:x.n}), 'info', 9000, {label:t('rt_open'), fn:() => { S.view = 'disposal'; savePrefs(); renderAll(); }});
    return x.n;
  } catch(e){ console.warn('disposal', e); return 0; }
}

(function rtWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (typeof NAV_MORE !== 'undefined'){ const g = NAV_MORE.find(x => x[0] === 'nm_work'); if (g && !g[1].some(x => x[0] === 'disposal')) g[1].push(['disposal', 'shred', 'nav_rt', 'nd_rt']); }
  if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('disposal')) ADV_VIEWS.push('disposal');
  wrap('renderView', (o) => function(){
    if (S.view === 'disposal'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewDisposal(); return; }
    return o.apply(this, arguments);
  });
  wrap('w1Todos', (o) => function(){ const L = o.apply(this, arguments); try { const x = rtDue(); if (x) L.push({sev:'info', text:t('rt_todo', {y:x.Y, n:x.n}), a:'nav', v:'disposal'}); } catch(e){} return L; });
  // printed codes are never reused: destroyed binders keep their short code and speaking code taken
  wrap('allShortCodes', (o) => function(){ const s = o.apply(this, arguments); try { dsGoneCodes().sc.forEach(c => s.add(c)); } catch(e){} return s; });
  wrap('suggestSpeakingCode', (o) => function(company, extra){ let ex = extra || []; try { ex = ex.concat(Array.from(dsGoneCodes().sp)); } catch(e){} return o.call(this, company, ex); });
  // backups carry the records; «Annulla» restores them
  wrap('workspaceJSON', (o) => function(){
    const s = o.apply(this, arguments);
    if (!Array.isArray(S.disposals) || !S.disposals.length) return s;
    return s.replace(/\n?\}\s*$/, ',\n  "disposals": ' + JSON.stringify(S.disposals) + '\n}');
  });
  wrap('applyWorkspaceObject', (o) => function(W){
    const keep = dsList().slice(), r = o.apply(this, arguments);
    try {
      if (W && W._dsUndo){ S.disposals = clone(W.disposals || []); return r; }
      const m = new Map(keep.map(d => [d.id, d]));
      (W && Array.isArray(W.disposals) ? W.disposals : []).forEach(d => {
        if (!d || !/^ds-/.test(String(d.id || ''))) return;
        const a = m.get(d.id);
        // a record only moves forward: approved → executed / cancelled; the one with more steps wins
        const rank = (x) => x.executed_at ? 2 : x.cancelled_at ? 1 : 0;
        if (!a || rank(d) > rank(a)) m.set(d.id, clone(d));
      });
      S.disposals = Array.from(m.values()).sort((a, b) => a.created_at < b.created_at ? 1 : -1);
    } catch(e){ console.warn('disposals', e); }
    return r;
  });
  wrap('undoPoint', (o) => function(){ const r = o.apply(this, arguments); try { if (typeof UNDO !== 'undefined' && UNDO){ UNDO.disposals = clone(S.disposals || []); UNDO._dsUndo = true; } } catch(e){} return r; });
  // the retention rules travel with the shared settings (sync packages + server), newer rulesAt wins
  wrap('locSyncSubset', (o) => function(){ const ss = o.apply(this, arguments); const r = S.settings.retention; if (r && r.rulesAt) ss.retention = clone(r); return ss; });
  wrap('locSyncApply', (o) => function(ss){
    const r = o.apply(this, arguments);
    try { if (ss && ss.retention && typeof ss.retention === 'object' && ss.retention.rulesAt && syTs(ss.retention.rulesAt) > syTs((S.settings.retention || {}).rulesAt || '')){
      const x = ss.retention; S.settings.retention = {on:x.on !== false, month:+x.month || 1, defYears:+x.defYears || 10, holdTag:String(x.holdTag == null ? RT_HOLD_DEF : x.holdTag).slice(0, 40), publicBody:x.publicBody === true,
        rules:(Array.isArray(x.rules) ? x.rules : []).slice(0, 100).map(rtNormRule), rulesAt:x.rulesAt};
    } } catch(e){}
    return r;
  });
})();
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => rtAutoCheck(), 3500);
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'disposal')) return;
  HELP_TOPICS.push({ id:'disposal', guide:null, tags:['archive', 'safety'], pop:48, related:['newyear', 'insights', 'log'],
    kw:{it:'scarto scartare distruzione distruggere macero conservazione anni regole verbale eliminare vecchi faldoni gennaio soprintendenza ente pubblico 2220 dieci anni', en:'disposal dispose destroy destruction shredding retention years rules record old binders january public body'},
    title:{it:'Come faccio lo scarto dei faldoni vecchi (proposta annuale e verbale)?', en:'How do I dispose of old binders (yearly proposal and record)?'},
    body:{it:'<p>Menu <b>⚙ Funzioni avanzate › Lavoro › Scarto</b>. Ogni anno (di serie a gennaio) DocMap propone i faldoni che hanno superato il tempo di conservazione, secondo le <b>Regole</b>: di serie 10 anni dall\'ultimo anno del faldone (scritture contabili, art. 2220 c.c.), atti e libri sociali da tenere sempre; puoi cambiarle o aggiungerne per categoria o per parole del titolo.</p>' +
      '<p><b>Non vengono proposti</b>: i faldoni senza anno (li vedi a parte per sistemarli), quelli con il tag <b>non-scartare</b> (es. un accertamento in corso), quelli fuori archivio, quelli già in un verbale.</p><ol>' +
      '<li>Controlla la proposta e togli la spunta a quelli da tenere.</li><li><b>Prepara il verbale</b>: scrivi chi approva (per un ente pubblico anche il numero dell\'autorizzazione della Soprintendenza). Il verbale ha un\'impronta SHA-256: se qualcuno lo cambia, la stampa lo dice.</li>' +
      '<li><b>Stampa il verbale</b> e fallo firmare; consegna i faldoni alla ditta di distruzione.</li><li>Dopo la distruzione, <b>Segna come distrutti</b>: i faldoni escono dall\'archivio (anche dal server), restano descritti nel verbale e i loro codici e QR non vengono mai riusati.</li></ol>' +
      '<p><b>Importante</b>: è una proposta da verificare (accertamenti, contenziosi, obblighi di legge, accordi con il cliente). DocMap non decide lo scarto e non è «conservazione a norma». Ogni passo si annulla subito con <b>Annulla</b> ed è scritto nel Registro attività.</p>',
      en:'<p>Menu <b>⚙ Advanced › Work › Disposal</b>: every year (January by default) the binders past their retention time by the studio\'s <b>Rules</b> (default 10 years from the last year; corporate records always kept) are proposed. Binders with no year, the hold tag, checked out or already in a record are left out. Untick, <b>Prepare the record</b> (who approves; SHA-256 fingerprint), print and sign it, then <b>Mark as destroyed</b> after the physical destruction: the binders leave the archive, their codes are never reused. It is a proposal to check, not legal advice.</p>'}
  });
});
