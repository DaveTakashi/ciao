/* =====================================================================
   DocMap 2026 — Actions & event delegation
   ===================================================================== */
const byId = (id) => S.binders.find(b => b.id === id);
const ACTIONS = {
  'nav': (el) => { S.view = el.dataset.v; savePrefs(); renderAll(); window.scrollTo(0, 0); },
  'lang': (el) => { S.lang = el.dataset.l; savePrefs(); renderAll(); if (HELP.open) renderHelp(); if (G.g) guideRenderCard(); },
  'reload': () => { location.reload(); },
  'quick-backup': () => quickBackup(),
  'modal-close': () => closeModal(),
  'modal-btn': (el) => {
    const ov = el.closest('.overlay'), b = ov && ov._opts.buttons[+el.dataset.i];
    if (!b) return;
    if (b.fn) b.fn(); else if (b.action === 'modal-close') closeModal();
  },
  // archive
  'new-binder': () => openEditor(null),
  'edit': (el) => openEditor(el.dataset.id),
  'dup': (el) => {
    const src = byId(el.dataset.id); if (!src) return;
    const b = normalizeBinder(Object.assign(clone(src), {id:uuid(), speaking_code:suggestSpeakingCode(src.company_name), short_code:newShortCode(), final_destination:'', selected_for_print:true, created_at:nowISO(), updated_at:nowISO()}));
    S.binders.push(b); commit(); toast(t('duplicated') + ': ' + b.speaking_code); renderArchiveResults(); openEditor(b.id);
  },
  'del': (el) => {
    const b = byId(el.dataset.id); if (!b) return;
    confirmAction({ danger:true, okLabel:t('delete'), detail:t('c_del_one', {c:b.speaking_code + ' — ' + b.company_name}),
      onOk: () => { undoPoint(); S.binders = S.binders.filter(x => x.id !== b.id); commit(); undoToast(t('deleted') + ': ' + b.speaking_code); renderView(); } });
  },
  'del-sel': () => {
    const sel = S.binders.filter(b => b.selected_for_print); if (!sel.length) return;
    confirmAction({ danger:true, okLabel:t('delete'), detail:t('c_del_many', {n:sel.length}) + ' ' + sel.map(b => b.speaking_code).join(', '),
      onOk: () => { undoPoint(); const ids = new Set(sel.map(b => b.id)); S.binders = S.binders.filter(b => !ids.has(b.id)); commit(); undoToast(t('deleted') + ': ' + sel.length); renderView(); } });
  },
  'toggle-print': (el) => { const b = byId(el.dataset.id); if (!b) return; b.selected_for_print = el.checked; savePrefs(); renderArchiveResults(); },
  'sel-all': () => { const ids = new Set(filteredBinders().map(b => b.id)); S.binders.forEach(b => { if (ids.has(b.id)) b.selected_for_print = true; }); savePrefs(); renderArchiveResults(); },
  'sel-none': () => { S.binders.forEach(b => b.selected_for_print = false); savePrefs(); renderArchiveResults(); },
  'arch-view': (el) => { S.archiveView = el.dataset.v; savePrefs(); renderView(); },
  'copy-url': (el) => { const b = byId(el.dataset.id); if (b) copyText(b.short_url); },
  'show-qr': (el) => { const b = byId(el.dataset.id); if (b) showQR(b); },
  // editor
  'ed-suggest': () => { const d = UI.ed.d; d.speaking_code = suggestSpeakingCode(d.company_name || 'DM'); const el = $('#ed-speaking_code'); if (el) el.value = d.speaking_code; edRefreshDerived(); },
  'ed-regen': () => { const d = UI.ed.d; d.short_code = newShortCode(); const el = $('#ed-short_code'); if (el) el.value = d.short_code; toast(t('regenerated') + ': ' + d.short_code); edRefreshDerived(); },
  'ed-greek': (el) => { const d = UI.ed.d; d.shelf_code = el.dataset.g; const i = $('#ed-shelf_code'); if (i) i.value = d.shelf_code; $('#ed-shelf-tools').innerHTML = shelfToolsHTML(d); edRefreshDerived(); },
  'ed-shelfcol': (el) => { const d = UI.ed.d; d.shelf_color = el.dataset.c; $('#ed-shelf-tools').innerHTML = shelfToolsHTML(d); edRefreshDerived(); },
  'ed-color': (el) => { UI.ed.d.color_hex = el.dataset.c; $('#ed-swatches').innerHTML = swatchesHTML(UI.ed.d.color_hex); edRefreshDerived(); },
  'ed-state': (el) => { UI.ed.d.archive_state = el.dataset.s; $$('#ed-state button').forEach(b => b.classList.toggle('on', b.dataset.s === el.dataset.s)); edRefreshDerived(); },
  'ed-ci-add': () => { UI.ed.d.contents_items.push({year:'', description:t('arch_n', {n:UI.ed.d.contents_items.length + 1})}); renderEdContents(); const rows = $$('#ed-contents [data-ci="description"]'); rows.length && rows[rows.length - 1].focus(); edRefreshDerived(); },
  'ed-ci-del': (el) => { UI.ed.d.contents_items.splice(+el.dataset.i, 1); renderEdContents(); edRefreshDerived(); },
  'ed-pipe-toggle': (el) => { UI.ed.pipeMode = el.checked; renderEdContents(); },
  // print
  'preset': (el, e) => {
    if (e.target.closest('[data-a="del-preset"]')) return;
    const p = findPreset(el.dataset.id);
    S.print.presetId = p.id; S.print.geometry = geoFromPreset(p); S.print.geometryModified = false;
    savePrefs(); renderView();
  },
  'del-preset': (el, e) => {
    e.stopPropagation();
    const p = (S.customPresets || []).find(x => x.id === el.dataset.id); if (!p) return;
    confirmAction({ danger:true, okLabel:t('delete'), detail:t('g_del_preset') + ': ' + p.name, onOk: () => {
      S.customPresets = S.customPresets.filter(x => x.id !== p.id); delete S.usedSlots[p.id];
      if (S.print.presetId === p.id){ S.print.presetId = BUILTIN_PRESETS[0].id; S.print.geometry = geoFromPreset(BUILTIN_PRESETS[0]); S.print.geometryModified = false; }
      commit(); renderView();
    }});
  },
  'geo-step': (el) => {
    const k = el.dataset.k, d = parseFloat(el.dataset.d), isPP = ['padding','offsetX','offsetY'].includes(k);
    if (k === 'ratio'){ const inp = $('input.inp[data-sp="ratio"]'); if (inp){ inp.value = clamp((parseFloat(inp.value) || 50) + d, 30, 70); inp.dispatchEvent(new Event('input', {bubbles:true})); $$('[data-sp="ratio"]').forEach(x => x.value = inp.value); } return; }
    const cur = isPP ? S.print[k] : S.print.geometry[k];
    setGeo(k, Math.round((cur + d) * 100) / 100, isPP);
  },
  'geo-fill': () => {
    const g = S.print.geometry, SAFE = 5;
    g.w = Math.floor(((210 - 2 * SAFE - (g.cols - 1) * g.gapX) / g.cols) * 10) / 10;
    g.h = Math.floor(((297 - 2 * SAFE - (g.rows - 1) * g.gapY) / g.rows) * 10) / 10;
    ACTIONS['geo-center']();
  },
  'geo-center': () => {
    const g = S.print.geometry;
    g.marginLeft = Math.round((210 - (g.cols * g.w + (g.cols - 1) * g.gapX)) / 2 * 100) / 100;
    g.marginTop = Math.round((297 - (g.rows * g.h + (g.rows - 1) * g.gapY)) / 2 * 100) / 100;
    S.print.geometryModified = true; savePrefs(); renderView();
  },
  'im-clip': async () => {
    try { const txt = await navigator.clipboard.readText(); $('#im-text').value = txt; UI.importText = txt; ACTIONS['im-analyze'](); }
    catch(e){ toast(t('im_clip_fail'), 'warn', 6000); $('#im-text').focus(); }
  },
  'geo-reset': () => { const p = findPreset(S.print.presetId); S.print.geometry = geoFromPreset(p); S.print.geometryModified = false; savePrefs(); renderView(); },
  'geo-save': () => {
    const base = findPreset(S.print.presetId);
    openModal({ title:t('g_savepreset'), body:'<div class="field"><label for="pn">' + esc(t('g_preset_name')) + '</label><input class="inp" id="pn" value="' + esc(base.name + (S.print.geometryModified ? ' — ' + t('pr_custom') : '')) + '"></div>',
      buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'save', fn:() => {
        const name = ($('#pn').value || '').trim() || 'Preset';
        const p = Object.assign({id:'custom-' + Date.now().toString(36), kind:'custom', name}, clone(S.print.geometry));
        S.customPresets.push(p);
        const oldUsed = S.usedSlots[S.print.presetId];
        S.print.presetId = p.id; S.print.geometryModified = false;
        if (oldUsed) S.usedSlots[p.id] = oldUsed.slice();
        commit(); closeModal(); toast(t('preset_saved') + ': ' + name); renderView();
      }}] });
  },
  'cmode': (el) => { S.print.contentMode = el.dataset.v; savePrefs(); const y = window.scrollY, pane = $('.studio > .card'), py = pane ? pane.scrollTop : 0; renderView(); window.scrollTo(0, y); const p2 = $('.studio > .card'); if (p2) p2.scrollTop = py; },
  'tpl': (el) => { S.print.template = el.dataset.v; savePrefs(); $$('[data-a="tpl"]').forEach(b => b.classList.toggle('on', b === el)); refreshPrint(); },
  'qmode': (el) => { S.print.qrMode = el.dataset.v; savePrefs(); $$('[data-a="qmode"]').forEach(b => b.classList.toggle('on', b === el)); refreshPrint(); },
  'pv-rot': (el) => { S.print.pvLandscape = el.dataset.v === '1'; savePrefs(); $$('[data-a="pv-rot"]').forEach(b => b.classList.toggle('on', b === el)); renderPrintPreview(); },
  'pv-mode': (el) => { S.print.previewMode = el.dataset.v; savePrefs(); $$('[data-a="pv-mode"]').forEach(b => b.classList.toggle('on', b === el)); refreshPrint(); },
  'slot': (el) => {
    const s = +el.dataset.s, id = S.print.presetId, set = usedSet();
    set.has(s) ? set.delete(s) : set.add(s);
    S.usedSlots[id] = Array.from(set).sort((a, b) => a - b); savePrefs(); refreshPrint();
  },
  'slots-free': () => { S.usedSlots[S.print.presetId] = []; savePrefs(); refreshPrint(); },
  'slots-start': () => {
    const N = slotCount(), n = clamp(parseInt($('#sl-start').value, 10) || 1, 1, N);
    S.usedSlots[S.print.presetId] = slotSeq().slice(0, n - 1).sort((a, b) => a - b); savePrefs(); refreshPrint();
  },
  'print-labels': () => printLabels(),
  'print-calib': () => printCalibration(),
  // import
  'pick-import': () => $('#file-import').click(),
  'im-analyze': () => { UI.importText = $('#im-text').value; analyzeImport(UI.importText); $('#im-preview').innerHTML = importPreviewHTML(); $('#im-preview').scrollIntoView({behavior:'smooth', block:'start'}); },
  'im-clear': () => { UI.importText = ''; UI.importParsed = null; renderView(); },
  'im-merge': () => {
    const IP = UI.importParsed; if (!IP) return;
    const u = IP.rows.filter(r => r.status === 'upd').length;
    if (u) confirmAction({ detail:t('im_c_upd', {u}), okLabel:t('im_merge'), onOk:() => applyImport('merge') });
    else applyImport('merge');
  },
  'im-replace': () => {
    const IP = UI.importParsed; if (!IP) return;
    const m = IP.rows.filter(r => r.status !== 'err').length;
    confirmAction({ danger:true, detail:t('im_c_rep', {n:S.binders.length, m}), okLabel:t('im_replace'), onOk:() => applyImport('replace') });
  },
  // export
  'ex-manifest': () => exportManifest(),
  'ex-merge': () => $('#file-manifest').click(),
  'ex-csv': () => exportFullCSV(),
  'ex-json': () => exportJSON(),
  'ex-register': () => openRegister(),
  // ai
  'ai-copy': () => copyText(buildAIPrompt(UI.aiCtx)),
  'ai-copy-tpl': () => copyText(csvTemplateHeader() + '\n'),
  // settings
  'se-apply-dest': () => confirmAction({ detail:t('se_apply_dest'), onOk:() => { S.binders.forEach(b => b.final_destination = ''); commit(); toast('OK'); renderView(); } }),
  'pick-restore': () => $('#file-restore').click(),
  'se-prev': () => {
    let prev = null; try { prev = localStorage.getItem(LS_PREV); } catch(e){}
    if (!prev){ toast(t('se_prev_none'), 'warn'); return; }
    confirmAction({ detail:t('se_prev_restore'), onOk:() => { try { S = migrate(JSON.parse(prev)); window.S = S; S.hasUnexportedChanges = true; persist(); renderAll(); toast(t('se_prev_done')); } catch(e){ toast(String(e), 'err'); } } });
  },
  'se-demo': () => confirmAction({ danger:true, detail:t('se_demo'), onOk:() => { S.binders = demoBinders(); commit(); toast(t('se_demo_done')); S.view = 'archive'; renderAll(); } }),
  // help & guided actions
  'help-open': () => helpOpen(),
  'help-close': () => helpClose(),
  'help-topic': (el, e) => { e.stopPropagation(); helpOpen(el.dataset.id); },
  'help-back': () => { HELP.topic = null; renderHelp(); },
  'help-tag': (el) => { HELP.tag = el.dataset.t; renderHelp(); },
  'guide-start': (el) => guideStart(el.dataset.id),
  'guide-close': () => guideStop(),
  'guide-next': () => guideNext(),
  'guide-back': () => { if (G.i > 0) guideEnter(G.i - 1, '', -1); },
  'guide-dot': (el) => { const i = +el.dataset.i; if (i !== G.i) guideEnter(i, '', i < G.i ? -1 : 1); },
  'guide-extra': () => { const st = guideStep(); if (st && st.extra) st.extra.fn(); },
  'guide-chain': (el) => guideStart(el.dataset.id),
  'guide-goview': (el) => { S.view = el.dataset.v; savePrefs(); renderAll(); },
  'ob-go': (el) => { S.onboarded = true; savePrefs(); closeModal(); guideStart(el.dataset.id); },
  // database
  'db-save-session': async () => {
    const name = ($('#db-session-name').value || '').trim();
    if (!name){ toast(t('db_need_name'), 'warn'); $('#db-session-name').focus(); return; }
    await dbSaveSession(name, ($('#db-session-note').value || '').trim());
    toast(t('db_saved', {n:name})); renderView();
  },
  'db-restore': (el) => {
    const s = dbSessions().find(x => x.id === +el.dataset.id); if (!s) return;
    confirmAction({ danger:true, okLabel:t('db_restore'), detail:t('db_restore_detail', {n:s.name, c:S.binders.length}), onOk: async () => { undoPoint(); await dbRestoreSession(s.id); undoToast(t('db_restored') + ': ' + s.name); } });
  },
  'db-session-del': (el) => {
    const s = dbSessions().find(x => x.id === +el.dataset.id); if (!s) return;
    confirmAction({ danger:true, okLabel:t('delete'), detail:t('db_del_detail', {n:s.name}), onOk: async () => { await dbDeleteSession(s.id); toast(t('deleted')); renderView(); } });
  },
  'db-session-json': (el) => { const W = dbSessionWorkspace(+el.dataset.id); if (W) download('docmap_session_' + el.dataset.id + '.json', JSON.stringify(W, null, 2), 'application/json'); },
  'db-download': () => dbDownload(),
  'db-open': () => dbOpenLinkedFile(),
  'db-link': () => dbLinkFile(),
  'db-reauth': () => dbReauth(),
  'db-unlink': () => dbUnlink(),
  'db-example': (el) => { const q = SQL_EXAMPLES[+el.dataset.i][1]; $('#db-sql').value = q; dbRunConsole(q); renderView(); },
  'db-run': () => { dbRunConsole($('#db-sql').value); renderView(); },
  'se-wipe': () => confirmAction({ danger:true, okLabel:t('se_wipe'), detail:t('se_wipe') + ': ' + S.binders.length + ' ' + t('k_total').toLowerCase(), onOk:() => { S.binders = []; S.usedSlots = {}; commit(); toast(t('se_wiped')); renderView(); } })
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.a];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.bind){
    const k = el.dataset.bind;
    if (k === 'q'){ UI.q = el.value; renderArchiveResults(); }
    else if (k === 'importText'){ UI.importText = el.value; }
    else if (k === 'clq'){ UI.clq = el.value; renderClientResults(); }
    return;
  }
  if (el.dataset.ed && UI.ed){
    const k = el.dataset.ed, d = UI.ed.d;
    if (k === '__pipe'){ d.contents_items = pipeToContents(el.value); }
    else if (k === 'selected_for_print'){ d.selected_for_print = el.checked; }
    else if (k === 'color_hex'){ d.color_hex = el.value.toUpperCase(); const sw = $('#ed-swatches'); if (sw){ $$('.sw', sw).forEach(s => s.classList.toggle('on', s.dataset.c === d.color_hex)); const lab = sw.querySelector('span.mono'); if (lab) lab.textContent = d.color_hex; } }
    else if (k === 'speaking_code'){ const pos = el.selectionStart; el.value = el.value.toUpperCase().replace(/\s+/g, ''); try { el.setSelectionRange(pos, pos); } catch(err){} d.speaking_code = el.value; }
    else if (k === 'company_name'){ d.company_name = el.value; if (UI.ed.isNew && !UI.ed.codeTouched){ d.speaking_code = el.value.trim() ? suggestSpeakingCode(el.value) : ''; const sc = $('#ed-speaking_code'); if (sc) sc.value = d.speaking_code; } if (UI.ed.isNew && !UI.ed.catTouched){ const same = S.binders.find(b => b.company_name === el.value); const cli = !same && (S.clients || []).find(c => c.name.toLowerCase() === el.value.trim().toLowerCase()); if (cli) applyClientToEditor(cli); if (same){ d.category = same.category; d.color_hex = same.color_hex; if (!d.multi_code && same.multi_code){ d.multi_code = same.multi_code; const mc = $('#ed-multi_code'); if (mc) mc.value = d.multi_code; } const c = $('#ed-category'); if (c) c.value = d.category; $('#ed-swatches').innerHTML = swatchesHTML(d.color_hex); } } }
    else if (k === 'category'){ d.category = el.value; UI.ed.catTouched = true; if (CAT_COLOR[el.value] && UI.ed.isNew){ d.color_hex = CAT_COLOR[el.value]; $('#ed-swatches').innerHTML = swatchesHTML(d.color_hex); } }
    else d[k] = el.value;
    if (k === 'speaking_code') UI.ed.codeTouched = true;
    edRefreshDerived();
    return;
  }
  if (el.dataset.ci && UI.ed){ const it = UI.ed.d.contents_items[+el.dataset.i]; if (it){ it[el.dataset.ci] = el.value; edRefreshDerived(); } return; }
  if (el.dataset.geo){ setGeo(el.dataset.geo, el.value, false); return; }
  if (el.dataset.sp === 'ratio'){ const v = clamp(parseFloat(el.value) || 50, 30, 70); S.print.split = Object.assign({}, S.print.split, {ratio:v / 100}); $$('[data-sp="ratio"]').forEach(x => { if (x !== el) x.value = v; }); savePrefs(); clearTimeout(setGeo._t); setGeo._t = setTimeout(refreshPrint, 40); return; }
  if (el.dataset.pp){
    const k = el.dataset.pp;
    if (['padding','offsetX','offsetY'].includes(k)){ setGeo(k, el.value, true); return; }
    if (k === 'copies'){ S.print.copies = clamp(parseInt(el.value, 10) || 1, 1, 50); savePrefs(); refreshPrint(); return; }
  }
  if (el.dataset.set){
    S.settings[el.dataset.set] = el.value; commit({dirty:false});
    if (el.dataset.set === 'destTemplate'){ const ex = S.binders[0] || normalizeBinder({speaking_code:'BL1', short_code:'dm26K8m2P9xL'}); const p = $('#se-dest-prev'); if (p) p.textContent = renderDest(el.value, ex); }
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.bind){
    const k = el.dataset.bind;
    if (['fState','fRoom','fCat'].includes(k)){ UI[k] = el.value; renderArchiveResults(); }
    else if (['restoreAll','prune','regSelOnly'].includes(k)) UI[k] = el.checked;
    else if (k === 'aiCtx'){ UI.aiCtx = el.checked; const p = $('#ai-prompt'); if (p) p.textContent = buildAIPrompt(UI.aiCtx); }
    return;
  }
  if (el.dataset.pp === 'cut'){ S.print.geometry.cut = el.checked; S.print.geometryModified = true; savePrefs(); refreshPrint(); const gm = $('#geo-mod'); if (gm) gm.innerHTML = '<span class="badge b-out">' + esc(t('g_modified')) + '</span>'; }
  if (el.dataset.fld){ S.print.fields = Object.assign({}, S.print.fields, {[el.dataset.fld]: el.type === 'checkbox' ? el.checked : el.value}); savePrefs(); refreshPrint(); }
  if (el.dataset.sp === 'rotate'){ S.print.split = Object.assign({}, S.print.split, {rotate:+el.value}); savePrefs(); refreshPrint(); }
  if (el.dataset.sp === 'guides'){ S.print.split = Object.assign({}, S.print.split, {guides:el.checked}); savePrefs(); refreshPrint(); }
  if (el.hasAttribute && el.hasAttribute('data-shelftype')){ S.settings.shelfType = el.value; savePrefs(); if (UI.ed){ $('#ed-shelf-tools').innerHTML = shelfToolsHTML(UI.ed.d); const i = $('#ed-shelf_code'); if (i) i.placeholder = (SHELF_TYPES[el.value] || [])[0] || t('st_text_ph'); } }
  if (el.dataset.pp === 'showMulti'){ S.print.showMulti = el.checked; savePrefs(); refreshPrint(); }
  if (el.dataset.pp === 'showQrUrl'){ S.print.showQrUrl = el.checked; savePrefs(); refreshPrint(); }
  if (el.dataset.pp === 'qrEcc'){ S.settings.qrEcc = el.value; savePrefs(); refreshPrint(); }
  if (el.dataset.ed === 'sector_code' && UI.ed){ UI.ed.d.sector_code = el.value; edRefreshDerived(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && G.g){ guideStop(); return; }   // closing the guide never closes the form
  if (e.key === 'Escape' && HELP.open){ helpClose(); return; }
  if (e.key === 'F1'){ e.preventDefault(); helpOpen(); return; }
  if (e.key === 'Escape' && topModal()){ closeModal(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); if (UI.ed && topModal()) saveEditor(); else quickBackup(); return; }
  if (e.key === 'Enter' && e.target.id === 'pn'){ const b = topModal() && topModal().querySelector('.btn-primary'); b && b.click(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'dropzone'){ e.preventDefault(); $('#file-import').click(); }
});

/* ---------------- File inputs & drag-drop ---------------- */
async function handleImportFile(file){
  if (!file) return;
  try {
    const txt = await readFileText(file);
    UI.importText = txt; S.view = 'import'; renderAll();
    if (readFileText.lastAnsi) toast(t('im_ansi'), 'warn', 8000);
    analyzeImport(txt); $('#im-preview').innerHTML = importPreviewHTML();
  } catch(err){ toast(String(err), 'err'); }
}
$('#file-import').addEventListener('change', (e) => { handleDroppedFile(e.target.files[0]); e.target.value = ''; });
$('#file-restore').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f){ UI.restoreAll = true; handleImportFile(f); } });
$('#file-manifest').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const txt = await readFileText(f);
    const r = mergeManifest(txt, UI.prune);
    download('manifest.csv', r.text, 'text/csv');
    markExported('manifest.csv');
    toast(t('ex1_merged', {k:r.kept, u:r.updated, a:r.added, r:r.removed ? t('ex1_removed', {n:r.removed}) : ''}), 'ok', 7000);
  } catch(err){ toast(String(err), 'err'); }
});
$('#file-sqlite').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!DB.ready){ toast(t('db_loading'), 'warn'); return; }
  dbOpenBytes(await f.arrayBuffer(), f.name);
});
/* Drag & drop anywhere: a file dropped outside the drop zone must never make the browser navigate away (losing the page). */
const isSqliteFile = async (f) => /\.(sqlite3?|db)$/i.test(f.name) || new TextDecoder().decode(new Uint8Array(await f.slice(0, 15).arrayBuffer())) === 'SQLite format 3';
async function handleDroppedFile(f){
  if (!f) return;
  if (await isSqliteFile(f)){ if (!DB.ready){ toast(t('db_loading'), 'warn'); return; } dbOpenBytes(await f.arrayBuffer(), f.name); return; }
  handleImportFile(f);
}
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  const dz = e.target.closest && e.target.closest('#dropzone'); if (dz) dz.classList.add('drag');
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (e) => {
  const dz = e.target.closest && e.target.closest('#dropzone'); if (dz) dz.classList.remove('drag');
  if (!e.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); document.body.classList.remove('dragging');
  const dz = $('#dropzone'); if (dz) dz.classList.remove('drag');
  handleDroppedFile(e.dataTransfer.files[0]);
});

document.addEventListener('toggle', (e) => { if (e.target && e.target.id === 'pr-adv'){ S.print.advanced = e.target.open; savePrefs(); } }, true);
Object.assign(ACTIONS, PHOTO_ACTIONS, CLIENT_ACTIONS, INFO_ACTIONS);

/* ---------------- Boot ---------------- */
(function boot(){
  S = loadState(); window.S = S;
  // integrity: guarantee unique, valid short codes
  if (ensureIntegrity()) S.hasUnexportedChanges = true;
  persist();
  renderAll();
  maybeOnboard();
  dbInit();
  window.DocMap = { state:() => S, DMQR, layoutLabels, buildLabelSheets, buildCalibSheet, buildRegisterHTML, mergeManifest, analyzeImport, applyImport, buildAIPrompt, parseCSV };
})();
