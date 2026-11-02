/* =====================================================================
   DocMap 2026 — v10 (stream M): provider seams for data, auth, crypto and blobs

   This file is the FOUNDATION for the mobile page shown after scanning a binder QR
   (scan.html + 11-scan.js) and for the future online version. It defines four small
   interfaces with a local implementation each, plus remote stubs that follow the REST
   contract in docs/API-CONTRACT.md:

     DataProvider   getBinderByQr · getBinderByCode · saveBinderPatch · listChanges · getCabinetPhoto · context
                    LocalDataProvider  → the same localStorage state the desktop app uses ('docmap_v26_state')
                    RemoteDataProvider → fetch(apiBase + '/v1/...') with Bearer token and ETag / If-Match
     AuthProvider   login · logout · currentUser · getToken · onChange · hasUsers
                    LocalAuthProvider  → users in localStorage 'docmap_v26_auth' (PBKDF2-SHA256 hashes),
                                         session in sessionStorage 'docmap_v26_session' with expiry, backoff
                    RemoteAuthProvider → POST /v1/auth/token (or an OIDC front end) per API-CONTRACT.md
     CryptoProvider available · encrypt · decrypt · sha256
                    LocalCryptoProvider → AES-256-GCM with envelope encryption: random data key (DEK) per
                                          record, wrapped (AES-KW) by a workspace key (KEK) kept as a
                                          NON-extractable CryptoKey in IndexedDB 'docmap_v26_keys'
     BlobStore      putBlob · getBlob · deleteBlob · listBlobs
                    LocalBlobStore → IndexedDB 'docmap_v26_blobs', encrypted with the CryptoProvider,
                                     "optimised working copy" policy (images ≤ 1400 px JPEG, PDFs capped)

   Factory: dmProviders() reads window.DOCMAP_CONFIG ({mode:'local'|'remote', apiBase, ...}) and returns
   {data, auth, crypto, blobs}. The MVP always runs 'local' from file:// — no network call is ever made
   unless a deployer sets mode:'remote' explicitly.

   NOT A SECURITY SYSTEM YET: see docs/SICUREZZA.md. Local users protect the scan page against casual
   viewing on a shared device, nothing more. The desktop app keeps working without login.

   Loaded by index.html (after 08-guide.js, before 09-actions.js) and by scan.html (after 02-core.js).
   It only needs 02-core.js at parse time; desktop-only parts (settings UI, actions, help topic,
   live merge of mobile edits) check `typeof` before touching desktop globals.
   ===================================================================== */
'use strict';

const AUTH_LS = 'docmap_v26_auth';              // {v:1, users:[UserRecord], policy:{sessionMinutes}}
const AUTH_FAIL_LS = 'docmap_v26_auth_fail';    // {username: {n, until, at}} failed-login counters (backoff)
const AUTH_SESSION_SS = 'docmap_v26_session';   // sessionStorage: {sid, user_id, exp}
const AUTH_ROLES = ['viewer', 'editor', 'admin'];
const AUTH_KDF = {alg:'pbkdf2_sha256', iter:600000, saltBytes:16, keyBytes:32};   // OWASP 2023: ≥ 600 000 for PBKDF2-HMAC-SHA256
const AUTH_MIN_SECRET = 4;                      // a PIN of at least 4 characters; 6+ recommended
const AUTH_FREE_FAILS = 3;                      // failures before the backoff starts
const AUTH_BACKOFF_S = (n) => Math.min(900, 15 * Math.pow(2, n - AUTH_FREE_FAILS));   // 15 s, 30 s, 60 s … max 15 min
const MOBILE_LOG_SOURCE = 'mobile';
const BLOB_IDB = 'docmap_v26_blobs', KEY_IDB = 'docmap_v26_keys';
const BLOB_POLICY = { imageMaxPx:1400, imageQuality:0.8, imageType:'image/jpeg', pdfMaxBytes:15 * 1024 * 1024, otherMaxBytes:10 * 1024 * 1024,
  purpose:'working-copy' };   // optimised copy for technical/functional maintenance, NOT long-term archiving

/* ---------------- small helpers (no desktop globals) ---------------- */
/** Typed error used by every provider. code ∈ not_found | conflict | unauthorized | forbidden | locked | invalid | offline | storage | no_users | config */
class DMError extends Error {
  constructor(code, message, data){ super(message || code); this.name = 'DMError'; this.code = code; this.data = data || null; }
}
const authB64 = (u8) => { let s = ''; const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const authUnb64 = (s) => { const bin = atob(String(s || '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const authHex = (u8) => Array.from(new Uint8Array(u8), x => x.toString(16).padStart(2, '0')).join('');
const authRand = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
const authNormUser = (u) => String(u || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '.');
const authNormSecret = (p) => String(p == null ? '' : p).normalize('NFKC');
const authHasSubtle = () => !!(window.crypto && crypto.subtle && typeof crypto.subtle.importKey === 'function');
function lsGetJSON(key, dflt){ try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : dflt; } catch(e){ return dflt; } }
function lsSetJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
/** Constant-time string compare (both strings are base64 of the same length in practice). */
function authEq(a, b){ a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }

/* =====================================================================
   Password hashing — PBKDF2-HMAC-SHA256 via WebCrypto
   Stored format (one string, Django-like):  pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>
     salt = 16 random bytes, hash = 32 bytes, input = NFKC-normalised UTF-8 secret.
   Python check:  hashlib.pbkdf2_hmac('sha256', secret.encode(), base64.b64decode(salt), iterations, 32)
   ===================================================================== */
async function authPbkdf2(secret, salt, iter){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authNormSecret(secret)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, key, AUTH_KDF.keyBytes * 8));
}
/** @returns {Promise<string>} 'pbkdf2_sha256$600000$salt$hash' */
async function authHashSecret(secret, iter){
  if (!authHasSubtle()) throw new DMError('config', 'WebCrypto non disponibile');
  iter = iter || AUTH_KDF.iter;
  const salt = authRand(AUTH_KDF.saltBytes);
  return [AUTH_KDF.alg, iter, authB64(salt), authB64(await authPbkdf2(secret, salt, iter))].join('$');
}
/** @returns {Promise<boolean>} */
async function authVerifySecret(secret, stored){
  const p = String(stored || '').split('$');
  if (p.length !== 4 || p[0] !== AUTH_KDF.alg || !(+p[1] > 0)) return false;
  const got = authB64(await authPbkdf2(secret, authUnb64(p[2]), +p[1]));
  return authEq(got, p[3]);
}

/* =====================================================================
   Configuration + web-mode vault
   docmap.config.js (loaded first) sets window.DOCMAP_CONFIG:
     {mode:'local'|'web', basePath:'/studio-de/', apiBase:null, studioSlug:'studio-de', studioName:''}
   - 'local' (default, file://): unchanged MVP behaviour, plaintext localStorage/IndexedDB, desktop without login.
   - 'web' without apiBase (static upload, e.g. https://docmap.pr-it.it/studio-de/): the server holds ONLY code.
     Data lives in each browser, ENCRYPTED AT REST in a local vault; login = unlocking the vault; login is
     required on every page; logged out = nothing decrypted, nothing rendered.
   - 'web' with apiBase (or 'remote'): Remote providers talking to the Python API (docs/API-CONTRACT.md).

   Vault design (DocMapVault):
     DEK  = random AES-256-GCM key of this browser's workspace (never stored in clear)
     KEK  = PBKDF2-SHA256(user secret, own salt, 600 000) → AES-KW 256, one per user; user.vault = {salt, iter, wrapped}
     state  → localStorage 'docmap_v26_vault' (+ '_prev')  = {v, alg:'A256GCM', iv, ct}   (JSON of S, AAD = key name)
     log    → localStorage 'docmap_v26_vault_log'          = pending activity-log entries (06e-log.js)
     SQLite → IndexedDB 'docmap_v26_sqlite'/kv 'db'        = {v, vault:true, iv, ct}     (idbGet/idbSet wrapped below)
     session: the DEK wrapped by a per-tab NON-extractable key (IndexedDB 'docmap_v26_keys', 'session:<sid>');
              wrapped copy + expiry in sessionStorage 'docmap_v26_vault_session' → survives reloads of the tab,
              gone when the tab closes or on "Esci".
   Public hook for other modules (e.g. the sync import of 06f-sync.js): window.DocMapVault
     isActive() · isUnlocked() · loadState() → Promise<object|null> · saveState(obj) → Promise · flush() → Promise · lock()
   The desktop app never needs to call it directly: persist()/loadState() in 02-core route through it in web mode,
   so an import that ends with commit() is stored encrypted transparently.
   ===================================================================== */
function dmConfig(){ return Object.assign({mode:'local', basePath:'./', apiBase:null, studioSlug:'', studioName:''}, window.DOCMAP_CONFIG || {}); }
const VAULT_LS = 'docmap_v26_vault', VAULT_PREV_LS = 'docmap_v26_vault_prev', VAULT_LOG_LS = 'docmap_v26_vault_log', VAULT_SS = 'docmap_v26_vault_session';
const VAULT = { dek:null, cache:null, chain:Promise.resolve(), sid:'', srv:null };
const SRV_VAULT_LS = 'docmap_v26_vault_srv';   // v10.1: {token, user, role, at} of the shared online database (encrypted)
async function vaultKek(secret, salt, iter){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(authNormSecret(secret)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:iter}, base, {name:'AES-KW', length:256}, false, ['wrapKey', 'unwrapKey']);
}
async function vaultEnc(u8, aad){
  if (!VAULT.dek) throw new DMError('unauthorized', 'vault locked');
  const iv = authRand(12), p = {name:'AES-GCM', iv}; if (aad) p.additionalData = new TextEncoder().encode(aad);
  return {v:1, alg:'A256GCM', iv:authB64(iv), ct:new Uint8Array(await crypto.subtle.encrypt(p, VAULT.dek, u8))};
}
async function vaultDec(env, aad){
  if (!VAULT.dek) throw new DMError('unauthorized', 'vault locked');
  const p = {name:'AES-GCM', iv:authUnb64(env.iv)}; if (aad) p.additionalData = new TextEncoder().encode(aad);
  const ct = typeof env.ct === 'string' ? authUnb64(env.ct) : env.ct;
  return new Uint8Array(await crypto.subtle.decrypt(p, VAULT.dek, ct));
}
async function vaultPutJSON(key, obj){ const e = await vaultEnc(new TextEncoder().encode(JSON.stringify(obj)), key); localStorage.setItem(key, JSON.stringify({v:1, alg:e.alg, iv:e.iv, ct:authB64(e.ct)})); }
async function vaultGetJSON(key){ const raw = localStorage.getItem(key); if (!raw) return null; return JSON.parse(new TextDecoder().decode(await vaultDec(JSON.parse(raw), key))); }
const DocMapVault = {
  isActive(){ return dmConfig().mode === 'web'; },   // v10.1: also with apiBase (the vault is then the encrypted offline cache + token)
  isUnlocked(){ return !!VAULT.dek; },
  hasData(){ try { return !!localStorage.getItem(VAULT_LS); } catch(e){ return false; } },
  /** Wrap the current DEK for a user secret (new user / new PIN). */
  async wrapFor(secret){
    if (!VAULT.dek) throw new DMError('unauthorized', 'vault locked');
    const salt = authRand(16), kek = await vaultKek(secret, salt, AUTH_KDF.iter);
    return {salt:authB64(salt), iter:AUTH_KDF.iter, wrapped:authB64(new Uint8Array(await crypto.subtle.wrapKey('raw', VAULT.dek, kek, 'AES-KW')))};
  },
  async newDek(){ VAULT.dek = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt', 'decrypt']); },
  /** Unlock with a user record + its secret (called by LocalAuthProvider.login after the hash check). */
  async unlock(user, secret, minutes){
    if (!user.vault) throw new DMError('invalid', 'no vault key for this user');
    const kek = await vaultKek(secret, authUnb64(user.vault.salt), +user.vault.iter);
    VAULT.dek = await crypto.subtle.unwrapKey('raw', authUnb64(user.vault.wrapped), kek, 'AES-KW', {name:'AES-GCM', length:256}, true, ['encrypt', 'decrypt']);
    await this.startSession(minutes);
    await this.prime();
  },
  async startSession(minutes){
    const sid = authHex(authRand(12)), sk = await crypto.subtle.generateKey({name:'AES-KW', length:256}, false, ['wrapKey', 'unwrapKey']);
    const db = await idbReq(KEY_IDB, ['keys']); try { await idbDo(db, 'keys', 'readwrite', os => os.put(sk, 'session:' + sid)); } finally { db.close(); }
    const w = new Uint8Array(await crypto.subtle.wrapKey('raw', VAULT.dek, sk, 'AES-KW'));
    sessionStorage.setItem(VAULT_SS, JSON.stringify({sid, wrapped:authB64(w), exp:Date.now() + Math.max(5, minutes || 480) * 60000}));
    VAULT.sid = sid;
  },
  /** Re-open the vault after a reload of the same tab (session not expired). */
  async resume(){
    if (VAULT.dek) return true;
    let s = null; try { s = JSON.parse(sessionStorage.getItem(VAULT_SS) || 'null'); } catch(e){}
    if (!s || !(s.exp > Date.now())) return false;
    try {
      const db = await idbReq(KEY_IDB, ['keys']); let sk; try { sk = await idbDo(db, 'keys', 'readonly', os => os.get('session:' + s.sid)); } finally { db.close(); }
      if (!sk) return false;
      VAULT.dek = await crypto.subtle.unwrapKey('raw', authUnb64(s.wrapped), sk, 'AES-KW', {name:'AES-GCM', length:256}, true, ['encrypt', 'decrypt']);
      VAULT.sid = s.sid; await this.prime(); return true;
    } catch(e){ VAULT.dek = null; return false; }
  },
  sessionValid(){ try { const s = JSON.parse(sessionStorage.getItem(VAULT_SS) || 'null'); return !!(s && s.exp > Date.now()); } catch(e){ return false; } },
  /** Decrypt the state into the cache read once by loadState() (02-core). Moves a plaintext state into the vault once. */
  async prime(){
    let st = null;
    try { st = await vaultGetJSON(VAULT_LS); } catch(e){ try { st = await vaultGetJSON(VAULT_PREV_LS); } catch(e2){ st = null; } }
    if (!st){ try { const raw = localStorage.getItem(LS_KEY); if (raw){ st = JSON.parse(raw); await vaultPutJSON(VAULT_LS, st); localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_PREV); } } catch(e){} }
    VAULT.cache = st;
    try { VAULT.srv = await vaultGetJSON(SRV_VAULT_LS); } catch(e){ VAULT.srv = null; }
    return st;
  },
  /* v10.1 shared online database: the server access token of this device, encrypted in the vault */
  srv(){ return VAULT.srv || null; },
  srvToken(){ return VAULT.srv && VAULT.srv.token || ''; },
  async srvSet(rec){ VAULT.srv = rec ? {token:String(rec.token || ''), user:String(rec.user || ''), role:AUTH_ROLES.includes(rec.role) ? rec.role : 'viewer', at:nowISO()} : null;
    await VAULT.chain; if (VAULT.srv) await vaultPutJSON(SRV_VAULT_LS, VAULT.srv); else localStorage.removeItem(SRV_VAULT_LS); },
  takeState(){ const c = VAULT.cache; VAULT.cache = null; return c; },
  async loadState(){ await VAULT.chain; try { return await vaultGetJSON(VAULT_LS); } catch(e){ return null; } },
  /** Snapshot now, encrypt + write in order (previous ciphertext kept as _prev). */
  saveState(obj){
    const json = JSON.stringify(obj);
    VAULT.chain = VAULT.chain.then(async () => {
      const e = await vaultEnc(new TextEncoder().encode(json), VAULT_LS);
      const cur = localStorage.getItem(VAULT_LS); if (cur) try { localStorage.setItem(VAULT_PREV_LS, cur); } catch(err){}
      localStorage.setItem(VAULT_LS, JSON.stringify({v:1, alg:e.alg, iv:e.iv, ct:authB64(e.ct)}));
    }).catch(err => { console.warn('vault save', err); if (typeof toast === 'function') toast(t('storage_fail'), 'err', 8000); });
    return VAULT.chain;
  },
  saveLog(list){ const copy = JSON.parse(JSON.stringify(list || [])); VAULT.chain = VAULT.chain.then(() => copy.length ? vaultPutJSON(VAULT_LOG_LS, copy) : localStorage.removeItem(VAULT_LOG_LS)).catch(e => console.warn('vault log', e)); return VAULT.chain; },
  async loadLog(){ try { const l = await vaultGetJSON(VAULT_LOG_LS); return Array.isArray(l) ? l : []; } catch(e){ return []; } },
  async appendLog(entry){ await VAULT.chain; const l = await this.loadLog(); l.push(entry); return this.saveLog(l); },
  flush(){ return VAULT.chain; },
  async encryptDb(bytes){ return Object.assign(await vaultEnc(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), 'sqlite'), {vault:true}); },
  async decryptDb(rec){ if (!rec) return null; return rec.vault ? vaultDec(rec, 'sqlite') : rec; },
  async lock(){
    try { await VAULT.chain; } catch(e){}
    const sid = VAULT.sid; VAULT.dek = null; VAULT.cache = null; VAULT.sid = ''; VAULT.srv = null;
    try { sessionStorage.removeItem(VAULT_SS); } catch(e){}
    if (sid) try { const db = await idbReq(KEY_IDB, ['keys']); try { await idbDo(db, 'keys', 'readwrite', os => os.delete('session:' + sid)); } finally { db.close(); } } catch(e){}
  },
  /** Desktop boot gate: in web mode show the lock screen and run boot() only after unlocking. */
  gateBoot(boot){ if (!this.isActive()) return false; vaultGate(boot); return true; }
};
window.DocMapVault = DocMapVault;
/* web mode: the SQLite working copy (with photos and sessions) is encrypted in IndexedDB */
if (typeof idbGet === 'function' && typeof idbSet === 'function'){
  const _get = idbGet, _set = idbSet;
  idbGet = async function(key){ const v = await _get(key); return key === 'db' && DocMapVault.isActive() ? (VAULT.dek ? DocMapVault.decryptDb(v) : null) : v; };
  idbSet = async function(key, val){ return _set(key, key === 'db' && DocMapVault.isActive() ? await DocMapVault.encryptDb(val) : val); };
}
/* web mode: pending activity-log entries go into the vault instead of plaintext localStorage */
if (typeof logSavePending === 'function'){
  const _lsp = logSavePending;
  logSavePending = function(){ if (DocMapVault.isActive()){ if (VAULT.dek) DocMapVault.saveLog(LOG.pending); return; } return _lsp(); };
}

/* =====================================================================
   AuthProvider
   ===================================================================== */
/**
 * @typedef {'viewer'|'editor'|'admin'} Role
 * @typedef {{id:string, username:string, display_name:string, role:Role}} AuthUser   (what the UI sees: never a hash)
 * @typedef {{id:string, username:string, display_name:string, role:Role, password_hash:string, disabled:boolean,
 *            created_at:string, updated_at:string, last_login_at:string}} UserRecord   (local store only)
 *
 * @interface AuthProvider
 *   login(username, secret) → Promise<AuthUser>     throws DMError 'unauthorized' | 'locked' {retry_in} | 'no_users'
 *   logout() → Promise<void>
 *   currentUser() → AuthUser|null                    (null when logged out or the session expired)
 *   getToken() → string|null                         (Bearer token for the RemoteDataProvider; local: session id)
 *   onChange(fn) → unsubscribe                       (fn(AuthUser|null))
 *   hasUsers() → Promise<boolean>
 *   can(action) → boolean                            ('view' | 'edit' | 'admin')
 */
const AUTH_CAN = { view:['viewer','editor','admin'], edit:['editor','admin'], admin:['admin'] };

class LocalAuthProvider {
  constructor(opts){ this.opts = opts || {}; this.subs = new Set(); this._u = undefined; }
  /* ---- user store (also used by the desktop "Utenti e accesso" section) ---- */
  store(){
    const s = lsGetJSON(AUTH_LS, null);
    const o = (s && typeof s === 'object') ? s : {};
    o.v = 1; o.users = Array.isArray(o.users) ? o.users.filter(u => u && u.id && u.username) : [];
    o.policy = Object.assign({sessionMinutes:480}, o.policy || {});
    return o;
  }
  saveStore(st){ lsSetJSON(AUTH_LS, st); }
  /** @returns {Promise<boolean>} */
  async hasUsers(){ return this.store().users.some(u => !u.disabled); }
  listUsers(){ return this.store().users.map(u => ({id:u.id, username:u.username, display_name:u.display_name, role:u.role, disabled:!!u.disabled, created_at:u.created_at, updated_at:u.updated_at, last_login_at:u.last_login_at || ''})); }
  /** Create a user. secret = PIN or password (min AUTH_MIN_SECRET chars). */
  async addUser(o){
    const username = authNormUser(o.username), role = AUTH_ROLES.includes(o.role) ? o.role : 'viewer';
    if (!/^[a-z0-9._@-]{2,40}$/.test(username)) throw new DMError('invalid', 'username');
    if (authNormSecret(o.secret).length < AUTH_MIN_SECRET) throw new DMError('invalid', 'secret');
    const st = this.store();
    if (st.users.some(u => u.username === username)) throw new DMError('invalid', 'duplicate');
    const now = nowISO();
    const u = {id:uuid(), username, display_name:String(o.display_name || '').trim() || username, role, password_hash:await authHashSecret(o.secret), disabled:false, created_at:now, updated_at:now, last_login_at:''};
    if (DocMapVault.isActive()){ if (!DocMapVault.isUnlocked()) throw new DMError('unauthorized', 'vault locked'); u.vault = await DocMapVault.wrapFor(o.secret); }
    const fresh = this.store(); fresh.users.push(u); this.saveStore(fresh);
    return this.listUsers().find(x => x.id === u.id);
  }
  async updateUser(id, patch){
    patch = patch || {};
    const hash = patch.secret != null ? (authNormSecret(patch.secret).length >= AUTH_MIN_SECRET ? await authHashSecret(patch.secret) : null) : undefined;
    if (hash === null) throw new DMError('invalid', 'secret');
    const vw = hash && DocMapVault.isActive() ? await DocMapVault.wrapFor(patch.secret) : null;
    const st = this.store(), u = st.users.find(x => x.id === id); if (!u) throw new DMError('not_found');
    if (patch.role && AUTH_ROLES.includes(patch.role)) u.role = patch.role;
    if (patch.display_name != null) u.display_name = String(patch.display_name).trim() || u.username;
    if (patch.disabled != null) u.disabled = !!patch.disabled;
    if (hash) { u.password_hash = hash; if (vw) u.vault = vw; this.clearFails(u.username); }
    if (DocMapVault.isActive() && !st.users.some(x => x.role === 'admin' && !x.disabled)) throw new DMError('invalid', 'last_admin');
    u.updated_at = nowISO(); this.saveStore(st);
    this._u = undefined; this.emit();
  }
  removeUser(id){
    const st = this.store(); st.users = st.users.filter(u => u.id !== id);
    if (DocMapVault.isActive() && !st.users.some(x => x.role === 'admin' && !x.disabled)) throw new DMError('invalid', 'last_admin');   // the vault would become unreadable
    this.saveStore(st); this._u = undefined; this.emit();
  }
  /** Web mode, first run on this device: create the vault key and the first administrator, then log in. */
  async setupFirstAdmin(o){
    if (this.store().users.length) throw new DMError('invalid', 'users_exist');
    if (DocMapVault.isActive()) await DocMapVault.newDek();
    await this.addUser(Object.assign({}, o, {role:'admin'}));
    return this.login(o.username, o.secret);
  }
  setPolicy(p){ const st = this.store(); Object.assign(st.policy, p || {}); this.saveStore(st); }
  /* ---- failed attempts / backoff (per username, unknown names too: no user enumeration) ---- */
  fails(){ const f = lsGetJSON(AUTH_FAIL_LS, {}); return f && typeof f === 'object' ? f : {}; }
  lockInfo(username){
    const f = this.fails()[authNormUser(username)] || {n:0, until:0};
    const left = Math.ceil(((+f.until || 0) - Date.now()) / 1000);
    return {n:+f.n || 0, retry_in:left > 0 ? left : 0};
  }
  noteFail(username){
    const all = this.fails(), k = authNormUser(username), f = all[k] || {n:0, until:0};
    f.n = (+f.n || 0) + 1; f.at = nowISO();
    f.until = f.n >= AUTH_FREE_FAILS ? Date.now() + AUTH_BACKOFF_S(f.n) * 1000 : 0;
    all[k] = f; try { lsSetJSON(AUTH_FAIL_LS, all); } catch(e){}
    return {n:f.n, retry_in:f.until ? Math.ceil((f.until - Date.now()) / 1000) : 0, left:Math.max(0, AUTH_FREE_FAILS - f.n)};
  }
  clearFails(username){ const all = this.fails(); delete all[authNormUser(username)]; try { lsSetJSON(AUTH_FAIL_LS, all); } catch(e){} }
  /* ---- session ---- */
  async login(username, secret){
    const st = this.store();
    if (!st.users.some(u => !u.disabled)) throw new DMError('no_users');
    const lock = this.lockInfo(username);
    if (lock.retry_in > 0) throw new DMError('locked', 'locked', {retry_in:lock.retry_in});
    const u = st.users.find(x => x.username === authNormUser(username) && !x.disabled);
    // always run the KDF (dummy hash for unknown users) so timing does not reveal which names exist
    const okPw = await authVerifySecret(secret, u ? u.password_hash : 'pbkdf2_sha256$' + AUTH_KDF.iter + '$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!u || !okPw){ const f = this.noteFail(username); throw new DMError(f.retry_in > 0 ? 'locked' : 'unauthorized', 'bad_credentials', f); }
    this.clearFails(username);
    const fresh = this.store(), fu = fresh.users.find(x => x.id === u.id); if (fu){ fu.last_login_at = nowISO(); this.saveStore(fresh); }
    const mins = Math.max(5, +st.policy.sessionMinutes || 480);
    if (DocMapVault.isActive()) await DocMapVault.unlock(u, secret, mins);   // login = unlocking the local vault
    try { sessionStorage.setItem(AUTH_SESSION_SS, JSON.stringify({sid:authHex(authRand(16)), user_id:u.id, exp:Date.now() + mins * 60000})); } catch(e){ throw new DMError('storage', 'sessionStorage'); }
    this._u = undefined; this.emit();
    return this.currentUser();
  }
  async logout(){ try { sessionStorage.removeItem(AUTH_SESSION_SS); } catch(e){} if (DocMapVault.isActive()) await DocMapVault.lock(); this._u = undefined; this.emit(); }
  session(){ try { const s = JSON.parse(sessionStorage.getItem(AUTH_SESSION_SS) || 'null'); return s && s.exp > Date.now() ? s : null; } catch(e){ return null; } }
  /** The role always comes from the user store, never from the session object. */
  currentUser(){
    const s = this.session(); if (!s) return null;
    if (DocMapVault.isActive() && (!DocMapVault.isUnlocked() || !DocMapVault.sessionValid())) return null;   // logged out = vault locked
    const u = this.store().users.find(x => x.id === s.user_id && !x.disabled);
    if (!u) return null;
    // v10.1 web + apiBase: what this device may do is decided by its server token, not by the local device user
    const sv = dmConfig().apiBase && DocMapVault.isActive() ? DocMapVault.srv() : null;
    return {id:u.id, username:u.username, display_name:u.display_name, role:sv ? sv.role : u.role, server_user:sv ? sv.user : ''};
  }
  getToken(){ const s = this.session(); return s ? s.sid : null; }
  can(action){ const u = this.currentUser(); return !!(u && (AUTH_CAN[action] || []).includes(u.role)); }
  onChange(fn){ this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(){ const u = this.currentUser(); this.subs.forEach(fn => { try { fn(u); } catch(e){ console.warn(e); } }); }
}

/** Remote stub — see docs/API-CONTRACT.md §2. Not used by the MVP. */
class RemoteAuthProvider {
  constructor(cfg){ this.base = String(cfg.apiBase || '').replace(/\/+$/, ''); this.subs = new Set(); this.ssKey = AUTH_SESSION_SS + '_remote'; }
  tok(){ try { const s = JSON.parse(sessionStorage.getItem(this.ssKey) || 'null'); return s && s.exp > Date.now() ? s : null; } catch(e){ return null; } }
  async hasUsers(){ return true; }
  async login(username, secret){
    let r;
    try { r = await fetch(this.base + '/v1/auth/token', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({grant_type:'password', username, password:secret})}); }
    catch(e){ throw new DMError('offline'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw new DMError('locked', 'locked', {retry_in:+r.headers.get('Retry-After') || 60});
    if (!r.ok) throw new DMError('unauthorized', (j.error && j.error.message) || 'login');
    sessionStorage.setItem(this.ssKey, JSON.stringify({token:j.access_token, user:j.user, exp:Date.now() + (+j.expires_in || 3600) * 1000}));
    this.emit(); return j.user;
  }
  async logout(){ const s = this.tok(); try { if (s) await fetch(this.base + '/v1/auth/logout', {method:'POST', headers:{Authorization:'Bearer ' + s.token}}); } catch(e){} sessionStorage.removeItem(this.ssKey); this.emit(); }
  currentUser(){ const s = this.tok(); return s ? s.user : null; }
  getToken(){ const s = this.tok(); return s ? s.token : null; }
  can(action){ const u = this.currentUser(); return !!(u && (AUTH_CAN[action] || []).includes(u.role)); }
  onChange(fn){ this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(){ const u = this.currentUser(); this.subs.forEach(fn => { try { fn(u); } catch(e){} }); }
}

/* =====================================================================
   DataProvider
   ===================================================================== */
/**
 * Binder = the object of docs/MODELLO-DATI.md (normalizeBinder shape). ETag = binder.updated_at (local) or the
 * server's version string (remote).
 * @interface DataProvider
 *   context() → Promise<{studioName, lang}>              (safe to show logged out: no binder data)
 *   getBinderByQr(short_code) → Promise<{binder, etag, siblings}|null>
 *   getBinderByCode(speaking_code) → Promise<{binder, etag, siblings}|null>
 *       siblings = other binders in the same cabinet [{speaking_code, shelf_code, sector_code, location_code}] (for quick positions)
 *   saveBinderPatch(id, patch, {etag, user, force}) → Promise<{binder, etag}>
 *       patch = only the changed fields among MOBILE_FIELDS; throws DMError 'conflict' {current} when the
 *       stored binder changed since `etag` (unless force), 'not_found', 'forbidden', 'offline'
 *   listChanges({binder_id, limit}) → Promise<ActivityEntry[]>    (activity log entries, newest first)
 *   getCabinetPhoto(binder) → Promise<{url, mark:{x,y}|null, caption}|null>
 */
const MOBILE_FIELDS = ['archive_state', 'contents_items', 'room_code', 'cabinet_code', 'shelf_code', 'sector_code', 'notes', 'tags', 'location_id', 'location_code'];   // v11: + location (association mode, 11b-assoc.js)
const MOBILE_FIELD_IT = {archive_state:'stato', contents_items:'contenuti', room_code:'stanza', cabinet_code:'armadio', shelf_code:'ripiano', sector_code:'settore', notes:'note', tags:'tag', location_code:'posizione', location_id:'ubicazione'};

/** Pure: apply a mobile patch to a binder object (returns a new normalised binder). Shared by local provider and desktop live merge. */
function mobileApplyPatch(b, patch, at){
  const o = Object.assign({}, b);
  MOBILE_FIELDS.forEach(k => { if (patch && Object.prototype.hasOwnProperty.call(patch, k)) o[k] = k === 'contents_items' ? ciCarryIds(b.contents_items, pipeToContents(patch[k])) : patch[k]; });
  const n = normalizeBinder(o);
  n.id = b.id; n.created_at = b.created_at; n.short_code = b.short_code; n.short_url = b.short_url;   // never touched from mobile
  n.updated_at = at || nowISO();
  return n;
}
/** Field diff in the activity-log shape {field:[old, new]} (contents compared as pipe text). */
function mobileDiff(a, b){
  const ch = {};
  MOBILE_FIELDS.concat(['location_code']).forEach(k => {
    const x = k === 'contents_items' ? contentsToPipe(a[k]) : String(a[k] == null ? '' : a[k]);
    const y = k === 'contents_items' ? contentsToPipe(b[k]) : String(b[k] == null ? '' : b[k]);
    if (x !== y) ch[k] = [x, y];
  });
  return ch;
}

class LocalDataProvider {
  constructor(opts){ this.opts = opts || {}; this.photoCache = new Map(); }
  async readState(){
    if (DocMapVault.isActive()){ if (!DocMapVault.isUnlocked()) throw new DMError('unauthorized'); return {raw:null, st:await DocMapVault.loadState()}; }
    let raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch(e){ throw new DMError('storage', 'localStorage'); }
    if (!raw) return {raw:null, st:null};
    try { return {raw, st:JSON.parse(raw)}; } catch(e){ throw new DMError('storage', 'state'); }
  }
  async context(){
    const c = dmConfig();
    if (DocMapVault.isActive()) return {studioName:c.studioName || '', lang:''};   // the state is encrypted: nothing from it before login
    const {st} = await this.readState(); return {studioName:st && st.settings ? st.settings.studioName || '' : c.studioName || '', lang:st && st.lang || ''};
  }
  pack(st, b){
    if (!b) return null;
    const binder = normalizeBinder(b); binder.id = b.id; binder.updated_at = b.updated_at; binder.created_at = b.created_at;
    const siblings = (st.binders || []).filter(x => x.id !== b.id && x.room_code === b.room_code && x.cabinet_code === b.cabinet_code && (x.room_code || x.cabinet_code))
      .map(x => ({speaking_code:x.speaking_code, shelf_code:x.shelf_code || '', sector_code:x.sector_code || '', location_code:x.location_code || computeLocation(x)}));
    return {binder, etag:binder.updated_at, siblings};
  }
  async getBinderByQr(code){ const {st} = await this.readState(); if (!st) return null; return this.pack(st, (st.binders || []).find(b => b.short_code === String(code || '').trim())); }
  async getBinderByCode(code){ const {st} = await this.readState(); if (!st) return null; const c = String(code || '').trim().toUpperCase(); return c ? this.pack(st, (st.binders || []).find(b => String(b.speaking_code || '').toUpperCase() === c)) : null; }
  /** Re-read → check etag → merge only the patched fields → bump updated_at → write state + log entry. */
  async saveBinderPatch(id, patch, o){
    o = o || {};
    const {raw, st} = await this.readState();
    const i = st ? (st.binders || []).findIndex(b => b.id === id) : -1;
    if (i < 0) throw new DMError('not_found');
    const cur = st.binders[i];
    if (!o.force && o.etag && cur.updated_at !== o.etag) throw new DMError('conflict', 'conflict', {current:this.pack(st, cur)});
    const clean = {}; MOBILE_FIELDS.forEach(k => { if (patch && k in patch) clean[k] = patch[k]; });
    let at = nowISO(); if (at <= String(cur.updated_at || '')) at = new Date(Date.parse(cur.updated_at) + 1).toISOString();   // strictly increasing
    const nb = mobileApplyPatch(cur, clean, at);
    const changed = mobileDiff(cur, nb);
    if (!Object.keys(changed).length) return {binder:this.pack(st, cur).binder, etag:cur.updated_at, unchanged:true};
    st.binders[i] = nb;
    st.hasUnexportedChanges = true; st.lastSavedAt = at;
    try { if (DocMapVault.isActive()) await DocMapVault.saveState(st); else { localStorage.setItem(LS_PREV, raw); localStorage.setItem(LS_KEY, JSON.stringify(st)); } }
    catch(e){ throw new DMError('storage', 'quota'); }
    const u = o.user || {};
    const entry = { id:uuid(), at, who:(u.display_name || u.username || 'Mobile'), action:'binder.edit', target:{type:'binder', id:nb.id, code:nb.speaking_code},
      summary:'Modificato da mobile il faldone ' + nb.speaking_code + ': ' + Object.keys(changed).map(k => MOBILE_FIELD_IT[k] || k).join(', '),
      details:{changed, patch:clean, base_updated_at:cur.updated_at, new_updated_at:at, user_id:u.id || '', forced:!!o.force}, source:MOBILE_LOG_SOURCE };
    if (o.log){ if (o.log.action) entry.action = o.log.action; if (o.log.summary) entry.summary = o.log.summary; Object.assign(entry.details, o.log.details || {}); }   // v11: association mode logs binder.locate
    // the desktop picks this up from 'docmap_v26_log_pending' at boot (06e-log.js) or live (mobileLiveMerge below)
    try { if (DocMapVault.isActive()) await DocMapVault.appendLog(entry); else { const p = lsGetJSON('docmap_v26_log_pending', []); (Array.isArray(p) ? p : []).push(entry); lsSetJSON('docmap_v26_log_pending', p); } } catch(e){}
    return {binder:this.pack(st, nb).binder, etag:at, entry};
  }
  async listChanges(q){
    q = q || {};
    let list = DocMapVault.isActive() ? await DocMapVault.loadLog() : lsGetJSON('docmap_v26_log_pending', []); if (!Array.isArray(list)) list = [];
    if (typeof LOG !== 'undefined' && LOG.entries) { const have = new Set(list.map(e => e.id)); list = list.concat(LOG.entries.filter(e => !have.has(e.id))); }
    return list.filter(e => !q.binder_id || (e.target && e.target.id === q.binder_id)).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, q.limit || 20);
  }
  /* Cabinet photo: lives in the desktop SQLite (06b-photos.js, table photos). Read-only, loads sql.js lazily. */
  async getCabinetPhoto(b){
    const key = String(b.room_code || '') + String(b.cabinet_code || '');
    if (!key) return null;
    try {
      const db = await this.openSqlite(); if (!db) return null;
      const st = db.prepare("SELECT id, mime, data, caption, marks_json FROM photos WHERE owner_type = 'cabinet' AND owner_key = ? ORDER BY created_at, id LIMIT 1");
      let row = null; try { st.bind([key]); if (st.step()) row = st.get(); } finally { st.free(); }
      if (!row) return null;
      let marks = {}; try { marks = JSON.parse(row[4] || '{}') || {}; } catch(e){}
      const m = (b.shelf_code && marks[b.shelf_code + (b.sector_code ? '|' + b.sector_code : '')]) || (b.shelf_code && marks[b.shelf_code]) || null;
      let url = this.photoCache.get(row[0]);
      if (!url){ url = URL.createObjectURL(new Blob([row[2]], {type:row[1] || 'image/jpeg'})); this.photoCache.set(row[0], url); }
      return {url, mark:m ? {x:+m.x, y:+m.y} : null, caption:row[3] || ''};
    } catch(e){ console.warn('cabinet photo', e); return null; }
  }
  async openSqlite(){
    if (this._db !== undefined) return this._db;
    this._db = null;
    if (typeof DB !== 'undefined' && DB.ready && DB.db) return (this._db = DB.db);   // desktop page: reuse the live database
    let bytes = await new Promise((res) => {
      try {
        const r = indexedDB.open('docmap_v26_sqlite', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { try { const q = r.result.transaction('kv', 'readonly').objectStore('kv').get('db'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch(e){ res(null); } };
        r.onerror = () => res(null);
      } catch(e){ res(null); }
    });
    if (!bytes) return null;
    if (DocMapVault.isActive()){ if (!bytes.vault || !DocMapVault.isUnlocked()) return null; bytes = await DocMapVault.decryptDb(bytes); }
    if (typeof initSqlJs !== 'function'){
      const src = this.opts.sqlJsSrc || 'vendor/sql-wasm.js';
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('sql.js')); document.head.appendChild(s); });
    }
    const SQL = await initSqlJs({wasmBinary:authUnb64(window.DM_SQL_WASM_B64)});
    return (this._db = new SQL.Database(new Uint8Array(bytes)));
  }
}

/* =====================================================================
   v10.1 — shared online database (server-php/api.php, contract docs/API-CONTRACT.md)
   DMServer: tiny client for the query-routed API  <apiBase>?r=<route>
     - same origin (web app):  header X-DocMap-Token (NOT Authorization: SiteGround's password protection uses it
                               for HTTP Basic auth, and the browser adds those credentials by itself)
     - cross origin (desktop app from file://, opts.simple): POST text/plain with "_token" in the JSON body, so the
                               browser sends a "simple" request without a CORS preflight; optional opts.basic =
                               'user:password' of the folder protection adds Authorization: Basic (then a preflight
                               is needed: see server-php/.htaccess)
   Errors → DMError: 401 unauthorized · 403 forbidden · 404 not_found · 409 conflict · 422 invalid · 429 locked ·
   network → offline · anything else → server.
   ===================================================================== */
function dmServerUrl(base){ try { return new URL(String(base || ''), document.baseURI).href; } catch(e){ return String(base || ''); } }
class DMServer {
  constructor(base, token, opts){ this.base = dmServerUrl(base); this.token = token || ''; this.opts = opts || {}; }
  url(route, q){ const u = new URL(this.base); u.searchParams.set('r', route); Object.keys(q || {}).forEach(k => { if (q[k] != null) u.searchParams.set(k, q[k]); }); return u.href; }
  async call(route, o){
    o = o || {};
    const tok = typeof this.token === 'function' ? this.token() : this.token;
    const h = {'Accept':'application/json'}; let method = o.method || 'GET', body = o.body, q = o.q;
    let ci = null; try { ci = typeof jrClientInfo === 'function' ? jrClientInfo() : null; } catch(e){ ci = null; }   // v11: who is calling (06i-journal.js), for the server journal
    if (this.opts.simple){   // cross-origin desktop: no custom headers → no preflight
      method = 'POST'; body = Object.assign({}, body || {}, q || {}, tok ? {_token:tok} : {}, ci ? {_device:ci} : {}); q = null;
      h['Content-Type'] = 'text/plain;charset=UTF-8'; delete h.Accept;
      if (this.opts.basic){ h.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(this.opts.basic))); }
    } else {
      if (ci){ h['X-DocMap-Device'] = ci.id; h['X-DocMap-Device-Name'] = encodeURIComponent(ci.name); h['X-DocMap-App'] = ci.app; }
      if (tok) h['X-DocMap-Token'] = tok;
      if (body !== undefined) h['Content-Type'] = 'application/json';
    }
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const tm = ac ? setTimeout(() => ac.abort(), o.timeout || 30000) : 0;
    let r;
    try { r = await fetch(this.url(route, q), {method, headers:h, body:body === undefined ? undefined : JSON.stringify(body), cache:'no-store', credentials:this.opts.simple ? 'omit' : 'same-origin', signal:ac ? ac.signal : undefined}); }
    catch(e){ throw new DMError('offline', 'network'); }
    finally { clearTimeout(tm); }
    let j = {}; try { j = await r.json(); } catch(e){ j = {}; }
    if (r.ok){ if (j && j.journal_id) this.lastJournalId = j.journal_id; return j; }   // v11: server journal entry of this call
    const code = {400:'invalid', 401:'unauthorized', 403:'forbidden', 404:'not_found', 409:'conflict', 412:'conflict', 413:'invalid', 422:'invalid', 429:'locked'}[r.status] || 'server';
    const er = j.error || {};
    throw new DMError(code, er.message || ('HTTP ' + r.status), Object.assign({}, er, {status:r.status, server_code:er.code || '', retry_in:+(r.headers.get('Retry-After') || er.retry_in || 0)}, j.current ? {current:j.current, current_etag:j.current_etag} : {}));
  }
}

/** DataProvider on the shared online database (web + apiBase, or mode 'remote'). Used by scan.html. */
class RemoteDataProvider {
  constructor(cfg, tokenFn){ this.cfg = cfg; this.srv = new DMServer(cfg.apiBase, tokenFn); this.last = new Map(); }
  norm(raw){ const b = normalizeBinder(Object.assign({}, raw)); b.id = raw.id; b.updated_at = raw.updated_at; if (raw.created_at) b.created_at = raw.created_at; return b; }
  async context(){ return {studioName:this.cfg.studioName || '', lang:''}; }
  async get(q){
    try { const r = await this.srv.call('binder', {q}); const binder = this.norm(r.binder); this.last.set(binder.id, binder); return {binder, etag:r.etag || binder.updated_at, siblings:r.siblings || []}; }
    catch(e){ if (e.code === 'not_found') return null; throw e; }
  }
  getBinderByQr(c){ return this.get({qr:String(c || '').trim()}); }
  getBinderByCode(c){ return this.get({code:String(c || '').trim().toUpperCase()}); }
  /** POST ?r=patch {id, patch, base_updated_at, force, log}: 409 → DMError 'conflict' {current:{binder, etag, siblings}} */
  async saveBinderPatch(id, patch, o){
    o = o || {};
    const clean = {}; MOBILE_FIELDS.forEach(k => { if (patch && k in patch) clean[k] = patch[k]; });
    const base = this.last.get(id), u = o.user || {};
    const changed = base ? mobileDiff(base, mobileApplyPatch(base, clean, base.updated_at)) : {};
    const who = u.display_name || u.username || 'Mobile';
    const log = {id:uuid(), who, action:'binder.edit', target:{type:'binder', id, code:base ? base.speaking_code : ''}, source:MOBILE_LOG_SOURCE,
      summary:'Modificato da mobile il faldone ' + (base ? base.speaking_code : '') + ': ' + Object.keys(changed).map(k => MOBILE_FIELD_IT[k] || k).join(', '),
      details:{changed, patch:clean, user_id:u.id || ''}};
    if (o.log){ if (o.log.action) log.action = o.log.action; if (o.log.summary) log.summary = o.log.summary; Object.assign(log.details, o.log.details || {}); }   // v11: association mode logs binder.locate
    try {
      const r = await this.srv.call('patch', {method:'POST', body:{id, patch:clean, base_updated_at:o.etag || '', force:!!o.force, log, operator:who}});
      const binder = this.norm(r.binder); this.last.set(id, binder);
      return {binder, etag:r.etag || binder.updated_at, entry:log};
    } catch(e){
      if (e.code === 'conflict' && e.data && e.data.current){ const cur = this.norm(e.data.current); this.last.set(id, cur); e.data = {current:{binder:cur, etag:e.data.current_etag || cur.updated_at, siblings:[]}}; }
      throw e;
    }
  }
  async listChanges(){ return []; }        // the activity log arrives with the desktop/web sync (pull)
  async getCabinetPhoto(){ return null; }  // photos stay in each desktop SQLite for now (docs/SICUREZZA.md §4)
}

/** Device set-up in web + apiBase mode (lock screen and scan.html): check the server token, create the local
    device user (it encrypts this device's cache), store the token in the vault. */
async function srvSetupDevice(o){
  const cfg = dmConfig(), tok = String(o.token || '').trim();
  if (!tok) throw new DMError('invalid', 'token');
  let me;
  try { me = await new DMServer(cfg.apiBase, tok).call('me'); }
  catch(e){ if (e.code === 'unauthorized' || e.code === 'forbidden') throw new DMError('unauthorized', 'server_token', e.data); throw e; }
  const A = dmProviders().auth;
  await A.setupFirstAdmin({username:o.username, display_name:o.display_name || me.user, secret:o.secret});
  await DocMapVault.srvSet({token:tok, user:me.user, role:me.role});
  A._u = undefined; A.emit();
  return me;
}
/** Replace the server token of an unlocked device (Sincronizzazione › Server online). */
async function srvSetToken(tok){
  const cfg = dmConfig(); tok = String(tok || '').trim();
  const me = await new DMServer(cfg.apiBase, tok).call('me');
  await DocMapVault.srvSet({token:tok, user:me.user, role:me.role});
  return me;
}

/* =====================================================================
   CryptoProvider — AES-256-GCM, envelope encryption
   Envelope (JSON-safe, stored next to the ciphertext):
     {v:1, alg:'A256GCM', kid, iv:b64(12), wrapped_dek:b64(AES-KW), kw:'A256KW'}
   - one random DEK per record/blob (extractable only so it can be wrapped, never stored in clear)
   - the KEK ("workspace key") wraps DEKs; locally it is a NON-extractable CryptoKey kept in IndexedDB,
     on the server it becomes a per-tenant key in a KMS/HSM (docs/SICUREZZA.md §4)
   ===================================================================== */
/**
 * @interface CryptoProvider
 *   available() → Promise<boolean>
 *   encrypt(bytes:Uint8Array, aad?:string) → Promise<{envelope, ciphertext:Uint8Array}>
 *   decrypt(envelope, ciphertext, aad?) → Promise<Uint8Array>
 *   sha256(bytes) → Promise<string hex>
 */
function idbReq(name, stores){
  return new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new DMError('storage', 'IndexedDB'));
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => stores.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idbDo(db, store, mode, fn){
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode), os = tx.objectStore(store); let out;
    const q = fn(os); if (q) q.onsuccess = () => { out = q.result; };
    tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
class LocalCryptoProvider {
  constructor(){ this._kek = null; }
  async available(){ try { return authHasSubtle() && !!(await this.kek()); } catch(e){ return false; } }
  async kek(){
    if (this._kek) return this._kek;
    const db = await idbReq(KEY_IDB, ['keys']);
    let rec = await idbDo(db, 'keys', 'readonly', os => os.get('workspace'));
    if (!rec || !rec.key){
      const key = await crypto.subtle.generateKey({name:'AES-KW', length:256}, false, ['wrapKey', 'unwrapKey']);   // non-extractable
      rec = {kid:'local-' + authHex(authRand(6)), key, created_at:nowISO()};
      await idbDo(db, 'keys', 'readwrite', os => os.put(rec, 'workspace'));
      rec = await idbDo(db, 'keys', 'readonly', os => os.get('workspace')) || rec;   // re-read: another tab may have won the race
    }
    db.close();
    return (this._kek = rec);
  }
  async encrypt(bytes, aad){
    const k = await this.kek();
    const dek = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt', 'decrypt']);
    const iv = authRand(12);
    const p = {name:'AES-GCM', iv}; if (aad) p.additionalData = new TextEncoder().encode(aad);
    const ct = new Uint8Array(await crypto.subtle.encrypt(p, dek, bytes));
    const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, k.key, 'AES-KW'));
    return {envelope:{v:1, alg:'A256GCM', kw:'A256KW', kid:k.kid, iv:authB64(iv), wrapped_dek:authB64(wrapped)}, ciphertext:ct};
  }
  async decrypt(env, ct, aad){
    const k = await this.kek();
    if (!env || env.kid !== k.kid) throw new DMError('invalid', 'key id');
    const dek = await crypto.subtle.unwrapKey('raw', authUnb64(env.wrapped_dek), k.key, 'AES-KW', {name:'AES-GCM', length:256}, false, ['decrypt']);
    const p = {name:'AES-GCM', iv:authUnb64(env.iv)}; if (aad) p.additionalData = new TextEncoder().encode(aad);
    return new Uint8Array(await crypto.subtle.decrypt(p, dek, ct));
  }
  async sha256(bytes){ return authHex(await crypto.subtle.digest('SHA-256', bytes)); }
}

/* =====================================================================
   BlobStore — attachments (photos, PDFs, documents) as encrypted blobs, never as loose files
   Policy BLOB_POLICY: an OPTIMISED WORKING COPY for technical/functional maintenance, not a long-term archive:
     images → decoded, orientation fixed, long edge ≤ 1400 px, re-encoded JPEG q 0.8 (EXIF/GPS dropped);
     PDFs → stored as-is, refused above 15 MB; other types → refused above 10 MB.
   Meta record: {id, owner_type, owner_key, name, content_type, size, orig_size, sha256 (of the optimised
   plaintext), encrypted, envelope, policy:'working-copy', created_at}
   ===================================================================== */
/**
 * @interface BlobStore
 *   putBlob(input:Blob|File|Uint8Array, {owner_type, owner_key, name, content_type, optimise=true}) → Promise<BlobMeta>
 *   getBlob(id) → Promise<{meta, blob:Blob}|null>      (decrypted)
 *   deleteBlob(id) → Promise<void>
 *   listBlobs({owner_type, owner_key}) → Promise<BlobMeta[]>
 */
async function blobOptimise(input, ct){
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer());
  ct = ct || input.type || 'application/octet-stream';
  if (/^image\/(jpeg|png|webp|gif|bmp)$/.test(ct) && typeof createImageBitmap === 'function'){
    try {
      const src = await createImageBitmap(new Blob([bytes], {type:ct}), {imageOrientation:'from-image'});
      const k = Math.min(1, BLOB_POLICY.imageMaxPx / Math.max(src.width, src.height));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(src.width * k)); cv.height = Math.max(1, Math.round(src.height * k));
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(src, 0, 0, cv.width, cv.height); if (src.close) src.close();
      const out = await new Promise(res => cv.toBlob(res, BLOB_POLICY.imageType, BLOB_POLICY.imageQuality));
      return {bytes:new Uint8Array(await out.arrayBuffer()), content_type:BLOB_POLICY.imageType, orig_size:bytes.length};
    } catch(e){ /* undecodable image: fall through and keep it as-is within the size cap */ }
  }
  const cap = ct === 'application/pdf' ? BLOB_POLICY.pdfMaxBytes : BLOB_POLICY.otherMaxBytes;
  if (bytes.length > cap) throw new DMError('invalid', 'too_large', {max:cap, size:bytes.length});
  return {bytes, content_type:ct, orig_size:bytes.length};
}
class LocalBlobStore {
  constructor(cryptoProvider){ this.crypto = cryptoProvider; }
  db(){ return idbReq(BLOB_IDB, ['meta', 'data']); }
  async putBlob(input, o){
    o = o || {};
    const opt = o.optimise === false ? {bytes:input instanceof Uint8Array ? input : new Uint8Array(await input.arrayBuffer()), content_type:o.content_type || input.type || 'application/octet-stream'} : await blobOptimise(input, o.content_type);
    const id = uuid();
    const meta = {id, owner_type:String(o.owner_type || ''), owner_key:String(o.owner_key || ''), name:String(o.name || input.name || ''), content_type:opt.content_type,
      size:opt.bytes.length, orig_size:opt.orig_size || opt.bytes.length, sha256:'', encrypted:false, envelope:null, policy:BLOB_POLICY.purpose, created_at:nowISO()};
    meta.sha256 = await this.crypto.sha256(opt.bytes);
    let stored = opt.bytes;
    if (await this.crypto.available()){ const e = await this.crypto.encrypt(opt.bytes, id); stored = e.ciphertext; meta.encrypted = true; meta.envelope = e.envelope; }
    else console.warn('BlobStore: WebCrypto unavailable, blob stored unencrypted');
    const db = await this.db();
    try {
      await idbDo(db, 'data', 'readwrite', os => os.put(stored, id));
      await idbDo(db, 'meta', 'readwrite', os => os.put(meta, id));
    } finally { db.close(); }
    return meta;
  }
  async rawBlob(id){ const db = await this.db(); try { return await idbDo(db, 'data', 'readonly', os => os.get(id)); } finally { db.close(); } }
  async getBlob(id){
    const db = await this.db(); let meta, data;
    try { meta = await idbDo(db, 'meta', 'readonly', os => os.get(id)); data = await idbDo(db, 'data', 'readonly', os => os.get(id)); } finally { db.close(); }
    if (!meta || !data) return null;
    const plain = meta.encrypted ? await this.crypto.decrypt(meta.envelope, data, id) : data;   // id is the AAD: a blob cannot be swapped for another
    if (await this.crypto.sha256(plain) !== meta.sha256) throw new DMError('invalid', 'integrity');
    return {meta, blob:new Blob([plain], {type:meta.content_type})};
  }
  async deleteBlob(id){ const db = await this.db(); try { await idbDo(db, 'data', 'readwrite', os => os.delete(id)); await idbDo(db, 'meta', 'readwrite', os => os.delete(id)); } finally { db.close(); } }
  async listBlobs(q){
    q = q || {};
    const db = await this.db(); let all;
    try { all = await idbDo(db, 'meta', 'readonly', os => os.getAll()); } finally { db.close(); }
    return (all || []).filter(m => (!q.owner_type || m.owner_type === q.owner_type) && (!q.owner_key || m.owner_key === q.owner_key));
  }
}

/* =====================================================================
   Factory
   window.DOCMAP_CONFIG = { mode:'local' | 'web' | 'remote', apiBase:'server-php/api.php' (relative to the app) | 'https://…', sqlJsSrc:'vendor/sql-wasm.js' }
   ===================================================================== */
let DM_PROVIDERS = null;
function dmProviders(cfg){
  if (DM_PROVIDERS && !cfg) return DM_PROVIDERS;
  cfg = Object.assign(dmConfig(), cfg || {});
  const crypto_ = new LocalCryptoProvider();
  let auth, data;
  if (cfg.apiBase && /^[a-z][a-z0-9+.-]*:/i.test(cfg.apiBase) && !/^https:\/\//i.test(cfg.apiBase) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(cfg.apiBase))
    throw new DMError('config', 'DOCMAP_CONFIG.apiBase must be https:// or a path on this site');
  if (cfg.mode === 'web' && cfg.apiBase){   // v10.1: shared online database; login = unlocking this device's vault (holds the token)
    auth = new LocalAuthProvider(cfg); data = new RemoteDataProvider(cfg, () => DocMapVault.srvToken());
  } else if (cfg.mode === 'remote'){       // future: central login (OIDC) issuing the token
    auth = new RemoteAuthProvider(cfg); data = new RemoteDataProvider(cfg, () => auth.getToken());
  } else { auth = new LocalAuthProvider(cfg); data = new LocalDataProvider(cfg); }
  DM_PROVIDERS = {mode:cfg.mode, server:!!(cfg.apiBase && cfg.mode !== 'local'), cfg, auth, data, crypto:crypto_, blobs:new LocalBlobStore(crypto_)};
  return DM_PROVIDERS;
}

/* =====================================================================
   Desktop integration (index.html only): Impostazioni › Utenti e accesso, "Anteprima mobile",
   live merge of mobile edits, help topic `mobile`. Everything below is inert on scan.html.
   ===================================================================== */
Object.assign(I18N.it, {
  au_h:'Utenti e accesso (pagina mobile)', au_p:'Chi scansiona il QR di un faldone con il telefono vede la scheda solo dopo il login. Qui crei gli utenti e il loro PIN. Il programma sul PC continua a funzionare senza login.',
  au_none:'Nessun utente: la pagina mobile non mostra nessun dato finché non ne crei almeno uno.', au_add:'Aggiungi utente', au_user:'Nome utente', au_user_ph:'es. davide', au_name:'Nome visualizzato', au_name_ph:'es. Davide',
  au_role:'Ruolo', au_role_viewer:'Solo lettura', au_role_editor:'Può modificare', au_role_admin:'Amministratore', au_secret:'PIN o password', au_secret2:'Ripeti PIN o password',
  au_secret_hint:'Almeno 4 caratteri; meglio 6 o più. Viene salvato solo come impronta PBKDF2 (mai in chiaro).', au_new_t:'Nuovo utente', au_edit_t:'Utente {u}',
  au_pin_new:'Nuovo PIN o password', au_pin_keep:'Lascia vuoto per non cambiarlo', au_disabled:'Disattivato', au_last:'Ultimo accesso', au_never:'mai',
  au_e_user:'Nome utente: 2-40 caratteri tra lettere, numeri e . _ - @', au_e_dup:'Esiste già un utente con questo nome.', au_e_secret:'Il PIN deve avere almeno 4 caratteri.', au_e_match:'I due PIN non coincidono.',
  au_saved:'Utente salvato', au_deleted:'Utente eliminato', au_del_d:'L\'utente {u} non potrà più entrare nella pagina mobile.', au_session:'Durata del login sul telefono (minuti)',
  au_open:'Apri la pagina mobile', au_local_note:'Gli utenti restano solo in questo browser: non finiscono nei backup, nei CSV né nel file .sqlite. Protezione di base, non un sistema di sicurezza: vedi docs/SICUREZZA.md.',
  au_nocrypto:'Questo browser non permette la cifratura (WebCrypto): impossibile creare utenti.',
  mob_preview:'Anteprima mobile', mob_preview_d:'Apre la pagina che si vede sul telefono dopo aver scansionato il QR',
  mob_merged:'Modifica dal telefono applicata: {c}', lg_src_mobile:'mobile',
  'lga_settings.user_add':'Utente aggiunto', 'lga_settings.user_edit':'Utente modificato', 'lga_settings.user_delete':'Utente eliminato'
});
Object.assign(I18N.en, {
  au_h:'Users & access (mobile page)', au_p:'Whoever scans a binder QR with a phone sees the binder only after logging in. Create the users and their PIN here. The PC app keeps working without login.',
  au_none:'No users yet: the mobile page shows no data until you create at least one.', au_add:'Add user', au_user:'Username', au_user_ph:'e.g. david', au_name:'Display name', au_name_ph:'e.g. David',
  au_role:'Role', au_role_viewer:'Read only', au_role_editor:'Can edit', au_role_admin:'Administrator', au_secret:'PIN or password', au_secret2:'Repeat PIN or password',
  au_secret_hint:'At least 4 characters; 6 or more is better. Only a PBKDF2 hash is stored (never the PIN itself).', au_new_t:'New user', au_edit_t:'User {u}',
  au_pin_new:'New PIN or password', au_pin_keep:'Leave empty to keep it', au_disabled:'Disabled', au_last:'Last login', au_never:'never',
  au_e_user:'Username: 2-40 characters among letters, digits and . _ - @', au_e_dup:'A user with this name already exists.', au_e_secret:'The PIN needs at least 4 characters.', au_e_match:'The two PINs do not match.',
  au_saved:'User saved', au_deleted:'User deleted', au_del_d:'User {u} will no longer be able to open the mobile page.', au_session:'Phone login duration (minutes)',
  au_open:'Open the mobile page', au_local_note:'Users are kept only in this browser: they are not in backups, CSV files or the .sqlite file. Basic protection, not a security system: see docs/SICUREZZA.md.',
  au_nocrypto:'This browser does not allow encryption (WebCrypto): users cannot be created.',
  mob_preview:'Mobile preview', mob_preview_d:'Opens the page shown on a phone after scanning the QR',
  mob_merged:'Change from the phone applied: {c}', lg_src_mobile:'mobile',
  'lga_settings.user_add':'User added', 'lga_settings.user_edit':'User edited', 'lga_settings.user_delete':'User deleted'
});

function mobPreviewUrl(b){ return 'scan.html?code=' + encodeURIComponent(b.speaking_code || '') + '&qr=' + encodeURIComponent(b.short_code || ''); }
function mobPreviewBtnHTML(b, cls){ return '<button type="button" class="' + (cls || 'btn btn-sm') + '" data-a="mob-preview" data-id="' + esc(b.id) + '" title="' + esc(t('mob_preview_d')) + '">' + (typeof ic === 'function' ? ic('eye') : '') + esc(t('mob_preview')) + '</button>'; }

function authSettingsHTML(){
  const A = dmProviders().auth; if (!A.listUsers) return '';
  const users = A.listUsers(), pol = A.store().policy, web = DocMapVault.isActive(), me = A.currentUser();
  if (web && !(me && me.role === 'admin')) return '<div class="card card-p stack au-card" id="au-card" style="margin-top:16px"><h2 style="margin:0">' + ic('users') + ' ' + esc(t('au_h')) + '</h2><div class="small muted">' + esc(t('vl_admin_only')) + '</div>' +
    '<div><button class="btn btn-sm" data-a="vl-lock">' + ic('x') + esc(t('vl_lock_t')) + '</button></div></div>';
  const roleTxt = (r) => t('au_role_' + r);
  return '<div class="card card-p stack au-card" id="au-card" style="margin-top:16px"><div class="row between"><h2 style="margin:0">' + ic('users') + ' ' + esc(t('au_h')) + helpDot('mobile') + '</h2>' +
      '<div class="row"><a class="btn btn-sm" href="scan.html" target="_blank" rel="noopener">' + ic('eye') + esc(t('au_open')) + '</a><button class="btn btn-sm btn-primary" data-a="au-add">' + ic('plus') + esc(t('au_add')) + '</button></div></div>' +
    '<div class="small muted">' + esc(t('au_p')) + '</div>' +
    (users.length ? '<div class="tbl-wrap"><table class="tbl au-tbl"><thead><tr><th>' + esc(t('au_user')) + '</th><th>' + esc(t('au_name')) + '</th><th>' + esc(t('au_role')) + '</th><th>' + esc(t('au_last')) + '</th><th></th></tr></thead><tbody>' +
      users.map(u => '<tr data-uid="' + esc(u.id) + '"><td class="mono">' + esc(u.username) + (u.disabled ? ' <span class="badge">' + esc(t('au_disabled')) + '</span>' : '') + '</td><td>' + esc(u.display_name) + '</td><td>' + esc(roleTxt(u.role)) + '</td><td class="small">' + esc(u.last_login_at ? fmtDate(u.last_login_at, true) : t('au_never')) + '</td>' +
        '<td class="acts"><button class="icon-btn" data-a="au-edit" data-id="' + esc(u.id) + '" title="' + esc(t('act_edit')) + '">' + ic('pencil') + '</button><button class="icon-btn danger" data-a="au-del" data-id="' + esc(u.id) + '" title="' + esc(t('delete')) + '">' + ic('trash') + '</button></td></tr>').join('') + '</tbody></table></div>'
      : '<div class="warn-box">' + ic('alert') + '<div>' + esc(t('au_none')) + '</div></div>') +
    '<div class="field" style="max-width:260px"><label for="au-session">' + esc(t('au_session')) + '</label><input class="inp" id="au-session" type="number" min="5" max="10080" step="5" value="' + esc(pol.sessionMinutes) + '" data-au-session></div>' +
    (web ? '<div><button class="btn btn-sm" data-a="vl-lock">' + ic('x') + esc(t('vl_lock_t')) + '</button></div><div class="tiny muted">' + esc(t('vl_web_note')) + '</div>' : '<div class="tiny muted">' + esc(t('au_local_note')) + '</div>') + '</div>';
}
function authUserForm(u){
  const roles = AUTH_ROLES.map(r => '<option value="' + r + '"' + ((u ? u.role : 'editor') === r ? ' selected' : '') + '>' + esc(t('au_role_' + r)) + '</option>').join('');
  return '<div class="stack">' +
    '<div class="field"><label for="au-f-user">' + esc(t('au_user')) + '</label><input class="inp mono" id="au-f-user" autocomplete="off" value="' + esc(u ? u.username : '') + '" placeholder="' + esc(t('au_user_ph')) + '"' + (u ? ' disabled' : '') + '></div>' +
    '<div class="field"><label for="au-f-name">' + esc(t('au_name')) + '</label><input class="inp" id="au-f-name" autocomplete="off" value="' + esc(u ? u.display_name : '') + '" placeholder="' + esc(t('au_name_ph')) + '"></div>' +
    '<div class="field"><label for="au-f-role">' + esc(t('au_role')) + '</label><select class="inp" id="au-f-role">' + roles + '</select></div>' +
    '<div class="grid g2"><div class="field"><label for="au-f-pin">' + esc(u ? t('au_pin_new') : t('au_secret')) + '</label><input class="inp mono" id="au-f-pin" type="password" autocomplete="new-password"' + (u ? ' placeholder="' + esc(t('au_pin_keep')) + '"' : '') + '></div>' +
      '<div class="field"><label for="au-f-pin2">' + esc(t('au_secret2')) + '</label><input class="inp mono" id="au-f-pin2" type="password" autocomplete="new-password"></div></div>' +
    (u ? '<label class="chk"><input type="checkbox" id="au-f-dis"' + (u.disabled ? ' checked' : '') + '>' + esc(t('au_disabled')) + '</label>' : '') +
    '<div class="hint">' + esc(t('au_secret_hint')) + '</div><div class="err-t" id="au-f-err" aria-live="polite"></div></div>';
}
function authOpenUser(id){
  if (!authHasSubtle()){ toast(t('au_nocrypto'), 'err', 7000); return; }
  const A = dmProviders().auth, u = id ? A.listUsers().find(x => x.id === id) : null;
  openModal({ title:u ? t('au_edit_t', {u:u.username}) : t('au_new_t'), body:authUserForm(u),
    buttons:[{label:t('cancel'), cls:'btn', action:'modal-close'}, {label:t('save'), cls:'btn btn-primary', icon:'save', fn:async () => {
      const v = (s) => ($(s) || {}).value || '', err = (k) => { $('#au-f-err').textContent = t(k); };
      const pin = v('#au-f-pin'), pin2 = v('#au-f-pin2');
      if ((!u || pin) && authNormSecret(pin).length < AUTH_MIN_SECRET) return err('au_e_secret');
      if (pin !== pin2) return err('au_e_match');
      const btn = $('.modal-f .btn-primary', topModal()); if (btn) btn.disabled = true;
      try {
        if (u){
          await A.updateUser(u.id, {display_name:v('#au-f-name'), role:v('#au-f-role'), disabled:!!($('#au-f-dis') || {}).checked, secret:pin || undefined});
          logAct('settings.user_edit', {type:'user', id:u.id, code:u.username}, 'Modificato l\'utente ' + u.username + (pin ? ' (nuovo PIN)' : ''), {role:v('#au-f-role')});
        } else {
          const nu = await A.addUser({username:v('#au-f-user'), display_name:v('#au-f-name'), role:v('#au-f-role'), secret:pin});
          logAct('settings.user_add', {type:'user', id:nu.id, code:nu.username}, 'Aggiunto l\'utente ' + nu.username + ' (' + nu.role + ')', {role:nu.role});
        }
      } catch(e){ if (btn) btn.disabled = false; return err(e.message === 'duplicate' ? 'au_e_dup' : e.message === 'username' ? 'au_e_user' : e.message === 'secret' ? 'au_e_secret' : e.message === 'last_admin' ? 'vl_e_last' : 'au_nocrypto'); }
      closeModal(true); toast(t('au_saved')); renderView();
    }}] });
}
const AUTH_ACTIONS = {
  'au-add': () => authOpenUser(null),
  'au-edit': (el) => authOpenUser(el.dataset.id),
  'au-del': (el) => {
    const A = dmProviders().auth, u = A.listUsers().find(x => x.id === el.dataset.id); if (!u) return;
    confirmAction({ danger:true, plain:true, okLabel:t('delete'), detail:t('au_del_d', {u:u.username}), onOk:() => {
      try { A.removeUser(u.id); } catch(e){ toast(t('vl_e_last'), 'err', 7000); return; }
      logAct('settings.user_delete', {type:'user', id:u.id, code:u.username}, 'Eliminato l\'utente ' + u.username, {}); toast(t('au_deleted')); renderView(); } });
  },
  'vl-lock': () => vaultLockNow(),
  'mob-preview': (el) => { const b = S.binders.find(x => x.id === el.dataset.id); if (b) window.open(mobPreviewUrl(b), '_blank', 'noopener'); }
};

/* ---------------- Web mode: lock screen before the desktop app boots ---------------- */
Object.assign(I18N.it, {
  vl_h:'Accedi a DocMap', vl_p:'I dati di questo archivio sono cifrati in questo browser. Accedi per sbloccarli.',
  vl_setup_h:'Primo accesso su questo dispositivo', vl_setup_p:'Crea l\'amministratore di questo browser. Il PIN o la password cifra i dati salvati qui: se lo perdi, i dati di questo dispositivo non si possono recuperare (reimportali dal pacchetto di sincronizzazione).',
  vl_create:'Crea e accedi', vl_orphan_h:'Dati cifrati senza utenti', vl_orphan_p:'In questo browser ci sono dati cifrati ma nessun utente che possa aprirli. Puoi solo azzerarli e reimportare i dati.',
  vl_reset:'Azzera i dati di questo browser', vl_reset_sure:'Tocca di nuovo per confermare: i dati cifrati di questo browser verranno cancellati.',
  vl_lock:'Esci', vl_lock_t:'Esci e blocca i dati di questo browser', vl_web_note:'Versione web: i dati restano cifrati in questo browser, il server contiene solo il programma.',
  vl_admin_only:'Solo un amministratore può gestire gli utenti.', vl_enter:'Entra', vl_checking:'Verifica…', vl_bad:'Nome utente o PIN non corretti.', vl_locked:'Troppi tentativi: riprova tra {s} secondi.', vl_err:'Errore: {m}', vl_e_last:'Deve restare almeno un amministratore attivo: senza, i dati cifrati non si potrebbero più aprire.',
  vl_token:'Codice di accesso al server', vl_token_hint:'Il codice (token) che ti ha dato l\'amministratore: si inserisce una volta sola su questo dispositivo e resta cifrato qui.',
  vl_setup_srv_p:'Crea l\'utente di questo dispositivo e inserisci il tuo codice di accesso: i dati arrivano dal database online dello studio. Il PIN protegge la copia cifrata salvata su questo dispositivo.',
  vl_e_token:'Codice di accesso non valido o revocato.', vl_e_offline:'Server non raggiungibile: controlla la connessione e riprova.', vl_srv_note:'Versione online: i dati sono nel database condiviso dello studio (cifrato) e, cifrati, in questo browser.'
});
Object.assign(I18N.en, {
  vl_h:'Sign in to DocMap', vl_p:'This archive\'s data is encrypted in this browser. Sign in to unlock it.',
  vl_setup_h:'First sign-in on this device', vl_setup_p:'Create this browser\'s administrator. The PIN or password encrypts the data stored here: if you lose it, this device\'s data cannot be recovered (import it again from the sync package).',
  vl_create:'Create and sign in', vl_orphan_h:'Encrypted data without users', vl_orphan_p:'This browser holds encrypted data but no user can open it. You can only clear it and import the data again.',
  vl_reset:'Clear this browser\'s data', vl_reset_sure:'Tap again to confirm: this browser\'s encrypted data will be erased.',
  vl_lock:'Sign out', vl_lock_t:'Sign out and lock this browser\'s data', vl_web_note:'Web version: data stays encrypted in this browser, the server only holds the program.',
  vl_admin_only:'Only an administrator can manage users.', vl_enter:'Sign in', vl_checking:'Checking…', vl_bad:'Wrong username or PIN.', vl_locked:'Too many attempts: try again in {s} seconds.', vl_err:'Error: {m}', vl_e_last:'At least one active administrator must remain: without one the encrypted data could no longer be opened.',
  vl_token:'Server access code', vl_token_hint:'The code (token) your administrator gave you: entered once on this device and kept encrypted here.',
  vl_setup_srv_p:'Create this device\'s user and enter your access code: the data comes from the studio\'s online database. The PIN protects the encrypted copy kept on this device.',
  vl_e_token:'Access code not valid or revoked.', vl_e_offline:'Server unreachable: check the connection and try again.', vl_srv_note:'Online version: the data lives in the studio\'s shared (encrypted) database and, encrypted, in this browser.'
});
const VL = { busy:false, err:'', reset:false };
async function vaultGate(boot){
  const A = dmProviders().auth;
  let lang = 'it'; try { lang = localStorage.getItem('docmap_v26_scan_lang') || ((navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en'); } catch(e){}
  if (!S) { S = {lang, settings:{}}; window.S = S; }   // temporary: only t() reads it until boot replaces S
  const run = async () => {
    try { const l = await DocMapVault.loadLog(); LOG.pending = l.filter(logValid).map(logNorm); LOG.entries = LOG.pending.slice(); } catch(e){}
    const el = document.getElementById('vault-lock'); if (el) el.remove();
    document.documentElement.classList.remove('vl-locked');
    S = null; window.S = null;
    boot();
    vaultAfterBoot();
    if (typeof srvBoot === 'function') srvBoot();   // v10.1: pull from / push to the shared online database
  };
  if (await DocMapVault.resume()){ if (A.currentUser()) return run(); await DocMapVault.lock(); }
  document.documentElement.classList.add('vl-locked');
  VL.run = run;
  vaultLockRender();
}
function vaultLockRender(){
  const A = dmProviders().auth, c = dmConfig(), users = A.store().users.filter(u => !u.disabled);
  const mode = users.length ? 'login' : DocMapVault.hasData() ? 'orphan' : 'setup';
  let el = document.getElementById('vault-lock');
  if (!el){ el = document.createElement('div'); el.id = 'vault-lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
  let last = ''; try { last = localStorage.getItem('docmap_v26_scan_user') || ''; } catch(e){}
  const pinF = (id, lbl, ac) => '<div class="field"><label for="' + id + '">' + esc(t(lbl)) + '</label><input class="inp mono" id="' + id + '" type="password" autocomplete="' + ac + '"></div>';
  el.innerHTML = '<form class="vl-card" data-vl="' + mode + '" novalidate><div class="vl-brand"><span class="vl-mark">DM</span><div><b>DocMap</b>' + (c.studioName ? '<span>' + esc(c.studioName) + '</span>' : '') + '</div>' +
      '<div class="vl-lang"><button type="button" data-vl-lang="it" class="' + (S.lang === 'it' ? 'on' : '') + '">IT</button><button type="button" data-vl-lang="en" class="' + (S.lang === 'en' ? 'on' : '') + '">EN</button></div></div>' +
    (mode === 'login' ? '<h1>' + esc(t('vl_h')) + '</h1><p>' + esc(t('vl_p')) + '</p>' +
        '<div class="field"><label for="vl-user">' + esc(t('au_user')) + '</label><input class="inp" id="vl-user" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(last) + '"></div>' + pinF('vl-pin', 'au_secret', 'current-password')
      : mode === 'setup' ? '<h1>' + esc(t('vl_setup_h')) + '</h1><p>' + esc(t(c.apiBase ? 'vl_setup_srv_p' : 'vl_setup_p')) + '</p>' +
        '<div class="field"><label for="vl-user">' + esc(t('au_user')) + '</label><input class="inp" id="vl-user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="' + esc(t('au_user_ph')) + '"></div>' +
        '<div class="field"><label for="vl-name">' + esc(t('au_name')) + '</label><input class="inp" id="vl-name" placeholder="' + esc(t('au_name_ph')) + '"></div>' + pinF('vl-pin', 'au_secret', 'new-password') + pinF('vl-pin2', 'au_secret2', 'new-password') + '<div class="hint">' + esc(t('au_secret_hint')) + '</div>' +
        (c.apiBase ? '<div class="field"><label for="vl-token">' + esc(t('vl_token')) + '</label><input class="inp mono" id="vl-token" type="password" autocomplete="off" spellcheck="false"></div><div class="hint">' + esc(t('vl_token_hint')) + '</div>' : '')
      : '<h1>' + esc(t('vl_orphan_h')) + '</h1><p>' + esc(t('vl_orphan_p')) + '</p>') +
    '<div class="err-t" id="vl-err" role="alert">' + esc(VL.err) + '</div>' +
    (mode === 'orphan' ? '<button type="button" class="btn btn-danger" data-vl-reset>' + esc(VL.reset ? t('vl_reset_sure') : t('vl_reset')) + '</button>'
      : '<button type="submit" class="btn btn-primary btn-lg" id="vl-go"' + (VL.busy ? ' disabled' : '') + '>' + esc(VL.busy ? t('vl_checking') : mode === 'setup' ? t('vl_create') : t('vl_enter')) + '</button>') +
    '<div class="tiny muted">' + esc(t(c.apiBase ? 'vl_srv_note' : 'vl_web_note')) + '</div></form>';
  const f = el.querySelector('#vl-user'), pn = el.querySelector('#vl-pin');
  setTimeout(() => { const x = f && !f.value ? f : pn; if (x) x.focus(); }, 30);
}
async function vaultLockSubmit(form){
  if (VL.busy) return;
  const A = dmProviders().auth, v = (id) => (document.getElementById(id) || {}).value || '';
  const mode = form.dataset.vl, user = v('vl-user'), pin = v('vl-pin'), dname = v('vl-name'), token = v('vl-token');   // read before the busy re-render
  VL.err = '';
  if (mode === 'setup'){
    if (authNormSecret(pin).length < AUTH_MIN_SECRET){ VL.err = t('au_e_secret'); return vaultLockRender(); }
    if (pin !== v('vl-pin2')){ VL.err = t('au_e_match'); return vaultLockRender(); }
  }
  VL.busy = true; vaultLockRender();
  try {
    if (mode === 'setup' && dmConfig().apiBase) await srvSetupDevice({username:user, display_name:dname, secret:pin, token});
    else if (mode === 'setup') await A.setupFirstAdmin({username:user, display_name:dname, secret:pin});
    else await A.login(user, pin);
    try { localStorage.setItem('docmap_v26_scan_user', authNormUser(user)); } catch(e){}
    VL.busy = false;
    await VL.run();
  } catch(e){
    VL.busy = false;
    VL.err = e.code === 'locked' ? t('vl_locked', {s:(e.data && e.data.retry_in) || 60}) : e.message === 'username' ? t('au_e_user') : e.message === 'server_token' || e.message === 'token' ? t('vl_e_token') :
      e.code === 'offline' ? t('vl_e_offline') : e.code === 'unauthorized' ? t('vl_bad') : t('vl_err', {m:e.message || e.code});
    vaultLockRender();
    if (mode === 'login' || mode === 'setup'){ const u = document.getElementById('vl-user'); if (u) u.value = user; const n = document.getElementById('vl-name'); if (n) n.value = dname; }
  }
}
document.addEventListener('submit', (e) => { const f = e.target; if (f && f.dataset && f.dataset.vl && f.closest('#vault-lock')){ e.preventDefault(); vaultLockSubmit(f); } }, true);
document.addEventListener('click', (e) => {
  const lb = e.target.closest && e.target.closest('#vault-lock [data-vl-lang]');
  if (lb){ S.lang = lb.dataset.vlLang; try { localStorage.setItem('docmap_v26_scan_lang', S.lang); } catch(err){} return vaultLockRender(); }
  if (e.target.closest && e.target.closest('#vault-lock [data-vl-reset]')){
    if (!VL.reset){ VL.reset = true; return vaultLockRender(); }
    [VAULT_LS, VAULT_PREV_LS, VAULT_LOG_LS].forEach(k => { try { localStorage.removeItem(k); } catch(err){} });
    const q = indexedDB.deleteDatabase('docmap_v26_sqlite'); q.onsuccess = q.onerror = q.onblocked = () => location.reload();
  }
}, true);
function vaultAfterBoot(){
  if (!document.getElementById('vl-lockbtn')){
    const b = document.createElement('button'); b.id = 'vl-lockbtn'; b.type = 'button'; b.className = 'vl-lockbtn'; b.dataset.a = 'vl-lock';
    b.title = t('vl_lock_t'); b.innerHTML = (typeof ic === 'function' ? ic('x') : '') + '<span>' + esc(t('vl_lock')) + '</span>';
    document.body.appendChild(b);
  }
  setInterval(() => { if (!dmProviders().auth.currentUser()) vaultLockNow(); }, 30000);
}
/** Save everything still pending, lock the vault and reload to the lock screen. */
async function vaultLockNow(){
  try { if (typeof DB !== 'undefined' && DB.ready){ clearTimeout(DB.timer); dbSyncFromState('auto'); await dbPersist(); } } catch(e){}
  try { await DocMapVault.flush(); } catch(e){}
  await dmProviders().auth.logout();
  window.__dmLocking = true;
  location.reload();
}

/* Live merge: when the phone (another tab of this browser) saves a binder, apply the same patch to the open
   desktop state if that binder was not changed here in the meantime, so the next desktop save keeps it.
   Otherwise the usual "changed in another tab — reload" banner stays. */
function mobileLiveMerge(newValue){
  if (typeof LOG === 'undefined' || !S || !Array.isArray(S.binders)) return 0;
  let list; try { list = Array.isArray(newValue) ? newValue : JSON.parse(newValue || '[]'); } catch(e){ return 0; }
  if (!Array.isArray(list)) return 0;
  const have = new Set(LOG.entries.map(e => e.id));
  const fresh = list.filter(e => e && e.source === MOBILE_LOG_SOURCE && !have.has(e.id));
  if (!fresh.length) return 0;
  let applied = 0, blocked = 0;
  fresh.forEach(e => {
    const d = e.details || {}, b = e.target && S.binders.find(x => x.id === e.target.id);
    if (!b || !d.patch || !d.new_updated_at) return;
    if (b.updated_at === d.new_updated_at){ applied++; return; }
    const editing = typeof UI !== 'undefined' && UI.ed && UI.ed.d && UI.ed.d.id === b.id;
    if (b.updated_at !== d.base_updated_at || editing){ blocked++; return; }
    const nb = mobileApplyPatch(b, d.patch, d.new_updated_at);
    Object.keys(nb).forEach(k => { b[k] = nb[k]; });
    applied++;
    toast(t('mob_merged', {c:b.speaking_code}), 'ok', 4000);
  });
  logMerge(fresh);
  if (applied && !blocked){ otherTabChanged = false; S.hasUnexportedChanges = true; persist(); renderAll(); }
  return applied;
}
window.addEventListener('storage', (e) => {
  if (typeof renderAll !== 'function' || !S) return;
  if (e.key === 'docmap_v26_log_pending' && !DocMapVault.isActive()) { try { mobileLiveMerge(e.newValue); } catch(err){ console.warn('mobile merge', err); } }
  if (DocMapVault.isActive() && DocMapVault.isUnlocked()){
    if (e.key === VAULT_LS && e.newValue){ otherTabChanged = true; renderBanner(); }
    if (e.key === VAULT_LOG_LS) DocMapVault.loadLog().then(l => mobileLiveMerge(l)).catch(() => {});
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, AUTH_ACTIONS);
  if (typeof document !== 'undefined' && typeof renderAll === 'function'){
    document.addEventListener('change', (e) => {
      const el = e.target; if (!el || !el.matches || !el.matches('[data-au-session]')) return;
      const n = Math.max(5, Math.min(10080, Math.round(+el.value || 480))); el.value = n; dmProviders().auth.setPolicy({sessionMinutes:n}); toast('OK');
    });
  }
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'mobile', guide:null, tags:['qr', 'safety'], related:['log', 'backup'],
    title:{it:'Telefono: cosa si vede dopo aver scansionato il QR', en:'Phone: what you see after scanning the QR'},
    body:{it:'<p>Il QR stampato porta a <span class="kbd">qr7.it/dm26…</span> e da lì alla <b>pagina mobile</b> del faldone (<span class="kbd">scan.html</span>). Senza login la pagina mostra solo il nome dello studio e il modulo di accesso: <b>nessun dato del faldone</b>, nemmeno il codice.</p><ul>' +
        '<li>Crea gli utenti in <b>⚙ Funzioni avanzate › Impostazioni › Utenti e accesso</b>: nome utente, PIN o password, ruolo (<b>Solo lettura</b>, <b>Può modificare</b>, <b>Amministratore</b>).</li>' +
        '<li>Dopo il login: codice grande, cliente, posizione con <b>Dov\'è?</b> (foto dell\'armadio con il ripiano segnato, se c\'è), contenuti con lo stato, ultima modifica.</li>' +
        '<li>Chi può modificare tocca il grande pulsante <b>Modifica</b>: stato del faldone, stato di ogni documento (in archivio / in uso / al cliente), posizione rapida, note e tag.</li>' +
        '<li>Se nel frattempo il faldone è stato cambiato dal PC, il telefono avvisa e chiede se ricaricare o sovrascrivere. Ogni modifica finisce nel <b>Registro attività</b> con la fonte <b>mobile</b>.</li>' +
        '<li><b>Anteprima mobile</b> (nella finestra QR e nella scheda del faldone) apre la pagina in una nuova scheda di questo PC.</li>' +
        '<li><b>Versione online (v10.1)</b>: con il database condiviso dello studio (<span class="kbd">server-php</span>) il telefono legge e salva direttamente sul server: la prima volta crea l\'utente del telefono, un PIN e incolla il <b>codice di accesso</b> ricevuto dall\'amministratore. Senza server la protezione vale solo in questo browser (vedi <span class="kbd">docs/SICUREZZA.md</span>).</li></ul>',
          en:'<p>The printed QR leads to <span class="kbd">qr7.it/dm26…</span> and from there to the binder\'s <b>mobile page</b> (<span class="kbd">scan.html</span>). Without login the page shows only the studio name and the login form: <b>no binder data</b>, not even the code.</p><ul>' +
        '<li>Create users in <b>⚙ Advanced tools › Settings › Users &amp; access</b>: username, PIN or password, role (<b>Read only</b>, <b>Can edit</b>, <b>Administrator</b>).</li>' +
        '<li>After login: big code, client, location with <b>Where is it?</b> (cabinet photo with the shelf marked, if any), contents with their status, last change.</li>' +
        '<li>Editors tap the big <b>Edit</b> button: binder state, status of each document (in archive / in use / at the client), quick position, notes and tags.</li>' +
        '<li>If the binder was changed on the PC meanwhile, the phone warns and asks whether to reload or overwrite. Every change goes into the <b>Activity log</b> with source <b>mobile</b>.</li>' +
        '<li><b>Mobile preview</b> (in the QR window and the binder form) opens the page in a new tab on this PC.</li>' +
        '<li><b>Online version (v10.1)</b>: with the studio\'s shared database (<span class="kbd">server-php</span>) the phone reads and saves on the server directly: the first time it creates the phone user, a PIN and pastes the <b>access code</b> given by the administrator. Without a server the protection only applies to this browser (see <span class="kbd">docs/SICUREZZA.md</span>).</li></ul>'} });
});
