/* =====================================================================
   DocMap 2026 — Manual sync between the local desktop app and the web app (v10, stream S)

   The local app (file://) and the web app (https://docmap.pr-it.it/studio-de/) each keep their own
   copy of the data. Sync is MANUAL: one side exports a "sync package" file, the other imports it.
   Rule: record-level last-write-wins by `updated_at` (compared as time); ties and records changed on
   both sides since the last sync with that peer are shown as CONFLICTS that the user decides.
   Full contract (IT): docs/SYNC.md.

   Package (plain):
     { format:'docmap-sync', version:1, app, appVersion, exportedAt,
       source:{deviceId, deviceLabel, mode:'local'|'web', operator},
       since: ISO | null (null = full package), target: deviceId | '',
       ack: {peerDeviceId: lastSeenRemoteExportAt},          // "I have your data up to your time X"
       records:{binders:[...], clients:[...]}, tombstones:[{type, id, code, deletedAt, who}],
       settingsSubset:{studioName, destTemplate, catColors, colorMode, catFamilies, colorRules, colorUpdatedAt}, activity_log:[...], counts:{...} }
   Package (encrypted, WebCrypto): { format:'docmap-sync-enc', v:1,
       kdf:{name:'PBKDF2', hash:'SHA-256', iterations, salt}, cipher:'AES-256-GCM', iv, ct }   (base64; AAD 'docmap-sync-enc/1')

   State (all in S, persisted with it):
     S.settings.deviceId     stable id of this installation (also kept in localStorage SYNC_DEV_LS so a
                             restored backup from another device cannot clone it)
     S.settings.deviceLabel  human name ("PC studio", "Web app")
     S.tombstones            [{type:'binder'|'client'|'location', id, code, deletedAt, who}]   (v11: + locations) — newest SYNC_TOMB_CAP,
                             pruned after SYNC_TOMB_DAYS days
     S.sync                  {peers:{[deviceId]:{id, label, mode, lastImportAt, lastSeenRemoteExportAt,
                             lastExportAt, ackedAt}}, lastExportAt, lastImportAt, lastPeer, history:[…50]}
   Change tracking (syncTrack, run inside persist()): every record whose content changed while its
   `updated_at` did not gets `updated_at = now` (covers every code path: editor, bulk edits, Informazioni,
   mobile patches…); every binder/client id that disappears gets a tombstone; an id that reappears
   loses it. SYNC.quiet = true makes the next pass only re-baseline (sync apply, undo).
   ===================================================================== */
'use strict';

const SYNC_FORMAT = 'docmap-sync', SYNC_FORMAT_ENC = 'docmap-sync-enc', SYNC_VERSION = 1;
const SYNC_KDF_ITER = 310000;                  // PBKDF2-SHA256 iterations (≥ 210 000, OWASP)
const SYNC_AAD = 'docmap-sync-enc/1';
const SYNC_TOMB_CAP = 5000, SYNC_TOMB_DAYS = 365, SYNC_HIST_CAP = 50;
const SYNC_CLIP_MAX = 2 * 1024 * 1024;          // copy-to-clipboard only for packages up to 2 MB
const SYNC_DEV_LS = 'docmap_v26_device';
const SYNC_B_SKIP = ['updated_at', 'short_url', 'location_code', 'selected_for_print'];   // not "content"
const SYNC_C_SKIP = ['updated_at'];
const SYNC_L_SKIP = ['updated_at', 'short_url', 'code', 'level'];   // v11 locations: code / level are derived from the tree (02c-locations.js)
const SYNC = { base:null, quiet:false, plan:null, modeOverride:'' };

Object.assign(ICONS, {
  sync:'<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>'
});

Object.assign(I18N.it, {
  nav_sync:'Sincronizzazione', nd_sync:'Scambio manuale tra PC locale e web app',
  sy_h:'Sincronizzazione', sy_p:'Scambia le modifiche tra questo PC e la web app con un file: esporti da una parte e importi dall\'altra. Vince sempre la modifica più recente; i casi dubbi (modifiche da entrambe le parti) li decidi tu.',
  sy_mode_local:'Client locale', sy_mode_web:'Web app', sy_mode_server:'Server online',
  sy_ex_local:'Copia export per web app', sy_ex_web:'Esporta per il client locale',
  sy_im_local:'Importa dati dalla web app', sy_im_web:'Importa dati da client locale',
  sy_ex_d:'Crea un file da importare sull\'altro lato. Il file contiene faldoni, clienti, eliminazioni e registro attività.',
  sy_im_d:'Scegli o incolla il file ricevuto dall\'altro lato: vedrai cosa cambia prima di applicare.',
  sy_full:'Tutto l\'archivio', sy_incr:'Solo modifiche dall\'ultima sincronizzazione', sy_since:'modifiche dal {d}', sy_never:'mai sincronizzato: usa "Tutto l\'archivio"',
  sy_target:'Destinatario', sy_target_any:'Qualsiasi / nuovo dispositivo',
  sy_enc:'Cifra con passphrase (consigliato)', sy_pass:'Passphrase', sy_pass2:'Ripeti passphrase', sy_pass_hint:'Almeno 8 caratteri. Non viene mai salvata: comunicala a voce o di persona, non nello stesso canale del file.',
  sy_ipass:'Passphrase (se il file è cifrato)', sy_download:'Scarica file', sy_copy:'Copia negli appunti', sy_pick:'Scegli file…', sy_paste_ph:'…oppure incolla qui il contenuto del file', sy_analyze:'Analizza',
  sy_will:'Il pacchetto conterrà {b} faldoni, {c} clienti, {d} eliminazioni.',
  sy_err_pass_short:'La passphrase deve avere almeno 8 caratteri.', sy_err_pass_match:'Le due passphrase non coincidono.', sy_no_crypto:'Questo browser non permette la cifratura (WebCrypto non disponibile).',
  sy_err_need_pass:'Il file è cifrato: scrivi la passphrase.', sy_err_bad_pass:'Passphrase errata o file danneggiato.', sy_err_format:'Questo non è un file di sincronizzazione DocMap.', sy_err_version:'Versione del pacchetto non supportata ({v}).',
  sy_err_self:'Questo pacchetto è stato creato da questo stesso dispositivo: importalo sull\'altro lato.', sy_err_empty:'Scegli un file o incolla il contenuto.', sy_err_big:'File troppo grande.', sy_clip_big:'Pacchetto troppo grande per gli appunti: usa "Scarica file".',
  sy_exported:'Pacchetto creato: {f}', sy_copied:'Pacchetto copiato negli appunti ({n} KB).',
  sy_rv_t:'Revisione importazione', sy_rv_from:'Da: {l} ({m}) · esportato il {d}', sy_rv_full:'pacchetto completo', sy_rv_incr:'solo modifiche dal {d}',
  sy_k_new:'nuovi', sy_k_updated:'aggiornati (più recenti)', sy_k_unchanged:'invariati', sy_k_older:'più vecchi del locale (ignorati)', sy_k_delete:'eliminazioni', sy_k_conflict:'conflitti',
  sy_rv_nothing:'Niente da applicare: i dati sono già allineati.', sy_rv_all_newer:'Applica a tutti: il più recente', sy_rv_apply:'Applica', sy_rv_conflicts:'Conflitti da decidere',
  sy_rv_conf_d:'Questi record sono cambiati da entrambe le parti dopo l\'ultima sincronizzazione (o hanno la stessa ora). Proposta: vince il più recente; puoi scegliere tu record per record.',
  sy_keep_local:'Tieni locale', sy_keep_remote:'Tieni importato', sy_local:'Questo dispositivo', sy_remote:'Importato', sy_deleted:'eliminato il {d}', sy_field:'Campo',
  sy_r_both:'modificato da entrambe le parti', sy_r_tie:'stessa ora di modifica, contenuto diverso', sy_r_deleted_remote:'eliminato dall\'altra parte, modificato qui dopo', sy_r_deleted_local:'eliminato qui, modificato dall\'altra parte dopo',
  sy_rv_settings:'Applica anche le impostazioni condivise (nome studio, destinazione QR, colori categorie)',
  sy_rv_list:'Dettaglio', sy_w_clock:'Attenzione: l\'orologio dell\'altro dispositivo sembra avanti di {m} minuti. L\'ordine delle modifiche dipende dall\'ora.', sy_w_code:'Il codice {c} è già usato da un altro faldone: verrà rinominato automaticamente.',
  sy_done:'Sincronizzazione applicata: {n} nuovi, {u} aggiornati, {d} eliminati, {c} conflitti risolti.',
  sy_dev_h:'Questo dispositivo', sy_dev_label:'Nome del dispositivo', sy_dev_id:'ID dispositivo', sy_dev_mode:'Modalità',
  sy_q_h:'Coda e cronologia', sy_q_pending:'Modifiche locali non ancora esportate', sy_q_pending_peer:'Non ancora confermate da {l}', sy_q_peers:'Dispositivi conosciuti',
  sy_q_peer:'Dispositivo', sy_q_last_im:'Ultimo import da', sy_q_last_ex:'Ultimo export verso', sy_q_ack:'Ha i nostri dati fino al', sy_q_none:'Nessuna sincronizzazione ancora.', sy_q_hist:'Cronologia',
  sy_q_when:'Quando', sy_q_dir:'Direzione', sy_q_what:'Contenuto', sy_dir_export:'export', sy_dir_import:'import',
  sy_im_redirect:'Questo è un pacchetto di sincronizzazione: aprilo da ⚙ Funzioni avanzate › Sincronizzazione (record per record, con revisione dei conflitti).',
  lg_g_sync:'Sincronizzazione', lg_src_sync:'sync', 'lga_sync.export':'Export sincronizzazione', 'lga_sync.import':'Import sincronizzazione', 'lga_sync.conflict':'Conflitto risolto'
});
Object.assign(I18N.en, {
  nav_sync:'Sync', nd_sync:'Manual exchange between the local PC and the web app',
  sy_h:'Sync', sy_p:'Exchange changes between this PC and the web app with a file: export on one side, import on the other. The most recent change always wins; doubtful cases (changes on both sides) are up to you.',
  sy_mode_local:'Local client', sy_mode_web:'Web app', sy_mode_server:'Online server',
  sy_ex_local:'Export for the web app', sy_ex_web:'Export for the local client',
  sy_im_local:'Import data from the web app', sy_im_web:'Import data from the local client',
  sy_ex_d:'Creates a file to import on the other side. It holds binders, clients, deletions and the activity log.',
  sy_im_d:'Pick or paste the file received from the other side: you will see what changes before applying.',
  sy_full:'Whole archive', sy_incr:'Only changes since the last sync', sy_since:'changes since {d}', sy_never:'never synced: use "Whole archive"',
  sy_target:'Recipient', sy_target_any:'Any / new device',
  sy_enc:'Encrypt with a passphrase (recommended)', sy_pass:'Passphrase', sy_pass2:'Repeat passphrase', sy_pass_hint:'At least 8 characters. It is never stored: tell it in person, not over the same channel as the file.',
  sy_ipass:'Passphrase (if the file is encrypted)', sy_download:'Download file', sy_copy:'Copy to clipboard', sy_pick:'Choose file…', sy_paste_ph:'…or paste the file content here', sy_analyze:'Analyse',
  sy_will:'The package will hold {b} binders, {c} clients, {d} deletions.',
  sy_err_pass_short:'The passphrase must be at least 8 characters.', sy_err_pass_match:'The two passphrases do not match.', sy_no_crypto:'This browser cannot encrypt (WebCrypto not available).',
  sy_err_need_pass:'The file is encrypted: type the passphrase.', sy_err_bad_pass:'Wrong passphrase or damaged file.', sy_err_format:'This is not a DocMap sync file.', sy_err_version:'Unsupported package version ({v}).',
  sy_err_self:'This package was created on this same device: import it on the other side.', sy_err_empty:'Pick a file or paste its content.', sy_err_big:'File too large.', sy_clip_big:'Package too large for the clipboard: use "Download file".',
  sy_exported:'Package created: {f}', sy_copied:'Package copied to the clipboard ({n} KB).',
  sy_rv_t:'Import review', sy_rv_from:'From: {l} ({m}) · exported on {d}', sy_rv_full:'full package', sy_rv_incr:'changes since {d} only',
  sy_k_new:'new', sy_k_updated:'updated (newer)', sy_k_unchanged:'unchanged', sy_k_older:'older than local (ignored)', sy_k_delete:'deletions', sy_k_conflict:'conflicts',
  sy_rv_nothing:'Nothing to apply: the data is already aligned.', sy_rv_all_newer:'Apply to all: the most recent', sy_rv_apply:'Apply', sy_rv_conflicts:'Conflicts to decide',
  sy_rv_conf_d:'These records changed on both sides since the last sync (or carry the same time). Proposal: the most recent wins; you can choose record by record.',
  sy_keep_local:'Keep local', sy_keep_remote:'Keep imported', sy_local:'This device', sy_remote:'Imported', sy_deleted:'deleted on {d}', sy_field:'Field',
  sy_r_both:'changed on both sides', sy_r_tie:'same change time, different content', sy_r_deleted_remote:'deleted on the other side, changed here later', sy_r_deleted_local:'deleted here, changed on the other side later',
  sy_rv_settings:'Also apply the shared settings (studio name, QR destination, category colours)',
  sy_rv_list:'Details', sy_w_clock:'Warning: the other device\'s clock seems {m} minutes ahead. The order of changes depends on the time.', sy_w_code:'Code {c} is already used by another binder: it will be renamed automatically.',
  sy_done:'Sync applied: {n} new, {u} updated, {d} deleted, {c} conflicts resolved.',
  sy_dev_h:'This device', sy_dev_label:'Device name', sy_dev_id:'Device ID', sy_dev_mode:'Mode',
  sy_q_h:'Queue and history', sy_q_pending:'Local changes not exported yet', sy_q_pending_peer:'Not yet confirmed by {l}', sy_q_peers:'Known devices',
  sy_q_peer:'Device', sy_q_last_im:'Last import from', sy_q_last_ex:'Last export to', sy_q_ack:'Has our data up to', sy_q_none:'No sync yet.', sy_q_hist:'History',
  sy_q_when:'When', sy_q_dir:'Direction', sy_q_what:'Content', sy_dir_export:'export', sy_dir_import:'import',
  sy_im_redirect:'This is a sync package: open it from ⚙ Advanced tools › Sync (record by record, with conflict review).',
  lg_g_sync:'Sync', lg_src_sync:'sync', 'lga_sync.export':'Sync export', 'lga_sync.import':'Sync import', 'lga_sync.conflict':'Conflict resolved'
});
if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('sync')) LOG_GROUPS.push('sync');
// ⚙ menu, group "Dati": right after the activity log
NAV_MORE[0][1].push(['sync', 'sync', 'nav_sync', 'nd_sync']);
ADV_VIEWS.push('sync');

/* ---------------- Helpers ---------------- */
const syTs = (iso) => { const n = Date.parse(iso || ''); return isNaN(n) ? 0 : n; };
const syMax = (a, b) => syTs(a) >= syTs(b) ? (a || b || null) : b;
/** v11: the time stamp of a new local change made on top of a version stamped `prev`: now, but always LATER than prev.
    (A version pulled from a device whose clock is ahead must never beat an edit made after it here.) */
const syNext = (prev, now) => syTs(now) > syTs(prev) ? now : new Date(syTs(prev) + 1).toISOString();
const syB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const syUnB64 = (s) => Uint8Array.from(atob(String(s || '')), c => c.charCodeAt(0));
/** 'local' (file:// or localhost) or 'web' (served online). The web deploy can force it with window.DM_CONFIG = {mode:'web'}. */
function syncMode(){
  if (SYNC.modeOverride) return SYNC.modeOverride;
  const c = window.DM_CONFIG || window.DOCMAP_CONFIG;
  if (c && (c.mode === 'web' || c.mode === 'local')) return c.mode;
  const p = location.protocol, h = location.hostname;
  return p === 'file:' || !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' ? 'local' : 'web';
}
function syncDeviceId(){
  let id = '';
  try { id = localStorage.getItem(SYNC_DEV_LS) || ''; } catch(e){}
  if (!id) id = (S && S.settings && S.settings.deviceId) || 'dev-' + uuid();
  try { localStorage.setItem(SYNC_DEV_LS, id); } catch(e){}
  if (S && S.settings) S.settings.deviceId = id;
  return id;
}
/** Tests / support only: give this installation another identity. */
function syncSetDevice(id){ try { localStorage.setItem(SYNC_DEV_LS, id); } catch(e){} S.settings.deviceId = id; }
function syncEnsure(){
  if (!S) return;
  if (!Array.isArray(S.tombstones)) S.tombstones = [];
  const y = S.sync && typeof S.sync === 'object' ? S.sync : {};
  S.sync = Object.assign({peers:{}, lastExportAt:null, lastImportAt:null, lastPeer:'', history:[]}, y);
  if (!S.sync.peers || typeof S.sync.peers !== 'object') S.sync.peers = {};
  if (!Array.isArray(S.sync.history)) S.sync.history = [];
  if (!S.sync.recvAt || typeof S.sync.recvAt !== 'object' || Array.isArray(S.sync.recvAt)) S.sync.recvAt = {};   // v11, see syncMarkRecv
  if (S.settings){ syncDeviceId(); if (S.settings.deviceLabel == null) S.settings.deviceLabel = ''; }
}
function syncDeviceLabel(){ return String((S.settings && S.settings.deviceLabel) || '').trim() || t('sy_mode_' + syncMode()); }
/** Canonical content string of a record (keys sorted, meta fields left out): equal string = same content. */
function syncCanon(r, type){
  const skip = type === 'client' ? SYNC_C_SKIP : type === 'location' ? SYNC_L_SKIP : SYNC_B_SKIP, o = {};
  Object.keys(r || {}).sort().forEach(k => {
    if (skip.includes(k) || k.charAt(0) === '_') return;
    let v = r[k];
    if (k === 'contents_items') v = (Array.isArray(v) ? v : []).map(i => [String(i.year || ''), String(i.description || ''), String(i.status || 'archive')]);
    else if (v == null) v = '';
    else if (typeof v === 'boolean' || typeof v === 'number') v = String(v);
    o[k] = v;
  });
  return JSON.stringify(o);
}
function syncClean(o){   // a plain copy without prototype-polluting keys
  const r = {}; if (!o || typeof o !== 'object') return r;
  Object.keys(o).forEach(k => { if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') r[k] = o[k]; });
  return r;
}
const syTombKey = (type, id) => type + ':' + id;
function syncTombMap(){ const m = new Map(); (S.tombstones || []).forEach(x => m.set(syTombKey(x.type, x.id), x)); return m; }
function syncAddTomb(x){
  S.tombstones = (S.tombstones || []).filter(y => !(y.type === x.type && y.id === x.id));
  S.tombstones.push({type:x.type, id:x.id, code:String(x.code || ''), deletedAt:x.deletedAt || nowISO(), who:String(x.who || logWho())});
}
function syncPrune(){
  const lim = Date.now() - SYNC_TOMB_DAYS * 86400000;
  let t2 = (S.tombstones || []).filter(x => x && x.id && syTs(x.deletedAt) >= lim);
  if (t2.length > SYNC_TOMB_CAP) t2 = t2.sort((a, b) => syTs(a.deletedAt) - syTs(b.deletedAt)).slice(-SYNC_TOMB_CAP);
  S.tombstones = t2;
  if (S.sync.history.length > SYNC_HIST_CAP) S.sync.history = S.sync.history.slice(-SYNC_HIST_CAP);
}

/* ---------------- Change tracking (runs inside every persist) ---------------- */
function syncTrack(){
  if (!S || !Array.isArray(S.binders)) return;
  syncEnsure();
  const prev = SYNC.base, quiet = SYNC.quiet, now = nowISO(), cur = {binder:new Map(), client:new Map(), location:new Map()};
  const tombs = prev && !quiet ? syncTombMap() : null;
  const lists = {binder:S.binders, client:S.clients || [], location:S.locations || []};   // v11: + location tree
  ['binder', 'client', 'location'].forEach(type => {
    if (prev && !prev[type]) prev[type] = new Map(lists[type].map(r => [r.id, {h:syncCanon(r, type), u:String(r.updated_at || ''), code:''}]));   // base taken before this type existed
    lists[type].forEach(r => {
      if (!r || !r.id) return;
      const h = syncCanon(r, type), p = prev && prev[type].get(r.id);
      if (prev && !quiet){
        if (p && p.h !== h && p.u === String(r.updated_at || '')) r.updated_at = syNext(p.u, now);   // edited without bumping (v11: never earlier than the edited version)
        if (!p){
          if (type !== 'binder' && !r.updated_at) r.updated_at = now;
          if (tombs.has(syTombKey(type, r.id))){ S.tombstones = S.tombstones.filter(x => !(x.type === type && x.id === r.id)); tombs.delete(syTombKey(type, r.id)); }
        }
      }
      cur[type].set(r.id, {h, u:String(r.updated_at || ''), code:type === 'binder' ? r.speaking_code : type === 'location' ? r.code : (r.multi_code || r.name)});
    });
    if (prev && !quiet) prev[type].forEach((p, id) => { if (!cur[type].has(id) && !tombs.has(syTombKey(type, id))) syncAddTomb({type, id, code:p.code, deletedAt:syNext(p.u, now)}); });
  });
  SYNC.base = cur; SYNC.quiet = false;
  syncPrune();
}

/* ---------------- Encryption (WebCrypto, works on file:// in Chrome/Edge) ---------------- */
const syncCryptoOk = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
async function syncKey(pass, salt, iterations){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}
async function syncEncrypt(text, pass){
  if (!syncCryptoOk()) throw new Error(t('sy_no_crypto'));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await syncKey(pass, salt, SYNC_KDF_ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(SYNC_AAD), tagLength:128}, key, new TextEncoder().encode(text)));
  return {format:SYNC_FORMAT_ENC, v:1, kdf:{name:'PBKDF2', hash:'SHA-256', iterations:SYNC_KDF_ITER, salt:syB64(salt)}, cipher:'AES-256-GCM', iv:syB64(iv), ct:syB64(ct)};
}
async function syncDecrypt(env, pass){
  if (!syncCryptoOk()) throw new Error(t('sy_no_crypto'));
  if (!pass) throw new Error(t('sy_err_need_pass'));
  const k = env.kdf || {}, it = +k.iterations;
  if (env.v !== 1 || k.name !== 'PBKDF2' || k.hash !== 'SHA-256' || !(it >= 100000 && it <= 10000000)) throw new Error(t('sy_err_version', {v:env.v}));
  try {
    const key = await syncKey(pass, syUnB64(k.salt), it);
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:syUnB64(env.iv), additionalData:new TextEncoder().encode(SYNC_AAD), tagLength:128}, key, syUnB64(env.ct));
    return new TextDecoder().decode(pt);
  } catch(e){ throw new Error(t('sy_err_bad_pass')); }
}

/* ---------------- Export ---------------- */
function syncPeer(id){ return (S.sync.peers || {})[id] || null; }
/** Start of "only changes" for a recipient: what it confirmed having (ack), else our last export to it, else our last export at all. */
function syncSinceFor(target){
  syncEnsure();
  const p = target && syncPeer(target);
  return (p && (p.ackedAt || p.lastExportAt)) || (!target && S.sync.lastExportAt) || null;
}
/** v11: remember WHEN (local clock) a record or tombstone arrived here from a peer, and from which one. Without it a record
    received from device B with an old updated_at (B edited it this morning, we imported it this afternoon) would never be
    forwarded to the server / to a third device whose last exchange is in between.
    S.sync.recvAt = {'type:id': [localISO, peerId, version]}: version = the updated_at that peer holds (received from it,
    or accepted by the server on push) — syncAnalyze uses it to tell "unchanged here since that peer gave / took it". */
const SYNC_RECV_CAP = 20000;
function syncMarkRecv(type, id, from, ver){
  const m = S.sync.recvAt || (S.sync.recvAt = {});
  m[syTombKey(type, id)] = [nowISO(), String(from || ''), String(ver || '')];
  const keys = Object.keys(m);
  if (keys.length > SYNC_RECV_CAP) keys.sort((a, b) => syTs(m[a][0]) - syTs(m[b][0])).slice(0, keys.length - SYNC_RECV_CAP).forEach(k => delete m[k]);
}
/** v11: this exact local version came from (or was accepted by) that peer: not a local change, whatever its time stamp
    (a version stamped by a clock that is ahead would otherwise look "changed here after the last sync" → false conflict). */
function syncSameAsPeer(type, l, peerId){ const r = S.sync && S.sync.recvAt && S.sync.recvAt[syTombKey(type, l.id)]; return !!(r && r[1] === peerId && r[2] && r[2] === String(l.updated_at || '')); }
/** Changed since `since` (local edit or arrival from a peer other than `exclude`, the peer we are sending to). */
function syncIsNew(type, id, ts, since, exclude){
  if (!since || syTs(ts) > syTs(since) || syTs(since) > Date.now() + 5000) return true;   // a baseline in the future (clock put back): everything counts

  const r = S.sync && S.sync.recvAt && S.sync.recvAt[syTombKey(type, id)];
  return !!(r && r[1] !== exclude && syTs(r[0]) > syTs(since));
}
function syncChangedSince(since, exclude){
  const nw = (type, id, ts) => syncIsNew(type, id, ts, since, exclude || '');
  return { binders:S.binders.filter(b => nw('binder', b.id, b.updated_at)), clients:(S.clients || []).filter(c => nw('client', c.id, c.updated_at)), locations:(S.locations || []).filter(l => nw('location', l.id, l.updated_at)), tombstones:(S.tombstones || []).filter(x => nw(x.type, x.id, x.deletedAt)) };
}
/** opts: {incremental:bool, target:deviceId|''} → package object (plain). */
function syncBuildPackage(opts){
  opts = opts || {}; syncEnsure();
  const since = opts.incremental ? syncSinceFor(opts.target) : null;
  const ch = syncChangedSince(since, opts.target || ''), p = opts.target && syncPeer(opts.target);
  const logSince = since || (p && (p.ackedAt || p.lastExportAt)) || null;
  const log = (typeof LOG !== 'undefined' ? LOG.entries : []).filter(e => !logSince || syTs(e.at) > syTs(logSince));
  const ack = {}; Object.keys(S.sync.peers).forEach(id => { const x = S.sync.peers[id]; if (x.lastSeenRemoteExportAt) ack[id] = x.lastSeenRemoteExportAt; });
  return {
    format:SYNC_FORMAT, version:SYNC_VERSION, app:'DocMap26', appVersion:APP_VERSION, exportedAt:nowISO(),
    source:{deviceId:syncDeviceId(), deviceLabel:syncDeviceLabel(), mode:syncMode(), operator:String(S.settings.operator || '')},
    since:since || null, target:opts.target || '', ack,
    records:{binders:clone(ch.binders), clients:clone(ch.clients), locations:clone(ch.locations)}, tombstones:clone(ch.tombstones),   // v11: locations (older readers ignore the key)
    settingsSubset:{studioName:S.settings.studioName || '', destTemplate:S.settings.destTemplate || '', catColors:clone(S.settings.catColors || {}), ...colorSyncSubset(), ...(typeof locSyncSubset === 'function' ? locSyncSubset() : {})},   // colour block: 02b-colors.js · location levels: 06h-locations.js
    activity_log:log.map(e => ({id:e.id, at:e.at, who:e.who, action:e.action, target:e.target, summary:e.summary, details:e.details, source:e.source})),
    counts:{binders:ch.binders.length, clients:ch.clients.length, locations:ch.locations.length, tombstones:ch.tombstones.length, log:log.length}
  };
}
function syncFileName(){
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return 'docmap-sync-' + (slugify(syncDeviceLabel()) || syncMode()) + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.json';
}
/** Builds (and optionally encrypts) the package text and records the export. opts: {incremental, target, pass}. Returns {text, pkg, name}. */
async function syncExport(opts){
  opts = opts || {};
  const pkg = syncBuildPackage(opts), plain = JSON.stringify(pkg);
  const text = opts.pass ? JSON.stringify(await syncEncrypt(plain, opts.pass)) : JSON.stringify(pkg, null, 1);
  const name = syncFileName(), at = pkg.exportedAt;
  S.sync.lastExportAt = at;
  if (opts.target){ const p = syncPeer(opts.target); if (p) p.lastExportAt = at; S.sync.lastPeer = opts.target; }
  S.sync.history.push({at, dir:'export', peer:opts.target || '', label:opts.target && syncPeer(opts.target) ? syncPeer(opts.target).label : '', full:!pkg.since, since:pkg.since, file:name, enc:!!opts.pass, counts:pkg.counts});
  syncPrune(); savePrefs();
  logAct('sync.export', {type:'file', id:'', code:name}, 'Export per la sincronizzazione (' + (pkg.since ? 'solo modifiche dal ' + fmtDate(pkg.since, true) : 'completo') + (opts.pass ? ', cifrato' : '') + '): ' + pkg.counts.binders + ' faldoni, ' + pkg.counts.clients + ' clienti, ' + pkg.counts.tombstones + ' eliminazioni',
    {file:name, full:!pkg.since, since:pkg.since, target:opts.target || '', encrypted:!!opts.pass, binders:pkg.counts.binders, clients:pkg.counts.clients, tombstones:pkg.counts.tombstones, log:pkg.counts.log}, 'sync');
  return {text, pkg, name};
}

/* ---------------- Import: parse → analyse (review) → apply ---------------- */
const syIsSync = (o) => !!(o && typeof o === 'object' && (o.format === SYNC_FORMAT || o.format === SYNC_FORMAT_ENC));
async function syncParse(text, pass){
  const s = String(text || '').replace(/^﻿/, '').trim();
  if (!s) throw new Error(t('sy_err_empty'));
  if (s.length > 80 * 1024 * 1024) throw new Error(t('sy_err_big'));
  let o; try { o = JSON.parse(s); } catch(e){ throw new Error(t('sy_err_format')); }
  if (!syIsSync(o)) throw new Error(t('sy_err_format'));
  if (o.format === SYNC_FORMAT_ENC){ try { o = JSON.parse(await syncDecrypt(o, pass)); } catch(e){ throw e; } if (!o || o.format !== SYNC_FORMAT) throw new Error(t('sy_err_format')); }
  if (o.version !== SYNC_VERSION) throw new Error(t('sy_err_version', {v:o.version}));
  if (!o.source || !o.source.deviceId || !o.records) throw new Error(t('sy_err_format'));
  return o;
}
function syncNormRemote(r, type){
  const c = syncClean(r);
  if (type === 'client'){ const n = normalizeClient(c); n.updated_at = String(c.updated_at || ''); return n; }
  if (type === 'location'){ const n = normalizeLocation(c); n.updated_at = String(c.updated_at || ''); return n; }
  const n = normalizeBinder(c); n.updated_at = String(c.updated_at || ''); if (c.created_at) n.created_at = String(c.created_at);
  return n;
}
function syncFieldDiff(l, r, type){
  const skip = (type === 'client' ? SYNC_C_SKIP : type === 'location' ? SYNC_L_SKIP : SYNC_B_SKIP).concat(['id']), out = [];
  Object.keys(Object.assign({}, l || {}, r || {})).forEach(k => {
    if (skip.includes(k) || k.charAt(0) === '_') return;
    const v = (o) => { const x = o ? o[k] : ''; return k === 'contents_items' ? contentsToPipe(x || []) : x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x); };
    if (v(l) !== v(r)) out.push([k, v(l), v(r)]);
  });
  return out;
}
/** Review plan for a parsed package. Each item: {type, id, code, kind, reason?, local, remote, tomb, choice, fields}. */
function syncAnalyze(pkg){
  syncEnsure();
  const me = syncDeviceId(), peerId = pkg.source.deviceId;
  if (peerId === me) throw new Error(t('sy_err_self'));
  const peer = syncPeer(peerId) || {};
  const baseLocal = syMax(peer.lastImportAt, peer.ackedAt), baseRemote = peer.lastSeenRemoteExportAt || null;
  const hasBase = !!(baseLocal && baseRemote);
  const tombs = syncTombMap(), items = [], warnings = [];
  const newer = (a, b) => syTs(a) > syTs(b);
  const seen = new Set();
  [['binder', 'binders', S.binders], ['client', 'clients', S.clients || []], ['location', 'locations', S.locations || []]].forEach(([type, key, list]) => {
    const loc = new Map(list.map(x => [x.id, x]));
    const recs = Array.isArray(pkg.records[key]) ? pkg.records[key] : [];
    recs.forEach(raw => {
      if (!raw || typeof raw !== 'object' || !raw.id || seen.has(type + raw.id)) return;
      seen.add(type + raw.id);
      const r = syncNormRemote(raw, type), l = loc.get(r.id) || null, tb = tombs.get(syTombKey(type, r.id));
      const it = {type, id:r.id, code:type === 'binder' ? r.speaking_code : type === 'location' ? (r.code || r.seg || r.name) : (r.name || r.multi_code), local:l, remote:r, tomb:null, choice:'remote', fields:[]};
      if (!l){
        if (tb){
          it.tomb = tb;
          if (newer(r.updated_at, tb.deletedAt)){ it.kind = 'conflict'; it.reason = 'deleted_local'; it.choice = 'remote'; }
          else it.kind = 'older';
        } else it.kind = 'new';
      } else if (syncCanon(l, type) === syncCanon(r, type)) it.kind = 'unchanged';
      else {
        const lt = syTs(l.updated_at), rt = syTs(r.updated_at);
        it.fields = syncFieldDiff(l, r, type);
        if (lt === rt){ it.kind = 'conflict'; it.reason = 'tie'; it.choice = 'local'; }
        else if (hasBase && lt > syTs(baseLocal) && !syncSameAsPeer(type, l, peerId) && rt > syTs(baseRemote)){ it.kind = 'conflict'; it.reason = 'both'; it.choice = rt > lt ? 'remote' : 'local'; }
        else if (rt > lt) it.kind = 'updated';
        else it.kind = 'older';
      }
      items.push(it);
    });
    (Array.isArray(pkg.tombstones) ? pkg.tombstones : []).forEach(x => {
      if (!x || x.type !== type || !x.id || seen.has(type + x.id)) return;
      seen.add(type + x.id);
      const tb = {type, id:String(x.id), code:String(x.code || ''), deletedAt:String(x.deletedAt || ''), who:String(x.who || '')};
      const l = loc.get(tb.id);
      const it = {type, id:tb.id, code:l ? (type === 'binder' ? l.speaking_code : type === 'location' ? l.code : l.name) : tb.code, local:l || null, remote:null, tomb:tb, choice:'remote', fields:[]};
      if (!l) it.kind = 'propagate';   // already gone here: only remember the tombstone
      else if (newer(l.updated_at, tb.deletedAt)){ it.kind = 'conflict'; it.reason = 'deleted_remote'; it.choice = 'local'; }
      else it.kind = 'delete';
      items.push(it);
    });
  });
  // speaking-code collisions with other local binders (ensureIntegrity would rename the incoming one)
  const codes = new Map(S.binders.map(b => [b.speaking_code, b.id]));
  items.filter(i => i.type === 'binder' && i.remote && (i.kind === 'new' || i.kind === 'updated' || i.kind === 'conflict')).forEach(i => {
    const o = codes.get(i.remote.speaking_code); if (o && o !== i.id) warnings.push(t('sy_w_code', {c:i.remote.speaking_code}));
  });
  const skew = (syTs(pkg.exportedAt) - Date.now()) / 60000;
  if (skew > 5) warnings.unshift(t('sy_w_clock', {m:Math.round(skew)}));
  const plan = {pkg, peer:{id:peerId, label:String(pkg.source.deviceLabel || peerId), mode:pkg.source.mode === 'web' ? 'web' : 'local'}, items, warnings, applySettings:false};
  plan.counts = syncCounts(plan);
  return plan;
}
function syncCounts(plan){
  const c = {new:0, updated:0, unchanged:0, older:0, delete:0, conflict:0, propagate:0};
  plan.items.forEach(i => { c[i.kind] = (c[i.kind] || 0) + 1; });
  return c;
}
/** Conflicts: choose the most recent side (Dave's rule); ties keep local. */
function syncChooseNewer(plan){
  plan.items.filter(i => i.kind === 'conflict').forEach(i => {
    const lt = i.local ? syTs(i.local.updated_at) : syTs(i.tomb && i.tomb.deletedAt);
    const rt = i.remote ? syTs(i.remote.updated_at) : syTs(i.tomb && i.tomb.deletedAt);
    i.choice = rt > lt ? 'remote' : 'local';
  });
}
/** Applies a reviewed plan in one undoable step. Returns the counts actually applied.
    opts.quiet (v10.1 automatic pulls from the online server, 06g-server.js): no undo point, no summary log line
    (the conflict decisions are still logged). */
function syncApply(plan, opts){
  opts = opts || {};
  syncEnsure();
  if (!opts.quiet) undoPoint();
  const now = nowISO(), done = {new:0, updated:0, delete:0, conflict:0}, codes = {new:[], updated:[], delete:[]};
  const lists = {binder:S.binders.slice(), client:(S.clients || []).slice(), location:(S.locations || []).slice()};
  const idx = (type, id) => lists[type].findIndex(x => x.id === id);
  const put = (it) => {   // remote version replaces / joins the local list
    const r = clone(it.remote), k = idx(it.type, it.id);
    if (it.type === 'location'){ const l = normalizeLocation(r); l.updated_at = it.remote.updated_at || now; if (k >= 0) lists.location[k] = l; else lists.location.push(l); }
    else if (it.type === 'binder'){ const b = normalizeBinder(r); b.updated_at = it.remote.updated_at || now; if (k >= 0){ b.selected_for_print = !!lists.binder[k].selected_for_print; lists.binder[k] = b; } else lists.binder.push(b); }
    else { const c = normalizeClient(r); c.updated_at = it.remote.updated_at || now; if (k >= 0) lists.client[k] = c; else lists.client.push(c); }
    S.tombstones = S.tombstones.filter(x => !(x.type === it.type && x.id === it.id));
    syncMarkRecv(it.type, it.id, plan.peer.id, it.remote.updated_at);
  };
  const drop = (it) => { const k = idx(it.type, it.id); if (k >= 0) lists[it.type].splice(k, 1); syncAddTomb(it.tomb); syncMarkRecv(it.type, it.id, plan.peer.id, ''); };
  const confLog = [];
  plan.items.forEach(it => {
    if (it.kind === 'new'){ put(it); done.new++; codes.new.push(it.code); }
    else if (it.kind === 'updated'){ put(it); done.updated++; codes.updated.push(it.code); }
    else if (it.kind === 'delete'){ drop(it); done.delete++; codes.delete.push(it.code); }
    else if (it.kind === 'propagate'){ if (!syncTombMap().has(syTombKey(it.type, it.id))){ syncAddTomb(it.tomb); syncMarkRecv(it.type, it.id, plan.peer.id, ''); } }
    else if (it.kind === 'conflict'){
      done.conflict++;
      if (it.choice === 'remote'){ if (it.remote) put(it); else drop(it); }
      else if (it.local){   // keep local: make sure it stays the most recent so it wins on the other side too
        const k = idx(it.type, it.id), rt = it.remote ? it.remote.updated_at : it.tomb.deletedAt;
        if (k >= 0 && syTs(lists[it.type][k].updated_at) <= syTs(rt)) lists[it.type][k].updated_at = syNext(rt, now);   // v11: later than the other side even with clock skew
      }
      confLog.push(it);
    }
  });
  S.locations = lists.location; if (typeof locIntegrity === 'function') locIntegrity();   // v11: tree first, then the binders follow its codes
  S.binders = lists.binder.map(b => { const c = typeof binderLocCode === 'function' ? binderLocCode(b) : b.location_code; if (c !== b.location_code) b.location_code = c; return b; }); S.clients = lists.client;
  ensureIntegrity();
  if (plan.applySettings && plan.pkg.settingsSubset){
    const ss = plan.pkg.settingsSubset;
    if (typeof ss.studioName === 'string' && ss.studioName) S.settings.studioName = ss.studioName;
    if (typeof ss.destTemplate === 'string' && /^https?:\/\//i.test(ss.destTemplate)) S.settings.destTemplate = ss.destTemplate;
    if (ss.catColors && typeof ss.catColors === 'object') S.settings.catColors = Object.assign({}, S.settings.catColors || {}, syncClean(ss.catColors));
    colorSyncApply(ss);   // colorMode / catFamilies / colorRules: newer colorUpdatedAt wins (02b-colors.js)
    if (typeof locSyncApply === 'function') locSyncApply(ss);   // v11 location levels: newer locLevelsAt wins (06h-locations.js)
  }
  // peer bookkeeping
  const pid = plan.peer.id, p = S.sync.peers[pid] = Object.assign({id:pid, label:'', mode:'local', lastImportAt:null, lastSeenRemoteExportAt:null, lastExportAt:null, ackedAt:null}, S.sync.peers[pid] || {});
  p.label = plan.peer.label; p.mode = plan.peer.mode; p.lastImportAt = now;
  p.lastSeenRemoteExportAt = syMax(p.lastSeenRemoteExportAt, plan.pkg.exportedAt);
  const ack = plan.pkg.ack && plan.pkg.ack[syncDeviceId()]; if (ack) p.ackedAt = syMax(p.ackedAt, ack);
  S.sync.lastImportAt = now; S.sync.lastPeer = pid;
  S.sync.history.push({at:now, dir:'import', peer:pid, label:plan.peer.label, full:!plan.pkg.since, since:plan.pkg.since || null, counts:Object.assign({}, done)});
  // activity log: summary first (the one "Annulla" reverts), then the conflict decisions, then the peer's own entries
  const cut = (a) => logCut(a.join(', '), 160);
  const sum = opts.quiet ? null : logAct('sync.import', null, 'Importati dati da ' + plan.peer.label + ' (' + ({web:'web app', server:'server online'}[plan.peer.mode] || 'client locale') + '): ' + done.new + ' nuovi, ' + done.updated + ' aggiornati, ' + done.delete + ' eliminati, ' + done.conflict + ' conflitti' +
    (codes.new.length + codes.updated.length + codes.delete.length ? ' — ' + cut(codes.new.concat(codes.updated, codes.delete)) : ''),
    {peer:pid, peer_label:plan.peer.label, peer_mode:plan.peer.mode, exported_at:plan.pkg.exportedAt, full:!plan.pkg.since, added:done.new, updated:done.updated, deleted:done.delete, conflicts:done.conflict, codes:{new:codes.new.slice(0, 200), updated:codes.updated.slice(0, 200), deleted:codes.delete.slice(0, 200)}}, 'sync');
  confLog.forEach(it => logAct('sync.conflict', {type:it.type, id:it.id, code:it.code},
    'Conflitto su ' + it.code + ' (' + {both:'modificato da entrambe le parti', tie:'stessa ora', deleted_remote:'eliminato dall\'altra parte', deleted_local:'eliminato qui'}[it.reason] + '): ' + (it.choice === 'remote' ? 'tenuta la versione importata' : 'tenuta la versione locale'),
    {reason:it.reason, choice:it.choice, peer:pid, local_updated_at:it.local ? it.local.updated_at : null, remote_updated_at:it.remote ? it.remote.updated_at : null, deleted_at:it.tomb ? it.tomb.deletedAt : null, fields:(it.fields || []).map(f => f[0])}, 'sync'));
  if (Array.isArray(plan.pkg.activity_log) && typeof logMerge === 'function') logMerge(plan.pkg.activity_log.map(syncClean));
  if (sum && typeof LOG !== 'undefined'){ const k = LOG.entries.indexOf(sum); if (k >= 0) LOG.undoMark = k; }
  SYNC.quiet = true;   // timestamps come from the package: no bump, tombstones already written
  commit();
  return done;
}

/* ---------------- Hooks into existing globals ---------------- */
(function syncWrap(){
  const wrap = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = fn(orig); };
  wrap('persist', (o) => function(){ try { syncTrack(); } catch(e){ console.warn('syncTrack', e); } return o.apply(this, arguments); });
  // undo returns to the exact previous state, sync bookkeeping and tombstones included
  wrap('undoPoint', (o) => function(){ const r = o.apply(this, arguments); try { if (UNDO && S) UNDO.syncState = clone({sync:S.sync || null, tombstones:S.tombstones || []}); } catch(e){} return r; });
  wrap('applyWorkspaceObject', (o) => function(W){ const r = o.apply(this, arguments); if (W && W.syncState){ if (W.syncState.sync) S.sync = W.syncState.sync; S.tombstones = W.syncState.tombstones || []; SYNC.quiet = true; } return r; });
  // a sync package pasted into the normal Import view: explain where it goes (never merged with the replace/merge semantics)
  wrap('analyzeImport', (o) => function(text){
    const s = String(text || '').replace(/^﻿/, '').trim();
    if (/^\{/.test(s) && /"format"\s*:\s*"docmap-sync/.test(s.slice(0, 400))){ try { if (syIsSync(JSON.parse(s))){ UI.importParsed = {error:t('sy_im_redirect')}; SYV.text = s; return; } } catch(e){} }
    return o.apply(this, arguments);
  });
  wrap('renderView', (o) => function(){
    if (S && S.view === 'sync'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewSync(); return; }
    return o.apply(this, arguments);
  });
})();

/* ---------------- View ---------------- */
const SYV = { text:'', fileName:'', incr:false, target:null, busy:false };
const syFieldLabel = (k) => S.lang === 'en' ? k.replace(/_/g, ' ') : (LOG_FIELD_IT[k] || k);
const syDate = (iso) => iso ? fmtDate(iso, true) : '—';
const syDateS = (iso) => { const d = new Date(iso || ''); return isNaN(d) ? '—' : d.toLocaleString(S.lang === 'en' ? 'en-GB' : 'it-IT', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'}); };
function syncPendingCount(since, exclude){ const c = syncChangedSince(since, exclude); return c.binders.length + c.clients.length + c.locations.length + c.tombstones.length; }
function syncPeersList(){ return Object.keys(S.sync.peers).map(id => S.sync.peers[id]).sort((a, b) => syTs(syMax(b.lastImportAt, b.lastExportAt)) - syTs(syMax(a.lastImportAt, a.lastExportAt))); }
function syncTarget(){ if (SYV.target === null) SYV.target = S.sync.lastPeer && syncPeer(S.sync.lastPeer) ? S.sync.lastPeer : ''; return SYV.target; }
function syncExportInfoHTML(){
  const tg = syncTarget(), since = SYV.incr ? syncSinceFor(tg) : null, c = syncChangedSince(since);
  return esc(t('sy_will', {b:c.binders.length, c:c.clients.length, d:c.tombstones.length})) + (SYV.incr ? ' <span class="muted">(' + esc(since ? t('sy_since', {d:fmtDate(since, true)}) : t('sy_never')) + ')</span>' : '');
}
function viewSync(){
  syncEnsure();
  const mode = syncMode(), peers = syncPeersList(), tg = syncTarget(), canIncr = !!syncSinceFor(tg);
  if (!canIncr) SYV.incr = false;
  const card = (n, title, desc, inner) => '<div class="card card-p exp-card"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div class="exp-n">' + n + '</div><div><h2>' + esc(title) + '</h2><p class="card-sub" style="margin:4px 0 0">' + esc(desc) + '</p></div></div>' + inner + '</div>';
  const radio = (v, label, dis) => '<label class="chk small"><input type="radio" name="sy-scope" data-sy="incr" value="' + v + '"' + ((v === '1') === SYV.incr ? ' checked' : '') + (dis ? ' disabled' : '') + '>' + esc(label) + '</label>';
  const ex = '<div class="stack" style="gap:8px">' + radio('0', t('sy_full')) + radio('1', t('sy_incr'), !canIncr) + '</div>' +
    (peers.some(p => p.mode !== 'server') ? '<div class="field"><label for="sy-target">' + esc(t('sy_target')) + '</label><select class="inp" id="sy-target" data-sy="target"><option value="">' + esc(t('sy_target_any')) + '</option>' +
      peers.filter(p => p.mode !== 'server').map(p => '<option value="' + esc(p.id) + '"' + (p.id === tg ? ' selected' : '') + '>' + esc(p.label + ' · ' + t('sy_mode_' + p.mode)) + '</option>').join('') + '</select></div>' : '') +
    '<div class="small" id="sy-ex-info">' + syncExportInfoHTML() + '</div>' +
    '<label class="chk small"><input type="checkbox" id="sy-enc" checked' + (syncCryptoOk() ? '' : ' disabled') + '>' + esc(t('sy_enc')) + '</label>' +
    '<div class="grid g2" id="sy-pass-box" style="gap:10px"><div class="field"><label for="sy-pass">' + esc(t('sy_pass')) + '</label><input class="inp" type="password" id="sy-pass" autocomplete="new-password"></div>' +
      '<div class="field"><label for="sy-pass2">' + esc(t('sy_pass2')) + '</label><input class="inp" type="password" id="sy-pass2" autocomplete="new-password"></div></div>' +
    '<div class="hint">' + esc(t('sy_pass_hint')) + '</div>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-lg btn-primary" data-a="sy-export">' + ic('download') + esc(t('sy_download')) + '</button><button class="btn btn-lg" data-a="sy-copy">' + ic('clipboard') + esc(t('sy_copy')) + '</button></div>';
  const im = '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-a="sy-pick">' + ic('upload') + esc(t('sy_pick')) + '</button><span class="small muted mono" id="sy-fname">' + esc(SYV.fileName) + '</span>' +
      '<input type="file" id="sy-file" accept=".json,application/json" hidden></div>' +
    '<textarea class="inp mono" id="sy-text" rows="4" placeholder="' + esc(t('sy_paste_ph')) + '" aria-label="' + esc(t('sy_paste_ph')) + '" style="font-size:12px;resize:vertical">' + esc(SYV.text.length < 200000 ? SYV.text : '') + '</textarea>' +
    '<div class="field"><label for="sy-ipass">' + esc(t('sy_ipass')) + '</label><input class="inp" type="password" id="sy-ipass" autocomplete="off"></div>' +
    '<div><button class="btn btn-lg btn-dark" data-a="sy-analyze">' + ic('eye') + esc(t('sy_analyze')) + '</button></div>';
  return '<div class="page-h"><div><h1>' + esc(t('sy_h')) + helpDot('sync') + '</h1><p>' + esc(t('sy_p')) + '</p></div><div><span class="badge ' + (mode === 'web' ? 'b-upd' : 'b-new') + '">' + ic(mode === 'web' ? 'globe' : 'database') + esc(t('sy_mode_' + mode)) + '</span></div></div>' +
    '<div class="grid g2">' + card(1, t(mode === 'web' ? 'sy_ex_web' : 'sy_ex_local'), t('sy_ex_d'), ex) + card(2, t(mode === 'web' ? 'sy_im_web' : 'sy_im_local'), t('sy_im_d'), im) + '</div>' +
    '<div class="card card-p" style="margin-top:16px" id="sy-queue">' + syncQueueHTML() + '</div>';
}
function syncQueueHTML(){
  const peers = syncPeersList(), hist = S.sync.history.slice().reverse().slice(0, 20);
  const pend = syncPendingCount(S.sync.lastExportAt);
  const cnt = (c) => c ? [c.binders != null ? c.binders + 'F' : '', c.new != null ? '+' + c.new : '', c.updated != null ? '~' + c.updated : '', c.delete != null ? '−' + c.delete : '', c.conflict ? '⚠' + c.conflict : '', c.clients ? c.clients + 'C' : '', c.tombstones ? '−' + c.tombstones : ''].filter(Boolean).join(' ') : '';
  return '<h2>' + esc(t('sy_q_h')) + '</h2>' +
    '<div class="grid g2" style="margin-top:10px"><div class="stack" style="gap:6px">' +
      '<div class="small"><b>' + esc(t('sy_dev_h')) + '</b></div>' +
      '<div class="field"><label for="sy-label">' + esc(t('sy_dev_label')) + '</label><input class="inp" id="sy-label" data-set="deviceLabel" value="' + esc(S.settings.deviceLabel || '') + '" placeholder="' + esc(t('sy_mode_' + syncMode())) + '" style="max-width:280px"></div>' +
      '<div class="small muted">' + esc(t('sy_dev_id')) + ': <span class="mono" id="sy-devid">' + esc(syncDeviceId()) + '</span> · ' + esc(t('sy_dev_mode')) + ': ' + esc(t('sy_mode_' + syncMode())) + '</div></div>' +
    '<div class="stack" style="gap:6px"><div class="small"><b>' + esc(t('sy_q_pending')) + '</b>: <span class="badge b-upd" id="sy-pending">' + pend + '</span>' + (S.sync.lastExportAt ? ' <span class="small muted">(' + esc(t('sy_since', {d:fmtDate(S.sync.lastExportAt, true)})) + ')</span>' : '') + '</div>' +
      peers.map(p => { const s = p.ackedAt || p.lastExportAt; return s ? '<div class="small">' + esc(t('sy_q_pending_peer', {l:p.label})) + ': <b>' + syncPendingCount(s, p.id) + '</b></div>' : ''; }).join('') + '</div></div>' +
    '<div class="small" style="margin-top:14px"><b>' + esc(t('sy_q_peers')) + '</b></div>' +
    (peers.length ? '<div class="tbl-wrap"><table class="tbl" id="sy-peers"><thead><tr><th>' + esc(t('sy_q_peer')) + '</th><th>' + esc(t('sy_q_last_im')) + '</th><th>' + esc(t('sy_q_last_ex')) + '</th><th>' + esc(t('sy_q_ack')) + '</th></tr></thead><tbody>' +
      peers.map(p => '<tr><td><b>' + esc(p.label) + '</b> <span class="tiny muted">' + esc(t('sy_mode_' + p.mode)) + '</span><div class="tiny muted mono">' + esc(p.id) + '</div></td><td class="small">' + esc(syDate(p.lastImportAt)) + '</td><td class="small">' + esc(syDate(p.lastExportAt)) + '</td><td class="small">' + esc(syDate(p.ackedAt)) + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="small muted">' + esc(t('sy_q_none')) + '</div>') +
    (hist.length ? '<div class="small" style="margin-top:14px"><b>' + esc(t('sy_q_hist')) + '</b></div><div class="tbl-wrap"><table class="tbl" id="sy-hist"><thead><tr><th>' + esc(t('sy_q_when')) + '</th><th>' + esc(t('sy_q_dir')) + '</th><th>' + esc(t('sy_q_peer')) + '</th><th>' + esc(t('sy_q_what')) + '</th></tr></thead><tbody>' +
      hist.map(h => '<tr><td class="small">' + esc(syDate(h.at)) + '</td><td><span class="badge ' + (h.dir === 'import' ? 'b-new' : 'b-upd') + '">' + esc(t('sy_dir_' + h.dir)) + '</span></td><td class="small">' + esc(h.label || (h.dir === 'export' ? t('sy_target_any') : h.peer)) + '</td><td class="small mono">' + esc((h.full ? t('sy_full') : t('sy_since', {d:fmtDate(h.since, true)})) + ' · ' + cnt(h.counts) + (h.enc ? ' · 🔒' : '')) + '</td></tr>').join('') + '</tbody></table></div>' : '');
}

/* Review modal */
function syncValHTML(v){ return v === '' ? '<span class="muted">—</span>' : esc(logCut(v, 160)); }
function syncConflictHTML(it, i){
  const side = (who) => { const rec = who === 'local' ? it.local : it.remote, del = !rec && it.tomb;
    return '<label class="chk small" style="align-items:flex-start"><input type="radio" name="syc-' + i + '" data-syc="' + i + '" value="' + who + '"' + (it.choice === who ? ' checked' : '') + '><span><b>' + esc(t(who === 'local' ? 'sy_keep_local' : 'sy_keep_remote')) + '</b><br><span class="tiny muted">' +
      esc(del ? t('sy_deleted', {d:syDateS(it.tomb.deletedAt)}) : syDateS(rec && rec.updated_at)) + '</span></span></label>'; };
  const rows = it.fields.length ? it.fields : [];
  return '<div class="card card-p sy-conf" data-sycard="' + i + '" style="margin-top:10px"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><div><span class="mono"><b>' + esc(it.code || it.id) + '</b></span> <span class="small muted">' + esc((it.local || it.remote || {}).company_name || '') + '</span><div class="tiny" style="color:#92400E">' + esc(t('sy_r_' + it.reason)) + '</div></div>' +
    '<div class="row" style="gap:14px">' + side('local') + side('remote') + '</div></div>' +
    (rows.length ? '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl sy-diff"><thead><tr><th>' + esc(t('sy_field')) + '</th><th>' + esc(t('sy_local')) + '</th><th>' + esc(t('sy_remote')) + '</th></tr></thead><tbody>' +
      rows.map(f => '<tr><td class="small"><b>' + esc(syFieldLabel(f[0])) + '</b></td><td class="small">' + syncValHTML(f[1]) + '</td><td class="small">' + syncValHTML(f[2]) + '</td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
}
function syncReviewHTML(plan){
  const c = plan.counts, P = plan.pkg;
  const badge = (k, cls) => '<span class="badge ' + cls + '" data-syk="' + k + '">' + (c[k] || 0) + ' ' + esc(t('sy_k_' + k)) + '</span>';
  const conf = plan.items.map((it, i) => it.kind === 'conflict' ? syncConflictHTML(it, i) : '').join('');
  const list = ['new', 'updated', 'delete', 'older'].filter(k => c[k]).map(k => '<div class="small"><b>' + esc(t('sy_k_' + k)) + '</b>: <span class="mono">' + esc(logCut(plan.items.filter(i => i.kind === k).map(i => i.code).join(', '), 600)) + '</span></div>').join('');
  const nothing = !(c.new || c.updated || c.delete || c.conflict);
  return '<div id="sy-review" class="stack" style="gap:10px">' +
    '<div class="small muted">' + esc(t('sy_rv_from', {l:plan.peer.label, m:t('sy_mode_' + plan.peer.mode), d:fmtDate(P.exportedAt, true)})) + ' · ' + esc(P.since ? t('sy_rv_incr', {d:fmtDate(P.since, true)}) : t('sy_rv_full')) + '</div>' +
    '<div class="row" style="gap:6px;flex-wrap:wrap">' + badge('new', 'b-new') + badge('updated', 'b-upd') + badge('unchanged', '') + badge('older', '') + badge('delete', 'b-err') + badge('conflict', 'b-out') + '</div>' +
    plan.warnings.map(w => '<div class="warn-box small">' + ic('alert') + '<div>' + esc(w) + '</div></div>').join('') +
    (nothing ? '<div class="info-box small">' + ic('info') + '<div>' + esc(t('sy_rv_nothing')) + '</div></div>' : '') +
    (c.conflict ? '<div><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><h3 style="margin:0">' + esc(t('sy_rv_conflicts')) + '</h3><button class="btn btn-sm" data-a="sy-all-newer">' + ic('check') + esc(t('sy_rv_all_newer')) + '</button></div><div class="hint">' + esc(t('sy_rv_conf_d')) + '</div>' + conf + '</div>' : '') +
    (list ? '<details><summary class="small"><b>' + esc(t('sy_rv_list')) + '</b></summary><div class="stack" style="gap:6px;margin-top:6px">' + list + '</div></details>' : '') +
    (P.settingsSubset ? '<label class="chk small"><input type="checkbox" id="sy-apply-settings"' + (plan.applySettings ? ' checked' : '') + '>' + esc(t('sy_rv_settings')) + '</label>' : '') +
    '</div>';
}
function syncOpenReview(plan){
  SYNC.plan = plan;
  openModal({ title:t('sy_rv_t'), size:'lg', body:syncReviewHTML(plan), autofocus:false,
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('sy_rv_apply'), cls:'btn btn-primary', icon:'check', fn:() => syncApplyFromReview()}],
    onClose:() => { const p = SYNC.plan; SYNC.plan = null; if (p && p.onCancel) p.onCancel(); } });
}
function syncApplyFromReview(){
  const plan = SYNC.plan; if (!plan) return;
  const cb = $('#sy-apply-settings'); plan.applySettings = !!(cb && cb.checked);
  const d = syncApply(plan);
  SYNC.plan = null;   // applied: closing the modal is not a cancel
  closeModal(true);
  if (plan.onApplied){ renderAll(); plan.onApplied(d); return; }   // v10.1 server sync: continue with the push
  SYV.text = ''; SYV.fileName = '';
  undoToast(t('sy_done', {n:d.new, u:d.updated, d:d.delete, c:d.conflict}));
  renderAll();
}
async function syncAnalyzeUI(){
  const ta = $('#sy-text'), pass = ($('#sy-ipass') || {}).value || '';
  const text = (ta && ta.value.trim()) || SYV.text;
  try {
    const pkg = await syncParse(text, pass);
    const plan = syncAnalyze(pkg);
    if ($('#sy-ipass')) $('#sy-ipass').value = '';
    syncOpenReview(plan);
  } catch(e){ toast(String(e.message || e), 'err', 7000); }
}
async function syncExportUI(copy){
  if (SYV.busy) return;
  const enc = $('#sy-enc') && $('#sy-enc').checked, p1 = ($('#sy-pass') || {}).value || '', p2 = ($('#sy-pass2') || {}).value || '';
  if (enc){
    if (!syncCryptoOk()){ toast(t('sy_no_crypto'), 'err'); return; }
    if (p1.length < 8){ toast(t('sy_err_pass_short'), 'err'); return; }
    if (p1 !== p2){ toast(t('sy_err_pass_match'), 'err'); return; }
  }
  SYV.busy = true;
  try {
    const tg = syncTarget();
    const r = await syncExport({incremental:SYV.incr, target:tg, pass:enc ? p1 : ''});
    if (copy){
      if (r.text.length > SYNC_CLIP_MAX){ toast(t('sy_clip_big'), 'warn', 6000); download(r.name, r.text, 'application/json'); }
      else { await copyText(r.text); toast(t('sy_copied', {n:Math.max(1, Math.round(r.text.length / 1024))})); }
    } else { download(r.name, r.text, 'application/json'); toast(t('sy_exported', {f:r.name})); }
    ['#sy-pass', '#sy-pass2'].forEach(s => { const i = $(s); if (i) i.value = ''; });
    const q = $('#sy-queue'); if (q) q.innerHTML = syncQueueHTML();
    const inf = $('#sy-ex-info'); if (inf) inf.innerHTML = syncExportInfoHTML();
  } catch(e){ toast(String(e.message || e), 'err', 7000); }
  finally { SYV.busy = false; }
}
async function syncLoadFile(f){
  if (!f) return;
  try { SYV.text = await readFileText(f); SYV.fileName = f.name; if (S.view !== 'sync'){ S.view = 'sync'; renderAll(); } else { const ta = $('#sy-text'); if (ta) ta.value = SYV.text.length < 200000 ? SYV.text : ''; const fn = $('#sy-fname'); if (fn) fn.textContent = f.name; } }
  catch(e){ toast(String(e), 'err'); }
}

const SYNC_ACTIONS = {
  'sy-export': () => syncExportUI(false),
  'sy-copy': () => syncExportUI(true),
  'sy-pick': () => { const i = $('#sy-file'); if (i) i.click(); },
  'sy-analyze': () => syncAnalyzeUI(),
  'sy-all-newer': () => { const plan = SYNC.plan; if (!plan) return; syncChooseNewer(plan); plan.items.forEach((it, i) => { if (it.kind !== 'conflict') return; $$('[data-syc="' + i + '"]').forEach(r => { r.checked = r.value === it.choice; }); }); }
};
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset) return;
  if (el.dataset.syc != null && SYNC.plan){ const it = SYNC.plan.items[+el.dataset.syc]; if (it) it.choice = el.value === 'remote' ? 'remote' : 'local'; return; }
  if (el.id === 'sy-file'){ syncLoadFile(el.files[0]); el.value = ''; return; }
  const k = el.dataset.sy;
  if (k === 'incr'){ SYV.incr = el.value === '1'; const inf = $('#sy-ex-info'); if (inf) inf.innerHTML = syncExportInfoHTML(); }
  if (k === 'target'){ SYV.target = el.value; renderView(); }
  if (el.id === 'sy-enc'){ const b = $('#sy-pass-box'); if (b) b.style.display = el.checked ? '' : 'none'; }
});
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'sy-text'){ SYV.text = e.target.value; SYV.fileName = ''; } });

/* ---------------- Late registration ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, SYNC_ACTIONS);
  if (typeof VIEW_LABEL !== 'undefined') VIEW_LABEL.sync = 'nav_sync';
  // a sync package dropped / chosen anywhere opens the Sync view instead of the normal import
  if (typeof handleDroppedFile === 'function'){
    const orig = handleDroppedFile;
    window.handleDroppedFile = async function(f){
      try { if (f && f.size < 80 * 1024 * 1024 && /\.json$/i.test(f.name)){ const head = new TextDecoder().decode(new Uint8Array(await f.slice(0, 400).arrayBuffer())); if (/"format"\s*:\s*"docmap-sync/.test(head)) return syncLoadFile(f); } } catch(e){}
      return orig.apply(this, arguments);
    };
  }
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'sync', guide:null, tags:['export', 'import', 'safety'], related:['log', 'backup'],
    title:{it:'Sincronizzazione manuale tra PC locale e web app', en:'Manual sync between the local PC and the web app'},
    body:{it:'<p>DocMap funziona sia sul PC (doppio clic su <span class="kbd">index.html</span>) sia come web app (<b>docmap.pr-it.it/studio-de/</b>). Ognuno tiene la sua copia dei dati: per allinearli usa <b>⚙ Funzioni avanzate › Sincronizzazione</b>.</p><ol><li>Sul PC: <b>Copia export per web app</b> → scegli <b>Tutto l\'archivio</b> la prima volta, poi <b>Solo modifiche dall\'ultima sincronizzazione</b>. Scrivi una passphrase (consigliato): il file viene cifrato (AES-256).</li><li>Nella web app: <b>Importa dati da client locale</b> → scegli il file, scrivi la passphrase, <b>Analizza</b>.</li><li>La revisione mostra quanti record sono <b>nuovi</b>, <b>aggiornati</b>, <b>invariati</b>, <b>più vecchi</b> (ignorati), le <b>eliminazioni</b> e i <b>conflitti</b>.</li><li>Al contrario (web → PC) è lo stesso: <b>Esporta per il client locale</b> e sul PC <b>Importa dati dalla web app</b>.</li></ol><ul><li><b>Regola</b>: per ogni faldone o cliente vince la modifica <b>più recente in ordine di tempo</b>, da qualunque lato sia stata fatta.</li><li><b>Conflitto</b>: lo stesso record è cambiato da entrambe le parti dopo l\'ultima sincronizzazione (o ha la stessa ora). Vedi i campi diversi affiancati e scegli <b>Tieni locale</b> o <b>Tieni importato</b>, oppure <b>Applica a tutti: il più recente</b>.</li><li>Le <b>eliminazioni</b> viaggiano anche loro; se dall\'altra parte un faldone è stato eliminato ma qui l\'hai modificato dopo, resta il tuo e viene segnalato.</li><li>Tutto si applica in un passo solo: <b>Annulla</b> nel messaggio lo riporta indietro. Il registro attività scrive cosa è arrivato e le scelte sui conflitti.</li><li>La passphrase non viene mai salvata. Senza passphrase il file è leggibile da chiunque lo apra.</li><li><b>Server online (v10.1)</b>: se lo studio ha il database condiviso, in fondo a questa pagina inserisci indirizzo e codice di accesso e premi <b>Sincronizza con il server</b>. La prima volta, con il server vuoto, DocMap propone di caricare tutto l\'archivio; poi valgono le stesse regole (vince il più recente, conflitti da decidere). I file restano come alternativa.</li></ul>',
          en:'<p>DocMap runs both on the PC (double-click <span class="kbd">index.html</span>) and as a web app (<b>docmap.pr-it.it/studio-de/</b>). Each keeps its own copy of the data: to align them use <b>⚙ Advanced tools › Sync</b>.</p><ol><li>On the PC: <b>Export for the web app</b> → choose <b>Whole archive</b> the first time, then <b>Only changes since the last sync</b>. Type a passphrase (recommended): the file is encrypted (AES-256).</li><li>In the web app: <b>Import data from the local client</b> → pick the file, type the passphrase, <b>Analyse</b>.</li><li>The review shows how many records are <b>new</b>, <b>updated</b>, <b>unchanged</b>, <b>older</b> (ignored), the <b>deletions</b> and the <b>conflicts</b>.</li><li>The other way round (web → PC) works the same: <b>Export for the local client</b>, then on the PC <b>Import data from the web app</b>.</li></ol><ul><li><b>Rule</b>: for each binder or client the <b>most recent change in time</b> wins, whichever side made it.</li><li><b>Conflict</b>: the same record changed on both sides since the last sync (or carries the same time). You see the differing fields side by side and choose <b>Keep local</b> or <b>Keep imported</b>, or <b>Apply to all: the most recent</b>.</li><li><b>Deletions</b> travel too; if the other side deleted a binder you changed here later, yours stays and is flagged.</li><li>Everything is applied in one step: <b>Undo</b> in the message reverts it. The activity log records what arrived and the conflict choices.</li><li>The passphrase is never stored. Without a passphrase anyone who opens the file can read it.</li><li><b>Online server (v10.1)</b>: if the studio has the shared database, enter its address and access code at the bottom of this page and press <b>Sync with the server</b>. The first time, with an empty server, DocMap offers to upload the whole archive; then the same rules apply (most recent wins, conflicts to decide). Files remain as an alternative.</li></ul>'} });
});
