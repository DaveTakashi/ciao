/* =====================================================================
   DocMap 2026 — v11 (stream J): push / sync JOURNAL ("Registro sincronizzazioni")

   Every exchange of data between devices leaves a record that explains what happened to each record, so that a
   dispute ("I changed it, who overwrote it?") can be settled with evidence. Two journals, same shape:
   - LOCAL journal  S.syncJournal (persisted with S, in JSON backups as `sync_journal`; NOT in SQLite, schema unchanged)
     written by: package import/export (06f), server sync (06g), phone direct saves (scan.html, RemoteDataProvider)
   - SERVER journal server-php/api.php tables sync_journal + sync_journal_items (route `journal`, admin restore
     `journal_restore`), written by the server for every push / patch / pull with changes. See docs/SYNC.md §9.

   Local entry (newest last, cap JR_CAP; items capped per entry and overall):
     { id:'jr-<uuid>', at:ISO (this device's clock), kind:'server'|'package'|'phone'|'restore',
       dir:'sync'|'import'|'export'|'patch'|'restore', auto:bool (automatic web sync), ok:bool, error:'' ,
       peer:{id, label, mode, url?, file?, sha256?, bytes?, enc?},
       device:{id, name, app}, user:'operator or server user', role:'',
       counts:{sent, received, accepted, rejected, conflicts, created, updated, deleted, ignored},
       server_journal:[jid…]  (ids of the matching server entries, when known),
       items:[{ type, id, code, dir:'in'|'out', action, resolution, how, reason, local_updated_at, remote_updated_at,
                hash (SHA-256 of the canonical JSON of the version kept / sent, same as the server's new_hash),
                fields:[[field, valueHere, valueOther]]?  snapshot:{…}? (record before a deletion) }],
       items_total }
     action:  create | update | delete | tombstone | conflict | rejected-older | sent | sent-delete | restore
     resolution: took_remote | kept_local | accepted | rejected-older | conflict | rejected-invalid | queued | forced
     how (conflicts): auto (rule "most recent wins") | confirmed (proposal accepted in the review) | manual (changed by hand)
   Phone (scan.html): the same entries in the encrypted vault key JR_PHONE_VAULT (web mode only), list "Le mie
   sincronizzazioni"; device name in localStorage JR_LABEL_LS.

   Client identity sent on every server call (DMServer.call in 10-auth.js asks jrClientInfo()):
     headers X-DocMap-Device / X-DocMap-Device-Name (URI-encoded) / X-DocMap-App, or "_device":{id,name,app} in a
     text/plain body (desktop from file://). id = S.settings.deviceId (06f), name = S.settings.deviceLabel (editable in
     ⚙ Sincronizzazione), app = APP_VERSION.

   Hooks (no change of behaviour, only observation): syncParse, syncOpenReview, syncApply, syncExport (06f), srvSync,
   srvPush (06g), DMServer.prototype.call, RemoteDataProvider.prototype.saveBinderPatch (10-auth), workspaceJSON,
   logImport (backups), viewSync (the card). Generic over record types: a new type (e.g. 'location') that flows
   through syncApply / srvChanges is journaled without changes here.

   Loaded by index.html after 06g-server.js and by scan.html after 10-auth.js (desktop-only parts check `typeof`).
   ===================================================================== */
'use strict';

const JR_CAP = 2000, JR_ITEM_CAP = 300, JR_ITEMS_TOTAL = 12000, JR_VAL_MAX = 2000, JR_PHONE_CAP = 200, JR_PAGE = 30;
const JR_PHONE_VAULT = 'docmap_v26_vault_journal', JR_DEV_LS = 'docmap_v26_device', JR_LABEL_LS = 'docmap_v26_device_label';
const JR_CANON_SKIP = ['updated_at', 'short_url', 'location_code', 'selected_for_print'];   // = DM_CANON_SKIP (api.php) = SYNC_B_SKIP
const JR = { cur:null, inPush:false, last:Promise.resolve(),
  ui:{src:'local', f:{from:'', to:'', user:'', device:'', code:''}, limit:JR_PAGE},
  srv:{items:[], more:false, next:null, loading:false, err:'', loaded:false},
  phone:{list:null, back:''} };

Object.assign(I18N.it, {
  jr_h:'Registro sincronizzazioni', jr_p:'Ogni scambio di dati (server, pacchetti, telefoni) lascia qui una traccia: chi, quando, da quale dispositivo, e cosa è successo a ogni faldone. Serve a risolvere le contestazioni.',
  jr_src_local:'Questo dispositivo', jr_src_srv:'Server (tutti)', jr_src_srv_own:'Server (le mie)', jr_from:'Dal', jr_to:'Al', jr_user:'Utente', jr_device:'Dispositivo', jr_code:'Codice faldone',
  jr_reset:'Azzera filtri', jr_more:'Mostra altri', jr_csv:'Esporta CSV', jr_json:'Esporta JSON', jr_none:'Nessuna sincronizzazione registrata con questi filtri.', jr_loading:'Carico il registro dal server…',
  jr_when:'Quando', jr_peer:'Con', jr_dir:'Tipo', jr_res:'Esito', jr_det:'Dettagli', jr_n:'{n} voci',
  jr_k_server:'Server', jr_k_package:'Pacchetto', jr_k_phone:'Telefono', jr_k_restore:'Ripristino',
  jr_d_sync:'sincronizzazione', jr_d_import:'import', jr_d_export:'export', jr_d_patch:'salvataggio', jr_d_restore:'ripristino', jr_d_push:'invio', jr_d_pull:'ricezione', jr_d_journal_restore:'ripristino',
  jr_auto:'automatica', jr_err:'errore', jr_cancelled:'annullata',
  jr_c_sent:'{n} inviati', jr_c_received:'{n} ricevuti', jr_c_accepted:'{n} accettati', jr_c_rejected:'{n} rifiutati', jr_c_conflicts:'{n} conflitti', jr_c_same:'{n} invariati',
  jr_a_create:'nuovo', jr_a_update:'aggiornato', jr_a_delete:'eliminato', jr_a_tombstone:'eliminazione nota', jr_a_conflict:'conflitto', 'jr_a_rejected-older':'più vecchio, ignorato', 'jr_a_rejected-invalid':'non valido',
  jr_a_sent:'inviato', 'jr_a_sent-delete':'eliminazione inviata', jr_a_restore:'ripristinato', jr_a_pull:'ricevuto', 'jr_a_pull-delete':'eliminazione ricevuta',
  jr_r_took_remote:'tenuta la versione arrivata', jr_r_kept_local:'tenuta la versione di questo dispositivo', jr_r_accepted:'accettato dal server', 'jr_r_rejected-older':'rifiutato: il server ha una versione più recente',
  jr_r_conflict:'rifiutato: stessa ora, contenuto diverso', 'jr_r_rejected-invalid':'rifiutato: dati non validi', jr_r_queued:'in attesa di rete', jr_r_forced:'salvato comunque',
  jr_how_auto:'regola: vince il più recente', jr_how_confirmed:'proposta confermata a mano', jr_how_manual:'scelta a mano',
  jr_t_entry:'Dettaglio sincronizzazione', jr_i_at:'Data e ora', jr_i_peer:'Con', jr_i_dev:'Dispositivo', jr_i_app:'Versione', jr_i_user:'Utente', jr_i_file:'File', jr_i_hash:'Impronta SHA-256', jr_i_srvj:'Voce sul server',
  jr_col_code:'Faldone', jr_col_type:'Tipo', jr_col_action:'Cosa', jr_col_dec:'Decisione', jr_col_here:'Ora qui / client', jr_col_other:'Ora arrivata / server', jr_col_hash:'Impronta',
  jr_diff:'Differenze', jr_tried:'Tentata (rifiutata)', jr_before:'Prima', jr_after:'Dopo', jr_here:'Questo dispositivo', jr_other:'Arrivata', jr_nodiff:'Nessuna differenza di campo registrata.', jr_trunc:'Mostrate {n} voci su {t}.',
  jr_rs:'Ripristina questa versione', jr_rs_prev:'Ripristina la versione precedente', jr_rs_new:'Ripristina la versione rifiutata', jr_rs_t:'Ripristinare questa versione?',
  jr_rs_d:'Il faldone {c} torna come in questa versione. È una nuova modifica (con l\'ora di adesso): arriva agli altri dispositivi alla prossima sincronizzazione e resta scritta nel registro.',
  jr_rs_done:'Versione ripristinata: {c}', jr_rs_srv_done:'Versione ripristinata sul server: {c}. Sincronizzo…', jr_rs_gone:'Il record non c\'è più su questo dispositivo e non ho una copia completa da ripristinare.',
  jr_rs_srv_only:'Il ripristino sul server è riservato all\'amministratore.', jr_srv_err:'Registro del server non disponibile: {m}', jr_srv_need:'Collega il server (sopra) per vedere anche il suo registro.',
  jr_exported:'Registro esportato: {f}', jr_cut:'(valore troncato)',
  jr_ph_h:'Le mie sincronizzazioni', jr_ph_p:'I salvataggi fatti da questo telefono, con l\'esito del server.', jr_ph_none:'Nessun salvataggio da questo telefono.', jr_ph_name:'Nome di questo telefono', jr_ph_save:'Salva nome', jr_ph_saved:'Nome salvato',
  jr_ph_ok:'salvato', jr_ph_conflict:'rifiutato: cambiato altrove', jr_ph_queued:'in attesa di rete', jr_ph_err:'errore', jr_ph_forced:'salvato comunque', jr_ph_fields:'Campi: {f}',
  jr_t_binder:'faldone', jr_t_client:'cliente', jr_t_location:'ubicazione', jr_t_settings:'impostazioni',
  lg_src_journal:'registro', 'lga_sync.restore':'Ripristino dal registro sincronizzazioni', 'lga_sync.journal_export':'Export del registro sincronizzazioni'
});
Object.assign(I18N.en, {
  jr_h:'Sync journal', jr_p:'Every data exchange (server, packages, phones) leaves a trace here: who, when, from which device, and what happened to each binder. Use it to settle disputes.',
  jr_src_local:'This device', jr_src_srv:'Server (all)', jr_src_srv_own:'Server (mine)', jr_from:'From', jr_to:'To', jr_user:'User', jr_device:'Device', jr_code:'Binder code',
  jr_reset:'Clear filters', jr_more:'Show more', jr_csv:'Export CSV', jr_json:'Export JSON', jr_none:'No sync recorded with these filters.', jr_loading:'Loading the server journal…',
  jr_when:'When', jr_peer:'With', jr_dir:'Type', jr_res:'Result', jr_det:'Details', jr_n:'{n} rows',
  jr_k_server:'Server', jr_k_package:'Package', jr_k_phone:'Phone', jr_k_restore:'Restore',
  jr_d_sync:'sync', jr_d_import:'import', jr_d_export:'export', jr_d_patch:'save', jr_d_restore:'restore', jr_d_push:'push', jr_d_pull:'pull', jr_d_journal_restore:'restore',
  jr_auto:'automatic', jr_err:'error', jr_cancelled:'cancelled',
  jr_c_sent:'{n} sent', jr_c_received:'{n} received', jr_c_accepted:'{n} accepted', jr_c_rejected:'{n} rejected', jr_c_conflicts:'{n} conflicts', jr_c_same:'{n} unchanged',
  jr_a_create:'new', jr_a_update:'updated', jr_a_delete:'deleted', jr_a_tombstone:'known deletion', jr_a_conflict:'conflict', 'jr_a_rejected-older':'older, ignored', 'jr_a_rejected-invalid':'invalid',
  jr_a_sent:'sent', 'jr_a_sent-delete':'deletion sent', jr_a_restore:'restored', jr_a_pull:'received', 'jr_a_pull-delete':'deletion received',
  jr_r_took_remote:'kept the incoming version', jr_r_kept_local:'kept this device\'s version', jr_r_accepted:'accepted by the server', 'jr_r_rejected-older':'rejected: the server holds a newer version',
  jr_r_conflict:'rejected: same time, different content', 'jr_r_rejected-invalid':'rejected: invalid data', jr_r_queued:'waiting for network', jr_r_forced:'saved anyway',
  jr_how_auto:'rule: most recent wins', jr_how_confirmed:'proposal confirmed by hand', jr_how_manual:'chosen by hand',
  jr_t_entry:'Sync details', jr_i_at:'Date and time', jr_i_peer:'With', jr_i_dev:'Device', jr_i_app:'Version', jr_i_user:'User', jr_i_file:'File', jr_i_hash:'SHA-256 fingerprint', jr_i_srvj:'Server entry',
  jr_col_code:'Binder', jr_col_type:'Type', jr_col_action:'What', jr_col_dec:'Decision', jr_col_here:'Time here / client', jr_col_other:'Time incoming / server', jr_col_hash:'Fingerprint',
  jr_diff:'Differences', jr_tried:'Attempted (rejected)', jr_before:'Before', jr_after:'After', jr_here:'This device', jr_other:'Incoming', jr_nodiff:'No field difference recorded.', jr_trunc:'Showing {n} of {t} rows.',
  jr_rs:'Restore this version', jr_rs_prev:'Restore the previous version', jr_rs_new:'Restore the rejected version', jr_rs_t:'Restore this version?',
  jr_rs_d:'Binder {c} goes back to this version. It is a new change (stamped now): it reaches the other devices at the next sync and stays in the journal.',
  jr_rs_done:'Version restored: {c}', jr_rs_srv_done:'Version restored on the server: {c}. Syncing…', jr_rs_gone:'The record is no longer on this device and there is no full copy to restore.',
  jr_rs_srv_only:'Restoring on the server is for the administrator only.', jr_srv_err:'Server journal not available: {m}', jr_srv_need:'Connect the server (above) to see its journal too.',
  jr_exported:'Journal exported: {f}', jr_cut:'(value truncated)',
  jr_ph_h:'My syncs', jr_ph_p:'The saves made from this phone, with the server\'s answer.', jr_ph_none:'No saves from this phone yet.', jr_ph_name:'Name of this phone', jr_ph_save:'Save name', jr_ph_saved:'Name saved',
  jr_ph_ok:'saved', jr_ph_conflict:'refused: changed elsewhere', jr_ph_queued:'waiting for network', jr_ph_err:'error', jr_ph_forced:'saved anyway', jr_ph_fields:'Fields: {f}',
  jr_t_binder:'binder', jr_t_client:'client', jr_t_location:'location', jr_t_settings:'settings',
  lg_src_journal:'journal', 'lga_sync.restore':'Restore from the sync journal', 'lga_sync.journal_export':'Sync journal export'
});
/* v11.1: scan.html does not load 06f-sync.js, but the phone journal uses two of its strings (peer label of the server,
   header of the diff table): define them here only when missing, so phone entries no longer show the raw key. */
[['it', {sy_mode_server:'Server online', sy_field:'Campo'}], ['en', {sy_mode_server:'Online server', sy_field:'Field'}]].forEach(([l, d]) => Object.keys(d).forEach(k => { if (!(k in I18N[l])) I18N[l][k] = d[k]; }));

/* ---------------- identity of this device ---------------- */
const jrDesk = () => !!(typeof S !== 'undefined' && S && Array.isArray(S.binders) && S.settings);   // desktop app (index.html), not scan.html
function jrUaSummary(){
  const u = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : '';
  const br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || 'Browser';
}
function jrDeviceId(){
  if (jrDesk() && typeof syncDeviceId === 'function') return syncDeviceId();
  let id = ''; try { id = localStorage.getItem(JR_DEV_LS) || ''; } catch(e){}
  if (!id){ id = 'dev-' + uuid(); try { localStorage.setItem(JR_DEV_LS, id); } catch(e){} }
  return id;
}
function jrDeviceName(){
  if (jrDesk() && typeof syncDeviceLabel === 'function') return syncDeviceLabel();
  let n = ''; try { n = localStorage.getItem(JR_LABEL_LS) || ''; } catch(e){}
  return String(n).trim().slice(0, 80) || jrUaSummary();
}
/** {id, name, app}: sent with every server call (10-auth.js DMServer.call). */
function jrClientInfo(){ return {id:jrDeviceId(), name:jrDeviceName(), app:typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''}; }

/* ---------------- canonical JSON + SHA-256 (identical to canon()/jr_hash() of api.php) ---------------- */
function jrCanon(v, top){
  if (Array.isArray(v)) return v.map(x => jrCanon(x, false));
  if (v && typeof v === 'object'){
    const keys = Object.keys(v);
    if (!keys.length) return [];
    if (keys.every((k, i) => k === String(i))) return keys.map(k => jrCanon(v[k], false));   // PHP: a list
    const o = {};
    keys.sort().forEach(k => { if ((top && JR_CANON_SKIP.includes(k)) || k.charAt(0) === '_') return; o[k] = jrCanon(v[k], false); });
    return o;
  }
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return v;
}
const jrJson = (v) => JSON.stringify(v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');   // PHP escapes these two
async function jrSha256(text){
  try {
    if (!(window.crypto && crypto.subtle && window.TextEncoder)) return '';
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, '0')).join('');
  } catch(e){ return ''; }
}
/** Hash of a record as the server would compute it on the pushed copy. */
const jrRecHash = (r) => r ? jrSha256(jrJson(jrCanon(r, true))) : Promise.resolve('');
const jrTombHash = (type, id, at) => jrSha256('deleted:' + type + '/' + id + '@' + at);

/* ---------------- helpers ---------------- */
const jrCode = (r) => !r ? '' : String(r.speaking_code || r.code || r.full_code || r.multi_code || r.name || '');
const jrCut = (v) => { const s = String(v == null ? '' : v); return s.length > JR_VAL_MAX ? s.slice(0, JR_VAL_MAX) + '…' : s; };
const jrFields = (f) => (Array.isArray(f) ? f : []).slice(0, 80).map(x => [String(x[0]), jrCut(x[1]), jrCut(x[2])]);
const jrVal = (k, x) => k === 'contents_items' && typeof contentsToPipe === 'function' ? contentsToPipe(x || []) : x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x);
/** Generic field diff of two record versions: [[field, a, b]] (meta fields left out). */
function jrDiff(a, b){
  const out = [];
  Object.keys(Object.assign({}, a || {}, b || {})).sort().forEach(k => {
    if (k === 'updated_at' || k === 'id' || k.charAt(0) === '_') return;
    const x = jrVal(k, a ? a[k] : ''), y = jrVal(k, b ? b[k] : '');
    if (x !== y) out.push([k, x, y]);
  });
  return out;
}
function jrNewEntry(o){
  return Object.assign({id:'jr-' + uuid(), at:nowISO(), kind:'', dir:'', auto:false, ok:true, error:'', peer:{}, device:jrClientInfo(), user:'', role:'',
    counts:{sent:0, received:0, accepted:0, rejected:0, conflicts:0, created:0, updated:0, deleted:0, ignored:0}, server_journal:[], items:[], items_total:0}, o || {});
}
/** Fills the hashes (async), caps the items and appends the entry to the local journal (desktop) — returns a promise. */
function jrAdd(e){
  const p = (async () => {
    e.items_total = e.items_total || e.items.length;
    e.items = e.items.slice(0, JR_ITEM_CAP);
    e.items.forEach(it => { if (it._rec) it._rec = jrJson(jrCanon(it._rec, true)); });   // canonical text NOW (the record may change before hashing)
    for (const it of e.items){
      if (it._rec !== undefined){ it.hash = it._rec ? await jrSha256(it._rec) : ''; delete it._rec; }
      else if (it._tomb){ it.hash = await jrTombHash(it.type, it.id, it._tomb); delete it._tomb; }
    }
    if (!jrDesk()) return e;
    jrEnsure(); S.syncJournal.push(e); jrPrune();
    try { if (typeof savePrefs === 'function') savePrefs(); } catch(err){}
    jrRefreshCard();
    return e;
  })();
  JR.last = JR.last.then(() => p).catch(() => p);
  return p;
}
function jrEnsure(){ if (S && !Array.isArray(S.syncJournal)) S.syncJournal = []; }
function jrPrune(){
  const J = S.syncJournal;
  if (J.length > JR_CAP) J.splice(0, J.length - JR_CAP);
  let total = J.reduce((n, e) => n + ((e.items && e.items.length) || 0), 0);
  for (let i = 0; i < J.length && total > JR_ITEMS_TOTAL; i++){   // oldest entries lose their item details first (the header stays)
    const n = (J[i].items || []).length; if (!n) continue;
    J[i].items_total = J[i].items_total || n; J[i].items = []; J[i].items_pruned = true; total -= n;
  }
}

/* ---------------- capture: plans of 06f (package import, server pull) ---------------- */
/** Items of a plan as they will be decided (taken BEFORE syncApply mutates the lists). */
function jrPlanItems(plan){
  const out = [];
  (plan.items || []).forEach(it => {
    if (it.kind === 'unchanged') return;
    const remoteAt = it.remote ? it.remote.updated_at : it.tomb ? it.tomb.deletedAt : null;
    const x = {type:it.type, id:it.id, code:String(it.code || jrCode(it.local || it.remote) || (it.tomb && it.tomb.code) || ''), dir:'in', action:'', resolution:'', how:'', reason:it.reason || '',
      local_updated_at:it.local ? String(it.local.updated_at || '') : (it.tomb && it.kind !== 'propagate' && it.kind !== 'delete' ? it.tomb.deletedAt : null), remote_updated_at:remoteAt};
    if (JR.inPush) x.reason = x.reason || 'server_newer';
    if (it.kind === 'new'){ x.action = 'create'; x.resolution = 'took_remote'; }
    else if (it.kind === 'updated'){ x.action = 'update'; x.resolution = 'took_remote'; x.fields = jrFields(it.fields); }
    else if (it.kind === 'delete'){ x.action = 'delete'; x.resolution = 'took_remote'; x.snapshot = it.local ? clone(it.local) : null; }
    else if (it.kind === 'propagate'){ x.action = 'tombstone'; x.resolution = 'took_remote'; }
    else if (it.kind === 'older'){ x.action = 'rejected-older'; x.resolution = 'kept_local'; x.fields = jrFields(it.fields); }
    else if (it.kind === 'conflict'){
      x.action = 'conflict'; x.resolution = it.choice === 'remote' ? 'took_remote' : 'kept_local';
      x.how = plan.jrReviewed ? (it.jrProposed && it.jrProposed !== it.choice ? 'manual' : 'confirmed') : 'auto';
      x.fields = jrFields(it.fields);
      if (it.choice === 'remote' && !it.remote && it.local) x.snapshot = clone(it.local);   // the remote side is a deletion
    } else return;
    out.push(x);
  });
  return out;
}
/** After syncApply: hash of the version now held (or of the tombstone). */
function jrAfterApply(items){
  items.forEach(x => {
    const list = x.type === 'binder' ? S.binders : x.type === 'client' ? (S.clients || []) : (Array.isArray(S[x.type + 's']) ? S[x.type + 's'] : []);
    const r = list.find(y => y && y.id === x.id);
    if (r){ x._rec = r; if (x.resolution === 'kept_local' && r.updated_at) x.local_updated_at = String(r.updated_at); }
    else { const tb = (S.tombstones || []).find(y => y.type === x.type && y.id === x.id); if (tb) x._tomb = tb.deletedAt; else x._rec = null; }
  });
}
function jrCountIn(c, items){
  items.forEach(x => {
    if (x.action === 'conflict') c.conflicts++;
    if (x.resolution !== 'took_remote') { if (x.action === 'rejected-older') c.ignored++; return; }
    c.received++;
    if (x.action === 'create') c.created++; else if (x.action === 'update') c.updated++; else if (x.action === 'delete' || x.action === 'tombstone') c.deleted++;
    else if (x.action === 'conflict'){ if (x.snapshot) c.deleted++; else c.updated++; }
  });
}

/* ---------------- capture: server sync (06g) ---------------- */
function jrOutItems(ch, rejected){
  const rej = new Map((rejected || []).map(x => [x.type + ':' + x.id, x]));
  const outcome = (type, id) => { const r = rej.get(type + ':' + id); return !r ? 'accepted' : r.reason === 'tie' ? 'conflict' : r.reason === 'older' ? 'rejected-older' : 'rejected-invalid'; };
  const out = [];
  Object.keys(ch || {}).forEach(k => {
    if (k === 'log' || k === 'tombstones' || !Array.isArray(ch[k])) return;
    const type = k.replace(/s$/, '');   // binders → binder, clients → client, locations → location
    ch[k].forEach(r => out.push({type, id:r.id, code:jrCode(r), dir:'out', action:'sent', resolution:outcome(type, r.id), local_updated_at:String(r.updated_at || ''), remote_updated_at:(rej.get(type + ':' + r.id) || {}).server_updated_at || null, _rec:r}));
  });
  (ch.tombstones || []).forEach(x => out.push({type:x.type, id:x.id, code:String(x.code || ''), dir:'out', action:'sent-delete', resolution:outcome(x.type, x.id), local_updated_at:x.deletedAt, remote_updated_at:(rej.get(x.type + ':' + x.id) || {}).server_updated_at || null, _tomb:x.deletedAt}));
  return out;
}
function jrFinishServer(ctx, res){
  res = res || {};
  const items = ctx.out.concat(ctx.in), c = {sent:0, received:0, accepted:0, rejected:0, conflicts:0, created:0, updated:0, deleted:0, ignored:0};
  jrCountIn(c, ctx.in);
  ctx.out.forEach(x => { c.sent++; if (x.resolution === 'accepted') c.accepted++; else { c.rejected++; if (x.resolution === 'conflict') c.conflicts++; } });
  const interactive = !!ctx.o.interactive;
  if (!interactive && !items.length && !res.seeded) return null;   // automatic cycle with nothing to say: no entry
  if (!interactive && res.error) return null;                       // automatic retries are not journaled (status bar shows them)
  const conf = ctx.conf || {};
  return jrAdd(jrNewEntry({kind:'server', dir:'sync', auto:!interactive, ok:!res.error && !res.cancelled, error:res.error ? String(res.message || res.error) : res.cancelled ? 'cancelled' : '',
    peer:{id:'server:' + (conf.url || ''), label:t('sy_mode_server'), mode:'server', url:conf.url || ''}, user:(typeof SRV !== 'undefined' && SRV.user) || String((S.settings && S.settings.operator) || ''),
    role:(typeof SRV !== 'undefined' && SRV.role) || '', counts:c, server_journal:Array.from(new Set(ctx.jids)), seeded:!!res.seeded, items}));
}

/* ---------------- wrappers ---------------- */
function jrWrapSync(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function' || orig.__jr) return; const w = fn(orig); w.__jr = true; window[name] = w; };
  // package text → fingerprint of the file (kept on the parsed package, never sent anywhere)
  wrap('syncParse', (o) => async function(text){
    const pkg = await o.apply(this, arguments);
    try { const s = String(text || ''); Object.defineProperty(pkg, '__jrFile', {value:{name:(typeof SYV !== 'undefined' && SYV.fileName) || '', sha256:await jrSha256(s), bytes:s.length}, enumerable:false}); } catch(e){}
    return pkg;
  });
  wrap('syncOpenReview', (o) => function(plan){ try { plan.jrReviewed = true; plan.items.forEach(i => { i.jrProposed = i.choice; }); } catch(e){} return o.apply(this, arguments); });
  wrap('syncApply', (o) => function(plan, opts){
    let items = null; try { items = jrPlanItems(plan); } catch(e){ console.warn('journal', e); }
    const r = o.apply(this, arguments);
    try {
      if (items){
        jrAfterApply(items);
        if (plan.peer && plan.peer.mode === 'server'){ if (JR.cur) JR.cur.in.push(...items); }
        else {
          const c = {sent:0, received:0, accepted:0, rejected:0, conflicts:0, created:0, updated:0, deleted:0, ignored:0}; jrCountIn(c, items);
          const f = (plan.pkg && plan.pkg.__jrFile) || {};
          jrAdd(jrNewEntry({kind:'package', dir:'import', user:String(S.settings.operator || ''), counts:c, items,
            peer:{id:plan.peer.id, label:plan.peer.label, mode:plan.peer.mode, file:f.name || '', sha256:f.sha256 || '', bytes:f.bytes || 0, exportedAt:plan.pkg && plan.pkg.exportedAt, full:!(plan.pkg && plan.pkg.since)}}));
        }
      }
    } catch(e){ console.warn('journal', e); }
    return r;
  });
  wrap('syncExport', (o) => async function(opts){
    const r = await o.apply(this, arguments);
    try {
      const P = r.pkg, recs = P.records || {}, items = [];
      Object.keys(recs).forEach(k => (recs[k] || []).forEach(x => items.push({type:k.replace(/s$/, ''), id:x.id, code:jrCode(x), dir:'out', action:'sent', resolution:'', local_updated_at:String(x.updated_at || ''), remote_updated_at:null, _rec:x})));
      (P.tombstones || []).forEach(x => items.push({type:x.type, id:x.id, code:String(x.code || ''), dir:'out', action:'sent-delete', resolution:'', local_updated_at:x.deletedAt, remote_updated_at:null, _tomb:x.deletedAt}));
      const tg = (opts && opts.target) || '', peer = tg && typeof syncPeer === 'function' ? syncPeer(tg) : null;
      jrAdd(jrNewEntry({kind:'package', dir:'export', user:String(S.settings.operator || ''), counts:Object.assign(jrNewEntry().counts, {sent:items.length}), items,
        peer:{id:tg, label:peer ? peer.label : '', mode:peer ? peer.mode : '', file:r.name, sha256:await jrSha256(r.text), bytes:r.text.length, enc:!!(opts && opts.pass), full:!P.since, since:P.since || null}}));
    } catch(e){ console.warn('journal', e); }
    return r;
  });
  wrap('srvSync', (o) => async function(opts){
    const conf = typeof srvConf === 'function' ? srvConf() : null;
    if (!conf || (typeof SRV !== 'undefined' && SRV.busy)) return o.apply(this, arguments);
    const ctx = JR.cur = {o:opts || {}, conf, in:[], out:[], jids:[]};
    let res;
    try { res = await o.apply(this, arguments); } finally { if (JR.cur === ctx) JR.cur = null; }
    try { jrFinishServer(ctx, res); } catch(e){ console.warn('journal', e); }
    return res;
  });
  // a pull with only "older / unchanged" records skips syncApply: still journal the ignored ones
  wrap('srvApplyPlan', (o) => function(conf, plan){
    try { if (JR.cur && typeof srvHasWork === 'function' && !srvHasWork(plan)){ const items = jrPlanItems(plan); jrAfterApply(items); JR.cur.in.push(...items); } } catch(e){ console.warn('journal', e); }
    return o.apply(this, arguments);
  });
  wrap('srvPush', (o) => async function(cl, conf){
    const ctx = JR.cur; let ch = null;
    try { if (ctx) ch = srvChanges(srvPeer(conf)); } catch(e){ ch = null; }
    JR.inPush = true;
    let res; try { res = await o.apply(this, arguments); } finally { JR.inPush = false; }
    try { if (ctx && ch) ctx.out.push(...jrOutItems(ch, res.rejected)); } catch(e){ console.warn('journal', e); }
    return res;
  });
  // backups carry the journal (optional key sync_journal), a restored backup brings it back (merged by id)
  wrap('workspaceJSON', (o) => function(withLog){
    const s = o.apply(this, arguments);
    if (!withLog || !S || !Array.isArray(S.syncJournal) || !S.syncJournal.length) return s;
    return s.replace(/\n\}\s*$/, ',\n  "sync_journal": ' + JSON.stringify(S.syncJournal) + '\n}');
  });
  wrap('logImport', (o) => function(mode, IP){
    try { const W = IP && IP.workspace; if (W && Array.isArray(W.sync_journal) && UI.restoreAll && mode === 'replace') jrMerge(W.sync_journal); } catch(e){}
    return o.apply(this, arguments);
  });
  wrap('viewSync', (o) => function(){ return o.apply(this, arguments) + '<div class="card card-p jr-card" id="jr-card">' + jrCardInner() + '</div>'; });
}
function jrMerge(list){
  jrEnsure();
  const have = new Set(S.syncJournal.map(e => e.id));
  list.forEach(e => { if (e && typeof e === 'object' && typeof e.id === 'string' && typeof e.at === 'string' && !have.has(e.id)){ S.syncJournal.push(e); have.add(e.id); } });
  S.syncJournal.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  jrPrune();
}
/** 10-auth.js classes: loaded after this file on index.html, before it on scan.html. */
function jrWrapProviders(){
  if (typeof DMServer !== 'undefined' && !DMServer.prototype.call.__jr){
    const o = DMServer.prototype.call;
    DMServer.prototype.call = async function(){ const r = await o.apply(this, arguments); try { if (JR.cur && r && r.journal_id) JR.cur.jids.push(r.journal_id); } catch(e){} return r; };
    DMServer.prototype.call.__jr = true;
  }
  if (typeof RemoteDataProvider !== 'undefined' && !RemoteDataProvider.prototype.saveBinderPatch.__jr){
    const o = RemoteDataProvider.prototype.saveBinderPatch;
    RemoteDataProvider.prototype.saveBinderPatch = async function(id, patch, opts){
      opts = opts || {};
      const base = this.last && this.last.get(id), u = opts.user || {};
      const fields = (b2) => base ? Object.entries(mobileDiff(base, b2 || mobileApplyPatch(base, patch || {}, base.updated_at))).map(([k, v]) => [k, jrCut(v[0]), jrCut(v[1])]) : Object.keys(patch || {}).map(k => [k, '', jrVal(k, patch[k])]);
      const entry = (ok, res, extra) => jrPhoneAdd(jrNewEntry(Object.assign({kind:'phone', dir:'patch', ok, user:u.display_name || u.username || '', role:u.role || '',
        peer:{id:'server:' + (this.srv && this.srv.base || ''), label:t('sy_mode_server'), mode:'server', url:this.srv && this.srv.base || ''},
        counts:Object.assign(jrNewEntry().counts, {sent:1, accepted:res === 'accepted' || res === 'forced' ? 1 : 0, rejected:res === 'conflict' ? 1 : 0, conflicts:res === 'conflict' ? 1 : 0})}, extra)));
      this.srv.lastJournalId = null;
      try {
        const r = await o.apply(this, arguments);
        const res = opts.force ? 'forced' : 'accepted';
        entry(true, res, {server_journal:this.srv.lastJournalId ? [this.srv.lastJournalId] : [], items:[{type:'binder', id, code:jrCode(r.binder || base), dir:'out', action:'update', resolution:res, local_updated_at:opts.etag || '', remote_updated_at:r.etag || '', fields:fields()}]});
        return r;
      } catch(e){
        const cur = e.code === 'conflict' && e.data && e.data.current ? e.data.current : null;
        const res = e.code === 'conflict' ? 'conflict' : e.code === 'offline' ? 'queued' : 'error';
        entry(false, res, {error:String(e.code || e.message || 'error'), items:[{type:'binder', id, code:jrCode(base || (cur && cur.binder)), dir:'out', action:'update', resolution:res, local_updated_at:opts.etag || '', remote_updated_at:cur ? cur.etag : null, fields:fields()}]});
        throw e;
      }
    };
    RemoteDataProvider.prototype.saveBinderPatch.__jr = true;
  }
}

/* ---------------- phone journal (scan.html, encrypted in the vault) ---------------- */
async function jrPhoneLoad(){
  if (JR.phone.list) return JR.phone.list;
  let l = [];
  try { if (typeof DocMapVault !== 'undefined' && DocMapVault.isUnlocked() && localStorage.getItem(JR_PHONE_VAULT)) l = (await vaultGetJSON(JR_PHONE_VAULT)) || []; } catch(e){ l = []; }
  JR.phone.list = Array.isArray(l) ? l : [];
  return JR.phone.list;
}
function jrPhoneAdd(e){
  const p = (async () => {
    if (typeof DocMapVault === 'undefined' || !DocMapVault.isUnlocked()) return e;   // no vault (no login): nothing is kept on the phone
    const l = await jrPhoneLoad(); l.push(e); if (l.length > JR_PHONE_CAP) l.splice(0, l.length - JR_PHONE_CAP);
    try { await vaultPutJSON(JR_PHONE_VAULT, l); } catch(err){ console.warn('journal', err); }
    return e;
  })();
  JR.last = JR.last.then(() => p).catch(() => p);
  return p;
}
function jrPhoneHTML(){
  const l = (JR.phone.list || []).slice().reverse().slice(0, 50);
  const res = (x) => ({accepted:'ok', forced:'forced', conflict:'conflict', queued:'queued'}[x] || 'err');
  let name = ''; try { name = localStorage.getItem(JR_LABEL_LS) || ''; } catch(e){}
  return '<main class="sc-main jr-ph"><div class="sc-edit-h"><button type="button" class="sc-icon" data-jr="ph-back" aria-label="' + esc(t('sc_back')) + '">' + (typeof sic === 'function' ? sic('back') : '‹') + '</button><h1>' + esc(t('jr_ph_h')) + '</h1></div>' +
    '<p class="sc-muted jr-ph-p">' + esc(t('jr_ph_p')) + '</p>' +
    (l.length ? '<ul class="jr-ph-list" id="jr-ph-list">' + l.map(e => { const it = (e.items || [])[0] || {}, r = res(it.resolution);
      return '<li class="sc-card jr-ph-it"><div class="jr-ph-row"><b class="jr-ph-code">' + esc(it.code || it.id || '?') + '</b><span class="jr-ph-st jr-st-' + r + '">' + esc(t('jr_ph_' + r)) + '</span></div>' +
        '<div class="sc-muted jr-ph-meta">' + esc(fmtDate(e.at, true)) + (e.server_journal && e.server_journal.length ? ' · #' + esc(e.server_journal.join(',')) : '') + '</div>' +
        ((it.fields || []).length ? '<div class="jr-ph-f">' + esc(t('jr_ph_fields', {f:it.fields.map(f => (typeof MOBILE_FIELD_IT !== 'undefined' && S.lang === 'it' && MOBILE_FIELD_IT[f[0]]) || f[0].replace(/_/g, ' ')).join(', ')})) + '</div>' : '') + '</li>'; }).join('') + '</ul>'
      : '<div class="sc-card sc-muted" id="jr-ph-empty">' + esc(t('jr_ph_none')) + '</div>') +
    '<section class="sc-card"><label class="sc-field"><span>' + esc(t('jr_ph_name')) + '</span><input id="jr-ph-name" value="' + esc(name) + '" placeholder="' + esc(jrUaSummary()) + '" maxlength="80" autocomplete="off"></label>' +
      '<button type="button" class="sc-btn sc-block" data-jr="ph-name">' + esc(t('jr_ph_save')) + '</button><div class="sc-muted jr-ph-dev">' + esc(jrDeviceId()) + '</div></section></main>';
}
async function jrPhoneOpen(){
  if (typeof SC === 'undefined') return;
  JR.phone.list = null; await jrPhoneLoad();
  JR.phone.back = SC.view; SC.view = 'journal'; scRender(); window.scrollTo(0, 0);
}

/* ---------------- desktop card (⚙ Sincronizzazione) ---------------- */
function jrSrvRole(){ return typeof SRV !== 'undefined' && typeof srvConf === 'function' && srvConf() ? SRV.role : ''; }
function jrMatch(e, f){
  const day = String(e.at || '').slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  const has = (v, q) => String(v || '').toLowerCase().includes(String(q).toLowerCase().trim());
  if (f.user && !has(e.user, f.user) && !has(e.operator, f.user)) return false;
  const d = e.device || {};
  if (f.device && !has(d.name, f.device) && !has(d.id, f.device)) return false;
  if (f.code && !(e.records || e.items || []).some(it => has(it.code, f.code) || has(it.id, f.code))) return false;
  return true;
}
function jrLocalList(){ jrEnsure(); return S.syncJournal.slice().reverse().filter(e => jrMatch(e, JR.ui.f)); }
function jrSrvList(){ return JR.srv.items.filter(e => jrMatch(e, JR.ui.f)); }
const jrBadge = (cls, txt) => '<span class="badge ' + cls + '">' + esc(txt) + '</span>';
function jrCountsHTML(c, srv){
  if (!c) return '';
  const k = srv ? ['sent', 'accepted', 'rejected', 'conflicts', 'same'] : ['received', 'sent', 'rejected', 'conflicts'];
  return k.filter(x => c[x]).map(x => '<span class="jr-cnt jr-cnt-' + x + '">' + esc(t('jr_c_' + x, {n:c[x]})) + '</span>').join('') || '<span class="muted">—</span>';
}
function jrRowHTML(e, srv, i){
  const kind = srv ? 'server' : e.kind, dir = srv ? e.route : e.dir;
  const peer = srv ? e.device.name : (e.peer.file || e.peer.label || e.peer.id || '—');
  return '<tr data-jrrow="' + i + '"><td class="small nowrap">' + esc(syDateS(e.at)) + '</td>' +
    '<td><span class="jr-kind jr-k-' + esc(kind) + '">' + esc(t('jr_k_' + kind)) + '</span> <span class="small">' + esc(t('jr_d_' + dir) || dir) + '</span>' + (e.auto ? ' <span class="tiny muted">' + esc(t('jr_auto')) + '</span>' : '') +
      (e.ok === false ? ' ' + jrBadge('b-err', e.error === 'cancelled' ? t('jr_cancelled') : t('jr_err')) : '') + '</td>' +
    '<td class="small jr-peer" title="' + esc(srv ? e.device.id : e.peer.id || '') + '">' + esc(peer) + '</td>' +
    '<td class="small">' + esc(e.user || '—') + (e.role ? ' <span class="tiny muted">' + esc(e.role) + '</span>' : '') + '</td>' +
    '<td class="small">' + esc(srv ? e.device.app : (e.device && e.device.name) || '') + '</td>' +
    '<td><div class="jr-cnts">' + jrCountsHTML(e.counts, srv) + '</div></td>' +
    '<td class="acts"><button class="btn btn-sm" data-a="jr-detail" data-i="' + i + '" data-src="' + (srv ? 'srv' : 'local') + '">' + esc(t('jr_det')) + '</button></td></tr>';
}
function jrListHTML(){
  const srv = JR.ui.src === 'srv';
  if (srv && !jrSrvRole()) return '<div class="hint">' + esc(t('jr_srv_need')) + '</div>';
  if (srv && JR.srv.loading && !JR.srv.items.length) return '<div class="small muted" id="jr-loading">' + esc(t('jr_loading')) + '</div>';
  if (srv && JR.srv.err) return '<div class="err-t small" id="jr-srv-err">' + esc(t('jr_srv_err', {m:JR.srv.err})) + '</div>';
  const all = srv ? jrSrvList() : jrLocalList(), rows = srv ? all : all.slice(0, JR.ui.limit);
  if (!all.length) return '<div class="small muted" id="jr-empty">' + esc(!srv && !Object.values(JR.ui.f).some(Boolean) && I18N.it.hx_jr_empty ? t('hx_jr_empty') : t('jr_none')) + '</div>';   // v11.1: first-use hint (07b-helpx.js)
  const head = '<thead><tr><th>' + esc(t('jr_when')) + '</th><th>' + esc(t('jr_dir')) + '</th><th>' + esc(srv ? t('jr_device') : t('jr_peer')) + '</th><th>' + esc(t('jr_user')) + '</th><th>' + esc(srv ? t('jr_i_app') : t('jr_device')) + '</th><th>' + esc(t('jr_res')) + '</th><th></th></tr></thead>';
  JR.rows = rows;
  return '<div class="tbl-wrap jr-tbl-wrap"><table class="tbl jr-tbl" id="jr-tbl">' + head + '<tbody>' + rows.map((e, i) => jrRowHTML(e, srv, i)).join('') + '</tbody></table></div>' +
    '<div class="row jr-foot"><span class="small muted">' + esc(t('jr_n', {n:srv ? rows.length : all.length})) + '</span>' +
      ((srv ? JR.srv.more : all.length > rows.length) ? '<button class="btn btn-sm" data-a="jr-more">' + esc(t('jr_more')) + '</button>' : '') + '</div>';
}
function jrCardInner(){
  const role = jrSrvRole(), f = JR.ui.f, srv = JR.ui.src === 'srv';
  const inp = (k, type, ph) => '<div class="field"><label for="jr-f-' + k + '">' + esc(t('jr_' + k)) + '</label><input class="inp" id="jr-f-' + k + '" type="' + type + '" data-jrf="' + k + '" value="' + esc(f[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off"></div>';
  return '<div class="row between jr-head"><div><h2 style="margin:0">' + ic('clock') + ' ' + esc(t('jr_h')) + (typeof helpDot === 'function' ? helpDot('journal') : '') + '</h2><p class="card-sub" style="margin:4px 0 0">' + esc(t('jr_p')) + '</p></div>' +
      (role === 'admin' || role === 'editor' ? '<div class="seg" id="jr-src"><button class="' + (srv ? '' : 'on') + '" data-a="jr-src" data-v="local">' + esc(t('jr_src_local')) + '</button>' +
        '<button class="' + (srv ? 'on' : '') + '" data-a="jr-src" data-v="srv">' + esc(t(role === 'admin' ? 'jr_src_srv' : 'jr_src_srv_own')) + '</button></div>' : '') + '</div>' +
    '<div class="jr-filters">' + inp('from', 'date') + inp('to', 'date') + inp('user', 'text') + inp('device', 'text') + inp('code', 'text', 'BL1') +
      '<div class="jr-fbtn"><button class="btn btn-sm" data-a="jr-reset">' + esc(t('jr_reset')) + '</button></div></div>' +
    '<div id="jr-list">' + jrListHTML() + '</div>' +
    '<div class="row jr-exp"><button class="btn btn-sm" data-a="jr-csv">' + ic('download') + esc(t('jr_csv')) + '</button><button class="btn btn-sm" data-a="jr-json">' + ic('download') + esc(t('jr_json')) + '</button></div>';
}
function jrRefreshCard(){ const c = document.getElementById('jr-card'); if (c && typeof viewSync === 'function') c.innerHTML = jrCardInner(); }
function jrRefreshList(){ const l = document.getElementById('jr-list'); if (l) l.innerHTML = jrListHTML(); }

/* server journal */
async function jrSrvLoad(more){
  const conf = typeof srvConf === 'function' ? srvConf() : null; if (!conf) return;
  JR.srv.loading = true; JR.srv.err = ''; if (!more){ JR.srv.items = []; JR.srv.next = null; } jrRefreshList();
  const f = JR.ui.f, q = {limit:50};
  if (f.from) q.from = f.from; if (f.to) q.to = f.to; if (f.user && SRV.role === 'admin') q.user = f.user; if (f.code) q.code = f.code;
  if (more && JR.srv.next) q.before = JR.srv.next;
  try { const r = await srvClient(conf).call('journal', {q}); JR.srv.items = JR.srv.items.concat(r.items || []); JR.srv.more = !!r.more; JR.srv.next = r.next_before; JR.srv.loaded = true; }
  catch(e){ JR.srv.err = e.message || e.code || 'error'; }
  JR.srv.loading = false; jrRefreshList();
}

/* detail modal */
function jrDecHTML(it){
  const r = it.resolution ? '<div class="small">' + esc(t('jr_r_' + it.resolution) || it.resolution) + '</div>' : '';
  return r + (it.how ? '<div class="tiny muted">' + esc(t('jr_how_' + it.how)) + '</div>' : '') + (it.reason ? '<div class="tiny muted">' + esc((typeof t === 'function' && I18N[S.lang]['sy_r_' + it.reason]) ? t('sy_r_' + it.reason) : it.reason) + '</div>' : '');
}
function jrDiffHTML(fields, la, lb){
  if (!fields || !fields.length) return '<div class="small muted">' + esc(t('jr_nodiff')) + '</div>';
  const lab = (k) => typeof syFieldLabel === 'function' ? syFieldLabel(k) : k;
  return '<table class="tbl jr-diff"><thead><tr><th>' + esc(t('sy_field')) + '</th><th>' + esc(la) + '</th><th>' + esc(lb) + '</th></tr></thead><tbody>' +
    fields.map(f => '<tr><td class="small"><b>' + esc(lab(f[0])) + '</b></td><td class="small jr-v jr-v-a">' + (f[1] === '' ? '<span class="muted">—</span>' : esc(logCut(f[1], 400))) + '</td><td class="small jr-v jr-v-b">' + (f[2] === '' ? '<span class="muted">—</span>' : esc(logCut(f[2], 400))) + '</td></tr>').join('') + '</tbody></table>';
}
const jrShort = (h) => h ? '<span class="mono tiny" title="' + esc(h) + '">' + esc(h.slice(0, 12)) + '</span>' : '<span class="muted">—</span>';
function jrLocalDetailHTML(e){
  const P = e.peer || {}, D = e.device || {};
  const info = [[t('jr_i_at'), syDateS(e.at)], [t('jr_i_peer'), (P.label || P.id || '—') + (P.mode ? ' · ' + (t('sy_mode_' + P.mode) || P.mode) : '')], [t('jr_i_dev'), (D.name || '') + ' · ' + (D.id || '')], [t('jr_i_app'), D.app || ''], [t('jr_i_user'), e.user || '—']]
    .concat(P.file ? [[t('jr_i_file'), P.file + (P.enc ? ' 🔒' : '')], [t('jr_i_hash'), P.sha256 || '']] : []).concat(e.server_journal && e.server_journal.length ? [[t('jr_i_srvj'), '#' + e.server_journal.join(', #')]] : []);
  const order = (e.items || []).map((it, k) => k).sort((a, b) => jrRank(e.items[a]) - jrRank(e.items[b]) || a - b);   // conflicts first
  const rows = order.map(k => { const it = e.items[k];
    const canRs = jrCanRestoreLocal(it);
    const la = it.dir === 'out' ? t('jr_before') : t('jr_here'), lb = it.dir === 'out' ? t('jr_after') : t('jr_other');
    return '<tr class="jr-it" data-k="' + k + '"><td><b class="mono">' + esc(it.code || it.id) + '</b><div class="tiny muted mono" title="' + esc(it.id) + '">' + esc(String(it.id).slice(0, 8)) + '</div></td><td class="small">' + esc(jrType(it.type)) + '</td>' +
      '<td>' + jrBadge(jrActCls(it.action), t('jr_a_' + it.action) || it.action) + '</td><td>' + jrDecHTML(it) + '</td>' +
      '<td class="small nowrap">' + esc(syDateS(it.local_updated_at)) + '</td><td class="small nowrap">' + esc(syDateS(it.remote_updated_at)) + '</td><td>' + jrShort(it.hash) + '</td></tr>' +
      ((it.fields && it.fields.length) || canRs ? '<tr class="jr-it-d"><td colspan="7"><details' + ((e.items || []).length <= 3 ? ' open' : '') + '><summary class="small">' + esc(t('jr_diff')) + '</summary><div class="jr-dbox">' + jrDiffHTML(it.fields, la, lb) +
        (canRs ? '<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-a="jr-restore" data-e="' + esc(e.id) + '" data-k="' + k + '">' + ic('undo') + esc(t('jr_rs')) + '</button><span class="tiny muted">' + esc(t(it.resolution === 'kept_local' ? 'jr_other' : 'jr_here')) + '</span></div>' : '') + '</div></details></td></tr>' : '');
  }).join('');
  return '<div class="stack jr-detail" id="jr-detail"><dl class="jr-info">' + info.map(x => '<dt>' + esc(x[0]) + '</dt><dd' + (x[0] === t('jr_i_hash') ? ' class="mono tiny"' : '') + '>' + esc(x[1]) + '</dd>').join('') + '</dl>' +
    '<div class="jr-cnt-row">' + jrCountsHTML(e.counts, false) + '</div>' + (e.error && e.error !== 'cancelled' ? '<div class="err-t small">' + esc(e.error) + '</div>' : '') +
    (e.items_total > (e.items || []).length ? '<div class="hint">' + esc(t('jr_trunc', {n:(e.items || []).length, t:e.items_total})) + '</div>' : '') +
    (rows ? '<div class="tbl-wrap"><table class="tbl jr-items"><thead><tr><th>' + esc(t('jr_col_code')) + '</th><th>' + esc(t('jr_col_type')) + '</th><th>' + esc(t('jr_col_action')) + '</th><th>' + esc(t('jr_col_dec')) + '</th><th>' + esc(t('jr_col_here')) + '</th><th>' + esc(t('jr_col_other')) + '</th><th>' + esc(t('jr_col_hash')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') + '</div>';
}
function jrSrvDetailHTML(e){
  const admin = SRV.role === 'admin';
  const info = [[t('jr_i_at'), syDateS(e.at) + ' · #' + e.jid], [t('jr_dir'), t('jr_d_' + e.route) || e.route], [t('jr_i_dev'), e.device.name + ' · ' + e.device.id], [t('jr_i_app'), e.device.app], [t('jr_i_user'), e.user + ' (' + e.role + ')' + (e.operator && e.operator !== e.user ? ' · ' + e.operator : '')]]
    .concat(e.ip ? [['IP', e.ip]] : []);
  const rows = (e.records || []).map((it, k) => {
    const fields = it.prev !== undefined || it.new !== undefined ? jrDiff(it.prev, it.new) : [];
    const rs = admin && it.type !== 'settings' && !/^pull/.test(it.action) && it.action !== 'rejected-invalid';
    const btn = (ver, lab) => '<button class="btn btn-sm" data-a="jr-restore-srv" data-jid="' + e.jid + '" data-n="' + it.n + '" data-v="' + ver + '" data-c="' + esc(it.code || it.id) + '">' + ic('undo') + esc(t(lab)) + '</button>';
    return '<tr class="jr-it"><td><b class="mono">' + esc(it.code || it.id) + '</b><div class="tiny muted mono" title="' + esc(it.id) + '">' + esc(String(it.id).slice(0, 8)) + '</div></td><td class="small">' + esc(jrType(it.type)) + '</td><td>' + jrBadge(jrActCls(it.action), t('jr_a_' + it.action) || it.action) + (it.reason ? '<div class="tiny muted">' + esc(it.reason) + '</div>' : '') + '</td>' +
      '<td class="small nowrap">' + esc(syDateS(it.client_updated_at)) + '</td><td class="small nowrap">' + esc(syDateS(it.prev_updated_at)) + ' → ' + esc(syDateS(it.new_updated_at)) + '</td><td>' + jrShort(it.prev_hash) + '<br>' + jrShort(it.new_hash) + '</td></tr>' +
      (fields.length || rs ? '<tr class="jr-it-d"><td colspan="6"><details' + ((e.records || []).length <= 3 ? ' open' : '') + '><summary class="small">' + esc(t('jr_diff')) + '</summary><div class="jr-dbox">' + jrDiffHTML(fields, t('jr_before'), /^(conflict|rejected)/.test(it.action) ? t('jr_tried') : t('jr_after')) +
        (rs ? '<div class="row" style="margin-top:8px;gap:8px">' + (it.prev ? btn('prev', 'jr_rs_prev') : '') + (/^(conflict|rejected-older)$/.test(it.action) && it.new ? btn('new', 'jr_rs_new') : '') + '</div>' : '') + '</div></details></td></tr>' : '');
  }).join('');
  return '<div class="stack jr-detail" id="jr-detail"><dl class="jr-info">' + info.map(x => '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>').join('') + '</dl><div class="jr-cnt-row">' + jrCountsHTML(e.counts, true) + '</div>' +
    (e.items_total > (e.records || []).length ? '<div class="hint">' + esc(t('jr_trunc', {n:(e.records || []).length, t:e.items_total})) + '</div>' : '') +
    (rows ? '<div class="tbl-wrap"><table class="tbl jr-items"><thead><tr><th>' + esc(t('jr_col_code')) + '</th><th>' + esc(t('jr_col_type')) + '</th><th>' + esc(t('jr_col_action')) + '</th><th>' + esc(t('jr_col_here')) + '</th><th>' + esc(t('jr_col_other')) + '</th><th>' + esc(t('jr_col_hash')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '') + '</div>';
}
const jrRank = (it) => it.action === 'conflict' ? 0 : /rejected|delete/.test(it.action || '') || /rejected|conflict/.test(it.resolution || '') ? 1 : 2;
const jrType = (ty) => I18N[S.lang]['jr_t_' + ty] ? t('jr_t_' + ty) : ty;
const jrActCls = (a) => /^(create|pull)$/.test(a) ? 'b-new' : /delete|tombstone/.test(a) ? 'b-err' : /conflict/.test(a) ? 'b-out' : /rejected/.test(a) ? '' : 'b-upd';
async function jrOpenDetail(src, i){
  const e = (JR.rows || [])[i]; if (!e) return;
  if (src === 'local'){ openModal({title:t('jr_t_entry'), size:'lg', autofocus:false, body:jrLocalDetailHTML(e), buttons:[{label:t('close'), cls:'btn', action:'modal-close'}]}); return; }
  let full = e;
  try { const r = await srvClient(srvConf()).call('journal', {q:{entry:e.jid}}); full = (r.items || [])[0] || e; } catch(err){ toast(t('jr_srv_err', {m:err.message || err.code}), 'err', 6000); }
  JR.srvDetail = full;
  openModal({title:t('jr_t_entry') + ' #' + e.jid, size:'lg', autofocus:false, body:jrSrvDetailHTML(full), buttons:[{label:t('close'), cls:'btn', action:'modal-close'}]});
}

/* restore */
function jrList(type){ return type === 'binder' ? S.binders : type === 'client' ? (S.clients || (S.clients = [])) : (Array.isArray(S[type + 's']) ? S[type + 's'] : null); }
function jrCanRestoreLocal(it){
  if (!jrList(it.type) || it.dir === 'out') return false;
  if (it.snapshot && !jrList(it.type).some(r => r.id === it.id)) return true;   // deleted here: the full copy can come back
  return !!(it.fields && it.fields.length && it.fields.every(f => String(f[1]).length <= JR_VAL_MAX && String(f[2]).length <= JR_VAL_MAX) && jrList(it.type).some(r => r.id === it.id));
}
/** Coerce a journaled string value back to the field's type. */
function jrCoerce(k, v, cur){
  if (k === 'contents_items') return typeof pipeToContents === 'function' ? ciCarryIds(cur, pipeToContents(v)) : [];
  if (typeof cur === 'boolean') return v === 'true';
  if (typeof cur === 'number') return +v || 0;
  if (cur && typeof cur === 'object'){ try { return JSON.parse(v); } catch(e){ return cur; } }
  return v;
}
function jrRestoreLocal(eid, k){
  const e = S.syncJournal.find(x => x.id === eid), it = e && e.items[k]; if (!it) return;
  const list = jrList(it.type), idx = list ? list.findIndex(r => r.id === it.id) : -1;
  if (idx < 0 && !it.snapshot){ toast(t('jr_rs_gone'), 'err', 6000); return; }
  confirmAction({title:t('jr_rs_t'), detail:t('jr_rs_d', {c:it.code || it.id}), okLabel:t('jr_rs'), plain:true, onOk:() => {
    undoPoint();
    const side = it.resolution === 'kept_local' ? 2 : 1;   // restore the version that did NOT win
    let before = null, after;
    if (idx < 0){ after = clone(it.snapshot); list.push(after); }
    else {
      before = clone(list[idx]); after = list[idx];
      (it.fields || []).forEach(f => { after[f[0]] = jrCoerce(f[0], f[side], before[f[0]]); });
    }
    const norm = it.type === 'binder' ? normalizeBinder(after) : it.type === 'client' ? normalizeClient(after) : after;
    if (norm !== after){ norm.id = after.id; if (after.created_at) norm.created_at = after.created_at; list[idx < 0 ? list.length - 1 : idx] = norm; }
    // a NEW change: later than the current version and than any deletion we know of, so it wins everywhere at the next sync
    const tb = (S.tombstones || []).find(x => x.type === it.type && x.id === it.id);
    norm.updated_at = syNext(syMax(before ? before.updated_at : null, tb ? tb.deletedAt : null), nowISO());
    if (typeof ensureIntegrity === 'function') ensureIntegrity();
    if (typeof logAct === 'function') logAct('sync.restore', {type:it.type, id:it.id, code:it.code}, 'Ripristinata dal registro sincronizzazioni una versione di ' + (it.code || it.id) + ' (' + syDateS(e.at) + ')', {journal_entry:e.id, item:k, side:side === 1 ? 'here' : 'other'}, 'sync');
    commit();
    const now = list.find(r => r.id === it.id);
    jrAdd(jrNewEntry({kind:'restore', dir:'restore', user:String(S.settings.operator || ''), peer:{id:e.id, label:t('jr_h'), mode:''}, counts:Object.assign(jrNewEntry().counts, {updated:1}),
      items:[{type:it.type, id:it.id, code:it.code, dir:'in', action:'restore', resolution:'', reason:'journal ' + e.id + '/' + k, local_updated_at:before ? before.updated_at : null, remote_updated_at:now ? now.updated_at : null,
        fields:before ? jrDiff(before, now) .map(f => [f[0], jrCut(f[1]), jrCut(f[2])]) : [], _rec:now || null}]}));
    closeModal(true); renderAll();
    toast(t('jr_rs_done', {c:it.code || it.id}));
  }});
}
function jrRestoreSrv(el){
  if (SRV.role !== 'admin'){ toast(t('jr_rs_srv_only'), 'warn'); return; }
  const c = el.dataset.c, body = {jid:+el.dataset.jid, n:+el.dataset.n, version:el.dataset.v};
  confirmAction({title:t('jr_rs_t'), detail:t('jr_rs_d', {c}), okLabel:t('jr_rs'), plain:true, onOk:async () => {
    try {
      const r = await srvClient(srvConf()).call('journal_restore', {method:'POST', body});
      logAct('sync.restore', {type:r.type, id:r.id, code:c}, 'Ripristinata sul server dal registro sincronizzazioni una versione di ' + c + ' (voce #' + body.jid + '/' + body.n + ')', {server_journal:r.journal_id, source:body}, 'sync');
      closeModal(true); toast(t('jr_rs_srv_done', {c}));
      await srvSync({interactive:true});
      if (JR.ui.src === 'srv') jrSrvLoad(false);
    } catch(e){ toast(t('jr_srv_err', {m:e.message || e.code}), 'err', 7000); }
  }});
}

/* export (dispute evidence) */
const JR_CSV_COLS = ['source', 'entry', 'at', 'kind', 'direction', 'peer', 'file', 'file_sha256', 'user', 'role', 'device_id', 'device_name', 'app_version', 'result', 'record_type', 'record_id', 'code', 'action', 'resolution', 'how', 'reason',
  'client_or_local_updated_at', 'prev_or_remote_updated_at', 'new_updated_at', 'prev_hash', 'new_hash', 'fields', 'server_journal'];
function jrCsvRows(){
  const srv = JR.ui.src === 'srv', rows = [JR_CSV_COLS];
  (srv ? jrSrvList() : jrLocalList()).forEach(e => {
    const base = srv ? ['server', e.jid, e.at, 'server', e.route, '', '', '', e.user, e.role, e.device.id, e.device.name, e.device.app, Object.keys(e.counts).map(k => k + '=' + e.counts[k]).join(' ')]
      : ['local', e.id, e.at, e.kind, e.dir, e.peer.label || e.peer.id || '', e.peer.file || '', e.peer.sha256 || '', e.user, e.role, (e.device || {}).id, (e.device || {}).name, (e.device || {}).app, (e.ok === false ? 'error ' + e.error + ' · ' : '') + Object.keys(e.counts || {}).filter(k => e.counts[k]).map(k => k + '=' + e.counts[k]).join(' ')];
    const its = srv ? (e.records || []) : (e.items || []);
    if (!its.length) rows.push(base.concat(new Array(JR_CSV_COLS.length - base.length).fill('')));
    its.forEach(it => rows.push(base.concat(srv ? [it.type, it.id, it.code, it.action, '', '', it.reason, it.client_updated_at || '', it.prev_updated_at || '', it.new_updated_at || '', it.prev_hash || '', it.new_hash || '', '', e.jid]
      : [it.type, it.id, it.code, it.action, it.resolution || '', it.how || '', it.reason || '', it.local_updated_at || '', it.remote_updated_at || '', '', '', it.hash || '', (it.fields || []).map(f => f[0] + ': ' + logCut(f[1], 80) + ' → ' + logCut(f[2], 80)).join(' | '), (e.server_journal || []).join(',')])));
  });
  return rows;
}
function jrExport(kind){
  const d = new Date(), p = (n) => String(n).padStart(2, '0'), stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  const srv = JR.ui.src === 'srv', name = 'docmap-registro-sync-' + (srv ? 'server' : 'locale') + '-' + stamp + '.' + kind;
  if (kind === 'csv') download(name, '\ufeff' + toCSV(jrCsvRows().map(r => r.map(safeCell)), ';'), 'text/csv');
  else download(name, JSON.stringify({format:'docmap-sync-journal', version:1, app:'DocMap26', appVersion:APP_VERSION, exportedAt:nowISO(), source:srv ? 'server' : 'local',
    device:jrClientInfo(), filters:JR.ui.f, entries:srv ? jrSrvList() : jrLocalList()}, null, 1), 'application/json');
  logAct('sync.journal_export', {type:'file', id:'', code:name}, 'Esportato il registro sincronizzazioni (' + (srv ? 'server' : 'questo dispositivo') + ')', {file:name, filters:JR.ui.f}, 'sync');
  toast(t('jr_exported', {f:name}));
}

const JR_ACTIONS = {
  'jr-src': (el) => { JR.ui.src = el.dataset.v === 'srv' ? 'srv' : 'local'; jrRefreshCard(); if (JR.ui.src === 'srv') jrSrvLoad(false); },
  'jr-more': () => { if (JR.ui.src === 'srv') jrSrvLoad(true); else { JR.ui.limit += JR_PAGE; jrRefreshList(); } },
  'jr-reset': () => { JR.ui.f = {from:'', to:'', user:'', device:'', code:''}; JR.ui.limit = JR_PAGE; jrRefreshCard(); if (JR.ui.src === 'srv') jrSrvLoad(false); },
  'jr-detail': (el) => jrOpenDetail(el.dataset.src, +el.dataset.i),
  'jr-restore': (el) => jrRestoreLocal(el.dataset.e, +el.dataset.k),
  'jr-restore-srv': (el) => jrRestoreSrv(el),
  'jr-csv': () => jrExport('csv'),
  'jr-json': () => jrExport('json')
};

/* ---------------- registration ---------------- */
jrWrapSync();
jrWrapProviders();
if (typeof ICONS !== 'undefined' && !ICONS.clock) ICONS.clock = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
if (typeof ICONS !== 'undefined' && !ICONS.undo) ICONS.undo = '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>';
let jrFilterTimer = 0;
document.addEventListener('input', (e) => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.jrf) return;
  JR.ui.f[el.dataset.jrf] = String(el.value || '').trim(); JR.ui.limit = JR_PAGE;
  clearTimeout(jrFilterTimer);
  jrFilterTimer = setTimeout(() => { if (JR.ui.src === 'srv' && el.dataset.jrf !== 'device') jrSrvLoad(false); else jrRefreshList(); }, el.type === 'date' ? 0 : 250);
});
document.addEventListener('click', (e) => {   // scan.html (no ACTIONS map there)
  const el = e.target.closest && e.target.closest('[data-jr]'); if (!el) return;
  const a = el.dataset.jr;
  if (a === 'ph-open') return jrPhoneOpen();
  if (a === 'ph-back'){ SC.view = JR.phone.back && JR.phone.back !== 'journal' ? JR.phone.back : 'card'; if (!SC.rec && SC.view === 'card') return scRoute(); scRender(); if (SC.view === 'card' && typeof scLoadPhoto === 'function') scLoadPhoto(); return; }
  if (a === 'ph-name'){ const v = String((document.getElementById('jr-ph-name') || {}).value || '').trim().slice(0, 80); try { if (v) localStorage.setItem(JR_LABEL_LS, v); else localStorage.removeItem(JR_LABEL_LS); } catch(err){}
    SC.msg = {kind:'ok', text:t('jr_ph_saved')}; scRender(); }
});
document.addEventListener('DOMContentLoaded', () => {
  jrWrapProviders();
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, JR_ACTIONS);
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'journal', guide:'journal', tags:['safety', 'export'], related:['sync', 'log', 'multi-device'],
    title:{it:'Registro sincronizzazioni: chi ha cambiato cosa, e come risolvere una contestazione', en:'Sync journal: who changed what, and how to settle a dispute'},
    body:{it:'<p>In <b>⚙ Funzioni avanzate › Sincronizzazione</b>, in fondo, il <b>Registro sincronizzazioni</b> elenca ogni scambio di dati: sincronizzazioni con il server, pacchetti importati ed esportati, salvataggi dai telefoni.</p><ul><li><b>Questo dispositivo</b>: cosa è arrivato qui e cosa è partito da qui, con la decisione presa su ogni faldone (tenuta la versione arrivata o quella di questo dispositivo, e perché).</li><li><b>Server</b> (amministratore): il registro del database online, di tutti i dispositivi; un editor vede solo le proprie voci.</li><li><b>Dettagli</b> mostra i campi prima e dopo; <b>Ripristina questa versione</b> la rimette come nuova modifica (resta scritto nel registro).</li><li><b>Esporta CSV / JSON</b> per conservare la prova.</li></ul><p><b>Risolvere una contestazione</b> ("chi ha spostato / cambiato questo faldone?"):</p><ol><li>Sincronizza prima con il server, così il registro è completo.</li><li>Scrivi il <b>codice del faldone</b> nel filtro (es. BL1); restringi con le date o l\'utente se serve.</li><li>Apri <b>Dettagli</b> sulle voci: campi prima → dopo, ora, utente, dispositivo, e quale versione è stata tenuta (quella arrivata o quella locale) e perché (più recente, scelta in un conflitto).</li><li>L\'amministratore passa a <b>Server</b> per vedere le stesse voci da tutti i PC e i telefoni.</li><li>Se la versione giusta è un\'altra: <b>Ripristina questa versione</b>. Non si cancella nulla: il ripristino diventa una nuova modifica, scritta nel registro, che arriva agli altri alla prossima sincronizzazione.</li><li><b>Esporta CSV / JSON</b> per conservare la prova.</li></ol><p>Differenza con il <b>Registro attività</b>: quello dice <i>cosa</i> si è fatto su questo dispositivo (crea, modifica, stampa…); il Registro sincronizzazioni dice <i>come</i> le modifiche sono passate da un dispositivo all\'altro. La procedura tecnica è in docs/SYNC.md.</p>',
          en:'<p>In <b>⚙ Advanced tools › Sync</b>, at the bottom, the <b>Sync journal</b> lists every data exchange: server syncs, imported and exported packages, saves from phones.</p><ul><li><b>This device</b>: what arrived here and what left from here, with the decision taken for each binder (incoming version or this device\'s, and why).</li><li><b>Server</b> (administrator): the online database journal, for all devices; an editor sees only their own entries.</li><li><b>Details</b> shows the fields before and after; <b>Restore this version</b> puts it back as a new change (recorded in the journal).</li><li><b>Export CSV / JSON</b> to keep the evidence.</li></ul><p><b>Settling a dispute</b> ("who moved / changed this binder?"):</p><ol><li>Sync with the server first, so the journal is complete.</li><li>Type the <b>binder code</b> in the filter (e.g. BL1); narrow with dates or user if needed.</li><li>Open <b>Details</b> on the entries: fields before → after, time, user, device, and which version was kept (incoming or local) and why (most recent, choice in a conflict).</li><li>The administrator switches to <b>Server</b> to see the same entries from all PCs and phones.</li><li>If the right version is another one: <b>Restore this version</b>. Nothing is deleted: the restore becomes a new change, recorded in the journal, that reaches the others with the next sync.</li><li><b>Export CSV / JSON</b> to keep the evidence.</li></ol><p>Difference with the <b>Activity log</b>: that one says <i>what</i> was done on this device (create, edit, print…); the Sync journal says <i>how</i> changes travelled from one device to another. The technical procedure is in docs/SYNC.md.</p>'} });
});
