/* =====================================================================
   DocMap 2026 — v11 (stream X): "Ubicazioni" — location tree, location QR labels, association mode (desktop)

   Model and codes: 02c-locations.js (S.locations, normalizeLocation, locIntegrity, locIndex, assocParseCode).
   This file is the desktop side (index.html):
   1. Informazioni › Ubicazioni (sub-tab 'loc'): tree editor (add child, rename, move, delete with confirm +
      undo, "Crea in serie" = whole structures at once, e.g. 20 boxes B01..B20 in a shelf), level names
      (S.settings.locLevels), binder counts per node, binders of a node, assign the archive selection,
      selection of nodes for printing.
   2. Location labels: label template 'loc' (kind 'L') in the existing print engine (03-print.js); the queue is
      S.print.locIds (ids of the nodes to print) while S.print.contentMode === 'loc'; PDF via 05c as usual.
      qr7 manifest rows (04-ui exportManifest / mergeManifest call locManifestRows()).
   3. Association mode (Modalità associazione): scan a location QR → that box is active; every binder QR scanned
      next goes into it, the next location QR switches box. Input = USB / Bluetooth barcode scanner acting as a
      keyboard (text + Enter) or the webcam (DMCamScanner, 11b-assoc.js). Offline, saved locally, synced later.
      Every assignment → logAct('binder.locate', …, {from, to, via, device, user}) and can be undone.
   4. Hooks: archive filter + search, binder editor field, "Dov'è?", sync settings subset (location levels).

   State used here: S.locations, S.settings.locLevels / locLevelsAt, S.print.locIds / locPrevMode (print),
   binder.location_id. Ephemeral: LUI (selection, open nodes, checked nodes, association session).
   ===================================================================== */
'use strict';

Object.assign(ICONS, {
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  scan:'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  chevr:'<path d="m9 18 6-6-6-6"/>', warehouse:'<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  move:'<path d="M5 9 2 12l3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
  layers:'<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>', stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>'
});

Object.assign(I18N.it, {
  in_loc:'Ubicazioni', in_d_loc:'L\'archivio fisico come albero: magazzino › armadio › scansia › scaffale › scatola. Il QR va sulla scatola.',
  lo_p:'Programma la struttura del tuo archivio e stampa i QR delle scatole. Poi, in Modalità associazione, scansiona il QR di una scatola e i QR dei faldoni che contiene.',
  lo_new_root:'Nuovo {l}', lo_add_child:'Aggiungi {l}', lo_bulk:'Crea in serie…', lo_levels:'Livelli…', lo_assoc:'Modalità associazione', lo_print_sel:'Stampa etichette', lo_search_ph:'Cerca codice o nome…',
  lo_empty_h:'Nessuna ubicazione', lo_empty_p:'Crea il primo livello (es. il magazzino) e poi, con "Crea in serie", armadi, scaffali e scatole in un colpo solo. I codici (es. MAG1-A1-S1-R1-B01) e i QR si generano da soli.',
  lo_empty_btn:'Crea la struttura', lo_count:'{n} ubicazioni', lo_name:'Nome', lo_name_ph:'facoltativo, es. Archivio seminterrato', lo_seg:'Codice', lo_kind:'Tipo', lo_notes:'Note', lo_code:'Codice completo',
  lo_qr:'QR della ubicazione', lo_binders_here:'Faldoni qui dentro', lo_binders_sub:'{n} faldoni in tutto (anche nelle sotto-ubicazioni)', lo_none_here:'Nessun faldone in questa ubicazione.',
  lo_remove:'Togli', lo_move:'Sposta…', lo_del:'Elimina', lo_del_d:'Elimina {c} con {k} sotto-ubicazioni. {n} faldoni restano in archivio, senza ubicazione.', lo_deleted:'Ubicazione eliminata: {c}', lo_saved:'Ubicazione salvata',
  lo_created:'Create {n} ubicazioni', lo_print_one:'Stampa etichetta', lo_print_leaves:'Stampa le etichette qui dentro ({n})', lo_assign_sel:'Metti qui i faldoni selezionati ({n})', lo_assigned:'{n} faldoni collocati in {c}',
  lo_unassigned:'{n} faldoni senza ubicazione', lo_assoc_here:'Avvia associazione qui', lo_top:'— primo livello —', lo_move_t:'Sposta {c}', lo_move_to:'Dentro a', lo_moved:'Spostata: {c}',
  lo_sel_n:'{n} selezionate', lo_sel_leaves:'Seleziona ultimo livello ({l})', lo_sel_none:'Nessuna', lo_seg_dup:'Codice già usato qui: diventa {c}', lo_children:'{n} dentro', lo_expand:'Apri tutto', lo_collapse:'Chiudi tutto',
  lo_bulk_t:'Crea in serie dentro {c}', lo_bulk_root_t:'Crea la struttura dell\'archivio', lo_bulk_n:'Quanti', lo_bulk_prefix:'Prefisso', lo_bulk_from:'Da', lo_bulk_pad:'Cifre', lo_bulk_each:'dentro ciascuno',
  lo_bulk_prev:'Verranno create {n} ubicazioni. Esempi: {e}', lo_bulk_ok:'Crea', lo_bulk_max:'Massimo {n} ubicazioni per volta.', lo_bulk_none:'Indica almeno un numero.', lo_bulk_print:'Stampa le etichette',
  lo_bulk_hint:'Per ogni livello: quanti elementi creare dentro ciascuno del livello sopra. Lascia 0 per fermarti a quel livello.',
  lo_bk_how_h:'Come funziona', lo_bk_how:'Descrivi il magazzino dall\'alto verso il basso. Esempio: 1 magazzino, dentro 3 armadi, in ogni armadio 4 scaffali, su ogni scaffale 10 scatole = 1 + 3 + 12 + 120 = 136 ubicazioni, ognuna con il suo codice (MAG1-A1-S1-B01) e il suo QR.',
  lo_bk_c_n:'quanti per ogni elemento del livello sopra (0 = ti fermi qui)', lo_bk_c_prefix:'le lettere davanti al numero (A → A1, A2…)', lo_bk_c_from:'il primo numero (di solito 1)', lo_bk_c_pad:'quante cifre (2 → 01, 02…; serve per l\'ordine giusto oltre il 9)',
  lo_bk_presets:'Esempi pronti:', lo_bk_sum_first:'{n} × {l}', lo_bk_sum_each:'{n} × {l} in ciascuno ({tot} in tutto)',
  lo_lv_t:'Livelli dell\'archivio', lo_lv_p:'Nomi e prefissi dei livelli, dal più grande al più piccolo (1-8 livelli). Il prefisso forma i codici: MAG1-A2-S3-R1-B04. Le etichette QR di solito vanno sull\'ultimo livello.',
  lo_lv_name:'Nome', lo_lv_prefix:'Prefisso', lo_lv_add:'Aggiungi livello', lo_lv_reset:'Ripristina predefiniti', lo_lv_saved:'Livelli salvati', lo_lv_n:'Livello {n}',
  la_h:'Modalità associazione', la_p:'Scansiona il QR di una scatola: si apre. Ogni QR di faldone scansionato dopo finisce dentro quella scatola, finché non scansioni la scatola successiva.',
  la_active:'Ubicazione attiva', la_none:'Scansiona il QR di una ubicazione per iniziare', la_scan_ph:'Lettore QR / codice + Invio', la_cam:'Webcam', la_cam_off:'Spegni webcam', la_stop:'Termina',
  la_switched:'Ora in {c}', la_put:'{b} → {c}', la_dup:'{b} è già in {c}', la_unknown:'Codice non riconosciuto: {v}', la_need_loc:'Prima scansiona il QR di una ubicazione.', la_undo:'Annulla', la_undone:'{b} rimesso dov\'era',
  la_recent:'Ultime associazioni', la_in_box:'{n} faldoni qui', la_from:'da {c}', la_nowhere:'nessuna ubicazione', la_cam_err:'Webcam non disponibile: {m}', la_session:'In questa sessione: {n}', la_scan_hint:'Il campo resta pronto: puoi scansionare uno dopo l\'altro.',
  lo_ed_label:'Ubicazione (scatola)', lo_ed_ph:'Cerca: codice o nome della scatola', lo_ed_clear:'Togli ubicazione', lo_ed_hint:'Quando c\'è un\'ubicazione, la posizione del faldone diventa il suo codice.',
  lo_all:'Tutte le ubicazioni', lo_without:'Senza ubicazione', lo_assign_btn:'Ubicazione…', lo_assign_t:'Ubicazione per {n} faldoni', lo_pick:'Ubicazione', lo_pick_ph:'Cerca codice o nome…', lo_clear_sel:'Togli l\'ubicazione', lo_assign_go:'Assegna',
  cm_loc:'Etichette ubicazione (QR scatole)', cm_loc_d:'Codice grande, percorso e QR per scatole e scaffali. Si scelgono in Informazioni › Ubicazioni.', lo_pr_h:'Etichette ubicazione: {n}', lo_pr_none:'Nessuna ubicazione da stampare: scegline in Informazioni › Ubicazioni.',
  lo_pr_manage:'Scegli le ubicazioni', lo_pr_back:'Torna alle etichette dei faldoni', l_loc_cap:'UBICAZIONE', lo_where:'Ubicazione', lo_nf:'Ubicazione non trovata',
  lg_g_location:'Ubicazioni', 'lga_location.create':'Ubicazione creata', 'lga_location.bulk_create':'Ubicazioni create in serie', 'lga_location.edit':'Ubicazione modificata', 'lga_location.move':'Ubicazione spostata',
  'lga_location.delete':'Ubicazione eliminata', 'lga_location.levels':'Livelli modificati', 'lga_binder.locate':'Faldone collocato', 'lga_binder.locate_bulk':'Faldoni collocati', sv_seed_lo:'{n} ubicazioni'
});
Object.assign(I18N.en, {
  in_loc:'Locations', in_d_loc:'The physical archive as a tree: warehouse › cabinet › shelving unit › shelf › box. The QR goes on the box.',
  lo_p:'Program the structure of your archive and print the box QR codes. Then, in Association mode, scan a box QR and the QR codes of the binders it holds.',
  lo_new_root:'New {l}', lo_add_child:'Add {l}', lo_bulk:'Create in series…', lo_levels:'Levels…', lo_assoc:'Association mode', lo_print_sel:'Print labels', lo_search_ph:'Search code or name…',
  lo_empty_h:'No locations yet', lo_empty_p:'Create the first level (e.g. the warehouse), then use "Create in series" for cabinets, shelves and boxes in one go. Codes (e.g. MAG1-A1-S1-R1-B01) and QR codes are generated automatically.',
  lo_empty_btn:'Create the structure', lo_count:'{n} locations', lo_name:'Name', lo_name_ph:'optional, e.g. Basement archive', lo_seg:'Code', lo_kind:'Type', lo_notes:'Notes', lo_code:'Full code',
  lo_qr:'Location QR', lo_binders_here:'Binders in here', lo_binders_sub:'{n} binders in all (sub-locations included)', lo_none_here:'No binders in this location.',
  lo_remove:'Remove', lo_move:'Move…', lo_del:'Delete', lo_del_d:'Delete {c} with {k} sub-locations. {n} binders stay in the archive, without a location.', lo_deleted:'Location deleted: {c}', lo_saved:'Location saved',
  lo_created:'{n} locations created', lo_print_one:'Print label', lo_print_leaves:'Print the labels in here ({n})', lo_assign_sel:'Put the selected binders here ({n})', lo_assigned:'{n} binders placed in {c}',
  lo_unassigned:'{n} binders without location', lo_assoc_here:'Start association here', lo_top:'— top level —', lo_move_t:'Move {c}', lo_move_to:'Inside', lo_moved:'Moved: {c}',
  lo_sel_n:'{n} selected', lo_sel_leaves:'Select last level ({l})', lo_sel_none:'None', lo_seg_dup:'Code already used here: it becomes {c}', lo_children:'{n} inside', lo_expand:'Expand all', lo_collapse:'Collapse all',
  lo_bulk_t:'Create in series inside {c}', lo_bulk_root_t:'Create the archive structure', lo_bulk_n:'How many', lo_bulk_prefix:'Prefix', lo_bulk_from:'From', lo_bulk_pad:'Digits', lo_bulk_each:'inside each',
  lo_bulk_prev:'{n} locations will be created. Examples: {e}', lo_bulk_ok:'Create', lo_bulk_max:'At most {n} locations at a time.', lo_bulk_none:'Enter at least one number.', lo_bulk_print:'Print the labels',
  lo_bulk_hint:'For each level: how many to create inside each one of the level above. Leave 0 to stop at that level.',
  lo_bk_how_h:'How it works', lo_bk_how:'Describe the warehouse from the top down. Example: 1 warehouse, 3 cabinets in it, 4 shelves in each cabinet, 10 boxes on each shelf = 1 + 3 + 12 + 120 = 136 locations, each with its code (MAG1-A1-S1-B01) and its QR.',
  lo_bk_c_n:'how many for each item of the level above (0 = stop here)', lo_bk_c_prefix:'the letters before the number (A → A1, A2…)', lo_bk_c_from:'the first number (usually 1)', lo_bk_c_pad:'how many digits (2 → 01, 02…; keeps the order right past 9)',
  lo_bk_presets:'Ready-made:', lo_bk_sum_first:'{n} × {l}', lo_bk_sum_each:'{n} × {l} in each ({tot} in all)',
  lo_lv_t:'Archive levels', lo_lv_p:'Level names and prefixes, from the largest to the smallest (1-8 levels). The prefix builds the codes: MAG1-A2-S3-R1-B04. QR labels usually go on the last level.',
  lo_lv_name:'Name', lo_lv_prefix:'Prefix', lo_lv_add:'Add level', lo_lv_reset:'Restore defaults', lo_lv_saved:'Levels saved', lo_lv_n:'Level {n}',
  la_h:'Association mode', la_p:'Scan a box QR: it opens. Every binder QR scanned next goes into that box, until you scan the next box.',
  la_active:'Active location', la_none:'Scan a location QR to start', la_scan_ph:'QR scanner / code + Enter', la_cam:'Webcam', la_cam_off:'Turn webcam off', la_stop:'Finish',
  la_switched:'Now in {c}', la_put:'{b} → {c}', la_dup:'{b} is already in {c}', la_unknown:'Code not recognised: {v}', la_need_loc:'Scan a location QR first.', la_undo:'Undo', la_undone:'{b} put back where it was',
  la_recent:'Latest associations', la_in_box:'{n} binders here', la_from:'from {c}', la_nowhere:'no location', la_cam_err:'Webcam not available: {m}', la_session:'This session: {n}', la_scan_hint:'The field stays ready: scan one after the other.',
  lo_ed_label:'Location (box)', lo_ed_ph:'Search: box code or name', lo_ed_clear:'Remove location', lo_ed_hint:'With a location, the binder position becomes its code.',
  lo_all:'All locations', lo_without:'Without location', lo_assign_btn:'Location…', lo_assign_t:'Location for {n} binders', lo_pick:'Location', lo_pick_ph:'Search code or name…', lo_clear_sel:'Remove the location', lo_assign_go:'Assign',
  cm_loc:'Location labels (box QR)', cm_loc_d:'Big code, path and QR for boxes and shelves. Chosen in Information › Locations.', lo_pr_h:'Location labels: {n}', lo_pr_none:'No locations to print: choose some in Information › Locations.',
  lo_pr_manage:'Choose the locations', lo_pr_back:'Back to the binder labels', l_loc_cap:'LOCATION', lo_where:'Location', lo_nf:'Location not found',
  lg_g_location:'Locations', 'lga_location.create':'Location created', 'lga_location.bulk_create':'Locations created in series', 'lga_location.edit':'Location edited', 'lga_location.move':'Location moved',
  'lga_location.delete':'Location deleted', 'lga_location.levels':'Levels edited', 'lga_binder.locate':'Binder placed', 'lga_binder.locate_bulk':'Binders placed', sv_seed_lo:'{n} locations'
});
if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('location')) LOG_GROUPS.push('location');
if (typeof LOG_FIELD_IT !== 'undefined') Object.assign(LOG_FIELD_IT, {location_id:'ubicazione'});
INFO_TABS.push(['loc', 'box']);

const LOC_BULK_MAX = 5000;
const LUI = { sel:'', q:'', open:new Set(), checked:new Set(), assoc:{on:false, loc:'', list:[], n:0, cam:null}, bulk:null, lv:null };

/* ---------------- helpers ---------------- */
function locEnsure(){ if (!Array.isArray(S.locations)) S.locations = []; return S.locations; }
function locAfterChange(){ locIntegrity(); locRefreshBinders(); }
/** Binders follow the codes of the tree (location_code is derived, not content: no updated_at bump). */
function locRefreshBinders(){ S.binders.forEach(b => { if (b.location_id){ const c = binderLocCode(b); if (c !== b.location_code) b.location_code = c; } }); }
/** JSON workspace import (05-views applyImport): replace the tree (full restore) or merge it by id, newer updated_at wins. */
function locImportWorkspace(list, replace){
  const inc = (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object').map(normalizeLocation);
  if (replace) S.locations = inc;
  else {
    locEnsure(); const byId = new Map(S.locations.map((l, i) => [l.id, i]));
    inc.forEach(l => { const i = byId.get(l.id); if (i == null){ S.locations.push(l); byId.set(l.id, S.locations.length - 1); } else if (String(l.updated_at) > String(S.locations[i].updated_at || '')) S.locations[i] = l; });
  }
  locAfterChange();
}
const LOC_CNT = { ver:-1, arr:null, bArr:null, len:-1, own:new Map(), all:new Map() };
/** Binder counts per node: own (directly inside) and all (subtree). Cached per index version + binders array. */
/** "N faldoni qui" with the singular for 1 (v11.1; la_in_box1 lives in 07b-helpx.js, falls back to la_in_box). */
function laInBox(n){ return t(n === 1 && I18N.it.la_in_box1 ? 'la_in_box1' : 'la_in_box', {n}); }
function locCounts(){
  const X = locIndex(), C = LOC_CNT, sig = S.binders.length + ':' + S.binders.reduce((n, b) => n + (b.location_id ? b.location_id.length : 0), 0);
  if (C.ver === X.built && C.arr === X.arr && C.bArr === sig) return C;
  C.ver = X.built; C.arr = X.arr; C.bArr = sig; C.own = new Map(); C.all = new Map();
  S.binders.forEach(b => { if (b.location_id && X.byId.has(b.location_id)) C.own.set(b.location_id, (C.own.get(b.location_id) || 0) + 1); });
  const go = (id) => { let n = C.own.get(id) || 0; locChildren(id).forEach(c => { n += go(c.id); }); C.all.set(id, n); return n; };
  locChildren('').forEach(r => go(r.id));
  return C;
}
function locSubtreeSet(id){ const s = new Set([id]); locDescendants(id).forEach(x => s.add(x)); return s; }
/** Archive filter: binder inside the node (or its sub-nodes); '__none' = no (known) location. */
function locBinderIn(b, id){
  if (id === '__none') return !b.location_id || !locById(b.location_id);
  if (!b.location_id) return false;
  if (b.location_id === id) return true;
  return locPath(b.location_id).some(l => l.id === id);
}
function locBinderSearchText(b){ if (!b.location_id) return ''; const l = locById(b.location_id); return l ? locPathText(l.id, ' ') + ' ' + l.short_code : ''; }
function locLabelOf(l){ return l.code + (l.name ? ' · ' + l.name : ''); }
function locOptionsHTML(cur, o){
  o = o || {}; const out = [], skip = o.skip || new Set();
  const go = (pid, d) => locChildren(pid).forEach(l => { if (skip.has(l.id)) return; out.push('<option value="' + esc(l.id) + '"' + (cur === l.id ? ' selected' : '') + '>' + '  '.repeat(d) + esc(locLabelOf(l)) + '</option>'); go(l.id, d + 1); });
  go('', 0);
  return out.join('');
}
/** Typeahead source of locations (editor, assign dialog). */
function locTaSource(){ return locArr().map(l => ({value:l.code, meta:locPathText(l.id) + (locCounts().own.get(l.id) ? ' · ' + laInBox(locCounts().own.get(l.id)) : ''), match:l.code + ' ' + locPathText(l.id, ' ') + ' ' + l.short_code, id:l.id, count:locCounts().own.get(l.id) || 0})); }
function locFindTyped(v){
  const s = String(v || '').trim(); if (!s) return null;
  const p = assocParseCode(s); const all = locArr();
  if (p.type === 'location') return all.find(l => l.short_code === p.code) || null;
  const u = s.toUpperCase();
  return all.find(l => l.code.toUpperCase() === u) || all.find(l => locTitle(l).toUpperCase() === u) || null;
}
function locBeep(ok){
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = locBeep.ctx || (locBeep.ctx = new A()), o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = ok === 'switch' ? 660 : ok ? 1046 : 220; g.gain.value = 0.06;
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? 0.09 : 0.22));
  } catch(e){}
}

/* ---------------- mutations ---------------- */
function locCreate(parentId, o){
  locEnsure();
  const parent = parentId ? locById(parentId) : null, level = parent ? Math.min(LOC_MAX_DEPTH - 1, parent.level + 1) : 0;
  const now = nowISO();
  const l = normalizeLocation(Object.assign({id:uuid(), parent_id:parent ? parent.id : '', level, seg:locNextSeg(parent ? parent.id : '', level), short_code:newLocShortCode(), created_at:now, updated_at:now}, o || {}));
  S.locations.push(l); locTouch();
  return l;
}
function locAddChild(parentId){
  const parent = parentId ? locById(parentId) : null;
  if (parent && parent.level >= LOC_MAX_DEPTH - 1) return toast(t('lo_bulk_max', {n:LOC_MAX_DEPTH}), 'warn');
  const l = locCreate(parentId);
  locAfterChange();
  logAct('location.create', {type:'location', id:l.id, code:l.code}, 'Creata l\'ubicazione ' + l.code, {code:l.code, parent:parent ? parent.code : ''});
  commit();
  LUI.sel = l.id; locPath(l.id).slice(0, -1).forEach(x => LUI.open.add(x.id));
  locRender();
  setTimeout(() => { const n = $('#lo-f-name'); if (n) n.focus(); }, 30);
}
function locSaveFields(id, f){
  const l = locById(id); if (!l) return;
  const before = clone(l);
  if ('name' in f) l.name = String(f.name || '').replace(/\s+/g, ' ').trim();
  if ('kind' in f) l.kind = String(f.kind || '').replace(/\s+/g, ' ').trim();
  if ('notes' in f) l.notes = String(f.notes || '').trim();
  let note = '';
  if ('seg' in f){
    const s = locSegClean(f.seg) || l.seg;
    if (s !== l.seg){ const taken = locChildren(l.parent_id).some(c => c.id !== l.id && c.seg === s); l.seg = s; if (taken) note = 'dup'; }
  }
  const changed = ['name', 'kind', 'notes', 'seg'].filter(k => before[k] !== l[k]);
  if (!changed.length) return;
  l.updated_at = nowISO(); locTouch();
  locAfterChange();
  if (note) toast(t('lo_seg_dup', {c:l.seg}), 'warn', 5000);
  logAct('location.edit', {type:'location', id:l.id, code:l.code}, 'Modificata l\'ubicazione ' + l.code + ': ' + changed.join(', '), {changed:changed.reduce((o, k) => (o[k] = [before[k], l[k]], o), {})});
  commit();
}
/** Bulk create: counts[i] children per node at depth (start level + i). Returns the new records. */
function locBulkCreate(parentId, rows){
  const parent = parentId ? locById(parentId) : null, made = [];
  const go = (pid, level, i) => {
    const r = rows[i]; if (!r || !(r.n > 0) || level >= LOC_MAX_DEPTH) return;
    for (let k = 0; k < r.n && made.length < LOC_BULK_MAX; k++){
      const seg = locSegClean(r.prefix) + String((r.from || 1) + k).padStart(r.pad || 1, '0');
      const exists = locChildren(pid).find(c => c.seg === seg);
      const node = exists || locCreate(pid, {seg});
      if (!exists) made.push(node);
      go(node.id, level + 1, i + 1);
    }
  };
  go(parent ? parent.id : '', parent ? parent.level + 1 : 0, 0);
  locAfterChange();
  return made;
}
function locBulkCount(rows){ let total = 0, mult = 1; for (const r of rows){ if (!(r.n > 0)) break; mult *= r.n; total += mult; } return total; }
function locMove(id, newParent){
  const l = locById(id); if (!l) return;
  if (newParent && locSubtreeSet(id).has(newParent)) return;
  const old = l.code;
  l.parent_id = newParent || ''; l.updated_at = nowISO(); locTouch();
  locAfterChange();
  locDescendants(id).forEach(x => { const d = locById(x); if (d) d.updated_at = l.updated_at; });   // level/code of the subtree changed: let the other devices re-derive them together
  logAct('location.move', {type:'location', id:l.id, code:l.code}, 'Spostata l\'ubicazione ' + old + ' → ' + l.code, {from:old, to:l.code, parent:newParent ? (locById(newParent) || {}).code || '' : ''});
  commit();
  toast(t('lo_moved', {c:l.code}));
}
function locDelete(id){
  const l = locById(id); if (!l) return;
  const ids = locSubtreeSet(id), inside = S.binders.filter(b => ids.has(b.location_id));
  confirmAction({danger:true, okLabel:t('lo_del'), detail:t('lo_del_d', {c:l.code, k:ids.size - 1, n:inside.length}), onOk:() => {
    undoPoint();
    const code = l.code;
    inside.forEach(b => { b.location_id = ''; b.location_code = binderLocCode(b); b.updated_at = nowISO(); });
    S.locations = S.locations.filter(x => !ids.has(x.id));
    locAfterChange();
    ids.forEach(x => LUI.checked.delete(x));
    if (ids.has(LUI.sel)) LUI.sel = l.parent_id || '';
    if (ids.has(LUI.assoc.loc)) LUI.assoc.loc = '';
    logAct('location.delete', {type:'location', id, code}, 'Eliminata l\'ubicazione ' + code + (ids.size > 1 ? ' e ' + (ids.size - 1) + ' sotto-ubicazioni' : '') + (inside.length ? '; ' + inside.length + ' faldoni senza ubicazione' : ''), {code, locations:ids.size, binders:inside.map(b => b.speaking_code).slice(0, 200)});
    commit(); locRender();
    undoToast(t('lo_deleted', {c:code}));
  }});
}
/** Put binders into a location ('' = remove). via: scanner | camera | manual | editor | bulk | undo. Returns the moved binders. */
function locAssign(binders, locId, o){
  o = o || {};
  const to = locId ? locById(locId) : null; if (locId && !to) return [];
  const now = nowISO(), moved = [];
  binders.forEach(b => {
    if ((b.location_id || '') === (locId || '')) return;
    const from = b.location_id ? locById(b.location_id) : null;
    moved.push({b, from:b.location_id || '', fromCode:from ? from.code : (b.location_id ? b.location_code : '')});
    b.location_id = locId || ''; b.location_code = binderLocCode(b); b.updated_at = now;
  });
  if (!moved.length) return moved;
  const base = {via:o.via || 'manual', device:typeof syncDeviceId === 'function' ? syncDeviceId() : '', user:logWho()};
  if (moved.length === 1 && o.via !== 'bulk'){
    const m = moved[0];
    logAct('binder.locate', logBT(m.b), 'Collocato il faldone ' + m.b.speaking_code + ' in ' + (to ? to.code : 'nessuna ubicazione') + (m.fromCode ? ' (prima in ' + m.fromCode + ')' : ''),
      Object.assign({from:{id:m.from, code:m.fromCode}, to:{id:to ? to.id : '', code:to ? to.code : ''}}, base));
  } else {
    logAct('binder.locate_bulk', to ? {type:'location', id:to.id, code:to.code} : null, (to ? 'Collocati ' + moved.length + ' faldoni in ' + to.code : 'Tolta l\'ubicazione a ' + moved.length + ' faldoni'),
      Object.assign({to:{id:to ? to.id : '', code:to ? to.code : ''}, binders:moved.slice(0, 500).map(m => ({id:m.b.id, code:m.b.speaking_code, from:m.fromCode}))}, base));
  }
  if (!o.noCommit) commit();
  return moved;
}

/* ---------------- Informazioni › Ubicazioni ---------------- */
function locVisibleIds(){
  const q = String(LUI.q || '').trim().toLowerCase(); if (!q) return null;
  const vis = new Set();
  locArr().forEach(l => { if ((l.code + ' ' + l.name + ' ' + locKind(l) + ' ' + l.short_code + ' ' + l.notes).toLowerCase().includes(q)) locPath(l.id).forEach(p => vis.add(p.id)); });
  return vis;
}
function locTreeHTML(){
  const C = locCounts(), vis = locVisibleIds(), rows = [];
  const go = (pid, d) => locChildren(pid).forEach(l => {
    if (vis && !vis.has(l.id)) return;
    const kids = locChildren(l.id).length, open = vis ? true : LUI.open.has(l.id);
    rows.push('<div class="lt-row' + (LUI.sel === l.id ? ' on' : '') + (LUI.assoc.on && LUI.assoc.loc === l.id ? ' assoc' : '') + '" style="--d:' + d + '" data-lid="' + esc(l.id) + '">' +
      (kids ? '<button type="button" class="lt-tg' + (open ? ' open' : '') + '" data-a="lo-toggle" data-id="' + esc(l.id) + '" aria-label="' + esc(open ? t('lo_collapse') : t('lo_expand')) + '" aria-expanded="' + open + '">' + ic('chevr') + '</button>' : '<span class="lt-tg-sp"></span>') +
      '<label class="chk lt-chk" title="' + esc(t('lo_print_sel')) + '"><input type="checkbox" data-lo-check="' + esc(l.id) + '"' + (LUI.checked.has(l.id) ? ' checked' : '') + ' aria-label="' + esc(l.code) + '"></label>' +
      '<button type="button" class="lt-main" data-a="lo-sel" data-id="' + esc(l.id) + '"><span class="lt-ic lv' + Math.min(l.level, 4) + '">' + ic(l.level === 0 ? 'warehouse' : kids ? 'layers' : 'box') + '</span>' +
        '<span class="lt-tx"><b class="mono">' + esc(l.seg) + '</b><span class="lt-nm">' + esc(l.name || locKind(l)) + '</span></span>' +
        (C.all.get(l.id) ? '<span class="lt-n" title="' + esc(t('lo_binders_sub', {n:C.all.get(l.id)})) + '">' + C.all.get(l.id) + '</span>' : '') + '</button></div>');
    if (open) go(l.id, d + 1);
  });
  go('', 0);
  return rows.join('') || '<div class="empty small">' + esc(t('in_none')) + '</div>';
}
function locDetailHTML(){
  const l = locById(LUI.sel);
  if (!l) return '<div class="lo-hint">' + ic('info') + '<span>' + esc(t('lo_p')) + '</span></div>';
  const C = locCounts(), own = S.binders.filter(b => b.location_id === l.id).sort((a, b) => naturalCmp(a.speaking_code, b.speaking_code));
  const L = locLevels(), next = l.level + 1 < Math.min(L.length, LOC_MAX_DEPTH) ? locLevelName(l.level + 1) : '';   // levels come from the settings (Livelli…)
  const leaves = locDescendants(l.id).map(locById).filter(x => x && !locChildren(x.id).length);
  const selN = printQueueBinders ? S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))).length : 0;
  let qr = ''; try { qr = DMQR.svg(l.short_url, {ecl:S.settings.qrEcc || 'M', quiet:2, fg:'#0F172A'}); } catch(e){}
  return '<div class="lo-crumbs">' + locPath(l.id).map((p, i, a) => i < a.length - 1 ? '<button type="button" class="lo-crumb" data-a="lo-sel" data-id="' + esc(p.id) + '">' + esc(p.seg) + '</button>' + ic('chevr', 'lo-sep') : '<span class="lo-crumb cur">' + esc(p.seg) + '</span>').join('') + '</div>' +
    '<div class="lo-head"><div class="lo-qr" title="' + esc(l.short_url) + '">' + qr + '<span class="mono">' + esc(l.short_code) + '</span></div>' +
      '<div class="lo-head-tx"><div class="lo-kind">' + esc(locKind(l)) + '</div><div class="lo-code mono" id="lo-code">' + esc(l.code) + '</div><div class="lo-path">' + esc(locPathText(l.id)) + '</div>' +
      '<div class="lo-stats"><span class="badge">' + esc(laInBox(C.own.get(l.id) || 0)) + '</span>' + (C.all.get(l.id) !== (C.own.get(l.id) || 0) ? '<span class="badge">' + esc(t('lo_binders_sub', {n:C.all.get(l.id) || 0})) + '</span>' : '') + (locChildren(l.id).length ? '<span class="badge">' + esc(t('lo_children', {n:locChildren(l.id).length})) + '</span>' : '') + '</div></div></div>' +
    '<div class="lo-acts">' +
      (next ? '<button class="btn btn-sm" data-a="lo-add" data-id="' + esc(l.id) + '" id="lo-add-child">' + ic('plus') + esc(t('lo_add_child', {l:next.toLowerCase()})) + '</button><button class="btn btn-sm" data-a="lo-bulk" data-id="' + esc(l.id) + '" id="lo-bulk">' + ic('layers') + esc(t('lo_bulk')) + '</button>' : '') +
      '<button class="btn btn-sm" data-a="lo-print" data-id="' + esc(l.id) + '" id="lo-print-one">' + ic('printer') + esc(t('lo_print_one')) + '</button>' +
      (leaves.length ? '<button class="btn btn-sm" data-a="lo-print-leaves" data-id="' + esc(l.id) + '" id="lo-print-leaves">' + ic('printer') + esc(t('lo_print_leaves', {n:leaves.length})) + '</button>' : '') +
      (locChildren(l.id).length ? '<button class="btn btn-sm" data-a="lo-print-tree" data-id="' + esc(l.id) + '" id="lo-print-tree">' + ic('printer') + esc(t('lo_print_tree', {n:locDescendants(l.id).length + 1})) + '</button>' : '') +
      (typeof tapeOpen === 'function' ? '<button class="btn btn-sm" data-a="tp-open" data-src="strip" data-id="' + esc(l.id) + '" id="lo-strip">' + ic('tag') + esc(t('lo_strip')) + '</button>' : '') +
      '<button class="btn btn-sm btn-dark" data-a="lo-assoc-here" data-id="' + esc(l.id) + '" id="lo-assoc-here">' + ic('scan') + esc(t('lo_assoc_here')) + '</button>' +
      '<span class="tb-sp"></span><button class="btn btn-sm" data-a="lo-move" data-id="' + esc(l.id) + '">' + ic('move') + esc(t('lo_move')) + '</button><button class="btn btn-sm btn-danger" data-a="lo-del" data-id="' + esc(l.id) + '" id="lo-del">' + ic('trash') + esc(t('lo_del')) + '</button></div>' +
    '<div class="grid g2 lo-form">' +
      '<div class="field"><label for="lo-f-seg">' + esc(t('lo_seg')) + '</label><input class="inp mono" id="lo-f-seg" data-lo-f="seg" value="' + esc(l.seg) + '" maxlength="16" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="lo-f-name">' + esc(t('lo_name')) + '</label><input class="inp" id="lo-f-name" data-lo-f="name" value="' + esc(l.name) + '" placeholder="' + esc(t('lo_name_ph')) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="lo-f-kind">' + esc(t('lo_kind')) + '</label><input class="inp" id="lo-f-kind" data-lo-f="kind" value="' + esc(l.kind) + '" placeholder="' + esc(locLevelName(l.level)) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="lo-f-notes">' + esc(t('lo_notes')) + '</label><input class="inp" id="lo-f-notes" data-lo-f="notes" value="' + esc(l.notes) + '" autocomplete="off"></div></div>' +
    '<div class="lo-bh"><h3>' + esc(t('lo_binders_here')) + ' <span class="muted">(' + own.length + ')</span></h3>' +
      (selN ? '<button class="btn btn-sm btn-primary" data-a="lo-assign-sel" data-id="' + esc(l.id) + '" id="lo-assign-sel">' + ic('archive') + esc(t('lo_assign_sel', {n:selN})) + '</button>' : '') + '</div>' +
    (own.length ? '<div class="lo-blist">' + own.slice(0, 300).map(b => '<div class="lo-b"><span class="code-chip"><span class="bar" style="background:' + esc(b.color_hex) + '"></span>' + esc(b.speaking_code) + '</span><span class="lo-b-tx"><b>' + esc(b.company_name) + '</b><span class="muted">' + esc(b.binder_title) + '</span></span>' +
      '<button class="icon-btn" data-a="locate" data-id="' + esc(b.id) + '" title="' + esc(t('act_locate')) + '">' + ic('pin') + '</button><button class="icon-btn" data-a="edit" data-id="' + esc(b.id) + '" title="' + esc(t('act_edit')) + '">' + ic('pencil') + '</button>' +
      '<button class="btn btn-sm" data-a="lo-unassign" data-id="' + esc(b.id) + '">' + esc(t('lo_remove')) + '</button></div>').join('') + (own.length > 300 ? '<div class="muted small">+' + (own.length - 300) + '</div>' : '') + '</div>' : '<div class="muted small lo-none">' + esc(t('lo_none_here')) + '</div>');
}
function locPanelHTML(){
  const n = locArr().length, L = locLevels();
  const tools = '<div class="toolbar lo-tools"><div class="search">' + ic('search') + '<input class="inp" type="search" id="lo-q" value="' + esc(LUI.q) + '" placeholder="' + esc(t('lo_search_ph')) + '" aria-label="search"></div>' +
    '<button class="btn btn-primary" data-a="lo-add-root" id="lo-add-root">' + ic('plus') + esc(t('lo_new_root', {l:L[0].name.toLowerCase()})) + '</button>' +
    '<button class="btn" data-a="lo-bulk" data-id="" id="lo-bulk-root">' + ic('layers') + esc(t('lo_bulk')) + '</button>' +
    '<button class="btn" data-a="lo-levels" id="lo-levels">' + ic('sliders') + esc(t('lo_levels')) + '</button>' +
    '<button class="btn btn-dark" data-a="lo-assoc" id="lo-assoc-btn"' + (n ? '' : ' disabled') + '>' + ic('scan') + esc(t('lo_assoc')) + '</button></div>';
  if (!n) return tools + '<div class="info-intro">' + ic('box') + '<span>' + esc(t('lo_p')) + '</span></div>' +
    '<div class="empty lo-empty">' + ic('warehouse', 'lg') + '<h3>' + esc(t('lo_empty_h')) + '</h3><p>' + esc(t('lo_empty_p')) + '</p><div class="row" style="justify-content:center"><button class="btn btn-primary" data-a="lo-bulk" data-id="" id="lo-empty-bulk">' + ic('layers') + esc(t('lo_empty_btn')) + '</button></div></div>';
  return tools + (LUI.assoc.on ? '<div id="lo-assoc-box">' + locAssocHTML() + '</div>' : '<div class="info-intro">' + ic('box') + '<span>' + esc(t('lo_p')) + '</span></div>') +
    '<div class="toolbar lo-selbar"><span class="small muted">' + esc(t('lo_count', {n})) + '</span><span class="tb-sp"></span>' +
      '<button class="btn btn-sm" data-a="lo-print-all" id="lo-print-all">' + ic('printer') + esc(t('lo_print_all', {n})) + '</button>' +
      '<button class="btn btn-sm" data-a="lo-sel-leaves">' + ic('check') + esc(t('lo_sel_leaves', {l:L[L.length - 1].name})) + '</button><button class="btn btn-sm" data-a="lo-sel-none">' + esc(t('lo_sel_none')) + '</button>' +
      '<button class="btn btn-sm btn-primary" data-a="lo-print-sel" id="lo-print-sel"' + (LUI.checked.size ? '' : ' disabled') + '>' + ic('printer') + esc(t('lo_print_sel')) + ' <span class="qr-n">' + LUI.checked.size + '</span></button></div>' +
    '<div class="lo-grid"><div class="lo-tree" id="lo-tree" role="tree">' + locTreeHTML() + '</div><div class="lo-detail" id="lo-detail">' + locDetailHTML() + '</div></div>';
}
function locRender(){
  if (S.view !== 'info' || infoTab() !== 'loc') return;
  const p = $('#info-panel'); if (!p) return;
  const y = window.scrollY, tr = $('#lo-tree'), ty = tr ? tr.scrollTop : 0, f = document.activeElement && document.activeElement.id;
  p.innerHTML = locPanelHTML();
  const tr2 = $('#lo-tree'); if (tr2) tr2.scrollTop = ty;
  window.scrollTo(0, y);
  const n = $('.info-tabs [data-v="loc"] .it-n'); if (n) n.textContent = locArr().length;
  if (f === 'lo-q' || f === 'la-scan'){ const el = $('#' + f); if (el){ el.focus(); if (f === 'lo-q') el.setSelectionRange(el.value.length, el.value.length); } }
  locCamAttach();
}
function locRenderTree(){ const tr = $('#lo-tree'); if (tr){ const y = tr.scrollTop; tr.innerHTML = locTreeHTML(); tr.scrollTop = y; } }
function locSelect(id){
  LUI.sel = id; locPath(id).slice(0, -1).forEach(p => LUI.open.add(p.id));
  const d = $('#lo-detail'); if (d){ d.innerHTML = locDetailHTML(); locRenderTree(); } else locRender();
}

/* ---------------- dialogs ---------------- */
/** "1 Magazzino → 3 Armadio in ciascuno (3 in tutto) → …" */
function locBulkSummary(rows){
  const parts = []; let mult = 1;
  for (let i = 0; i < rows.length; i++){ const r = rows[i]; if (!(r.n > 0)) break; mult *= r.n; parts.push(i ? t('lo_bk_sum_each', {n:r.n, l:r.name, tot:mult}) : t('lo_bk_sum_first', {n:r.n, l:r.name})); }
  return parts.join(' → ');
}
function locBulkRowsFor(parent){
  const L = locLevels(), start = parent ? parent.level + 1 : 0, rows = [];
  for (let lv = start; lv < Math.max(L.length, start + 1) && lv < LOC_MAX_DEPTH; lv++){
    const leaf = lv >= L.length - 1;
    rows.push({level:lv, name:locLevelName(lv), prefix:locLevelPrefix(lv), n:lv === start ? (leaf ? 10 : 1) : 0, from:1, pad:leaf ? 2 : 1});
  }
  return rows;
}
/** Ready-made structures for the rows of the dialog (only the levels that exist from here down). */
function locBulkPresets(rows){
  // always down to the deepest level (the boxes): small = one of each level and 10 boxes, then bigger warehouses
  const L = rows.length, out = []; if (!L) return out;
  const mk = (top, mid, leaf) => rows.map((r, i) => i === L - 1 ? leaf : i === 0 ? top : mid);
  const P = L === 1 ? [[10], [20], [50]] : [mk(1, 1, 10), mk(1, 2, 10), mk(1, 3, 20)];
  P.forEach(ns => { if (locBulkCount(rows.map((r, i) => ({n:ns[i]}))) > LOC_BULK_MAX) return; out.push({ns, label:ns.map((n, i) => n + ' ' + rows[i].name.toLowerCase()).join(' › ')}); });
  return out;
}
function locBulkPreview(){
  const B = LUI.bulk; if (!B) return;
  const total = locBulkCount(B.rows), ex = [];
  const parent = B.parent ? locById(B.parent) : null;
  const pre = parent ? parent.code + '-' : '';
  let path = [];
  for (const r of B.rows){ if (!(r.n > 0)) break; path.push(locSegClean(r.prefix) + String(r.from || 1).padStart(r.pad || 1, '0')); }
  if (path.length) ex.push(pre + path.join('-'));
  if (path.length){ const last = B.rows[path.length - 1]; const p2 = path.slice(0, -1).concat(locSegClean(last.prefix) + String((last.from || 1) + Math.max(0, last.n - 1)).padStart(last.pad || 1, '0')); if (p2.join('-') !== path.join('-')) ex.push(pre + p2.join('-')); }
  const el = $('#lo-bulk-prev');
  if (el) el.innerHTML = total > LOC_BULK_MAX ? '<div class="danger-box small">' + ic('alert') + '<div>' + esc(t('lo_bulk_max', {n:LOC_BULK_MAX})) + '</div></div>'
    : total ? '<div class="info-box small">' + ic('info') + '<div>' + esc(t('lo_bulk_prev', {n:total, e:ex.join(' … ')})) + '<div class="lo-bk-sum" id="lo-bk-sum">' + esc(locBulkSummary(B.rows)) + '</div></div></div>' : '<div class="hint">' + esc(t('lo_bulk_none')) + '</div>';
  const ok = topModal() && topModal().querySelector('.modal-f .btn-primary'); if (ok) ok.disabled = !total || total > LOC_BULK_MAX;
}
function locOpenBulk(parentId){
  const parent = parentId ? locById(parentId) : null;
  LUI.bulk = {parent:parent ? parent.id : '', rows:locBulkRowsFor(parent)};
  const B = LUI.bulk;
  // v12.1: a plain explanation with an example, the meaning of each column and ready-made structures (Dave: "deve essere spiegato meglio")
  const presets = locBulkPresets(B.rows).map((p, k) => '<button type="button" class="btn btn-sm" data-a="lo-bk-preset" data-k="' + k + '">' + esc(p.label) + '</button>').join('');
  const body = '<div class="stack" id="lo-bulk-form"><div class="info-box small lo-bk-explain">' + ic('info') + '<div><b>' + esc(t('lo_bk_how_h')) + '</b><div>' + esc(t('lo_bk_how')) + '</div>' +
      '<ul class="lo-bk-cols"><li><b>' + esc(t('lo_bulk_n')) + '</b>: ' + esc(t('lo_bk_c_n')) + '</li><li><b>' + esc(t('lo_bulk_prefix')) + '</b>: ' + esc(t('lo_bk_c_prefix')) + '</li><li><b>' + esc(t('lo_bulk_from')) + '</b>: ' + esc(t('lo_bk_c_from')) + '</li><li><b>' + esc(t('lo_bulk_pad')) + '</b>: ' + esc(t('lo_bk_c_pad')) + '</li></ul></div></div>' +
    (presets ? '<div class="row lo-bk-presets" style="gap:6px;flex-wrap:wrap"><span class="small muted">' + esc(t('lo_bk_presets')) + '</span>' + presets + '</div>' : '') +
    '<div class="hint">' + esc(t('lo_bulk_hint')) + '</div><div class="lo-bk">' +
    '<div class="lo-bk-h"><span>' + esc(t('lo_kind')) + '</span><span>' + esc(t('lo_bulk_n')) + '</span><span>' + esc(t('lo_bulk_prefix')) + '</span><span>' + esc(t('lo_bulk_from')) + '</span><span>' + esc(t('lo_bulk_pad')) + '</span></div>' +
    B.rows.map((r, i) => '<div class="lo-bk-r"><b>' + esc(r.name) + (i ? ' <span class="muted tiny">' + esc(t('lo_bulk_each')) + '</span>' : '') + '</b>' +
      '<input class="inp mono" type="number" min="0" max="999" data-lo-bk="n" data-i="' + i + '" value="' + r.n + '" aria-label="' + esc(t('lo_bulk_n') + ' ' + r.name) + '">' +
      '<input class="inp mono" data-lo-bk="prefix" data-i="' + i + '" value="' + esc(r.prefix) + '" maxlength="8" aria-label="' + esc(t('lo_bulk_prefix')) + '">' +
      '<input class="inp mono" type="number" min="0" max="9999" data-lo-bk="from" data-i="' + i + '" value="' + r.from + '" aria-label="' + esc(t('lo_bulk_from')) + '">' +
      '<input class="inp mono" type="number" min="1" max="4" data-lo-bk="pad" data-i="' + i + '" value="' + r.pad + '" aria-label="' + esc(t('lo_bulk_pad')) + '"></div>').join('') +
    '</div><div id="lo-bulk-prev"></div></div>';
  openModal({title:parent ? t('lo_bulk_t', {c:parent.code}) : t('lo_bulk_root_t'), body, size:'lg',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('lo_bulk_ok'), cls:'btn btn-primary', icon:'layers', fn:() => {
      const total = locBulkCount(B.rows); if (!total || total > LOC_BULK_MAX) return;
      undoPoint();
      const made = locBulkCreate(B.parent, B.rows);
      const leafIds = made.filter(x => !locChildren(x.id).length).map(x => x.id);
      logAct('location.bulk_create', parent ? {type:'location', id:parent.id, code:parent.code} : null, 'Create in serie ' + made.length + ' ubicazioni' + (parent ? ' in ' + parent.code : '') + (made.length ? ' (' + made[0].code + ' … ' + made[made.length - 1].code + ')' : ''),
        {count:made.length, parent:parent ? parent.code : '', rows:B.rows.filter(r => r.n > 0).map(r => ({level:r.level, n:r.n, prefix:r.prefix, from:r.from, pad:r.pad})), codes:made.slice(0, 200).map(x => x.code)});
      commit(); closeModal(true);
      if (parent){ LUI.open.add(parent.id); LUI.sel = parent.id; } else if (made[0]){ LUI.sel = made[0].id; }
      made.forEach(x => { if (locChildren(x.id).length && x.level < 2) LUI.open.add(x.id); });
      LUI.checked = new Set(leafIds);
      locRender();
      toast(t('lo_created', {n:made.length}), 'ok', 9000, leafIds.length ? {label:t('lo_bulk_print'), fn:() => locPrintStart(leafIds)} : null);
    }}],
    onMount:() => locBulkPreview(), onClose:() => { LUI.bulk = null; }});
}
function locOpenLevels(){
  LUI.lv = locLevels().map(x => ({name:x.name, prefix:x.prefix}));
  const draw = () => { const b = $('#lo-lv'); if (!b) return; b.innerHTML = LUI.lv.map((x, i) => '<div class="lo-lv-r"><span class="lo-lv-n">' + (i + 1) + '</span><input class="inp" data-lo-lv="name" data-i="' + i + '" value="' + esc(x.name) + '" aria-label="' + esc(t('lo_lv_name')) + '"><input class="inp mono" data-lo-lv="prefix" data-i="' + i + '" value="' + esc(x.prefix) + '" maxlength="8" aria-label="' + esc(t('lo_lv_prefix')) + '">' +
    '<button type="button" class="icon-btn danger" data-a="lo-lv-del" data-i="' + i + '"' + (LUI.lv.length < 2 ? ' disabled' : '') + ' aria-label="' + esc(t('lo_del')) + '">' + ic('trash') + '</button></div>').join('') +
    '<div class="row"><button type="button" class="btn btn-sm" data-a="lo-lv-add"' + (LUI.lv.length >= LOC_MAX_DEPTH ? ' disabled' : '') + '>' + ic('plus') + esc(t('lo_lv_add')) + '</button><button type="button" class="btn btn-sm" data-a="lo-lv-reset">' + ic('refresh') + esc(t('lo_lv_reset')) + '</button></div>'; };
  locOpenLevels.draw = draw;
  openModal({title:t('lo_lv_t'), size:'lg', body:'<div class="stack"><p class="hint">' + esc(t('lo_lv_p')) + '</p><div class="lo-lv-h"><span></span><span>' + esc(t('lo_lv_name')) + '</span><span>' + esc(t('lo_lv_prefix')) + '</span><span></span></div><div class="stack" id="lo-lv"></div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'save', fn:() => {
      const L = LUI.lv.map((x, i) => ({name:String(x.name || '').trim() || t('lo_lv_n', {n:i + 1}), prefix:locSegClean(x.prefix) || 'L' + (i + 1)}));
      const before = JSON.stringify(S.settings.locLevels || null);
      const def = locLevels({}).map(x => x.name + '|' + x.prefix).join(), now = L.map(x => x.name + '|' + x.prefix).join();
      S.settings.locLevels = now === def ? [] : L; S.settings.locLevelsAt = nowISO();
      if (JSON.stringify(S.settings.locLevels) !== before) logAct('location.levels', null, 'Livelli dell\'archivio: ' + L.map(x => x.name + ' (' + x.prefix + ')').join(' › '), {levels:L});
      commit({dirty:false}); closeModal(true); locRender(); toast(t('lo_lv_saved'));
    }}],
    onMount:draw, onClose:() => { LUI.lv = null; }});
}
function locOpenMove(id){
  const l = locById(id); if (!l) return;
  const skip = locSubtreeSet(id);
  openModal({title:t('lo_move_t', {c:l.code}), body:'<div class="field"><label for="lo-move-to">' + esc(t('lo_move_to')) + '</label><select class="inp" id="lo-move-to"><option value="">' + esc(t('lo_top')) + '</option>' + locOptionsHTML(l.parent_id, {skip}) + '</select></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('lo_move').replace('…', ''), cls:'btn btn-primary', icon:'move', fn:() => { const v = $('#lo-move-to').value; closeModal(true); if (v !== l.parent_id){ undoPoint(); locMove(id, v); if (v) LUI.open.add(v); locRender(); } }}]});
}
/** Archive: put the ticked binders into a location (or remove it). */
function locOpenAssign(ids){
  const list = S.binders.filter(b => ids.includes(b.id)); if (!list.length) return;
  const pick = {id:''};
  openModal({title:t('lo_assign_t', {n:list.length}), body:'<div class="stack"><div class="field"><label for="lo-as-q">' + esc(t('lo_pick')) + '</label><input class="inp mono" id="lo-as-q" placeholder="' + esc(t('lo_pick_ph')) + '" autocomplete="off"><div class="hint" id="lo-as-path"></div></div>' +
      '<div class="small muted">' + list.slice(0, 12).map(b => esc(b.speaking_code)).join(', ') + (list.length > 12 ? ' …' : '') + '</div></div>',
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('lo_clear_sel'), cls:'btn', icon:'x', fn:() => dmBulkGuard(list, t('bg_w_unloc'), () => { undoPoint(); const m = locAssign(list, '', {via:'bulk'}); closeModal(true); renderView(); undoToast(t('lo_unassigned', {n:m.length})); })},
      {label:t('lo_assign_go'), cls:'btn btn-primary', icon:'box', fn:() => { const l = locById(pick.id) || locFindTyped(($('#lo-as-q') || {}).value); if (!l){ toast(t('lo_nf'), 'warn'); return; } dmBulkGuard(list, t('bg_w_loc'), () => { undoPoint(); const m = locAssign(list, l.id, {via:'bulk'}); closeModal(true); renderView(); undoToast(t('lo_assigned', {n:m.length, c:l.code})); }); }}],
    onMount:() => { const i = $('#lo-as-q'); taAttach(i, {source:locTaSource, top:8, max:12, minWidth:360, onPick:(it) => { pick.id = it.id; const p = $('#lo-as-path'); if (p) p.textContent = locPathText(it.id); }}); i.addEventListener('input', () => { const l = locFindTyped(i.value); pick.id = l ? l.id : ''; const p = $('#lo-as-path'); if (p) p.textContent = l ? locPathText(l.id) : ''; }); }});
}

/* ---------------- association mode (desktop) ---------------- */
function locAssocHTML(){
  const A = LUI.assoc, l = locById(A.loc), C = locCounts();
  return '<div class="la-card' + (l ? ' on' : '') + '" id="la-card"><div class="la-top"><div class="la-ic">' + ic('scan') + '</div><div class="la-st">' +
      (l ? '<div class="la-cap">' + esc(t('la_active')) + ' · ' + esc(locKind(l)) + '</div><div class="la-code mono" id="la-code">' + esc(l.code) + '</div><div class="la-path">' + esc(locPathText(l.id)) + ' · <b id="la-n">' + esc(laInBox(C.own.get(l.id) || 0)) + '</b></div>'
         : '<div class="la-cap">' + esc(t('la_h')) + '</div><div class="la-code la-wait">' + esc(t('la_none')) + '</div><div class="la-path">' + esc(t('la_p')) + '</div>') + '</div>' +
      '<button class="btn btn-sm" data-a="la-cam" id="la-cam-btn">' + ic('camera') + esc(A.cam ? t('la_cam_off') : t('la_cam')) + '</button><button class="btn btn-sm btn-danger" data-a="la-stop" id="la-stop">' + ic('stop') + esc(t('la_stop')) + '</button></div>' +
    '<div class="la-in"><input class="inp mono" id="la-scan" placeholder="' + esc(t('la_scan_ph')) + '" autocomplete="off" spellcheck="false" aria-label="' + esc(t('la_scan_ph')) + '"><span class="hint">' + esc(t('la_scan_hint')) + '</span></div>' +
    '<div class="la-video' + (A.cam ? '' : ' hidden') + '" id="la-video-box"></div>' +
    (A.msg ? '<div class="la-msg ' + esc(A.msg.kind) + '" id="la-msg" role="status">' + ic(A.msg.kind === 'ok' ? 'check' : A.msg.kind === 'switch' ? 'box' : 'alert') + '<span>' + esc(A.msg.text) + '</span></div>' : '<div class="la-msg idle" id="la-msg" role="status"></div>') +
    (A.list.length ? '<div class="la-list"><div class="la-lh">' + esc(t('la_recent')) + ' <span class="muted">· ' + esc(t('la_session', {n:A.n})) + '</span></div>' + A.list.slice(0, 8).map((x, i) => '<div class="la-row' + (x.undone ? ' undone' : '') + '"><span class="tiny muted mono">' + esc(fmtDate(x.at, true).split(' ').pop()) + '</span><span class="mono"><b>' + esc(x.code) + '</b></span><span class="la-r-tx">' + esc(x.company) + '</span><span class="loc">' + esc(x.toCode) + '</span><span class="tiny muted">' + esc(x.fromCode ? t('la_from', {c:x.fromCode}) : '') + '</span>' +
      (x.undone ? '' : '<button class="btn btn-sm" data-a="la-undo" data-i="' + i + '">' + ic('undo') + esc(t('la_undo')) + '</button>') + '</div>').join('') + '</div>' : '') + '</div>';
}
function locAssocRender(){ const b = $('#lo-assoc-box'); if (b){ b.innerHTML = locAssocHTML(); locCamAttach(); const i = $('#la-scan'); if (i) i.focus(); } else locRender(); }
function locAssocStart(id){
  LUI.assoc.on = true; if (id) LUI.assoc.loc = id;
  if (S.view !== 'info' || infoTab() !== 'loc'){ S.view = 'info'; S.infoTab = 'loc'; savePrefs(); renderAll(); } else locRender();
  setTimeout(() => { const i = $('#la-scan'); if (i) i.focus(); }, 40);
}
function locAssocStop(){ locCamStop(); LUI.assoc = {on:false, loc:'', list:[], n:0, cam:null}; locRender(); }
/** One scan (scanner, webcam or typed). Returns {kind:'switch'|'ok'|'dup'|'need'|'unknown', …}. */
function locAssocInput(text, via){
  const A = LUI.assoc, p = assocParseCode(text), raw = String(text || '').trim();
  if (!raw) return {kind:'empty'};
  let loc = null, bin = null;
  const ci = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  if (p.type === 'location') loc = locArr().find(l => l.short_code === p.code) || locArr().find(l => ci(l.short_code, p.code));
  else if (p.type === 'binder') bin = S.binders.find(b => b.short_code === p.code) || S.binders.find(b => ci(b.short_code, p.code));
  else if (p.type === 'text'){ bin = S.binders.find(b => b.speaking_code === p.code); if (!bin) loc = locArr().find(l => l.code.toUpperCase() === p.code); }
  let r;
  if (loc){ A.loc = loc.id; r = {kind:'switch', loc}; A.msg = {kind:'switch', text:t('la_switched', {c:loc.code})}; locBeep('switch'); }
  else if (bin){
    const to = locById(A.loc);
    if (!to){ r = {kind:'need'}; A.msg = {kind:'warn', text:t('la_need_loc')}; locBeep(false); }
    else if (bin.location_id === to.id){ r = {kind:'dup', b:bin}; A.msg = {kind:'warn', text:t('la_dup', {b:bin.speaking_code, c:to.code})}; locBeep(false); }
    else {
      const m = locAssign([bin], to.id, {via:via || 'scanner'})[0];
      A.n++; A.list.unshift({id:bin.id, code:bin.speaking_code, company:bin.company_name, to:to.id, toCode:to.code, from:m.from, fromCode:m.fromCode, at:nowISO()}); A.list = A.list.slice(0, 50);
      r = {kind:'ok', b:bin, loc:to}; A.msg = {kind:'ok', text:t('la_put', {b:bin.speaking_code, c:to.code})}; locBeep(true);
    }
  } else { r = {kind:'unknown'}; A.msg = {kind:'err', text:t('la_unknown', {v:raw.slice(0, 60)})}; locBeep(false); }
  if (navigator.vibrate && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) try { navigator.vibrate(r.kind === 'ok' ? 40 : r.kind === 'switch' ? [30, 40, 30] : 160); } catch(e){}
  locAssocRender(); locRenderTree();
  return r;
}
function locAssocUndo(i){
  const x = LUI.assoc.list[i]; if (!x || x.undone) return;
  const b = S.binders.find(y => y.id === x.id); if (!b) return;
  locAssign([b], x.from && locById(x.from) ? x.from : '', {via:'undo'});
  x.undone = true; LUI.assoc.n = Math.max(0, LUI.assoc.n - 1);
  LUI.assoc.msg = {kind:'warn', text:t('la_undone', {b:x.code})};
  locAssocRender(); locRenderTree();
}
function locCamAttach(){
  const A = LUI.assoc, box = $('#la-video-box'); if (!A.cam || !box) return;
  A.cam.attach(box);
}
async function locCamToggle(){
  const A = LUI.assoc;
  if (A.cam){ locCamStop(); locAssocRender(); return; }
  if (typeof DMCamScanner !== 'function') return;
  const cam = new DMCamScanner({onCode:(txt) => (typeof onTagScanned === 'function' && onTagScanned(txt, 'qr')) || locAssocInput(txt, 'camera')});   // v12: one pipeline (11e-nfc.js)
  A.cam = cam; locAssocRender();
  try { await cam.start(); locCamAttach(); }
  catch(e){ A.cam = null; A.msg = {kind:'err', text:t('la_cam_err', {m:e && e.message || e})}; locAssocRender(); }
}
function locCamStop(){ const A = LUI.assoc; if (A.cam){ try { A.cam.stop(); } catch(e){} A.cam = null; } }

/* ---------------- print: label template 'loc', kind 'L' ---------------- */
LABEL_TEMPLATES.push({id:'loc', name:'cm_loc', desc:'cm_loc_d', kinds:['L'], recommended:[], full:true});
LABEL_KIND_NAMES.L = 'cm_loc';
function locPrintIds(){ const ids = Array.isArray(S.print.locIds) ? S.print.locIds : []; return ids.filter(id => locById(id)); }
function locPrintQueue(){ return locPrintIds().map(locById).sort((a, b) => naturalCmp(a.code, b.code)); }
/** Pseudo-binder handed to the print engine (qrBox reads short_url / short_code). */
function locPrintItem(l){ return {_loc:l, id:'loc:' + l.id, short_code:l.short_code, short_url:l.short_url, speaking_code:l.code, color_hex:'#0F172A', company_name:locPathText(l.id), binder_title:'', contents_items:[], tags:'', updated_at:l.updated_at}; }
function locPrintStart(ids){
  if (S.print.contentMode !== 'loc') S.print.locPrevMode = S.print.contentMode;
  S.print.contentMode = 'loc'; S.print.locIds = ids.slice(); S.print.pages = Object.assign({}, S.print.pages || {}, {sel:'all', order:null, sig:''});
  if (S.print.tape) S.print.tape.on = false;   // v12.3: these labels are printed on A4 sheets
  savePrefs(); S.view = 'print'; renderAll();
}
function renderLocLabel(b, g, P){
  const l = b && b._loc ? b._loc : (locPrintQueue()[0] || locArr()[0] || {code:'MAG1-A1-S1-R1-B01', seg:'B01', level:4, name:'', kind:'', short_code:'dm26LAbCdEfGh', short_url:shortUrl('dm26LAbCdEfGh'), id:''});
  const it = b && b._loc ? b : locPrintItem(l);
  const w = g.w, h = g.h, pad = clamp(+P.padding || 0, 0, Math.min(w, h) / 5);
  const x0 = pad, y0 = pad, iw = Math.max(5, w - 2 * pad), ih = Math.max(5, h - 2 * pad);
  const radius = g.radius ? 'border-radius:' + MM(g.radius) + ';' : '';
  const kind = String(locKind(l) || '').toUpperCase(), seg = l.seg || l.code, code = l.code, path = l.id ? locPath(l.id).slice(0, -1).map(locTitle).join(' › ') : '';
  const wide = iw >= ih * 1.2, live = P.qrMode !== 'none';
  let html = '<div class="lab lab-loc" style="' + radius + '">';
  const band = clamp(ih * 0.085, 2.4, 7), fb = band * 0.56;
  html += '<div style="position:absolute;left:0;top:0;right:0;height:' + MM(band + pad * 0.6) + ';background:#000;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 ' + MM(pad + 0.6) + ';padding-top:' + MM(pad * 0.6) + ';box-sizing:border-box;font-size:' + MM(fb) + ';font-weight:800;letter-spacing:.08em;white-space:nowrap;overflow:hidden">' +
    '<span>' + esc(t('l_loc_cap')) + '</span><span>' + esc(kind) + '</span></div>';
  const top = y0 + band + Math.max(1, pad * 0.4), avH = ih - band - Math.max(1, pad * 0.4);
  let q = 0, qx, qy, tx, ty, tw, th;
  if (wide){ q = live ? Math.min(avH, iw * 0.46) : 0; qx = x0 + iw - q; qy = top + (avH - q) / 2; tx = x0; ty = top; tw = iw - q - (q ? Math.max(1.5, pad * 0.6) : 0); th = avH; }
  else { q = live ? Math.min(iw * 0.82, avH * 0.5) : 0; qx = x0 + (iw - q) / 2; tx = x0; tw = iw; ty = top; th = avH - q - (q ? 1.2 : 0); qy = top + th + (q ? 1.2 : 0); }
  if (q) html += qrBox(it, qx, qy, q, P);
  const fSeg = fitLine('<span class="lmono" style="font-weight:800">' + esc(seg) + '</span>', tw, Math.min(th * (wide ? 0.42 : 0.4), 30), 2.2, 'lmono').fs;
  const fCode = fitLine('<span class="lmono" style="font-weight:800">' + esc(code) + '</span>', tw, Math.min(fSeg * 0.36, 7), 1.5, 'lmono').fs;
  const remain = Math.max(2, th - fSeg * 1.05 - fCode * 1.3 - (l.name ? fCode * 1.4 : 0));
  const fPath = path ? fitWrap(path, tw, Math.min(remain, fCode * 3.4), Math.min(fCode * 0.95, 4.2), 1.3, 'ln', 1.2).fs : 0;
  LM.L = {q, code:fSeg, minText:Math.min(fCode, fPath || 99, P.showQrUrl && q ? Math.max(1.3, q * 0.07) : 99)};
  html += '<div style="position:absolute;left:' + MM(tx) + ';top:' + MM(ty) + ';width:' + MM(tw) + ';height:' + MM(th) + ';display:flex;flex-direction:column;justify-content:' + (wide ? 'center' : 'flex-start') + ';overflow:hidden;color:#000;' + (wide ? '' : 'text-align:center;align-items:center;') + '">' +
    '<div class="lmono" style="font-size:' + MM(fSeg) + ';line-height:1;font-weight:800;letter-spacing:-.02em;white-space:nowrap">' + esc(seg) + '</div>' +
    '<div class="lmono" style="font-size:' + MM(fCode) + ';line-height:1.2;font-weight:800;margin-top:' + MM(fCode * 0.2) + ';white-space:nowrap">' + esc(code) + '</div>' +
    (l.name ? '<div class="ln" style="font-size:' + MM(fCode) + ';line-height:1.2;font-weight:700;margin-top:' + MM(fCode * 0.2) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">' + esc(l.name) + '</div>' : '') +
    (path ? '<div class="ln" style="font-size:' + MM(fPath) + ';line-height:1.2;margin-top:' + MM(fPath * 0.35) + ';color:#222">' + esc(path) + '</div>' : '') + '</div>';
  if (q && P.showQrUrl){ const fu = Math.max(1.3, Math.min(q * 0.075, 3)); if (wide || qy + q + fu * 1.3 <= y0 + ih + pad * 0.5) html += qrUrlText(it, qx, Math.min(qy + q, y0 + ih - fu * 1.25), q, fu); }
  return html + '</div>';
}

/* ---------------- manifest (04-ui exportManifest / mergeManifest) ---------------- */
function locManifestRows(){ return locArr().filter(l => LOC_SC_RE.test(l.short_code || '')).slice().sort((a, b) => naturalCmp(a.code, b.code)).map(l => [l.short_code, l.short_url || shortUrl(l.short_code), locDest(l), locManifestTags(l)]); }

/* ---------------- sync: shared settings subset (06f syncBuildPackage / syncApply, 06g srvSettingsSubset) ---------------- */
function locSyncSubset(){ return {locLevels:clone(Array.isArray(S.settings.locLevels) ? S.settings.locLevels : []), locLevelsAt:S.settings.locLevelsAt || ''}; }
function locSyncApply(ss){
  if (!ss || !Array.isArray(ss.locLevels) || !ss.locLevelsAt) return;
  if (syTs(ss.locLevelsAt) <= syTs(S.settings.locLevelsAt || '')) return;
  S.settings.locLevels = ss.locLevels.filter(x => x && typeof x === 'object').slice(0, LOC_MAX_DEPTH).map(x => ({name:String(x.name || '').slice(0, 40), prefix:locSegClean(x.prefix)}));
  S.settings.locLevelsAt = ss.locLevelsAt;
}

/* ---------------- archive, editor, "Dov'è?" ---------------- */
function locFilterSelectHTML(){
  if (!locArr().length) return '';
  return '<select class="inp lo-fsel" data-lo-filter="1" aria-label="' + esc(t('lo_all')) + '"><option value="">' + esc(t('lo_all')) + '</option><option value="__none"' + (UI.fLoc === '__none' ? ' selected' : '') + '>' + esc(t('lo_without')) + '</option>' + locOptionsHTML(UI.fLoc) + '</select>';
}
function locEditorHTML(d){
  const l = d.location_id ? locById(d.location_id) : null;
  return '<div class="field lo-ed" id="lo-ed"><label for="ed-locpick">' + ic('box') + esc(t('lo_ed_label')) + '</label><div class="row" style="flex-wrap:nowrap"><input class="inp mono" id="ed-locpick" value="' + esc(l ? l.code : (d.location_id ? d.location_code : '')) + '" placeholder="' + esc(t('lo_ed_ph')) + '" autocomplete="off" spellcheck="false">' +
    '<button type="button" class="btn" data-a="lo-ed-clear" title="' + esc(t('lo_ed_clear')) + '"' + (d.location_id ? '' : ' disabled') + ' id="lo-ed-clear">' + ic('x') + '</button></div><div class="hint" id="lo-ed-path">' + esc(l ? locPathText(l.id) : t('lo_ed_hint')) + '</div></div>';
}
function locEditorSet(id){
  const ed = UI.ed; if (!ed) return;
  ed.d.location_id = id || '';
  ed.d.location_code = binderLocCode(ed.d);
  const l = id ? locById(id) : null;
  const p = $('#lo-ed-path'); if (p) p.textContent = l ? locPathText(l.id) : t('lo_ed_hint');
  const c = $('#lo-ed-clear'); if (c) c.disabled = !id;
  const i = $('#ed-locpick'); if (i && !id && document.activeElement !== i) i.value = '';
  const pill = $('#ed-loc'); if (pill){ pill.textContent = ed.d.location_code || '—'; pill.classList.toggle('hidden', !ed.d.location_code); }
  clearTimeout(locEditorSet._t); locEditorSet._t = setTimeout(() => { if (typeof renderEdPreview === 'function' && UI.ed) renderEdPreview(); }, 120);
}

/* ---------------- wrappers around globals (installed at load; callers resolve them at call time) ---------------- */
(function locWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('infoPanelHTML', (o) => function(tab){ return tab === 'loc' ? locPanelHTML() : o.apply(this, arguments); });
  wrap('mountInfo', (o) => function(){ if (infoTab() === 'loc') return locCamAttach(); return o.apply(this, arguments); });
  wrap('infoTabCount', (o) => function(k){ return k === 'loc' ? locArr().length : o.apply(this, arguments); });
  wrap('ensureIntegrity', (o) => function(){ let n = o.apply(this, arguments); if (S && Array.isArray(S.locations) && S.locations.length){ const before = S.locations.map(l => l.code + l.short_code + l.seg).join(); locIntegrity(); if (S.locations.map(l => l.code + l.short_code + l.seg).join() !== before) n++; locRefreshBinders(); } return n; });
  wrap('queueItems', (o) => function(){
    if (S.print.contentMode !== 'loc') return o.apply(this, arguments);
    const copies = clamp(parseInt(S.print.copies, 10) || 1, 1, 50), out = [];
    locPrintQueue().forEach(l => { for (let c = 0; c < copies; c++) out.push({kind:'L', b:locPrintItem(l), part:0}); });
    return out;
  });
  wrap('renderLabel', (o) => function(kind, b, g, P){ return kind === 'L' ? renderLocLabel(b, g, P) : o.apply(this, arguments); });
  wrap('renderPrintSummary', (o) => function(){
    const r = o.apply(this, arguments);
    if (S.print.contentMode !== 'loc') return r;
    const el = $('#pr-summary'); if (!el) return r;
    const q = locPrintQueue(), L = layoutLabels();
    el.innerHTML = '<div class="lo-prbar"><b>' + ic('box') + esc(t('lo_pr_h', {n:q.length})) + '</b><button class="btn btn-sm" data-a="lo-pr-back" id="lo-pr-back">' + ic('undo') + esc(t('lo_pr_back')) + '</button></div>' +
      (q.length ? '<div class="row" style="gap:6px">' + q.slice(0, 18).map(l => '<span class="loc">' + esc(l.code) + '</span>').join('') + (q.length > 18 ? '<span class="muted small">+' + (q.length - 18) + '</span>' : '') + '</div>' +
        '<div class="small" style="margin-top:10px;font-weight:600">' + esc(t('pr_sum', {l:L.items, s:L.pages.length, u:L.skipped})) + '</div>' : '<div class="warn-box small">' + ic('alert') + '<div>' + esc(t('lo_pr_none')) + '</div></div>') +
      '<button class="btn btn-sm" style="margin-top:8px" data-a="lo-pr-manage">' + ic('box') + esc(t('lo_pr_manage')) + '</button>';
    return r;
  });
  wrap('logPrintDetails', (o) => function(){ const d = o.apply(this, arguments); if (S.print.contentMode === 'loc'){ const q = locPrintQueue(); d.binders = 0; d.codes = []; d.locations = q.length; d.location_codes = q.slice(0, 100).map(l => l.code); } return d; });
  wrap('edLocationHTML', (o) => function(d){ return locEditorHTML(d) + o.apply(this, arguments); });
  wrap('edEnhance', (o) => function(){
    const r = o.apply(this, arguments);
    const i = $('#ed-locpick'); if (!i || !UI.ed) return r;
    taAttach(i, {source:locTaSource, top:8, max:10, minWidth:360, onPick:(it) => { locEditorSet(it.id); i.value = it.value; }});
    i.addEventListener('input', () => { const l = locFindTyped(i.value); if (l) locEditorSet(l.id); else if (!i.value.trim()) locEditorSet(''); });
    i.addEventListener('blur', () => { const d = UI.ed && UI.ed.d; if (!d) return; const l = d.location_id ? locById(d.location_id) : null; if (!i.value.trim()) locEditorSet(''); else if (l) i.value = l.code; });
    return r;
  });
  wrap('edSyncLoc', (o) => function(){ const r = o.apply(this, arguments); const d = UI.ed && UI.ed.d; if (d && d.location_id){ const pill = $('#ed-loc'); if (pill){ pill.textContent = binderLocCode(d) || '—'; pill.classList.remove('hidden'); } } return r; });
  // editor save: a changed location is also an assignment (binder.locate, via 'editor') next to the usual binder.edit line
  wrap('logBinderSave', (o) => function(old, b){
    const r = o.apply(this, arguments);
    if (old && (old.location_id || '') !== (b.location_id || '')){
      const f = old.location_id ? locById(old.location_id) : null, to = b.location_id ? locById(b.location_id) : null;
      logAct('binder.locate', logBT(b), 'Collocato il faldone ' + b.speaking_code + ' in ' + (to ? to.code : 'nessuna ubicazione') + (old.location_id ? ' (prima in ' + (f ? f.code : old.location_code) + ')' : '') + ' · scheda faldone',
        {from:{id:old.location_id || '', code:old.location_id ? (f ? f.code : old.location_code || '') : ''}, to:{id:to ? to.id : '', code:to ? to.code : ''}, via:'editor', device:typeof syncDeviceId === 'function' ? syncDeviceId() : '', user:logWho()});
    }
    return r;
  });
  wrap('saveEditor', (o) => function(){ const d = UI.ed && UI.ed.d; if (d) d.location_code = binderLocCode(d); return o.apply(this, arguments); });
  wrap('locateBodyHTML', (o) => function(b){
    let h = o.apply(this, arguments);
    const l = b.location_id ? locById(b.location_id) : null; if (!l) return h;
    if (!(b.room_code || b.cabinet_code || b.shelf_code)) h = h.replace('<div class="warn-box">' + ic('alert') + '<div>' + esc(t('loc_none')) + '</div></div>', '');
    const box = '<div class="lo-where" id="lo-where">' + ic('box') + '<div><div class="lo-kind">' + esc(t('lo_where')) + ' · ' + esc(locKind(l)) + '</div><div class="lo-wpath">' +
      locPath(l.id).map(p => '<span><small>' + esc(locKind(p)) + '</small><b class="mono">' + esc(p.seg) + '</b>' + (p.name ? '<em>' + esc(p.name) + '</em>' : '') + '</span>').join(ic('chevr', 'lo-sep')) + '</div></div>' +
      '<button class="btn btn-sm" data-a="lo-goto" data-id="' + esc(l.id) + '">' + ic('box') + esc(t('in_loc')) + '</button></div>';
    const k = h.indexOf('<div class="small" style="margin:6px 0 14px">');
    const e = k >= 0 ? h.indexOf('</div>', k) + 6 : -1;
    return e > 0 ? h.slice(0, e) + box + h.slice(e) : box + h;
  });
  wrap('renderArchiveResults', (o) => function(){
    const r = o.apply(this, arguments);
    const bb = $('#bulkbar'); if (bb && locArr().length && !$('#lo-assign-btn')){
      const n = S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))).length;
      const del = bb.querySelector('[data-a="del-sel"]');
      const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.id = 'lo-assign-btn'; btn.dataset.a = 'lo-assign-open'; btn.disabled = !n; btn.innerHTML = ic('box') + esc(t('lo_assign_btn'));
      if (del) bb.insertBefore(btn, del); else bb.appendChild(btn);
    }
    return r;
  });
})();

/* ---------------- actions & events ---------------- */
const LOC_ACTIONS = {
  'lo-sel': (el) => locSelect(el.dataset.id),
  'lo-toggle': (el) => { const id = el.dataset.id; if (LUI.open.has(id)) LUI.open.delete(id); else LUI.open.add(id); locRenderTree(); },
  'lo-add-root': () => locAddChild(''),
  'lo-add': (el) => locAddChild(el.dataset.id),
  'lo-bulk': (el) => locOpenBulk(el.dataset.id || ''),
  'lo-levels': () => locOpenLevels(),
  'lo-lv-add': () => { if (LUI.lv.length < LOC_MAX_DEPTH){ const i = LUI.lv.length; LUI.lv.push({name:t('lo_lv_n', {n:i + 1}), prefix:'L' + (i + 1)}); locOpenLevels.draw(); } },
  'lo-lv-del': (el) => { if (LUI.lv.length > 1){ LUI.lv.splice(+el.dataset.i, 1); locOpenLevels.draw(); } },
  'lo-lv-reset': () => { LUI.lv = locLevels({}).map(x => ({name:x.name, prefix:x.prefix})); locOpenLevels.draw(); },
  'lo-move': (el) => locOpenMove(el.dataset.id),
  'lo-del': (el) => locDelete(el.dataset.id),
  'lo-print': (el) => locPrintStart([el.dataset.id]),
  'lo-print-leaves': (el) => locPrintStart(locDescendants(el.dataset.id).filter(id => !locChildren(id).length)),
  'lo-print-tree': (el) => locPrintStart([el.dataset.id].concat(locDescendants(el.dataset.id))),
  'lo-print-all': () => { const ids = locArr().map(l => l.id); if (ids.length) locPrintStart(ids); },
  'lo-print-sel': () => { const ids = Array.from(LUI.checked).filter(id => locById(id)); if (ids.length) locPrintStart(ids); },
  'lo-sel-leaves': () => { LUI.checked = new Set(locArr().filter(l => !locChildren(l.id).length).map(l => l.id)); locRender(); },
  'lo-sel-none': () => { LUI.checked = new Set(); locRender(); },
  'lo-bk-preset': (el) => {
    const B = LUI.bulk; if (!B) return; const p = locBulkPresets(B.rows)[+el.dataset.k]; if (!p) return;
    B.rows.forEach((r, i) => { r.n = i < p.ns.length ? p.ns[i] : 0; r.pad = i === p.ns.length - 1 && p.ns[i] >= 10 ? 2 : 1; });
    document.querySelectorAll('#lo-bulk-form [data-lo-bk]').forEach(inp => { const r = B.rows[+inp.dataset.i]; if (r) inp.value = r[inp.dataset.loBk]; });
    locBulkPreview();
  },
  'lo-assign-sel': (el) => { const l = locById(el.dataset.id); if (!l) return; const list = S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))); dmBulkGuard(list, t('bg_w_loc'), () => { undoPoint(); const m = locAssign(list, l.id, {via:'bulk'}); locRender(); undoToast(t('lo_assigned', {n:m.length, c:l.code})); }); },
  'lo-unassign': (el) => { const b = S.binders.find(x => x.id === el.dataset.id); if (!b) return; undoPoint(); locAssign([b], '', {via:'manual'}); locRender(); undoToast(t('lo_unassigned', {n:1})); },
  'lo-assoc': () => { if (LUI.assoc.on) locAssocStop(); else locAssocStart(LUI.sel && locById(LUI.sel) && !locChildren(LUI.sel).length ? LUI.sel : ''); },
  'lo-assoc-here': (el) => locAssocStart(el.dataset.id),
  'la-stop': () => locAssocStop(),
  'la-cam': () => locCamToggle(),
  'la-undo': (el) => locAssocUndo(+el.dataset.i),
  'lo-pr-back': () => { S.print.contentMode = S.print.locPrevMode && S.print.locPrevMode !== 'loc' && labelTemplate(S.print.locPrevMode) ? S.print.locPrevMode : 'info'; savePrefs(); renderView(); },
  'lo-pr-manage': () => { S.view = 'info'; S.infoTab = 'loc'; savePrefs(); renderAll(); },
  'lo-goto': (el) => { while (topModal()) closeModal(true); LUI.sel = el.dataset.id; locPath(el.dataset.id).forEach(p => LUI.open.add(p.id)); S.view = 'info'; S.infoTab = 'loc'; savePrefs(); renderAll(); },
  'lo-ed-clear': () => locEditorSet(''),
  'lo-assign-open': () => locOpenAssign(S.binders.filter(b => b.selected_for_print && !(S.settings.hideDemo && isDemo(b))).map(b => b.id))
};
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'lo-q'){ LUI.q = el.value; locRenderTree(); return; }
  if (el.dataset && el.dataset.loBk && LUI.bulk){ const r = LUI.bulk.rows[+el.dataset.i]; if (!r) return; const k = el.dataset.loBk; r[k] = k === 'prefix' ? locSegClean(el.value) : Math.max(0, parseInt(el.value, 10) || 0); if (k === 'pad') r.pad = Math.max(1, Math.min(4, r.pad || 1)); locBulkPreview(); return; }
  if (el.dataset && el.dataset.loLv && LUI.lv){ const x = LUI.lv[+el.dataset.i]; if (x) x[el.dataset.loLv] = el.value; }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.loF && LUI.sel){ locSaveFields(LUI.sel, {[el.dataset.loF]:el.value}); const d = $('#lo-detail'); if (d){ const f = document.activeElement && document.activeElement.id; d.innerHTML = locDetailHTML(); if (f){ const x = $('#' + f); if (x) x.focus(); } } locRenderTree(); return; }
  if (el.dataset && el.dataset.loCheck){ if (el.checked) LUI.checked.add(el.dataset.loCheck); else LUI.checked.delete(el.dataset.loCheck); const b = $('#lo-print-sel'); if (b){ b.disabled = !LUI.checked.size; const n = b.querySelector('.qr-n'); if (n) n.textContent = LUI.checked.size; } return; }
  if (el.dataset && el.dataset.loFilter){ UI.fLoc = el.value; renderArchiveResults(); }
});
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el && el.id === 'la-scan' && (e.key === 'Enter' || e.key === 'Tab')){ e.preventDefault(); const v = el.value; el.value = ''; if (v.trim()) locAssocInput(v, 'scanner'); return; }
  if (el && el.dataset && el.dataset.loF && e.key === 'Enter'){ e.preventDefault(); el.blur(); }
});
document.addEventListener('DOMContentLoaded', () => {
  Object.assign(ACTIONS, LOC_ACTIONS);
  if (typeof VIEW_LABEL !== 'undefined') VIEW_LABEL.info = VIEW_LABEL.info || 'nav_info';
  HELP_TOPICS.push({ id:'locations', guide:'locations', tags:['qr', 'archive', 'label'], acts:['how', 'create', 'print'], pop:58, related:['info', 'qr-reprint', 'sync'],
    title:{it:'Come programmo le ubicazioni e associo i faldoni alle scatole?', en:'How do I set up locations and put binders into boxes?'},
    body:{
      it:'<p>In <b>Informazioni › Ubicazioni</b> crei l\'albero dell\'archivio fisico: <b>magazzino › armadio › scansia › scaffale › scatola</b> (nomi e numero di livelli in <b>Livelli…</b>, da 1 a 8). Con <b>Crea in serie…</b> crei una struttura intera in un colpo (es. 20 scatole B01…B20 in uno scaffale): i codici come <span class="kbd">MAG1-A2-S3-R1-B04</span> e i QR si generano da soli.</p>' +
        '<ol><li><b>Stampa le etichette</b>: spunta le scatole (o "Seleziona ultimo livello") e premi <b>Stampa etichette</b>; si apre Stampa etichette con il contenuto "Etichette ubicazione". Funziona anche <b>Scarica PDF</b>. Il manifest qr7 contiene anche le righe delle ubicazioni.</li>' +
        '<li><b>Modalità associazione</b>: scansiona il QR di una scatola (lettore USB/Bluetooth, webcam o telefono) → la scatola è attiva; ogni QR di faldone scansionato dopo finisce lì dentro; il QR della scatola successiva apre la nuova scatola. Ogni passaggio è nel Registro attività e si annulla.</li>' +
        '<li><b>Dal telefono</b>: inquadra il QR della scatola con la fotocamera, premi <b>Avvia associazione qui</b> e poi inquadra i faldoni uno dopo l\'altro (o usa <b>Scansiona in sequenza</b> nella pagina). La modalità resta attiva per 30 minuti di inattività.</li></ol>' +
        '<p>In Archivio puoi filtrare per ubicazione e con <b>Ubicazione…</b> mettere i faldoni spuntati in una scatola; <b>Dov\'è?</b> mostra il percorso completo. Le ubicazioni si sincronizzano con il server e con i pacchetti come i faldoni.</p>',
      en:'<p>In <b>Information › Locations</b> you build the tree of the physical archive: <b>warehouse › cabinet › shelving unit › shelf › box</b> (names and number of levels in <b>Levels…</b>, 1 to 8). <b>Create in series…</b> creates a whole structure at once (e.g. 20 boxes B01…B20 in a shelf): codes like <span class="kbd">MAG1-A2-S3-R1-B04</span> and the QR codes are generated automatically.</p>' +
        '<ol><li><b>Print the labels</b>: tick the boxes (or "Select last level") and press <b>Print labels</b>; Print labels opens with the "Location labels" content. <b>Download PDF</b> works too. The qr7 manifest also holds the location rows.</li>' +
        '<li><b>Association mode</b>: scan a box QR (USB/Bluetooth scanner, webcam or phone) → that box is active; every binder QR scanned next goes into it; the next box QR opens the new box. Every step is in the Activity log and can be undone.</li>' +
        '<li><b>From a phone</b>: point the camera at the box QR, press <b>Start association here</b> and then scan the binders one after the other (or use <b>Scan in sequence</b> on the page). The mode stays on for 30 minutes of inactivity.</li></ol>' +
        '<p>In Archive you can filter by location and, with <b>Location…</b>, put the ticked binders into a box; <b>Where is it?</b> shows the full path. Locations sync with the server and with packages like binders.</p>'
    }});
  if (typeof GUIDES !== 'undefined') GUIDES.locations = { pop:56, title:{it:'Crea le ubicazioni e stampa i QR delle scatole', en:'Create locations and print the box QR codes'}, steps:[
    { target:'.nav [data-v="info"]', title:{it:'Apri Informazioni', en:'Open Information'}, text:{it:'Clicca "Informazioni" nella barra in alto.', en:'Click "Information" in the top bar.'}, done:() => S.view === 'info' },
    { target:'.info-tabs [data-v="loc"]', title:{it:'Ubicazioni', en:'Locations'}, text:{it:'Apri la scheda "Ubicazioni": qui c\'è l\'albero dell\'archivio fisico.', en:'Open the "Locations" tab: the tree of the physical archive lives here.'}, done:() => S.view === 'info' && infoTab() === 'loc' },
    { target:() => $('#lo-levels'), title:{it:'Livelli', en:'Levels'}, text:{it:'Con "Livelli…" scegli i nomi dei livelli (predefiniti: Magazzino › Armadio › Scansia › Scaffale › Scatola) e i prefissi dei codici.', en:'"Levels…" sets the level names (default: Warehouse › Cabinet › Shelving unit › Shelf › Box) and the code prefixes.'} },
    { target:() => $('#lo-bulk-root') || $('#lo-empty-bulk'), title:{it:'Crea in serie', en:'Create in series'}, text:{it:'"Crea in serie…" crea una struttura intera: per ogni livello indichi quanti elementi mettere dentro ciascuno di quello sopra. Codici e QR si generano da soli.', en:'"Create in series…" builds a whole structure: for each level say how many to put inside each one of the level above. Codes and QR codes are generated automatically.'}, noAutoClick:true },
    { target:() => $('#lo-tree') || $('#info-panel'), title:{it:'L\'albero', en:'The tree'}, text:{it:'Clicca un nodo per vederne i dettagli, rinominarlo, spostarlo o aggiungere sotto-ubicazioni. Le caselle servono a scegliere le etichette da stampare.', en:'Click a node to see its details, rename it, move it or add sub-locations. The tick boxes choose the labels to print.'} },
    { target:() => $('[data-a="lo-sel-leaves"]') || $('#info-panel'), title:{it:'Etichette delle scatole', en:'Box labels'}, text:{it:'"Seleziona ultimo livello" e poi "Stampa etichette": si apre la stampa con codice grande, percorso e QR. Funziona anche "Scarica PDF".', en:'"Select last level", then "Print labels": printing opens with big code, path and QR. "Download PDF" works too.'} },
    { target:() => $('#lo-assoc-btn') || $('#info-panel'), title:{it:'Modalità associazione', en:'Association mode'}, text:{it:'Quando le etichette sono sulle scatole: "Modalità associazione", poi scansiona il QR di una scatola e i QR dei faldoni che contiene, uno dopo l\'altro.', en:'Once the labels are on the boxes: "Association mode", then scan a box QR and the QR codes of the binders inside, one after the other.'} },
    { final:true, title:{it:'Ubicazioni pronte ✓', en:'Locations ready ✓'}, text:{it:'Dal telefono: inquadra il QR di una scatola e premi "Avvia associazione qui". In Archivio puoi filtrare per ubicazione; "Dov\'è?" mostra il percorso completo.', en:'From a phone: scan a box QR and press "Start association here". In Archive you can filter by location; "Where is it?" shows the full path.'} }
  ]};
});
