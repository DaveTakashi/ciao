/* =====================================================================
   DocMap 2026 — v12 (stream A): "Ricordami su questo dispositivo" + "Chi l'ha visto" / "Accessi"

   Loaded on index.html AFTER 10-auth.js (before 09-actions.js boots) and on scan.html after 11b-assoc.js.
   Everything here plugs into 10-auth.js / 11-scan.js / 06g-server.js by wrapping their globals (same pattern as
   06e / 06i): no data format of v10 / v11 changes.

   ---- 1. Remembered sign-in (web mode: docmap.config.js mode 'web', with or without apiBase) ----
   Without it every new tab (= every QR opened from the camera app) needs the PIN, because the unlocked vault key
   lives only in sessionStorage. With "Ricordami su questo dispositivo" (default on) the login also stores:
     localStorage  docmap_v26_remember = {v:1, rid, user_id, created_at, last_at, pwfp, wrapped, mac}
                   wrapped = the vault data key (DEK) wrapped (AES-KW) by a NON-extractable key; pwfp = first 128 bits of
                   SHA-256(password_hash) (a PIN change by the admin forgets the device); mac = HMAC-SHA256 of the fields
     IndexedDB     docmap_v26_keys / keys / 'remember:<rid>' = {kw:AES-KW key, mk:HMAC key}, both non-extractable
   The record is useless without that IndexedDB key, which the browser never lets out (not even to this script).
   A new tab then re-opens the vault without the PIN (DocMapVault.resume → rmResume), until:
     · inactivity longer than the policy (minutes since last_at; default 43200 = 30 days; 0 = always ask the PIN;
       480 = 8 h; -1 = never) — policy from config.php 'remember_minutes' (server, via `me`) or else from this device's
       Utenti e accesso (auth store policy.rememberMinutes)
     · "Esci" (logout), the user disabled / deleted / PIN changed, or the server token revoked (any 401 with this
       device's token forgets it). Threat model: docs/SICUREZZA.md §5d.
   Desktop file:// (local mode) is unchanged: no remember record, the PC app has no login.

   ---- 2. Views ----
   Desktop: opening a binder form = a view → activity log action 'view.binder' (group 'view'), at most one per
   binder per operator every 10 minutes; with a server configured also queued and sent with POST ?r=seen.
   The form shows "Chi l'ha visto" (local views + server last_seen). Sincronizzazione shows "Accessi" (local views;
   with a server: ?r=access — admin everything, editor own rows).
   Phone (scan.html + server): the server records the read itself (route binder, &via=qr|search|nav|nfc: SC.via, set by
   11d-search.js to 'search' and by stream C to 'nfc'); the card shows the last accesses (?r=last_seen). A card shown
   from the offline copy is queued and sent later with ?r=seen.
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  rm_label:'Ricordami su questo dispositivo', rm_hint:'Al prossimo QR entri senza PIN. Il PIN viene richiesto di nuovo dopo {d} senza usarlo, oppure se tocchi «Esci».',
  rm_hint_never:'Al prossimo QR entri senza PIN, finché non tocchi «Esci».',
  rm_h:'Accesso senza PIN su questo dispositivo', rm_p:'Con «Ricordami su questo dispositivo» il telefono apre i faldoni dal QR senza chiedere il PIN. Chi prende il telefono sbloccato vede quindi i faldoni: scegli quanto deve durare.',
  rm_policy:'Chiedi di nuovo il PIN dopo', rm_m0:'Chiedi sempre il PIN', rm_m480:'8 ore senza usarlo', rm_m43200:'30 giorni senza usarlo', rm_m_1:'Mai (fino a «Esci»)', rm_mins:'{n} minuti senza usarlo',
  rm_d480:'8 ore', rm_d43200:'30 giorni', rm_dmin:'{n} minuti', rm_srv:'Impostato dal server dello studio (config.php): {v}.',
  rm_on:'Questo dispositivo ricorda l\'accesso di {u} (ultimo uso {d}).', rm_off:'Questo dispositivo non ricorda nessun accesso.',
  rm_forget:'Dimentica questo dispositivo', rm_forgot:'Fatto: al prossimo QR verrà chiesto il PIN.', rm_saved:'Impostazione salvata',
  ac_seen_h:'Chi l\'ha visto', ac_seen_none:'Nessuna visita registrata.', ac_seen_srv:'Dal server', ac_seen_load:'Carica dal server', ac_seen_loading:'Caricamento…', ac_seen_err:'Server non raggiungibile: {m}',
  ac_seen_total:'{n} accessi in totale', ac_h:'Accessi', ac_p:'Chi ha aperto quale faldone, quando e come (QR, ricerca, scheda, NFC). Le visite di questo PC sono nel Registro attività; con il server online anche quelle dei telefoni.',
  ac_src_local:'Questo PC', ac_src_srv:'Server (tutti)', ac_src_srv_own:'Server (le mie)', ac_from:'Dal', ac_to:'Al', ac_user:'Persona', ac_code:'Faldone', ac_via:'Come', ac_any:'Tutti', ac_device:'Dispositivo', ac_when:'Quando',
  ac_reset:'Azzera filtri', ac_more:'Altri', ac_none:'Nessun accesso con questi filtri.', ac_srv_err:'Errore dal server: {m}', ac_ip:'IP',
  ac_via_qr:'QR', ac_via_search:'Ricerca', ac_via_nav:'Scheda', ac_via_nfc:'NFC', ac_seen_sum:'Visto il faldone {c}', ac_phone_h:'Visto di recente', ac_you:'tu',
  lg_g_view:'Visite', 'lga_view.binder':'Faldone visto'
});
Object.assign(I18N.en, {
  rm_label:'Remember me on this device', rm_hint:'Next time you scan a QR you get in without the PIN. The PIN is asked again after {d} without using it, or when you tap «Sign out».',
  rm_hint_never:'Next time you scan a QR you get in without the PIN, until you tap «Sign out».',
  rm_h:'Sign-in without PIN on this device', rm_p:'With «Remember me on this device» the phone opens binders from the QR without asking for the PIN. Whoever takes the unlocked phone can therefore see the binders: choose how long it lasts.',
  rm_policy:'Ask the PIN again after', rm_m0:'Always ask the PIN', rm_m480:'8 hours without using it', rm_m43200:'30 days without using it', rm_m_1:'Never (until «Sign out»)', rm_mins:'{n} minutes without using it',
  rm_d480:'8 hours', rm_d43200:'30 days', rm_dmin:'{n} minutes', rm_srv:'Set by the studio server (config.php): {v}.',
  rm_on:'This device remembers the sign-in of {u} (last used {d}).', rm_off:'This device does not remember any sign-in.',
  rm_forget:'Forget this device', rm_forgot:'Done: the PIN will be asked at the next QR.', rm_saved:'Setting saved',
  ac_seen_h:'Who looked at it', ac_seen_none:'No views recorded.', ac_seen_srv:'From the server', ac_seen_load:'Load from the server', ac_seen_loading:'Loading…', ac_seen_err:'Server unreachable: {m}',
  ac_seen_total:'{n} accesses in total', ac_h:'Accesses', ac_p:'Who opened which binder, when and how (QR, search, form, NFC). This PC\'s views are in the Activity log; with the online server also the phones\' ones.',
  ac_src_local:'This PC', ac_src_srv:'Server (all)', ac_src_srv_own:'Server (mine)', ac_from:'From', ac_to:'To', ac_user:'Person', ac_code:'Binder', ac_via:'How', ac_any:'All', ac_device:'Device', ac_when:'When',
  ac_reset:'Clear filters', ac_more:'More', ac_none:'No accesses with these filters.', ac_srv_err:'Server error: {m}', ac_ip:'IP',
  ac_via_qr:'QR', ac_via_search:'Search', ac_via_nav:'Form', ac_via_nfc:'NFC', ac_seen_sum:'Viewed binder {c}', ac_phone_h:'Seen recently', ac_you:'you',
  lg_g_view:'Views', 'lga_view.binder':'Binder viewed'
});

if (typeof ICONS !== 'undefined' && !ICONS.lock) ICONS.lock = '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';

/* =====================================================================
   1. Remembered sign-in
   ===================================================================== */
const RM_LS = 'docmap_v26_remember', RM_POLICY_LS = 'docmap_v26_remember_policy';
const RM_CHOICES = [0, 480, 43200, -1], RM_DEFAULT = 43200, RM_TOUCH_MS = 60000, RM_POLICY_MS = 600000;
/** want: the checkbox (null = untouched → default on) · ui: a form with the checkbox is on screen · now(): clock (tests) ·
    reason: why the last rmResume did not sign in ('timeout' | 'policy' | 'user' | 'pin' | 'mac' | 'keys' | 'unwrap' | '') */
const RM = { want:null, ui:false, now:() => Date.now(), lastTouch:0, reason:'', policyAt:0 };

function rmAvailable(){
  try { return typeof DocMapVault !== 'undefined' && DocMapVault.isActive() && authHasSubtle() && typeof indexedDB !== 'undefined'; } catch(e){ return false; }
}
function rmAuth(){ try { const A = dmProviders().auth; return A && typeof A.store === 'function' ? A : null; } catch(e){ return null; } }
/** {minutes, source:'server'|'device'|'default'} — the server's config.php wins when it sets one. */
function rmPolicy(){
  const sv = lsGetJSON(RM_POLICY_LS, null);
  if (sv && typeof sv.minutes === 'number' && isFinite(sv.minutes) && sv.minutes >= -1) return {minutes:Math.round(sv.minutes), source:'server'};
  const A = rmAuth(); let p; try { p = A ? A.store().policy.rememberMinutes : undefined; } catch(e){}
  if (typeof p === 'number' && isFinite(p) && p >= -1) return {minutes:Math.round(p), source:'device'};
  return {minutes:RM_DEFAULT, source:'default'};
}
function rmDurText(m){ return m === 480 ? t('rm_d480') : m === 43200 ? t('rm_d43200') : t('rm_dmin', {n:m}); }
function rmChoiceText(m){ return RM_CHOICES.includes(m) ? t('rm_m' + String(m).replace('-', '_')) : t('rm_mins', {n:m}); }
function rmRecord(){ const r = lsGetJSON(RM_LS, null); return r && r.v === 1 && r.rid && r.user_id && r.wrapped ? r : null; }
async function rmKeyDb(fn, mode){ const db = await idbReq(KEY_IDB, ['keys']); try { return await idbDo(db, 'keys', mode || 'readonly', fn); } finally { db.close(); } }
async function rmFp(u){ return authHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(u.password_hash || '')))).slice(0, 32); }
const rmMacData = (r) => new TextEncoder().encode(JSON.stringify([r.v, r.rid, r.user_id, r.created_at, r.last_at, r.pwfp, r.wrapped]));
async function rmMac(mk, r){ return authB64(new Uint8Array(await crypto.subtle.sign('HMAC', mk, rmMacData(r)))); }
async function rmVerify(mk, r){ try { return await crypto.subtle.verify('HMAC', mk, authUnb64(r.mac), rmMacData(r)); } catch(e){ return false; } }

/** Store the remembered sign-in of user record `u` (the vault must be unlocked). */
async function rmSave(auth, u){
  if (!rmAvailable() || !VAULT.dek || !u) return false;
  if (rmPolicy().minutes === 0){ await rmForget('policy'); return false; }
  await rmForget('replace');
  const kw = await crypto.subtle.generateKey({name:'AES-KW', length:256}, false, ['wrapKey', 'unwrapKey']);
  const mk = await crypto.subtle.generateKey({name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
  const rid = authHex(authRand(12)), now = new Date(RM.now()).toISOString();
  await rmKeyDb(os => os.put({kw, mk}, 'remember:' + rid), 'readwrite');
  const rec = {v:1, rid, user_id:u.id, created_at:now, last_at:now, pwfp:await rmFp(u), wrapped:authB64(new Uint8Array(await crypto.subtle.wrapKey('raw', VAULT.dek, kw, 'AES-KW')))};
  rec.mac = await rmMac(mk, rec);
  lsSetJSON(RM_LS, rec);
  RM.lastTouch = RM.now();
  return true;
}
/** Forget the remembered sign-in (record + its IndexedDB keys). */
async function rmForget(why){
  const r = lsGetJSON(RM_LS, null);
  try { localStorage.removeItem(RM_LS); } catch(e){}
  if (r && r.rid) try { await rmKeyDb(os => os.delete('remember:' + r.rid), 'readwrite'); } catch(e){}
  if (why && why !== 'replace') RM.reason = why;
  return !!r;
}
function rmIdleOk(rec, pol){ const last = Date.parse(rec.last_at) || 0; return pol < 0 || (pol > 0 && RM.now() - last <= pol * 60000); }
/** Sign in from the remembered record, without the PIN. → true when signed in. */
async function rmResume(auth){
  RM.reason = '';
  auth = auth || rmAuth();
  if (!auth || !rmAvailable()) return false;
  const rec = rmRecord(); if (!rec) return false;
  if (auth.currentUser()) return true;
  const fail = async (why) => { await rmForget(why); RM.reason = why; return false; };
  const pol = rmPolicy().minutes;
  if (pol === 0) return fail('policy');
  if (!rmIdleOk(rec, pol)) return fail('timeout');
  const u = auth.store().users.find(x => x.id === rec.user_id && !x.disabled); if (!u) return fail('user');
  let keys; try { keys = await rmKeyDb(os => os.get('remember:' + rec.rid)); } catch(e){ RM.reason = 'idb'; return false; }   // IndexedDB busy: keep the record, ask the PIN this time
  if (!keys || !keys.kw || !keys.mk) return fail('keys');
  if (!(await rmVerify(keys.mk, rec))) return fail('mac');
  if (rec.pwfp !== await rmFp(u)) return fail('pin');
  const mins = Math.max(5, +auth.store().policy.sessionMinutes || 480);
  try {
    VAULT.dek = await crypto.subtle.unwrapKey('raw', authUnb64(rec.wrapped), keys.kw, 'AES-KW', {name:'AES-GCM', length:256}, true, ['encrypt', 'decrypt']);
    await DocMapVault.startSession(mins);
    await DocMapVault.prime();
    sessionStorage.setItem(AUTH_SESSION_SS, JSON.stringify({sid:authHex(authRand(16)), user_id:u.id, exp:Date.now() + mins * 60000, remembered:true}));
  } catch(e){ VAULT.dek = null; return fail('unwrap'); }
  RM.lastTouch = 0; await rmTouch(true);
  auth._u = undefined; auth.emit();
  return !!auth.currentUser();
}
/** Push the tab session expiry forward (both the login session and the vault session). */
function rmExtend(mins){
  const exp = Date.now() + Math.max(5, mins || 480) * 60000;
  [AUTH_SESSION_SS, VAULT_SS].forEach(k => { try { const s = JSON.parse(sessionStorage.getItem(k) || 'null'); if (s){ s.exp = exp; sessionStorage.setItem(k, JSON.stringify(s)); } } catch(e){} });
}
/** Synchronous: the tab session ran out but the vault is still open here and the device is remembered → extend it. */
function rmKeepAlive(){
  try {
    if (!rmAvailable() || !VAULT.dek) return false;
    const rec = rmRecord(), A = rmAuth(); if (!rec || !A) return false;
    const pol = rmPolicy().minutes; if (pol === 0 || !rmIdleOk(rec, pol)) return false;
    const s = JSON.parse(sessionStorage.getItem(AUTH_SESSION_SS) || 'null');
    if (!s || s.user_id !== rec.user_id || !A.store().users.some(u => u.id === rec.user_id && !u.disabled)) return false;
    rmExtend(+A.store().policy.sessionMinutes || 480);
    return !!A.currentUser();
  } catch(e){ return false; }
}
/** Activity: last_at = now (at most once a minute), session kept alive. */
async function rmTouch(force){
  if (!rmAvailable()) return;
  const now = RM.now(); if (!force && now - RM.lastTouch < RM_TOUCH_MS) return;
  const rec = rmRecord(), A = rmAuth(); if (!rec || !A) return;
  const u = A.currentUser(); if (!u || u.id !== rec.user_id) return;
  RM.lastTouch = now;
  try {
    const keys = await rmKeyDb(os => os.get('remember:' + rec.rid)); if (!keys || !keys.mk) return;
    rec.last_at = new Date(now).toISOString(); rec.mac = await rmMac(keys.mk, rec); lsSetJSON(RM_LS, rec);
    rmExtend(+A.store().policy.sessionMinutes || 480);
  } catch(e){}
}
/** After a successful login with the PIN: remember (checkbox on) or forget. */
async function rmAfterLogin(auth, u){
  const shown = RM.ui, want = RM.want !== false; RM.ui = false;
  try {
    if (shown && want) await rmSave(auth, u);
    else if (shown) await rmForget('unchecked');
    else { const r = rmRecord(); if (r && r.user_id !== u.id) await rmForget('other_user'); }
  } catch(e){ console.warn('remember', e); }
}
/** The checkbox for the login / first-use forms (web mode only). */
function rmCheckboxHTML(cls){
  if (!rmAvailable()) return '';
  const pol = rmPolicy().minutes; if (pol === 0) return '';
  RM.ui = true;
  return '<label class="rm-chk' + (cls ? ' ' + cls : '') + '"><input type="checkbox" id="dm-remember" data-rm-want' + (RM.want !== false ? ' checked' : '') + '><span><b>' + esc(t('rm_label')) + '</b>' +
    '<small>' + esc(pol < 0 ? t('rm_hint_never') : t('rm_hint', {d:rmDurText(pol)})) + '</small></span></label>';
}
/** Server policy (config.php remember_minutes via `me`), at most every 10 minutes; a 401 forgets the device. */
async function rmRefreshPolicy(force){
  if (!rmAvailable() || !dmConfig().apiBase || !DocMapVault.srvToken()) return;
  if (!force && Date.now() - RM.policyAt < RM_POLICY_MS) return;
  RM.policyAt = Date.now();
  try {
    const me = await new DMServer(dmConfig().apiBase, DocMapVault.srvToken()).call('me');
    if (me && typeof me.remember_minutes === 'number') lsSetJSON(RM_POLICY_LS, {minutes:me.remember_minutes, at:nowISO()});
    else try { localStorage.removeItem(RM_POLICY_LS); } catch(e){}
    if (rmPolicy().minutes === 0) await rmForget('policy');
  } catch(e){}
}
/** Settings › Utenti e accesso: policy (admin) + forget this device (everyone). Web mode only. */
function rmSettingsHTML(){
  if (!rmAvailable()) return '';
  const A = rmAuth(), me = A && A.currentUser(), admin = !!(me && (me.role === 'admin' || (A.store().users.find(u => u.id === me.id) || {}).role === 'admin'));
  const pol = rmPolicy(), rec = rmRecord(), u = rec && A ? A.store().users.find(x => x.id === rec.user_id) : null;
  const opts = RM_CHOICES.concat(RM_CHOICES.includes(pol.minutes) ? [] : [pol.minutes]);
  return '<div class="card card-p stack rm-card" id="rm-card" style="margin-top:16px"><h2 style="margin:0">' + ic('lock') + ' ' + esc(t('rm_h')) + (typeof helpDot === 'function' ? helpDot('remember') : '') + '</h2>' +
    '<div class="small muted">' + esc(t('rm_p')) + '</div>' +
    (pol.source === 'server' ? '<div class="small" id="rm-srv">' + esc(t('rm_srv', {v:rmChoiceText(pol.minutes)})) + '</div>'
      : admin ? '<div class="field" style="max-width:320px"><label for="rm-policy">' + esc(t('rm_policy')) + '</label><select class="inp" id="rm-policy" data-rm-policy>' +
          opts.map(m => '<option value="' + m + '"' + (m === pol.minutes ? ' selected' : '') + '>' + esc(rmChoiceText(m)) + '</option>').join('') + '</select></div>'
      : '<div class="small">' + esc(t('rm_policy')) + ': <b>' + esc(rmChoiceText(pol.minutes)) + '</b></div>') +
    '<div class="small" id="rm-state">' + esc(rec ? t('rm_on', {u:u ? (u.display_name || u.username) : '?', d:fmtDate(rec.last_at, true)}) : t('rm_off')) + '</div>' +
    (rec ? '<div><button class="btn btn-sm" data-a="rm-forget" id="rm-forget">' + ic('x') + esc(t('rm_forget')) + '</button></div>' : '') + '</div>';
}

/* =====================================================================
   2. Views: desktop activity log + seen queue, "Chi l'ha visto", "Accessi"; phone last seen
   ===================================================================== */
const AC_THROTTLE_MS = 600000, AC_THROTTLE_LS = 'docmap_v26_view_seen', AC_QUEUE_LS = 'docmap_v26_seen_queue', AC_QUEUE_MAX = 500;
const AC_VIAS = ['qr', 'search', 'nav', 'nfc'];
const AC = { queue:null, timer:null, flushing:false, ui:{src:'local', f:{from:'', to:'', user:'', code:'', via:''}}, srv:{items:[], more:false, next:null, loading:false, err:'', loaded:false}, seen:{} };
const acVia = (v) => AC_VIAS.includes(v) ? v : 'nav';
const acViaText = (v) => AC_VIAS.includes(v) ? t('ac_via_' + v) : (v || '');
function acDeviceName(){ try { return typeof jrDeviceName === 'function' ? jrDeviceName() : (typeof LOG_DEVICE !== 'undefined' ? LOG_DEVICE : ''); } catch(e){ return ''; } }

/* ---- seen queue (sent with POST ?r=seen) ---- */
function acQueue(){
  if (AC.queue) return AC.queue;
  let q = [];
  if (!(typeof DocMapVault !== 'undefined' && DocMapVault.isActive())) q = lsGetJSON(AC_QUEUE_LS, []);   // web mode: memory only (no plaintext codes in localStorage)
  return (AC.queue = Array.isArray(q) ? q.filter(x => x && x.id && x.at) : []);
}
function acQueueSave(){ if (typeof DocMapVault !== 'undefined' && DocMapVault.isActive()) return; try { if (AC.queue && AC.queue.length) lsSetJSON(AC_QUEUE_LS, AC.queue); else localStorage.removeItem(AC_QUEUE_LS); } catch(e){} }
function acQueuePush(item){ const q = acQueue(); q.push(item); if (q.length > AC_QUEUE_MAX) q.splice(0, q.length - AC_QUEUE_MAX); acQueueSave(); }
/** Desktop: the configured server client (06g), or null. */
function acSrvClient(){ try { const c = typeof srvConf === 'function' ? srvConf() : null; return c ? srvClient(c) : null; } catch(e){ return null; } }
/** Phone: the server of scan.html (web + apiBase), or null. */
function acPhoneClient(){ try { return typeof SC !== 'undefined' && SC.P && SC.P.server && DocMapVault.srvToken() ? new DMServer(dmConfig().apiBase, () => DocMapVault.srvToken()) : null; } catch(e){ return null; } }
function acFlushSoon(ms){ clearTimeout(AC.timer); AC.timer = setTimeout(acFlush, ms == null ? 2500 : ms); }
async function acFlush(){
  const q = acQueue(); if (!q.length || AC.flushing) return {sent:0};
  const cl = acSrvClient() || acPhoneClient(); if (!cl) return {sent:0};
  AC.flushing = true;
  const batch = q.slice(0, AC_QUEUE_MAX);
  try {
    const r = await cl.call('seen', {method:'POST', body:{items:batch.map(x => ({type:x.type || 'binder', id:x.id, code:x.code || '', at:x.at, via:x.via || 'nav'}))}});
    q.splice(0, batch.length); acQueueSave();
    return {sent:batch.length, recorded:r.recorded};
  } catch(e){ if (['invalid', 'forbidden', 'not_found'].includes(e.code)) { q.splice(0, batch.length); acQueueSave(); } return {sent:0, err:e.code}; }   // not_found: a v11 server without ?r=seen
  finally { AC.flushing = false; }
}

/* ---- desktop: one view = one activity-log entry (throttled) ---- */
function acThrottle(key){
  const now = Date.now(), m = lsGetJSON(AC_THROTTLE_LS, {}) || {};
  if (m[key] && now - m[key] < AC_THROTTLE_MS) return false;
  Object.keys(m).forEach(k => { if (now - m[k] >= AC_THROTTLE_MS) delete m[k]; });
  m[key] = now; try { lsSetJSON(AC_THROTTLE_LS, m); } catch(e){}
  return true;
}
/** Record that the binder was looked at on this PC. via: 'nav' (form) | 'search' | 'qr' | 'nfc'. → the log entry or null (throttled). */
function acNoteView(b, via){
  if (!b || !b.id || typeof logAct !== 'function') return null;
  const who = typeof logWho === 'function' ? logWho() : '';
  if (!acThrottle(b.id + '|' + who)) return null;
  via = acVia(via);
  const e = logAct('view.binder', logBT(b), 'Visto il faldone ' + (b.speaking_code || ''), {via, device:acDeviceName()});
  if (acSrvClient()){ acQueuePush({type:'binder', id:b.id, code:b.speaking_code || '', at:nowISO(), via}); acFlushSoon(); }
  return e;
}
function acLocalViews(id){ return (typeof LOG !== 'undefined' ? LOG.entries : []).filter(e => e.action === 'view.binder' && (!id || (e.target && e.target.id === id))); }

/* ---- binder form: "Chi l'ha visto" ---- */
function acSeenRows(list){
  return list.map(x => '<li><span class="ac-who">' + esc(x.user || '—') + '</span><span class="ac-when">' + esc(fmtDate(x.at, true)) + '</span><span class="ac-via ac-via-' + esc(x.via || '') + '">' + esc(acViaText(x.via)) + '</span>' +
    (x.device ? '<span class="ac-dev">' + esc(x.device) + '</span>' : '') + '</li>').join('');
}
function acSeenHTML(b){
  const loc = acLocalViews(b.id).slice(-6).reverse().map(e => ({user:e.who, at:e.at, via:(e.details || {}).via, device:(e.details || {}).device || (e.source === 'mobile' ? 'mobile' : '')}));
  const srv = !!acSrvClient(), st = AC.seen[b.id];
  return '<div class="ac-seen" id="ac-seen" data-id="' + esc(b.id) + '"><div class="row between"><div class="lbl">' + ic('eye') + ' ' + esc(t('ac_seen_h')) + (typeof helpDot === 'function' ? helpDot('access') : '') + '</div>' +
      (srv ? '<button type="button" class="btn btn-sm" data-a="ac-seen-load" data-id="' + esc(b.id) + '">' + esc(st && st.loading ? t('ac_seen_loading') : t('ac_seen_load')) + '</button>' : '') + '</div>' +
    (loc.length ? '<ul class="ac-seen-l" id="ac-seen-local">' + acSeenRows(loc) + '</ul>' : '<div class="tiny muted" id="ac-seen-local">' + esc(t('ac_seen_none')) + '</div>') +
    '<div id="ac-seen-srv">' + (st && st.err ? '<div class="tiny err-t">' + esc(t('ac_seen_err', {m:st.err})) + '</div>' : st && st.items ? '<div class="tiny muted">' + esc(t('ac_seen_srv')) + ' · ' + esc(t('ac_seen_total', {n:st.total})) + '</div>' +
      (st.items.length ? '<ul class="ac-seen-l">' + acSeenRows(st.items.map(x => ({user:x.user, at:x.at, via:x.via, device:x.device_name}))) + '</ul>' : '') : '') + '</div></div>';
}
async function acSeenLoad(id){
  const cl = acSrvClient(); if (!cl) return;
  AC.seen[id] = {loading:true}; acSeenRefresh(id);
  try { const r = await cl.call('last_seen', {q:{type:'binder', id, limit:10}}); AC.seen[id] = {items:r.items || [], total:r.total || 0}; }
  catch(e){ AC.seen[id] = e.code === 'not_found' ? {items:[], total:0} : {err:e.message || e.code}; }   // not_found: v11 server (no access log yet)
  acSeenRefresh(id);
}
function acSeenRefresh(id){
  const el = document.getElementById('ac-seen'); if (!el || el.dataset.id !== id) return;
  const b = (S && S.binders || []).find(x => x.id === id); if (b) el.outerHTML = acSeenHTML(b);
}
function acMountSeen(b){
  const prev = document.getElementById('ed-preview'); if (!prev || document.getElementById('ac-seen')) return;
  const col = prev.parentElement; if (!col) return;
  col.insertAdjacentHTML('beforeend', acSeenHTML(b));
}

/* ---- Sincronizzazione › "Accessi" ---- */
function acRole(){ return typeof SRV !== 'undefined' && acSrvClient() ? SRV.role : ''; }
function acMatch(x, f){
  const day = String(x.at || '').slice(0, 10), has = (v, q) => String(v || '').toLowerCase().includes(String(q).toLowerCase().trim());
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  if (f.user && !has(x.user, f.user)) return false;
  if (f.code && !has(x.code, f.code)) return false;
  if (f.via && x.via !== f.via) return false;
  return true;
}
function acRowsLocal(){
  return acLocalViews().map(e => ({at:e.at, user:e.who, code:(e.target || {}).code || '', id:(e.target || {}).id || '', via:(e.details || {}).via || 'nav', device:(e.details || {}).device || (e.source === 'mobile' ? 'mobile' : '')}))
    .filter(x => acMatch(x, AC.ui.f)).reverse();
}
function acListHTML(){
  const srv = AC.ui.src === 'srv', admin = acRole() === 'admin';
  const rows = srv ? AC.srv.items.map(x => ({at:x.at, user:x.user, code:(x.target || {}).code || '', id:(x.target || {}).id || '', via:x.via, device:(x.device || {}).name || '', ip:x.ip || ''})) : acRowsLocal().slice(0, 300);
  if (srv && AC.srv.err) return '<div class="warn-box">' + ic('alert') + '<div>' + esc(t('ac_srv_err', {m:AC.srv.err})) + '</div></div>';
  if (srv && AC.srv.loading && !rows.length) return '<div class="small muted">' + esc(t('ac_seen_loading')) + '</div>';
  if (!rows.length) return '<div class="small muted" id="ac-empty">' + esc(t('ac_none')) + '</div>';
  return '<div class="tbl-wrap"><table class="tbl ac-tbl" id="ac-tbl"><thead><tr><th>' + esc(t('ac_when')) + '</th><th>' + esc(t('ac_user')) + '</th><th>' + esc(t('ac_code')) + '</th><th>' + esc(t('ac_via')) + '</th><th>' + esc(t('ac_device')) + '</th>' + (srv && admin ? '<th>' + esc(t('ac_ip')) + '</th>' : '') + '</tr></thead><tbody>' +
    rows.map(x => '<tr><td class="small">' + esc(fmtDate(x.at, true)) + '</td><td>' + esc(x.user || '—') + '</td><td class="mono">' + (x.id && S.binders.some(b => b.id === x.id) ? '<button type="button" class="ac-link" data-a="ac-open" data-id="' + esc(x.id) + '">' + esc(x.code || '—') + '</button>' : esc(x.code || '—')) + '</td>' +
      '<td><span class="ac-via ac-via-' + esc(x.via || '') + '">' + esc(acViaText(x.via)) + '</span></td><td class="small">' + esc(x.device || '') + '</td>' + (srv && admin ? '<td class="small mono">' + esc(x.ip || '') + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
    (srv && AC.srv.more ? '<div><button class="btn btn-sm" data-a="ac-more">' + esc(t('ac_more')) + '</button></div>' : '');
}
function acCardInner(){
  const role = acRole(), srv = AC.ui.src === 'srv', f = AC.ui.f;
  const inp = (k, type, ph) => '<div class="field"><label for="ac-f-' + k + '">' + esc(t('ac_' + k)) + '</label><input class="inp" id="ac-f-' + k + '" type="' + type + '" data-acf="' + k + '" value="' + esc(f[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off"></div>';
  return '<div class="row between ac-head"><div><h2 style="margin:0">' + ic('eye') + ' ' + esc(t('ac_h')) + (typeof helpDot === 'function' ? helpDot('access') : '') + '</h2><p class="card-sub" style="margin:4px 0 0">' + esc(t('ac_p')) + '</p></div>' +
      (role === 'admin' || role === 'editor' ? '<div class="seg" id="ac-src"><button class="' + (srv ? '' : 'on') + '" data-a="ac-src" data-v="local">' + esc(t('ac_src_local')) + '</button>' +
        '<button class="' + (srv ? 'on' : '') + '" data-a="ac-src" data-v="srv">' + esc(t(role === 'admin' ? 'ac_src_srv' : 'ac_src_srv_own')) + '</button></div>' : '') + '</div>' +
    '<div class="ac-filters">' + inp('from', 'date') + inp('to', 'date') + (srv && role !== 'admin' ? '' : inp('user', 'text')) + inp('code', 'text', 'BL1') +
      '<div class="field"><label for="ac-f-via">' + esc(t('ac_via')) + '</label><select class="inp" id="ac-f-via" data-acf="via"><option value="">' + esc(t('ac_any')) + '</option>' +
        AC_VIAS.map(v => '<option value="' + v + '"' + (f.via === v ? ' selected' : '') + '>' + esc(acViaText(v)) + '</option>').join('') + '</select></div>' +
      '<div class="ac-fbtn"><button class="btn btn-sm" data-a="ac-reset">' + esc(t('ac_reset')) + '</button></div></div>' +
    '<div id="ac-list">' + acListHTML() + '</div>';
}
function acRefreshList(){ const el = document.getElementById('ac-list'); if (el) el.innerHTML = acListHTML(); }
function acRefreshCard(){ const el = document.getElementById('ac-card'); if (el) el.innerHTML = acCardInner(); }
async function acSrvLoad(more){
  const cl = acSrvClient(); if (!cl) return;
  AC.srv.loading = true; AC.srv.err = ''; if (!more){ AC.srv.items = []; AC.srv.next = null; } acRefreshList();
  const f = AC.ui.f, q = {limit:50};
  ['from', 'to', 'code', 'via'].forEach(k => { if (f[k]) q[k] = f[k]; });
  if (f.user && acRole() === 'admin') q.user = f.user;
  if (more && AC.srv.next) q.before = AC.srv.next;
  try { const r = await cl.call('access', {q}); AC.srv.items = AC.srv.items.concat(r.items || []); AC.srv.more = !!r.more; AC.srv.next = r.next_before; AC.srv.loaded = true; }
  catch(e){ AC.srv.err = e.message || e.code || 'error'; }
  AC.srv.loading = false; acRefreshList();
}

/* ---- phone (scan.html): last accesses on the card, offline views ---- */
const AC_PH = { for:'', items:null, total:0, err:'' };
function acPhoneSlotHTML(){
  if (typeof SC === 'undefined' || !SC.P || !SC.P.server || !SC.rec) return '';
  const id = SC.rec.binder.id, it = AC_PH.for === id ? AC_PH.items : null;
  if (AC_PH.for === id && !it && !AC_PH.err) return '';   // the server has no access log (v11) or refused: nothing to show
  return '<section class="sc-card ac-ph" id="ac-ph"><h3>' + esc(t('ac_phone_h')) + '</h3>' +
    (it ? (it.length ? '<ul class="ac-ph-l">' + it.map(x => '<li><b>' + esc(x.user || '—') + '</b><span>' + esc(fmtDate(x.at, true)) + '</span><span class="ac-via ac-via-' + esc(x.via || '') + '">' + esc(acViaText(x.via)) + '</span></li>').join('') + '</ul>'
      : '<div class="sc-muted">' + esc(t('ac_seen_none')) + '</div>') : '<div class="sc-muted">' + esc(AC_PH.err || t('ac_seen_loading')) + '</div>') + '</section>';
}
async function acPhoneLoad(){
  const cl = acPhoneClient(); if (!cl || !SC.rec) return;
  const id = SC.rec.binder.id;
  try { const r = await cl.call('last_seen', {q:{type:'binder', id, limit:5}}); AC_PH.for = id; AC_PH.items = r.items || []; AC_PH.total = r.total || 0; AC_PH.err = ''; }
  catch(e){ AC_PH.for = id; AC_PH.items = null; AC_PH.err = e.code === 'offline' ? t('sc_srv_off') : ''; }
  const el = document.getElementById('ac-ph'); if (el && SC.view === 'card' && SC.rec && SC.rec.binder.id === id) el.outerHTML = acPhoneSlotHTML();
}
/** Phone: a card shown from the offline copy (no server read happened) → queue a `seen` for later. */
function acScanOfflineView(b, via){ if (!b || !b.id) return; acQueuePush({type:'binder', id:b.id, code:b.speaking_code || '', at:nowISO(), via:acVia(via || (typeof SC !== 'undefined' && SC.via) || 'nav')}); }

/* =====================================================================
   3. Wiring (wrappers; idempotent)
   ===================================================================== */
const AC_ACTIONS = {
  'rm-forget': async () => { await rmForget('user_forget'); toast(t('rm_forgot')); if (typeof renderView === 'function') renderView(); },
  'ac-seen-load': (el) => acSeenLoad(el.dataset.id),
  'ac-src': (el) => { AC.ui.src = el.dataset.v === 'srv' ? 'srv' : 'local'; acRefreshCard(); if (AC.ui.src === 'srv') acSrvLoad(false); },
  'ac-more': () => acSrvLoad(true),
  'ac-reset': () => { AC.ui.f = {from:'', to:'', user:'', code:'', via:''}; acRefreshCard(); if (AC.ui.src === 'srv') acSrvLoad(false); },
  'ac-open': (el) => { if (typeof openEditor === 'function') openEditor(el.dataset.id); }
};
const AC_WRAPPED = new Set();
function acWrap(name, fn){ const o = window[name]; if (typeof o !== 'function' || AC_WRAPPED.has(name)) return false; AC_WRAPPED.add(name); window[name] = fn(o); return true; }
function acInstall(){
  /* 10-auth.js: login → remember, logout → forget, new tab → resume from the remembered record */
  if (typeof LocalAuthProvider !== 'undefined' && !LocalAuthProvider.prototype.login.__rm){
    const li = LocalAuthProvider.prototype.login, lo = LocalAuthProvider.prototype.logout;
    LocalAuthProvider.prototype.login = async function(username){
      const r = await li.apply(this, arguments);
      try { const s = this.session(), u = s && this.store().users.find(x => x.id === s.user_id); if (u) await rmAfterLogin(this, u); } catch(e){ console.warn('remember', e); }
      return r;
    };
    LocalAuthProvider.prototype.logout = async function(){ await rmForget('logout'); return lo.apply(this, arguments); };
    LocalAuthProvider.prototype.login.__rm = true;
  }
  if (typeof DocMapVault !== 'undefined' && !DocMapVault.resume.__rm){
    const re = DocMapVault.resume;
    DocMapVault.resume = async function(){ if (await re.apply(this, arguments)) return true; try { return await rmResume(); } catch(e){ return false; } };
    DocMapVault.resume.__rm = true;
  }
  /* a 401 with this device's own server token = token revoked → forget the remembered sign-in */
  if (typeof DMServer !== 'undefined' && !DMServer.prototype.call.__rm){
    const ca = DMServer.prototype.call;
    DMServer.prototype.call = async function(){
      try { return await ca.apply(this, arguments); }
      catch(e){
        try { const tk = typeof this.token === 'function' ? this.token() : this.token; if (e.code === 'unauthorized' && tk && typeof DocMapVault !== 'undefined' && tk === DocMapVault.srvToken()) await rmForget('revoked'); } catch(e2){}
        throw e;
      }
    };
    DMServer.prototype.call.__rm = true;
  }
  /* RemoteDataProvider.get: pass how the binder was reached (SC.via / this.via) → access_log.via */
  if (typeof RemoteDataProvider !== 'undefined' && !RemoteDataProvider.prototype.get.__ac){
    const g = RemoteDataProvider.prototype.get;
    RemoteDataProvider.prototype.get = function(q){
      const via = this.via || (typeof SC !== 'undefined' && SC.via) || '';
      return g.call(this, via && q && !q.via ? Object.assign({}, q, {via}) : q);
    };
    RemoteDataProvider.prototype.get.__ac = true;
  }
  acWrap('vaultLockRender', (o) => function(){
    const r = o.apply(this, arguments);
    const f = document.querySelector('#vault-lock form[data-vl="login"], #vault-lock form[data-vl="setup"]'), go = f && f.querySelector('#vl-go');
    if (go && !f.querySelector('#dm-remember')) go.insertAdjacentHTML('beforebegin', rmCheckboxHTML('rm-vl'));
    return r;
  });
  /* the 30-second check of the desktop web app: a remembered device keeps its session instead of locking */
  acWrap('vaultLockNow', (o) => function(){
    try { const A = rmAuth(); if (A && !A.currentUser() && rmKeepAlive()) return Promise.resolve(); } catch(e){}
    return o.apply(this, arguments);
  });
  acWrap('authSettingsHTML', (o) => function(){ return o.apply(this, arguments) + rmSettingsHTML(); });
  /* desktop */
  acWrap('openEditor', (o) => function(id){
    const r = o.apply(this, arguments);
    try { const b = id && S && S.binders.find(x => x.id === id); if (b){ acNoteView(b, (typeof UI !== 'undefined' && UI.q && S.view === 'archive') ? 'search' : 'nav'); acMountSeen(b); } } catch(e){ console.warn('access', e); }
    return r;
  });
  acWrap('viewSync', (o) => function(){ return o.apply(this, arguments) + '<div class="card card-p ac-card" id="ac-card">' + acCardInner() + '</div>'; });
  acWrap('srvSync', (o) => async function(){ const r = await o.apply(this, arguments); try { if (acQueue().length) acFlushSoon(500); } catch(e){} return r; });
  /* phone */
  acWrap('scLoginHTML', (o) => function(){ return o.apply(this, arguments).replace('<button type="submit"', rmCheckboxHTML('rm-sc') + '<button type="submit"'); });
  acWrap('scSetupHTML', (o) => function(){ return o.apply(this, arguments).replace('<button type="submit"', rmCheckboxHTML('rm-sc') + '<button type="submit"'); });
  acWrap('scCardHTML', (o) => function(){ const h = o.apply(this, arguments), slot = acPhoneSlotHTML(); return slot ? h.replace('<div class="sc-foot', slot + '<div class="sc-foot') : h; });
  acWrap('scRoute', (o) => async function(){
    try { if (SC.P && !SC.P.auth.currentUser() && !rmKeepAlive()) await rmResume(SC.P.auth); } catch(e){}
    const r = await o.apply(this, arguments);
    try {
      if (SC.view === 'card' && SC.rec){ if (SC.rec.offline) acScanOfflineView(SC.rec.binder); else if (SC.P.server){ acPhoneLoad(); rmRefreshPolicy(); if (acQueue().length) acFlushSoon(800); } }
    } catch(e){}
    return r;
  });
}
acInstall();
document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.matches) return;
  if (el.matches('[data-rm-want]')){ RM.want = !!el.checked; return; }
  if (el.matches('[data-rm-policy]')){
    const n = Math.round(+el.value); const A = rmAuth(); if (!A || !Number.isFinite(n)) return;
    A.setPolicy({rememberMinutes:n}); if (n === 0) rmForget('policy');
    if (typeof toast === 'function') toast(t('rm_saved'));
    return;
  }
  if (el.matches('[data-acf]')){
    AC.ui.f[el.dataset.acf] = String(el.value || '').trim();
    if (AC.ui.src === 'srv') acSrvLoad(false); else acRefreshList();
  }
});
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (RM.lastTouch && Date.now() - RM.lastTouch < RM_TOUCH_MS) return; rmTouch(); }, {passive:true, capture:true}));
document.addEventListener('visibilitychange', () => { if (!document.hidden) rmTouch(); });
window.addEventListener('online', () => { if (acQueue().length) acFlushSoon(1000); });
document.addEventListener('DOMContentLoaded', () => {
  acInstall();
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, AC_ACTIONS);
  if (typeof LOG_GROUPS !== 'undefined' && !LOG_GROUPS.includes('view')) LOG_GROUPS.push('view');
  if (typeof S !== 'undefined' && dmConfig().mode === 'web' && dmConfig().apiBase) setTimeout(() => rmRefreshPolicy(true), 4000);
  if (acQueue().length) acFlushSoon(5000);
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'remember', guide:null, tags:['safety', 'qr', 'online'], acts:['how', 'what'], pop:30, related:['mobile', 'access'],
    title:{it:'Come entro dal telefono senza PIN ogni volta («Ricordami su questo dispositivo»)', en:'How do I open binders from the phone without the PIN every time («Remember me on this device»)'},
    body:{it:'<p>Nella versione web, la prima volta che accedi dal telefono lascia acceso <b>Ricordami su questo dispositivo</b> (è già acceso). Da quel momento ogni QR scansionato apre <b>subito</b> il faldone, senza PIN.</p><ul>' +
        '<li>Il PIN viene chiesto di nuovo dopo un periodo <b>senza usare</b> DocMap su quel telefono: 30 giorni se nessuno cambia nulla. L\'amministratore sceglie in <b>Impostazioni › Utenti e accesso</b> tra <b>Chiedi sempre il PIN</b>, <b>8 ore</b>, <b>30 giorni</b> e <b>Mai</b>; con il server online vale <span class="kbd">remember_minutes</span> di <span class="kbd">config.php</span>.</li>' +
        '<li><b>Esci</b> sul telefono dimentica l\'accesso: al QR successivo serve di nuovo il PIN. Lo stesso succede se l\'amministratore disattiva l\'utente, cambia il suo PIN o <b>revoca il codice di accesso</b> del telefono.</li>' +
        '<li>Il telefono conserva solo una chiave <b>non esportabile</b> del browser: i dati restano cifrati. Ma chi prende il telefono <b>sbloccato</b> vede i faldoni finché l\'accesso non scade o viene revocato: per i telefoni condivisi scegli «Chiedi sempre il PIN» (vedi <span class="kbd">docs/SICUREZZA.md</span>).</li></ul>',
      en:'<p>In the web version, the first time you sign in from the phone keep <b>Remember me on this device</b> on (it already is). From then on every scanned QR opens the binder <b>at once</b>, without the PIN.</p><ul>' +
        '<li>The PIN is asked again after a period <b>without using</b> DocMap on that phone: 30 days unless someone changes it. The administrator chooses in <b>Settings › Users &amp; access</b> between <b>Always ask the PIN</b>, <b>8 hours</b>, <b>30 days</b> and <b>Never</b>; with the online server <span class="kbd">remember_minutes</span> in <span class="kbd">config.php</span> applies.</li>' +
        '<li><b>Sign out</b> on the phone forgets the sign-in: the next QR needs the PIN again. The same happens when the administrator disables the user, changes their PIN or <b>revokes the phone\'s access code</b>.</li>' +
        '<li>The phone keeps only a <b>non-exportable</b> browser key: the data stays encrypted. But whoever takes the <b>unlocked</b> phone sees the binders until the sign-in expires or is revoked: for shared phones choose «Always ask the PIN» (see <span class="kbd">docs/SICUREZZA.md</span>).</li></ul>'} });
  HELP_TOPICS.push({ id:'access', guide:null, tags:['safety', 'archive', 'online'], acts:['what', 'find'], pop:26, related:['log', 'journal', 'remember'],
    title:{it:'Chi ha visto un faldone? («Chi l\'ha visto» e «Accessi»)', en:'Who looked at a binder? («Who looked at it» and «Accesses»)'},
    body:{it:'<p>DocMap annota chi <b>apre</b> un faldone, non solo chi lo modifica.</p><ul>' +
        '<li><b>Sul PC</b>: aprire la scheda di un faldone è una visita, registrata nel <b>Registro attività</b> (gruppo <b>Visite</b>) al massimo una volta ogni 10 minuti per persona. Nella scheda, a destra, <b>Chi l\'ha visto</b> elenca le ultime visite; con il server online <b>Carica dal server</b> aggiunge quelle dei telefoni.</li>' +
        '<li><b>Dal telefono</b> con il server online: ogni scheda aperta (da QR, ricerca, NFC) viene registrata dal server. In fondo alla scheda <b>Visto di recente</b> mostra gli ultimi accessi.</li>' +
        '<li>In <b>⚙ Funzioni avanzate › Sincronizzazione</b>, accanto al Registro sincronizzazioni, <b>Accessi</b> elenca tutte le visite con filtri per data, persona, faldone e modo (QR, Ricerca, Scheda, NFC). Dal server: l\'amministratore vede tutti, chi può modificare vede i propri.</li>' +
        '<li>Il server conserva gli accessi per 365 giorni (<span class="kbd">access_keep_days</span> in <span class="kbd">config.php</span>), cifrati come il resto.</li></ul>',
      en:'<p>DocMap notes who <b>opens</b> a binder, not only who changes it.</p><ul>' +
        '<li><b>On the PC</b>: opening a binder form is a view, recorded in the <b>Activity log</b> (group <b>Views</b>) at most once every 10 minutes per person. In the form, on the right, <b>Who looked at it</b> lists the last views; with the online server <b>Load from the server</b> adds the phones\' ones.</li>' +
        '<li><b>From the phone</b> with the online server: every card opened (from QR, search, NFC) is recorded by the server. At the bottom of the card <b>Seen recently</b> shows the last accesses.</li>' +
        '<li>In <b>⚙ Advanced tools › Sync</b>, next to the Sync journal, <b>Accesses</b> lists all views with filters for date, person, binder and way (QR, Search, Form, NFC). From the server: the administrator sees everyone, editors see their own.</li>' +
        '<li>The server keeps accesses for 365 days (<span class="kbd">access_keep_days</span> in <span class="kbd">config.php</span>), encrypted like the rest.</li></ul>'} });
});
