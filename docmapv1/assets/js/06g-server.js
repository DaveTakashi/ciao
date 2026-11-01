/* =====================================================================
   DocMap 2026 — v10.1: sync with the SHARED ONLINE DATABASE (server-php/api.php, docs/API-CONTRACT.md)

   The server is one more sync peer of 06f-sync.js: S.sync.peers['server:<api url>'] (mode 'server').
   Every pull is turned into a sync package and goes through the same syncAnalyze → syncApply engine
   (record-level last-write-wins by updated_at, tombstones, conflict review). Pushes send what changed since
   the last successful push; the server applies LWW per record and returns what it rejected.

   Two ways to use it
   - web + apiBase (docmap.config.js of the deploy): AUTOMATIC. After unlocking the vault: pull + push; then every
     commit schedules a push (debounced), a pull runs every SRV_PULL_MS and on focus / online. Conflicts resolve
     to the most recent version (ties: the server's). Offline: changes stay in the encrypted local state (the
     "queue" is simply "changed since lastPushAt") and are retried with exponential backoff. Status in the top bar.
   - desktop local (file://): ON DEMAND. ⚙ Sincronizzazione › Server online: URL + token (+ optional folder
     password), "Sincronizza con il server" = pull → review (06f modal) when both sides changed → push.
     First sync against an EMPTY server = "Carica il mio archivio sul server (prima volta)" with a confirmation.
     URL / token live in localStorage SRV_LS (like all local-mode data: plaintext in this browser profile, never in
     backups, CSV or .sqlite). The file packages of 06f stay as a fallback.

   Peer record (in S.sync.peers, persisted with S; no schema change):
     {id, label, mode:'server', url, seq, logSeq, lastPullAt, lastPushAt, lastLogPushAt, lastSyncAt, settingsAt,
      settingsHash, lastImportAt, lastSeenRemoteExportAt (server clock), ackedAt, lastExportAt}
   In memory only: SRV.known (type:id → updated_at the server is known to hold) so pulled records are not echoed.

   Loaded by index.html after 06f-sync.js. Uses DMServer / dmServerUrl / DocMapVault from 10-auth.js at run time.
   ===================================================================== */
'use strict';

const SRV_LS = 'docmap_v26_srv';                  // desktop local mode: {url, token, basic}
const SRV_PULL_MS = 60000, SRV_PUSH_DEBOUNCE = 1500, SRV_BACKOFF_MAX = 300000, SRV_SKEW_WARN = 120000;
const SRV_REC_CHUNK = 500, SRV_LOG_CHUNK = 1000;
const SRV = { busy:false, state:'idle', err:'', skew:0, role:'', user:'', known:new Map(), knownLog:new Set(), retry:0,
  pushTimer:0, retryTimer:0, interval:0, started:false, last:null };

Object.assign(I18N.it, {
  sv_h:'Server online', sv_p:'Database condiviso dello studio sul tuo hosting (server-php). Il PC si sincronizza quando lo chiedi; la web app e i telefoni lavorano direttamente online.',
  sv_url:'Indirizzo del server', sv_url_ph:'https://docmap.pr-it.it/studio-de/server-php/api.php', sv_token:'Codice di accesso (token)', sv_basic:'Protezione con password della cartella (facoltativa)',
  sv_buser:'Utente della protezione', sv_bpass:'Password della protezione', sv_basic_hint:'Solo se la cartella è protetta con password (SiteGround) e la sincronizzazione dal PC viene bloccata.',
  sv_save:'Salva', sv_test:'Prova connessione', sv_sync:'Sincronizza con il server', sv_sync_now:'Sincronizza ora', sv_saved:'Impostazioni del server salvate',
  sv_conn:'Connesso come {u} ({r})', sv_last:'Ultima sincronizzazione', sv_never:'mai', sv_pending:'Modifiche da inviare', sv_skew:'Attenzione: l\'orologio di questo dispositivo differisce di {m} minuti da quello del server. L\'ordine delle modifiche dipende dall\'ora: correggi data e ora.',
  sv_st_ok:'Online · sincronizzato', sv_st_wait:'In attesa ({n})', sv_st_off:'Offline', sv_st_off_n:'Offline · in attesa ({n})', sv_st_sync:'Sincronizzo…', sv_st_denied:'Accesso negato', sv_st_ro:'Online · sola lettura',
  sv_e_denied:'Il server ha rifiutato il codice di accesso (errato o revocato): inseriscine uno valido.', sv_e_off:'Server non raggiungibile: riprovo da solo appena possibile.', sv_e_cfg:'Inserisci indirizzo e codice di accesso del server.',
  sv_e_locked:'Troppi codici errati da questa rete: riprova tra {s} secondi.', sv_e_server:'Errore del server: {m}', sv_e_ro:'Questo codice è di sola lettura: le modifiche non vengono inviate.',
  sv_done:'Sincronizzato con il server: {r} ricevuti, {s} inviati.', sv_cancel:'Sincronizzazione annullata: nulla è stato inviato.',
  sv_seed_t:'Carica il mio archivio sul server (prima volta)', sv_seed_d:'Il server è vuoto. Verrà caricato tutto l\'archivio di questo PC come base comune:', sv_seed_b:'{n} faldoni', sv_seed_c:'{n} clienti', sv_seed_x:'{n} eliminazioni', sv_seed_l:'{n} righe del registro attività',
  sv_seed_s:'le impostazioni condivise (nome studio, destinazione QR, colori)', sv_seed_ph:'Le foto degli armadi restano su questo PC (non vengono ancora caricate).', sv_seed_ok:'Carica sul server',
  sv_mode_auto:'Sincronizzazione automatica (web app)', sv_user:'Utente del server', sv_newtok:'Nuovo codice di accesso per questo dispositivo', sv_newtok_btn:'Sostituisci codice', sv_tok_ok:'Codice di accesso aggiornato',
  sv_tokens:'Codici di accesso', sv_tokens_d:'Crea un codice per ogni persona o telefono; revocalo quando serve (solo amministratore).', sv_tok_user:'Persona', sv_tok_role:'Ruolo', sv_tok_src:'Origine',
  sv_tok_new:'Nuovo codice', sv_tok_revoke:'Revoca', sv_tok_revoked:'revocato', sv_tok_created:'Codice per {u}: copialo ora, non verrà più mostrato', sv_tok_cfg:'config.php',
  'lga_sync.server':'Sincronizzazione server', 'lga_sync.token':'Codice di accesso al server'
});
Object.assign(I18N.en, {
  sv_h:'Online server', sv_p:'The studio\'s shared database on your hosting (server-php). The PC syncs when you ask; the web app and the phones work online directly.',
  sv_url:'Server address', sv_url_ph:'https://docmap.pr-it.it/studio-de/server-php/api.php', sv_token:'Access code (token)', sv_basic:'Folder password protection (optional)',
  sv_buser:'Protection user', sv_bpass:'Protection password', sv_basic_hint:'Only if the folder is password protected (SiteGround) and the sync from the PC is blocked.',
  sv_save:'Save', sv_test:'Test connection', sv_sync:'Sync with the server', sv_sync_now:'Sync now', sv_saved:'Server settings saved',
  sv_conn:'Connected as {u} ({r})', sv_last:'Last sync', sv_never:'never', sv_pending:'Changes to send', sv_skew:'Warning: this device\'s clock differs by {m} minutes from the server. The order of changes depends on the time: fix date and time.',
  sv_st_ok:'Online · in sync', sv_st_wait:'Waiting ({n})', sv_st_off:'Offline', sv_st_off_n:'Offline · waiting ({n})', sv_st_sync:'Syncing…', sv_st_denied:'Access denied', sv_st_ro:'Online · read only',
  sv_e_denied:'The server refused the access code (wrong or revoked): enter a valid one.', sv_e_off:'Server unreachable: retrying by itself as soon as possible.', sv_e_cfg:'Enter the server address and access code.',
  sv_e_locked:'Too many wrong codes from this network: try again in {s} seconds.', sv_e_server:'Server error: {m}', sv_e_ro:'This code is read only: changes are not sent.',
  sv_done:'Synced with the server: {r} received, {s} sent.', sv_cancel:'Sync cancelled: nothing was sent.',
  sv_seed_t:'Upload my archive to the server (first time)', sv_seed_d:'The server is empty. The whole archive of this PC will be uploaded as the common base:', sv_seed_b:'{n} binders', sv_seed_c:'{n} clients', sv_seed_x:'{n} deletions', sv_seed_l:'{n} activity-log rows',
  sv_seed_s:'the shared settings (studio name, QR destination, colours)', sv_seed_ph:'Cabinet photos stay on this PC (not uploaded yet).', sv_seed_ok:'Upload to the server',
  sv_mode_auto:'Automatic sync (web app)', sv_user:'Server user', sv_newtok:'New access code for this device', sv_newtok_btn:'Replace code', sv_tok_ok:'Access code updated',
  sv_tokens:'Access codes', sv_tokens_d:'Create one code per person or phone; revoke it when needed (administrator only).', sv_tok_user:'Person', sv_tok_role:'Role', sv_tok_src:'Source',
  sv_tok_new:'New code', sv_tok_revoke:'Revoke', sv_tok_revoked:'revoked', sv_tok_created:'Code for {u}: copy it now, it will not be shown again', sv_tok_cfg:'config.php',
  'lga_sync.server':'Server sync', 'lga_sync.token':'Server access code'
});

/* ---------------- configuration ---------------- */
/** Automatic mode: web deploy with apiBase and an unlocked vault. */
function srvAuto(){ const c = dmConfig(); return c.mode === 'web' && !!c.apiBase && typeof DocMapVault !== 'undefined' && DocMapVault.isUnlocked(); }
function srvLocalConf(){ return lsGetJSON(SRV_LS, {}) || {}; }
/** Accepts the API URL or the app URL (…/studio-de/ → …/studio-de/server-php/api.php). */
function srvNormUrl(u){ u = String(u || '').trim(); if (!u) return ''; if (!/\.php(\?|$)/i.test(u)) u = u.replace(/\/?$/, '/') + 'server-php/api.php'; return u; }
/** {url, token, simple, basic} or null when not configured. */
function srvConf(){
  if (srvAuto()){ const tk = DocMapVault.srvToken(); return tk ? {url:dmServerUrl(dmConfig().apiBase), token:tk, simple:false, auto:true} : null; }
  if (dmConfig().mode === 'web') return null;
  const c = srvLocalConf(); if (!c.url || !c.token) return null;
  return {url:srvNormUrl(c.url), token:c.token, simple:true, basic:c.basic || '', auto:false};
}
function srvClient(conf){ return new DMServer(conf.url, conf.token, {simple:conf.simple, basic:conf.basic}); }
function srvPeer(conf){
  syncEnsure();
  const id = 'server:' + conf.url;
  S.sync.peers[id] = Object.assign({id, label:t('sy_mode_server'), mode:'server', url:conf.url, seq:0, logSeq:0, lastPullAt:null, lastPushAt:null, lastLogPushAt:null, lastSyncAt:null,
    settingsAt:null, settingsHash:'', lastImportAt:null, lastSeenRemoteExportAt:null, ackedAt:null, lastExportAt:null}, S.sync.peers[id] || {});
  return S.sync.peers[id];
}
function srvSettingsSubset(){ return {studioName:S.settings.studioName || '', destTemplate:S.settings.destTemplate || '', catColors:clone(S.settings.catColors || {}), ...colorSyncSubset()}; }
const srvK = (type, id) => type + ':' + id;
function srvRecData(r){ const o = syncClean(clone(r)); delete o.selected_for_print; Object.keys(o).forEach(k => { if (k.charAt(0) === '_') delete o[k]; }); return o; }

/* ---------------- what is waiting to be sent ---------------- */
function srvChanges(peer){
  const since = peer.lastPushAt, nw = (type, id, ts) => syncIsNew(type, id, ts, since, peer.id);   // v11: also records that arrived from another device (06f recvAt)
  const fresh = (type) => (r) => r && r.id && nw(type, r.id, r.updated_at) && SRV.known.get(srvK(type, r.id)) !== String(r.updated_at || '');
  const lsince = peer.lastLogPushAt;
  return {
    binders:S.binders.filter(fresh('binder')), clients:(S.clients || []).filter(fresh('client')),
    tombstones:(S.tombstones || []).filter(x => x && x.id && nw(x.type, x.id, x.deletedAt) && SRV.known.get(srvK(x.type, x.id)) !== 'del:' + x.deletedAt),
    log:(typeof LOG !== 'undefined' ? LOG.entries : []).filter(e => e && e.id && (!lsince || syTs(e.at) > syTs(lsince)) && !SRV.knownLog.has(e.id))
  };
}
function srvPending(){
  const conf = srvConf(); if (!conf || !S || !S.sync) return 0;
  const id = 'server:' + conf.url, peer = S.sync.peers && S.sync.peers[id]; if (!peer) return S.binders.length + (S.clients || []).length + (S.tombstones || []).length;
  const c = srvChanges(peer); return c.binders.length + c.clients.length + c.tombstones.length;
}

/* ---------------- pull → package → plan ---------------- */
async function srvPullAll(cl, peer){
  const out = {records:[], tombstones:[], settings:null, log:[], seq:+peer.seq || 0, logSeq:+peer.logSeq || 0, serverTime:null, counts:null};
  let since = out.seq, logSince = out.logSeq;
  for (let page = 0; page < 1000; page++){
    const r = await cl.call('pull', {q:{since, log_since:logSince}});
    out.records.push(...(r.records || [])); out.tombstones.push(...(r.tombstones || []));
    if (r.settings) out.settings = r.settings;
    if (Array.isArray(r.activity_log)) out.log.push(...r.activity_log);
    if (!out.counts && r.counts) out.counts = r.counts;
    out.seq = +r.seq || since; out.logSeq = +r.log_seq || logSince; out.serverTime = r.server_time || out.serverTime;
    if (!r.more) break;
    since = out.seq; logSince = out.logSeq;
  }
  out.empty = !!(out.counts && !out.counts.records && !out.counts.tombstones);
  return out;
}
function srvPackage(conf, peer, pulled){
  const recs = (type) => pulled.records.filter(r => r.type === type && r.data).map(r => Object.assign({}, r.data, {id:r.id, updated_at:r.updated_at}));
  const newSettings = pulled.settings && syTs(pulled.settings.updated_at) > syTs(peer.settingsAt) ? pulled.settings.data : null;
  return {format:SYNC_FORMAT, version:SYNC_VERSION, app:'DocMap26', exportedAt:pulled.serverTime || nowISO(),
    source:{deviceId:'server:' + conf.url, deviceLabel:t('sy_mode_server'), mode:'web', operator:''}, since:peer.seq ? peer.lastPullAt : null, target:'', ack:{},
    records:{binders:recs('binder'), clients:recs('client')}, tombstones:pulled.tombstones.map(x => ({type:x.type, id:x.id, code:x.code, deletedAt:x.deletedAt, who:x.who})),
    settingsSubset:newSettings, activity_log:pulled.log};
}
function srvPlan(conf, peer, pulled){
  const pkg = srvPackage(conf, peer, pulled), plan = syncAnalyze(pkg);
  plan.peer.mode = 'server'; plan.peer.label = t('sy_mode_server'); plan.applySettings = !!pkg.settingsSubset;
  return plan;
}
/** Automatic resolution: the most recent version wins; same time → the server's. */
function srvAutoChoose(plan){ syncChooseNewer(plan); plan.items.forEach(i => { if (i.kind === 'conflict' && i.reason === 'tie') i.choice = 'remote'; }); }
const srvHasWork = (plan) => { const c = plan.counts; return !!(c.new || c.updated || c.delete || c.conflict || c.propagate || plan.applySettings); };
/** Apply a plan (quietly in automatic mode) and update the peer bookkeeping + the "known on the server" map. */
function srvApplyPlan(conf, plan, pulled, quiet){
  let d = {new:0, updated:0, delete:0, conflict:0};
  if (srvHasWork(plan)) d = syncApply(plan, {quiet});
  else if (pulled && pulled.log.length && typeof logMerge === 'function') logMerge(pulled.log.map(syncClean));
  if (pulled) srvAfterPull(conf, pulled, plan);
  return d;
}
function srvAfterPull(conf, pulled, plan){
  const p = srvPeer(conf), now = nowISO();   // syncApply may have replaced the peer object: always re-read it
  p.mode = 'server'; p.label = t('sy_mode_server'); p.url = conf.url;
  p.seq = pulled.seq; p.logSeq = pulled.logSeq; p.lastPullAt = now; p.lastImportAt = now;
  p.lastSeenRemoteExportAt = syMax(p.lastSeenRemoteExportAt, pulled.serverTime);
  pulled.records.forEach(r => SRV.known.set(srvK(r.type, r.id), String(r.updated_at || '')));
  pulled.tombstones.forEach(x => SRV.known.set(srvK(x.type, x.id), 'del:' + x.deletedAt));
  pulled.log.forEach(e => { if (e && e.id) SRV.knownLog.add(e.id); });
  if (plan && plan.applySettings && pulled.settings){ p.settingsAt = pulled.settings.updated_at; p.settingsHash = JSON.stringify(srvSettingsSubset()); }
}

/* ---------------- push ---------------- */
async function srvPush(cl, conf){
  const peer = srvPeer(conf), start = nowISO(), ch = srvChanges(peer);
  const subset = srvSettingsSubset(), hash = JSON.stringify(subset);
  const settings = hash !== peer.settingsHash ? {updated_at:start, data:subset} : null;
  const recs = ch.binders.map(b => ({type:'binder', id:b.id, updated_at:String(b.updated_at || start), data:srvRecData(b)}))
    .concat(ch.clients.map(c => ({type:'client', id:c.id, updated_at:String(c.updated_at || start), data:srvRecData(c)})));
  const tombs = ch.tombstones.map(x => ({type:x.type, id:x.id, code:x.code, deletedAt:x.deletedAt, who:x.who}));
  const log = ch.log.map(e => ({id:e.id, at:e.at, who:e.who, action:e.action, target:e.target, summary:e.summary, details:e.details, source:e.source}));
  const res = {applied:0, same:0, rejected:[], sent:recs.length + tombs.length};
  const n = Math.max(1, Math.ceil(recs.length / SRV_REC_CHUNK), Math.ceil(log.length / SRV_LOG_CHUNK));
  if (recs.length || tombs.length || log.length || settings){
    for (let k = 0; k < n; k++){
      const rs = recs.slice(k * SRV_REC_CHUNK, (k + 1) * SRV_REC_CHUNK), ls = log.slice(k * SRV_LOG_CHUNK, (k + 1) * SRV_LOG_CHUNK);
      const r = await cl.call('push', {method:'POST', body:{records:rs, tombstones:k ? [] : tombs, settings:k ? null : settings, activity_log:ls, deviceId:syncDeviceId(), operator:String(S.settings.operator || '')}});
      res.applied += +r.applied || 0; res.same += +r.same || 0; res.rejected.push(...(r.rejected || []));
      if (r.server_time) res.serverTime = r.server_time;   // v11: the server clock, not ours, marks what we have seen of it
      if (r.journal_id) (res.journalIds || (res.journalIds = [])).push(r.journal_id);
      rs.forEach(x => SRV.known.set(srvK(x.type, x.id), x.updated_at));
      const rj = new Set((r.rejected || []).map(x => srvK(x.type, x.id)));   // v11: the server now holds exactly this version (06f syncSameAsPeer)
      rs.forEach(x => { if (!rj.has(srvK(x.type, x.id))) syncMarkRecv(x.type, x.id, peer.id, x.updated_at); });
      if (!k) tombs.forEach(x => SRV.known.set(srvK(x.type, x.id), 'del:' + x.deletedAt));
      ls.forEach(e => SRV.knownLog.add(e.id));
    }
  }
  const p = srvPeer(conf);
  p.lastPushAt = start; p.ackedAt = start; p.lastLogPushAt = start;
  if (settings){ p.settingsHash = hash; p.settingsAt = start; }
  // the server kept a newer (or same-time) version: take it now, with the usual rule
  const cur = res.rejected.filter(x => x.current);
  res.rejected.filter(x => !x.current).forEach(x => SRV.known.set(srvK(x.type, x.id), 'invalid'));
  if (cur.length){
    const pulled = {records:cur.filter(x => !x.current.deleted).map(x => x.current), tombstones:cur.filter(x => x.current.deleted).map(x => x.current), settings:null, log:[], seq:p.seq, logSeq:p.logSeq, serverTime:res.serverTime || nowISO()};
    const plan = srvPlan(conf, p, pulled); srvAutoChoose(plan);
    const d = srvHasWork(plan) ? syncApply(plan, {quiet:true}) : {new:0, updated:0, delete:0};
    pulled.records.forEach(r => SRV.known.set(srvK(r.type, r.id), String(r.updated_at || '')));
    pulled.tombstones.forEach(x => SRV.known.set(srvK(x.type, x.id), 'del:' + x.deletedAt));
    res.taken = d.new + d.updated + d.delete;
  }
  return res;
}

/* ---------------- one sync cycle ---------------- */
/** Pull → merge → push. o.interactive (desktop button): review modal on conflicts, seed confirmation on an empty
    server, toasts. Returns {received, sent, rejected, seeded} or {cancelled} / {skipped}. */
async function srvSync(o){
  o = o || {};
  const conf = srvConf();
  if (!conf){ if (o.interactive) toast(t('sv_e_cfg'), 'warn', 6000); return {skipped:true}; }
  if (SRV.busy) return {busy:true};
  SRV.busy = true; SRV.state = 'syncing'; srvRender();
  clearTimeout(SRV.retryTimer); clearTimeout(SRV.pushTimer);
  let result = null;
  try {
    const cl = srvClient(conf);
    try { const t0 = Date.now(), pg = await cl.call('ping'), t1 = Date.now(); if (pg && pg.server_time) SRV.skew = syTs(pg.server_time) - (t0 + t1) / 2; } catch(e){ if (e.code === 'offline') throw e; }
    if (conf.auto){ const sv = DocMapVault.srv() || {}; SRV.role = sv.role || ''; SRV.user = sv.user || ''; }
    else { const me = await cl.call('me'); SRV.role = me.role; SRV.user = me.user; }
    const peer = srvPeer(conf), first = !peer.lastSyncAt && !peer.seq;
    const pulled = await srvPullAll(cl, peer);
    const plan = srvPlan(conf, peer, pulled);
    let d = {new:0, updated:0, delete:0, conflict:0}, seeded = false;
    if (o.interactive && first && pulled.empty && (S.binders.length || (S.clients || []).length)){
      if (!(await srvConfirmSeed(conf))){ SRV.state = 'idle'; toast(t('sv_cancel'), 'warn'); return (result = {cancelled:true}); }
      srvAfterPull(conf, pulled, plan); seeded = true;
    } else if (o.interactive && plan.counts.conflict){
      d = await new Promise(res => { plan.onApplied = res; plan.onCancel = () => res(null); syncOpenReview(plan); });
      if (!d){ SRV.state = 'idle'; toast(t('sv_cancel'), 'warn'); return (result = {cancelled:true}); }
      srvAfterPull(conf, pulled, plan);
    } else {
      if (!o.interactive) srvAutoChoose(plan);
      d = srvApplyPlan(conf, plan, pulled, !o.interactive);
    }
    let pr = {sent:0, rejected:[], taken:0};
    if (SRV.role !== 'viewer') pr = await srvPush(cl, conf);
    const p = srvPeer(conf); p.lastSyncAt = nowISO();
    if (conf.auto && SRV.role !== 'viewer' && !srvPending()) S.hasUnexportedChanges = false;   // safe on the server
    SRV.state = SRV.role === 'viewer' ? 'ro' : 'ok'; SRV.err = ''; SRV.retry = 0;
    result = {received:d.new + d.updated + d.delete + (pr.taken || 0), sent:pr.sent, rejected:pr.rejected.length, conflicts:d.conflict, seeded};
    SRV.last = result;
    if (o.interactive){
      logAct('sync.server', {type:'server', id:'', code:conf.url}, 'Sincronizzazione con il server' + (seeded ? ' (primo caricamento)' : '') + ': ' + result.received + ' ricevuti, ' + result.sent + ' inviati',
        {url:conf.url, received:result.received, sent:result.sent, rejected:result.rejected, conflicts:d.conflict, seeded}, 'sync');
      toast(t('sv_done', {r:result.received, s:result.sent}), 'ok', 5000);
    }
    savePrefs();
    if (o.interactive || result.received){ if (!topModal()) { if (o.interactive) renderAll(); else renderView(); } }
    renderTopbar();
    return result;
  } catch(e){
    SRV.err = e.code === 'unauthorized' || e.code === 'forbidden' ? t('sv_e_denied') : e.code === 'offline' ? t('sv_e_off') : e.code === 'locked' ? t('sv_e_locked', {s:(e.data && e.data.retry_in) || 60}) : t('sv_e_server', {m:e.message || e.code});
    SRV.state = e.code === 'unauthorized' || e.code === 'forbidden' ? 'denied' : 'offline';
    if (SRV.state === 'offline' && conf.auto){   // retry with exponential backoff (a denied token is NOT retried: it would lock the office IP)
      SRV.retry++;
      const wait = e.code === 'locked' ? ((e.data && e.data.retry_in) || 60) * 1000 : Math.min(SRV_BACKOFF_MAX, 5000 * Math.pow(2, SRV.retry - 1));
      SRV.retryTimer = setTimeout(() => srvSync(), wait);
    }
    if (o.interactive) toast(SRV.err, 'err', 8000);
    return (result = {error:e.code || 'error', message:SRV.err});
  } finally {
    SRV.busy = false; srvRender();
    if (result && !result.error && conf.auto && srvPending() > 0) srvSchedulePush();   // changes made while syncing
  }
}
function srvConfirmSeed(conf){
  const ch = srvChanges(srvPeer(conf)), li = (k, n) => '<li>' + esc(t(k, {n})) + '</li>';
  return new Promise(res => {
    let done = false;
    openModal({ title:t('sv_seed_t'), body:'<div class="stack" id="srv-seed"><p>' + esc(t('sv_seed_d')) + '</p><ul>' + li('sv_seed_b', ch.binders.length) + li('sv_seed_c', ch.clients.length) + li('sv_seed_x', ch.tombstones.length) + li('sv_seed_l', ch.log.length) +
        '<li>' + esc(t('sv_seed_s')) + '</li></ul><div class="hint">' + esc(t('sv_seed_ph')) + '</div><div class="tiny muted mono">' + esc(conf.url) + '</div></div>',
      buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('sv_seed_ok'), cls:'btn btn-primary', icon:'upload', fn:() => { done = true; closeModal(true); res(true); }}],
      onClose:() => { if (!done) res(false); } });
  });
}
function srvSchedulePush(){
  clearTimeout(SRV.pushTimer);
  SRV.pushTimer = setTimeout(() => { if (srvAuto() && SRV.state !== 'denied') srvSync(); }, SRV_PUSH_DEBOUNCE);
}

/* ---------------- automatic mode (web + apiBase) ---------------- */
function srvBoot(){
  if (!srvAuto() || SRV.started) return;
  SRV.started = true;
  if (!DocMapVault.srvToken()){ SRV.state = 'denied'; SRV.err = t('sv_e_denied'); srvRender(); return; }
  srvSync();
  SRV.interval = setInterval(() => { if (SRV.state !== 'denied' && !document.hidden) srvSync(); }, SRV_PULL_MS);
  window.addEventListener('focus', () => { if (SRV.state !== 'denied') srvSync(); });
  window.addEventListener('online', () => { if (SRV.state !== 'denied'){ SRV.retry = 0; srvSync(); } });
}

/* ---------------- status (top bar) + Sync view card ---------------- */
function srvStatusHTML(){
  const n = srvPending(), st = SRV.state;
  const [cls, txt] = st === 'syncing' ? ['warn', t('sv_st_sync')] : st === 'denied' ? ['err', t('sv_st_denied')] : st === 'offline' ? ['warn', n ? t('sv_st_off_n', {n}) : t('sv_st_off')]
    : n && st !== 'ro' ? ['warn', t('sv_st_wait', {n})] : st === 'ro' ? ['ok', t('sv_st_ro')] : st === 'ok' ? ['ok', t('sv_st_ok')] : ['warn', n ? t('sv_st_wait', {n}) : t('sv_st_sync')];
  return '<button type="button" class="status srv-st ' + cls + '" id="srv-status" data-srv-state="' + esc(st) + '" data-a="nav" data-v="sync" title="' + esc(SRV.err || t('sv_h')) + '"><span class="dot"></span><span class="sb-t">' + esc(txt) + '</span></button>';
}
function srvRender(){
  const el = document.getElementById('srv-status'); if (el) el.outerHTML = srvStatusHTML();
  const c = document.getElementById('srv-card'); if (c) c.innerHTML = srvCardInner();
}
function srvCardInner(){
  const conf = srvConf(), auto = dmConfig().mode === 'web' && !!dmConfig().apiBase, lc = srvLocalConf();
  const p = conf && S.sync && S.sync.peers ? S.sync.peers['server:' + conf.url] : null, n = conf ? srvPending() : 0;
  const skew = Math.abs(SRV.skew) > SRV_SKEW_WARN ? '<div class="warn-box small" id="srv-skew">' + ic('alert') + '<div>' + esc(t('sv_skew', {m:Math.round(Math.abs(SRV.skew) / 60000)})) + '</div></div>' : '';
  const info = '<div class="small" id="srv-info">' + esc(t('sv_last')) + ': <b id="srv-last">' + esc(p && p.lastSyncAt ? syDate(p.lastSyncAt) : t('sv_never')) + '</b> · ' + esc(t('sv_pending')) + ': <span class="badge b-upd" id="srv-pending">' + n + '</span>' +
    (SRV.user ? ' · ' + esc(t('sv_conn', {u:SRV.user, r:t('au_role_' + (SRV.role || 'viewer'))})) : '') + '</div>' + (SRV.err ? '<div class="err-t small" id="srv-err">' + esc(SRV.err) + '</div>' : '') +
    (SRV.role === 'viewer' ? '<div class="small muted">' + esc(t('sv_e_ro')) + '</div>' : '') + skew;
  const tokBtn = SRV.role === 'admin' ? '<button class="btn" data-a="srv-tokens">' + ic('users') + esc(t('sv_tokens')) + '</button>' : '';
  if (auto){
    return '<div class="row between"><h2 style="margin:0">' + ic('globe') + ' ' + esc(t('sv_h')) + '</h2>' + srvStatusHTML().replace('id="srv-status"', 'id="srv-status-card"') + '</div>' +
      '<div class="small muted">' + esc(t('sv_mode_auto')) + ' · <span class="mono">' + esc(dmServerUrl(dmConfig().apiBase)) + '</span></div>' + info +
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-primary" data-a="srv-sync">' + ic('sync') + esc(t('sv_sync_now')) + '</button>' + tokBtn + '</div>' +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field" style="min-width:260px"><label for="srv-newtok">' + esc(t('sv_newtok')) + '</label><input class="inp mono" id="srv-newtok" type="password" autocomplete="off"></div><button class="btn" data-a="srv-newtok">' + esc(t('sv_newtok_btn')) + '</button></div>';
  }
  const [bu, bp] = String(lc.basic || ':').split(/:(.*)/s);
  return '<div class="row between"><h2 style="margin:0">' + ic('globe') + ' ' + esc(t('sv_h')) + '</h2></div><div class="small muted">' + esc(t('sv_p')) + '</div>' +
    '<div class="grid g2" style="gap:10px"><div class="field"><label for="srv-url">' + esc(t('sv_url')) + '</label><input class="inp mono" id="srv-url" value="' + esc(lc.url || '') + '" placeholder="' + esc(t('sv_url_ph')) + '" autocomplete="off" spellcheck="false"></div>' +
      '<div class="field"><label for="srv-token">' + esc(t('sv_token')) + '</label><input class="inp mono" id="srv-token" type="password" value="' + esc(lc.token || '') + '" autocomplete="off"></div></div>' +
    '<details' + (lc.basic ? ' open' : '') + '><summary class="small">' + esc(t('sv_basic')) + '</summary><div class="grid g2" style="gap:10px;margin-top:6px"><div class="field"><label for="srv-buser">' + esc(t('sv_buser')) + '</label><input class="inp" id="srv-buser" value="' + esc(lc.basic ? bu : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="srv-bpass">' + esc(t('sv_bpass')) + '</label><input class="inp" id="srv-bpass" type="password" value="' + esc(lc.basic ? bp || '' : '') + '" autocomplete="off"></div></div><div class="hint">' + esc(t('sv_basic_hint')) + '</div></details>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-a="srv-save">' + ic('save') + esc(t('sv_save')) + '</button><button class="btn" data-a="srv-test">' + ic('check') + esc(t('sv_test')) + '</button>' +
      '<button class="btn btn-lg btn-primary" data-a="srv-sync" id="srv-sync">' + ic('sync') + esc(t('sv_sync')) + '</button>' + tokBtn + '</div>' + (conf ? info : '');
}
function srvSaveLocal(){
  const v = (id) => String(($('#' + id) || {}).value || '').trim();
  const bu = v('srv-buser'), bp = ($('#srv-bpass') || {}).value || '';
  const c = {url:srvNormUrl(v('srv-url')), token:v('srv-token'), basic:bu ? bu + ':' + bp : ''};
  const old = srvLocalConf();
  try { lsSetJSON(SRV_LS, c); } catch(e){}
  if (old.url !== c.url || old.token !== c.token){ SRV.known.clear(); SRV.knownLog.clear(); SRV.role = ''; SRV.user = ''; SRV.err = ''; SRV.state = 'idle'; }
  return c;
}
async function srvTokensModal(){
  const conf = srvConf(); if (!conf) return;
  const cl = srvClient(conf);
  let items = [];
  try { items = (await cl.call('tokens')).items || []; } catch(e){ toast(t('sv_e_server', {m:e.message || e.code}), 'err', 6000); return; }
  const roles = AUTH_ROLES.map(r => '<option value="' + r + '"' + (r === 'editor' ? ' selected' : '') + '>' + esc(t('au_role_' + r)) + '</option>').join('');
  openModal({ title:t('sv_tokens'), size:'lg', autofocus:false, body:'<div class="stack" id="srv-tok-modal"><div class="small muted">' + esc(t('sv_tokens_d')) + '</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('sv_tok_user')) + '</th><th>' + esc(t('sv_tok_role')) + '</th><th>' + esc(t('sv_tok_src')) + '</th><th></th></tr></thead><tbody>' +
      items.map(x => '<tr><td>' + esc(x.user) + '</td><td>' + esc(t('au_role_' + x.role)) + '</td><td class="small">' + esc(x.source === 'config' ? t('sv_tok_cfg') : syDate(x.created_at)) + '</td><td>' +
        (x.revoked_at ? '<span class="badge">' + esc(t('sv_tok_revoked')) + '</span>' : x.source === 'database' ? '<button class="btn btn-sm" data-a="srv-tok-revoke" data-id="' + esc(x.id) + '">' + esc(t('sv_tok_revoke')) + '</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><div class="field"><label for="srv-tok-user">' + esc(t('sv_tok_user')) + '</label><input class="inp" id="srv-tok-user" autocomplete="off"></div><div class="field"><label for="srv-tok-role">' + esc(t('sv_tok_role')) + '</label><select class="inp" id="srv-tok-role">' + roles + '</select></div>' +
      '<button class="btn btn-primary" data-a="srv-tok-create">' + ic('plus') + esc(t('sv_tok_new')) + '</button></div><div id="srv-tok-out"></div></div>',
    buttons:[{label:t('close'), cls:'btn', action:'modal-close'}] });
}
const SRV_ACTIONS = {
  'srv-save': () => { srvSaveLocal(); toast(t('sv_saved')); srvRender(); },
  'srv-test': async () => {
    if (dmConfig().mode !== 'web') srvSaveLocal();
    const conf = srvConf(); if (!conf){ toast(t('sv_e_cfg'), 'warn', 6000); return; }
    try { const me = await srvClient(conf).call('me'); SRV.role = me.role; SRV.user = me.user; SRV.err = ''; toast(t('sv_conn', {u:me.user, r:t('au_role_' + me.role)})); }
    catch(e){ SRV.err = e.code === 'unauthorized' || e.code === 'forbidden' ? t('sv_e_denied') : e.code === 'offline' ? t('sv_e_off') : e.code === 'locked' ? t('sv_e_locked', {s:(e.data && e.data.retry_in) || 60}) : t('sv_e_server', {m:e.message || e.code}); toast(SRV.err, 'err', 7000); }
    srvRender();
  },
  'srv-sync': () => { if (dmConfig().mode !== 'web') srvSaveLocal(); return srvSync({interactive:true}); },
  'srv-newtok': async () => {
    const v = String(($('#srv-newtok') || {}).value || '').trim(); if (!v) return;
    try { const me = await srvSetToken(v); SRV.role = me.role; SRV.user = me.user; SRV.state = 'idle'; SRV.err = ''; toast(t('sv_tok_ok')); srvRender(); srvSync(); }
    catch(e){ toast(e.code === 'offline' ? t('sv_e_off') : t('sv_e_denied'), 'err', 7000); }
  },
  'srv-tokens': () => srvTokensModal(),
  'srv-tok-create': async () => {
    const conf = srvConf(), u = String(($('#srv-tok-user') || {}).value || '').trim(), r = ($('#srv-tok-role') || {}).value || 'editor'; if (!conf || !u) return;
    try { const x = await srvClient(conf).call('token_create', {method:'POST', body:{user:u, role:r}});
      closeModal(true); await srvTokensModal();
      const o = $('#srv-tok-out'); if (o) o.innerHTML = '<div class="info-box small">' + ic('info') + '<div><b>' + esc(t('sv_tok_created', {u:x.user})) + '</b><div class="mono" id="srv-tok-plain" style="word-break:break-all;font-size:15px;margin-top:4px">' + esc(x.token) + '</div></div></div>';
      logAct('sync.token', {type:'server', id:x.id, code:x.user}, 'Creato un codice di accesso al server per ' + x.user + ' (' + x.role + ')', {role:x.role}, 'sync');
    } catch(e){ toast(t('sv_e_server', {m:e.message || e.code}), 'err', 6000); }
  },
  'srv-tok-revoke': async (el) => {
    const conf = srvConf(); if (!conf) return;
    try { await srvClient(conf).call('token_revoke', {method:'POST', body:{id:el.dataset.id}}); closeModal(true); srvTokensModal();
      logAct('sync.token', {type:'server', id:el.dataset.id, code:''}, 'Revocato un codice di accesso al server', {}, 'sync'); }
    catch(e){ toast(t('sv_e_server', {m:e.message || e.code}), 'err', 6000); }
  }
};

/* ---------------- hooks ---------------- */
(function srvWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  // every commit / save: in automatic mode schedule a push when something is waiting
  wrap('persist', (o) => function(){ const r = o.apply(this, arguments); try { if (srvAuto() && !SRV.busy && SRV.state !== 'denied' && srvPending() > 0){ srvSchedulePush(); const el = document.getElementById('srv-status'); if (el) el.outerHTML = srvStatusHTML(); } } catch(e){ console.warn('srv', e); } return r; });
  wrap('renderTopbar', (o) => function(){ const r = o.apply(this, arguments); try { if (srvAuto()){ const tr = document.querySelector('#topbar .top-right'); if (tr && !document.getElementById('srv-status')) tr.insertAdjacentHTML('afterbegin', srvStatusHTML()); } } catch(e){} return r; });
  wrap('viewSync', (o) => function(){ return o.apply(this, arguments) + (dmConfig().mode === 'web' && !dmConfig().apiBase ? '' : '<div class="card card-p stack" style="margin-top:16px" id="srv-card">' + srvCardInner() + '</div>'); });
})();
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, SRV_ACTIONS);
});
