/* =====================================================================
   DocMap 2026 — v10 (stream M): mobile page after scanning a binder QR (scan.html)

   URL:  <basePath>q/{short_code}  (default qr7.it destination https://docmap.pr-it.it/studio-de/q/{short_code},
         rewritten to scan.html by .htaccess / nginx, or redirected by 404.html to ?q=)
         fallbacks: scan.html?q={short_code} · ?qr={short_code} · #/q/{short_code} · ?code={speaking_code}
         (old default ?code=…&qr=… still works). The short code wins over the speaking code: one QR = one binder.
   Web mode (docmap.config.js mode 'web'): data comes from the encrypted local vault (DocMapVault), unlocked by login.

   Rules
   - Logged out: only the studio name, the language switch and the login form. NO binder data in the DOM,
     not even the code from the URL.
   - No users configured: a clear message pointing to DocMap › Impostazioni › Utenti e accesso, no form.
   - Logged in: binder card (code, Multi, client, category, state, "Dov'è?", contents with status, notes,
     last change). Role editor/admin → very large round "Modifica" button → mobile form (state, status of
     each document, quick position, notes, tags) saved through DataProvider.saveBinderPatch with the
     binder's etag (updated_at) → conflict screen if someone else changed it meanwhile.
   - Data access only through dmProviders() (10-auth.js): local today, remote (Python API) later.

   Depends on 02-core.js (t, esc, normalizeBinder, computeLocation, pipeToContents, CI_*) and 10-auth.js.
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  sc_title:'DocMap — Faldone', sc_brand:'DocMap', sc_login_h:'Accedi', sc_login_p:'Accedi per vedere il faldone di questo QR.',
  sc_user:'Nome utente', sc_secret:'PIN o password', sc_show:'Mostra', sc_hide:'Nascondi', sc_enter:'Entra', sc_checking:'Verifica…',
  sc_bad:'Nome utente o PIN non corretti.', sc_bad_left:'Nome utente o PIN non corretti. Ancora {n} tentativi prima dell\'attesa.', sc_locked:'Troppi tentativi: riprova tra {s} secondi.',
  sc_nousers_h:'Nessun utente configurato', sc_nousers:'Nessun utente configurato: crea un utente in DocMap › Impostazioni › Utenti e accesso.',
  sc_nocrypto:'Questo browser non permette il login sicuro (WebCrypto non disponibile).', sc_storage:'Impossibile leggere i dati di DocMap in questo browser.',
  sc_logout:'Esci', sc_hello:'Ciao {n}', sc_role_viewer:'sola lettura', sc_role_editor:'può modificare', sc_role_admin:'amministratore',
  sc_nf_h:'Faldone non trovato', sc_nf_p:'Questo QR non corrisponde a nessun faldone dell\'archivio. Forse è stato eliminato o l\'etichetta è di un altro archivio.',
  sc_noqr_h:'Scansiona un QR', sc_noqr_p:'Inquadra con la fotocamera il QR sull\'etichetta di un faldone, oppure cerca il codice.',
  sc_find:'Codice del faldone', sc_find_ph:'es. BL1', sc_find_btn:'Cerca',
  sc_where:'Dov\'è?', sc_room:'Stanza', sc_cab:'Armadio', sc_shelf:'Ripiano', sc_sector:'Settore', sc_from_top:'{n}° dall\'alto', sc_sx:'sinistra', sc_cx:'centro', sc_dx:'destra',
  sc_noloc:'Posizione non indicata.', sc_photo_alt:'Foto dell\'armadio {c}',
  sc_contents:'Contenuto', sc_nocontents:'Nessun contenuto indicato.', sc_notes:'Note', sc_tags:'Tag', sc_contacts:'Contatti', sc_updated:'Ultima modifica {d}', sc_multi:'Multi',
  sc_edit:'Modifica', sc_readonly:'Puoi solo consultare questo faldone.', sc_edit_h:'Modifica {c}', sc_state:'Stato del faldone',
  sc_items:'Stato dei documenti', sc_all_archive:'Tutti in archivio', sc_pos:'Posizione', sc_pos_ph:'es. A1-β-SX', sc_pos_hint:'Stanza+armadio, ripiano, settore: A1-β-SX oppure "Ufficio 1 · 2-3".',
  sc_pos_details:'Dettagli posizione', sc_pos_same:'Nello stesso armadio', sc_notes_ph:'Note sul faldone', sc_tags_ph:'iva, fatture, 2025',
  sc_save:'Salva', sc_cancel:'Annulla', sc_saving:'Salvataggio…', sc_saved:'Salvato', sc_nochange:'Nessuna modifica da salvare.',
  sc_conflict_h:'Modificato nel frattempo', sc_conflict_p:'Mentre lo modificavi, questo faldone è stato cambiato da un\'altra parte (ultima modifica {d}). Cosa vuoi fare?',
  sc_conflict_fields:'Campi cambiati dall\'altra parte: {f}', sc_reload:'Ricarica (perdo le mie modifiche)', sc_force:'Salva comunque le mie modifiche',
  sc_offline:'Nessuna rete: modifica salvata sul telefono, verrà inviata appena torna la connessione.', sc_err:'Errore: {m}', sc_gone:'Il faldone non esiste più.',
  sc_stale:'Questo faldone è appena cambiato su un altro dispositivo: al salvataggio ti verrà chiesto cosa fare.', sc_expired:'Sessione scaduta: accedi di nuovo per salvare.',
  sc_back:'Indietro', sc_lang:'Lingua', sc_local:'Dati letti da questo browser (DocMap sul PC).', sc_f_state:'stato', sc_f_items:'documenti', sc_f_pos:'posizione', sc_f_notes:'note', sc_f_tags:'tag',
  cis_archive:'In archivio', cis_in_use:'In uso', cis_client:'Al cliente', cis_label:'Stato del documento'   // same keys as 04b (desktop), not loaded here
});
Object.assign(I18N.en, {
  sc_title:'DocMap — Binder', sc_brand:'DocMap', sc_login_h:'Sign in', sc_login_p:'Sign in to see the binder of this QR.',
  sc_user:'Username', sc_secret:'PIN or password', sc_show:'Show', sc_hide:'Hide', sc_enter:'Sign in', sc_checking:'Checking…',
  sc_bad:'Wrong username or PIN.', sc_bad_left:'Wrong username or PIN. {n} more attempts before a wait.', sc_locked:'Too many attempts: try again in {s} seconds.',
  sc_nousers_h:'No users configured', sc_nousers:'No users configured: create a user in DocMap › Settings › Users & access.',
  sc_nocrypto:'This browser does not allow a secure login (WebCrypto not available).', sc_storage:'Cannot read DocMap data in this browser.',
  sc_logout:'Sign out', sc_hello:'Hi {n}', sc_role_viewer:'read only', sc_role_editor:'can edit', sc_role_admin:'administrator',
  sc_nf_h:'Binder not found', sc_nf_p:'This QR does not match any binder in the archive. It may have been deleted, or the label belongs to another archive.',
  sc_noqr_h:'Scan a QR', sc_noqr_p:'Point the camera at the QR on a binder label, or search the code.',
  sc_find:'Binder code', sc_find_ph:'e.g. BL1', sc_find_btn:'Search',
  sc_where:'Where is it?', sc_room:'Room', sc_cab:'Cabinet', sc_shelf:'Shelf', sc_sector:'Sector', sc_from_top:'{n} from the top', sc_sx:'left', sc_cx:'centre', sc_dx:'right',
  sc_noloc:'No location given.', sc_photo_alt:'Photo of cabinet {c}',
  sc_contents:'Contents', sc_nocontents:'No contents listed.', sc_notes:'Notes', sc_tags:'Tags', sc_contacts:'Contacts', sc_updated:'Last change {d}', sc_multi:'Multi',
  sc_edit:'Edit', sc_readonly:'You can only view this binder.', sc_edit_h:'Edit {c}', sc_state:'Binder state',
  sc_items:'Document status', sc_all_archive:'All in archive', sc_pos:'Location', sc_pos_ph:'e.g. A1-β-SX', sc_pos_hint:'Room+cabinet, shelf, sector: A1-β-SX or "Office 1 · 2-3".',
  sc_pos_details:'Location details', sc_pos_same:'In the same cabinet', sc_notes_ph:'Notes on the binder', sc_tags_ph:'vat, invoices, 2025',
  sc_save:'Save', sc_cancel:'Cancel', sc_saving:'Saving…', sc_saved:'Saved', sc_nochange:'Nothing to save.',
  sc_conflict_h:'Changed meanwhile', sc_conflict_p:'While you were editing, this binder was changed elsewhere (last change {d}). What do you want to do?',
  sc_conflict_fields:'Fields changed elsewhere: {f}', sc_reload:'Reload (lose my changes)', sc_force:'Save my changes anyway',
  sc_offline:'No network: change saved on the phone, it will be sent as soon as the connection is back.', sc_err:'Error: {m}', sc_gone:'The binder no longer exists.',
  sc_stale:'This binder has just changed on another device: you will be asked what to do when saving.', sc_expired:'Session expired: sign in again to save.',
  sc_back:'Back', sc_lang:'Language', sc_local:'Data read from this browser (DocMap on the PC).', sc_f_state:'state', sc_f_items:'documents', sc_f_pos:'location', sc_f_notes:'notes', sc_f_tags:'tags',
  cis_archive:'In archive', cis_in_use:'In use', cis_client:'At client', cis_label:'Document status'
});

const SC_LANG_LS = 'docmap_v26_scan_lang', SC_USER_LS = 'docmap_v26_scan_user', SC_OUTBOX_LS = 'docmap_v26_scan_outbox';
const SC_ICONS = {
  pencil:'<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', pin:'<path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>', check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>', lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  back:'<path d="m15 18-6-6 6-6"/>', user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
const sic = (n, cls) => '<svg class="sc-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (SC_ICONS[n] || '') + '</svg>';

const SC = { P:null, params:{qr:'', code:''}, ctx:{studioName:''}, user:null, hasUsers:null, view:'boot', rec:null, draft:null, msg:null, busy:false,
  conflict:null, stale:false, photo:null, photoFor:'', showPw:false, lockTimer:null, loginErr:'', findErr:'' };

/* ---------------- boot ---------------- */
/** Pure: where is the short code? ?q= · ?qr= · …/q/<code> (path routing) · #/q/<code>; plus ?code= and ?lang=. */
function scResolveRoute(loc){
  const q = new URLSearchParams(loc.search || ''), ok = (v) => /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : '';
  let qr = ok(String(q.get('q') || q.get('qr') || '').trim());
  if (!qr){ const m = String(loc.pathname || '').match(/\/q\/([A-Za-z0-9_-]{1,40})\/?$/); if (m) qr = m[1]; }
  if (!qr){ const h = String(loc.hash || '').match(/^#\/?q\/([A-Za-z0-9_-]{1,40})/); if (h) qr = h[1]; }
  return { qr, code:String(q.get('code') || '').trim().slice(0, 40), lang:String(q.get('lang') || '').toLowerCase() };
}
function scParams(){ return scResolveRoute(location); }
async function scBoot(){
  SC.params = scParams();
  S = {lang:'it', settings:{}}; window.S = S;   // light S: only what t() and fmtDate() need (no binders here)
  try { SC.P = dmProviders(); } catch(e){ SC.view = 'error'; SC.msg = {kind:'err', text:String(e.message || e)}; return scRender(); }
  try { SC.ctx = await SC.P.data.context(); } catch(e){ SC.ctx = {studioName:''}; }
  let lang = ['it', 'en'].includes(SC.params.lang) ? SC.params.lang : '';
  if (!lang) try { lang = localStorage.getItem(SC_LANG_LS) || ''; } catch(e){}
  if (!lang) lang = SC.ctx.lang || ((navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en');
  S.lang = ['it', 'en'].includes(lang) ? lang : 'it';
  SC.P.auth.onChange(() => { SC.user = SC.P.auth.currentUser(); });
  if (DocMapVault.isActive()) await DocMapVault.resume();   // web mode: re-open the vault of this tab's session
  await scRoute();
  window.addEventListener('online', scFlushOutbox);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scCheckSession(); });
  setInterval(scCheckSession, 30000);
  scFlushOutbox();
}
async function scRoute(){
  SC.user = SC.P.auth.currentUser();
  if (!SC.user){
    SC.rec = null; SC.photo = null;
    try { SC.hasUsers = await SC.P.auth.hasUsers(); } catch(e){ SC.hasUsers = false; }
    SC.view = !authHasSubtle() && SC.P.mode === 'local' ? 'nocrypto' : SC.hasUsers ? 'login' : 'nousers';
    return scRender();
  }
  if (!SC.params.qr && !SC.params.code){ SC.view = 'noqr'; return scRender(); }
  try {
    SC.rec = SC.params.qr ? await SC.P.data.getBinderByQr(SC.params.qr) : await SC.P.data.getBinderByCode(SC.params.code);
  } catch(e){ if (e.code === 'unauthorized'){ await SC.P.auth.logout(); return scRoute(); } SC.view = 'error'; SC.msg = {kind:'err', text:t('sc_storage')}; return scRender(); }
  if (!SC.rec){ SC.view = 'notfound'; return scRender(); }
  if (SC.draft && SC.draft.id === SC.rec.binder.id && SC.P.auth.can('edit')) SC.view = 'edit';   // back after a re-login
  else { SC.draft = null; SC.view = 'card'; }
  scRender();
  scLoadPhoto();
}
function scCheckSession(){ if (SC.user && !SC.P.auth.currentUser()){ if (SC.view === 'edit') SC.msg = {kind:'warn', text:t('sc_expired')}; scRoute(); } }

/* ---------------- helpers ---------------- */
function scSetLang(l){ S.lang = l; try { localStorage.setItem(SC_LANG_LS, l); } catch(e){} scRender(); }
function scFromTop(s){
  s = String(s || ''); if (/^\d{1,2}$/.test(s)) return +s;
  for (const k of ['greek', 'letter', 'emoji', 'symbol']){ const i = SHELF_TYPES[k].indexOf(k === 'letter' ? s.toUpperCase() : s); if (i >= 0) return i + 1; }
  return 0;
}
function scLocText(b){
  const p = [];
  if (b.room_code) p.push(t('sc_room') + ' ' + b.room_code);
  if (b.cabinet_code) p.push(t('sc_cab') + ' ' + b.cabinet_code);
  if (b.shelf_code){ const o = scFromTop(b.shelf_code); p.push(t('sc_shelf') + ' ' + b.shelf_code + (o ? ' (' + t('sc_from_top', {n:o}) + ')' : '')); }
  if (b.sector_code) p.push(t('sc_sector') + ' ' + ({SX:t('sc_sx'), CX:t('sc_cx'), DX:t('sc_dx')}[b.sector_code] || b.sector_code));
  return p.join(' · ');
}
const SC_GREEK = {alfa:'α', alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', teta:'θ'};
/** Same rules as the desktop "Posizione rapida" (04b parseQuickLocation), without the archive-wide room list. */
function scParseLoc(str, knownRooms){
  const s = String(str || '').replace(/\s+/g, ' ').trim(); if (!s) return {room_code:'', cabinet_code:'', shelf_code:'', sector_code:''};
  const tidy = (o) => { o = Object.assign({room_code:'', cabinet_code:'', shelf_code:'', sector_code:''}, o); Object.keys(o).forEach(k => o[k] = String(o[k] || '').trim());
    if (/^[a-z]{1,2}$/i.test(o.room_code)) o.room_code = o.room_code.toUpperCase(); if (SC_GREEK[o.shelf_code.toLowerCase()]) o.shelf_code = SC_GREEK[o.shelf_code.toLowerCase()];
    if (/^(sx|cx|dx)$/i.test(o.sector_code)) o.sector_code = o.sector_code.toUpperCase(); return o; };
  const strict = parseLocation(s);
  if (strict && strict.room_code && strict.cabinet_code && strict.shelf_code) return tidy(strict);
  const o = {room_code:'', cabinet_code:'', shelf_code:'', sector_code:''}; let rest = s;
  const dot = s.split(/\s*[·•|]\s*/);
  if (dot.length > 1){ o.room_code = dot[0]; rest = dot.slice(1).join(' '); }
  else { const room = (knownRooms || []).filter(r => r && r.length > 2).sort((a, b) => b.length - a.length).find(r => s.toLowerCase().startsWith(r.toLowerCase()) && /^(\s|-|$)/.test(s.slice(r.length))); if (room){ o.room_code = room; rest = s.slice(room.length); } }
  const tk = rest.split(/[\s\-–—\/,;]+/).filter(Boolean);
  if (!o.room_code && tk.length){ const m = tk[0].match(/^([A-Za-z]{1,2})(\d{1,3})(\D.*)?$/); if (m){ tk.shift(); o.room_code = m[1]; o.cabinet_code = m[2]; if (m[3]) tk.unshift(m[3]); } else o.room_code = tk.shift(); }
  if (!o.cabinet_code && tk.length) o.cabinet_code = tk.shift();
  if (tk.length) o.shelf_code = tk.shift();
  if (tk.length) o.sector_code = tk.join('-');
  return tidy(o);
}
function scStateChip(s){ return '<span class="sc-state st-' + esc(s) + '">' + esc(t('s_' + s)) + '</span>'; }
function scCiChip(st){ return '<span class="sc-ci st-' + esc(st) + '">' + esc(t('cis_' + st)) + '</span>'; }

/* ---------------- render ---------------- */
function scHeader(){
  const studio = SC.ctx.studioName || '';
  return '<header class="sc-top"><div class="sc-brand"><span class="sc-mark" aria-hidden="true">DM</span><div class="sc-brand-t"><b>' + esc(t('sc_brand')) + '</b>' + (studio ? '<span>' + esc(studio) + '</span>' : '') + '</div></div>' +
    '<div class="sc-top-r"><div class="sc-lang" role="group" aria-label="' + esc(t('sc_lang')) + '"><button type="button" data-s="lang" data-l="it" aria-pressed="' + (S.lang === 'it') + '">IT</button><button type="button" data-s="lang" data-l="en" aria-pressed="' + (S.lang === 'en') + '">EN</button></div>' +
    (SC.user ? '<button type="button" class="sc-out" data-s="logout" aria-label="' + esc(t('sc_logout')) + '">' + sic('out') + '<span>' + esc(t('sc_logout')) + '</span></button>' : '') + '</div></header>';
}
function scMsgHTML(){ return SC.msg ? '<div class="sc-msg ' + esc(SC.msg.kind || 'ok') + '" role="status">' + sic(SC.msg.kind === 'ok' ? 'check' : 'alert') + '<span>' + esc(SC.msg.text) + '</span></div>' : ''; }
function scLoginHTML(){
  let last = ''; try { last = localStorage.getItem(SC_USER_LS) || ''; } catch(e){}
  return '<main class="sc-main sc-center"><form class="sc-card sc-login" data-s="login-form" autocomplete="on" novalidate>' +
    '<div class="sc-lock">' + sic('lock') + '</div><h1>' + esc(t('sc_login_h')) + '</h1><p class="sc-muted">' + esc(t('sc_login_p')) + '</p>' + scMsgHTML() +
    '<label class="sc-field"><span>' + esc(t('sc_user')) + '</span><input id="sc-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="' + esc(last) + '"></label>' +
    '<label class="sc-field"><span>' + esc(t('sc_secret')) + '</span><span class="sc-pw"><input id="sc-pin" name="password" type="' + (SC.showPw ? 'text' : 'password') + '" autocomplete="current-password" required><button type="button" class="sc-pw-t" data-s="pw-toggle">' + esc(SC.showPw ? t('sc_hide') : t('sc_show')) + '</button></span></label>' +
    '<div class="sc-err" id="sc-login-err" role="alert">' + esc(SC.loginErr) + '</div>' +
    '<button type="submit" class="sc-btn sc-primary sc-block" id="sc-enter"' + (SC.busy ? ' disabled' : '') + '>' + esc(SC.busy ? t('sc_checking') : t('sc_enter')) + '</button></form></main>';
}
function scInfoHTML(icon, h, p, extra){
  return '<main class="sc-main sc-center"><div class="sc-card sc-info">' + '<div class="sc-lock">' + sic(icon) + '</div><h1>' + esc(h) + '</h1>' + (p ? '<p>' + esc(p) + '</p>' : '') + (extra || '') + '</div></main>';
}
function scFindHTML(){
  return '<form class="sc-find" data-s="find-form"><label class="sc-field"><span>' + esc(t('sc_find')) + '</span><span class="sc-pw"><input id="sc-find" autocapitalize="characters" autocomplete="off" placeholder="' + esc(t('sc_find_ph')) + '"><button type="submit" class="sc-pw-t">' + sic('search') + esc(t('sc_find_btn')) + '</button></span></label>' +
    (SC.findErr ? '<div class="sc-err">' + esc(SC.findErr) + '</div>' : '') + '</form>';
}
function scUserBar(){
  const u = SC.user; if (!u) return '';
  return '<div class="sc-userbar">' + sic('user') + '<span>' + esc(t('sc_hello', {n:u.display_name || u.username})) + '</span><span class="sc-role">' + esc(t('sc_role_' + u.role)) + '</span></div>';
}
function scCardHTML(){
  const b = SC.rec.binder, canEdit = SC.P.auth.can('edit');
  const placed = b.room_code || b.cabinet_code || b.shelf_code;
  const items = b.contents_items || [];
  const tags = String(b.tags || '').split(',').map(x => x.trim()).filter(x => x && x.toLowerCase() !== DEMO_TAG);
  return '<main class="sc-main">' + scUserBar() + scMsgHTML() +
    '<article class="sc-card sc-hero" style="--bc:' + esc(b.color_hex || '#2563EB') + '"><div class="sc-hero-bar"></div>' +
      '<div class="sc-hero-top"><div class="sc-code" id="sc-code">' + esc(b.speaking_code) + '</div>' + (b.multi_code ? '<div class="sc-multi"><span>' + esc(t('sc_multi')) + '</span><b>' + esc(b.multi_code) + '</b></div>' : '') + '</div>' +
      '<div class="sc-company" id="sc-company">' + esc(b.company_name) + '</div>' + (b.binder_title ? '<div class="sc-title">' + esc(b.binder_title) + '</div>' : '') +
      '<div class="sc-chips">' + (b.category ? '<span class="sc-cat">' + esc(b.category) + '</span>' : '') + scStateChip(b.archive_state) + (b.ref_year ? '<span class="sc-cat">' + esc(b.ref_year) + '</span>' : '') + '</div></article>' +
    '<section class="sc-card sc-where" aria-labelledby="sc-where-h"><h2 id="sc-where-h">' + sic('pin') + esc(t('sc_where')) + '</h2>' +
      (placed ? '<div class="sc-loc" id="sc-loc">' + esc(b.location_code || computeLocation(b)) + '</div><div class="sc-loc-t">' + esc(scLocText(b)) + '</div>' : '<div class="sc-muted">' + esc(t('sc_noloc')) + '</div>') +
      '<div id="sc-photo">' + scPhotoHTML() + '</div></section>' +
    '<section class="sc-card"><h2>' + esc(t('sc_contents')) + '</h2>' + (items.length ? '<ul class="sc-items" id="sc-items">' + items.map(i => '<li><div class="sc-it"><span class="sc-y">' + esc(i.year || '') + '</span><span>' + esc(i.description || '') + '</span></div>' + scCiChip(normCiStatus(i.status)) + '</li>').join('') + '</ul>' : '<div class="sc-muted">' + esc(t('sc_nocontents')) + '</div>') + '</section>' +
    (b.notes || tags.length || b.contacts ? '<section class="sc-card sc-more">' +
      (b.notes ? '<h3>' + esc(t('sc_notes')) + '</h3><p class="sc-notes" id="sc-notes">' + esc(b.notes) + '</p>' : '') +
      (b.contacts ? '<h3>' + esc(t('sc_contacts')) + '</h3><p>' + esc(b.contacts) + '</p>' : '') +
      (tags.length ? '<h3>' + esc(t('sc_tags')) + '</h3><div class="sc-chips">' + tags.map(x => '<span class="sc-tag">' + esc(x) + '</span>').join('') + '</div>' : '') + '</section>' : '') +
    '<div class="sc-foot sc-muted">' + esc(t('sc_updated', {d:fmtDate(b.updated_at, true)})) + (SC.P.mode === 'local' ? '<br>' + esc(t('sc_local')) : '') + '</div>' +
    (canEdit ? '<button type="button" class="sc-fab" data-s="edit" id="sc-edit" aria-label="' + esc(t('sc_edit')) + '">' + sic('pencil') + '<span>' + esc(t('sc_edit')) + '</span></button>' : '<div class="sc-ro sc-muted">' + sic('lock') + esc(t('sc_readonly')) + '</div>') +
    '</main>';
}
function scPhotoHTML(){
  const p = SC.photo; if (!p || SC.photoFor !== (SC.rec && SC.rec.binder.id)) return '';
  const b = SC.rec.binder;
  return '<figure class="sc-ph"><img src="' + esc(p.url) + '" alt="' + esc(t('sc_photo_alt', {c:String(b.room_code || '') + String(b.cabinet_code || '')})) + '">' +
    (p.mark ? '<span class="sc-pinm" style="left:' + (p.mark.x * 100) + '%;top:' + (p.mark.y * 100) + '%"><i></i><b>' + esc(b.location_code) + '</b></span>' : '') + (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') + '</figure>';
}
async function scLoadPhoto(){
  const r = SC.rec; if (!r) return;
  const id = r.binder.id;
  const p = await SC.P.data.getCabinetPhoto(r.binder);
  if (!SC.rec || SC.rec.binder.id !== id) return;
  SC.photo = p; SC.photoFor = id;
  const el = document.getElementById('sc-photo'); if (el) el.innerHTML = scPhotoHTML();
}
function scDraftFrom(b){ return { id:b.id, archive_state:b.archive_state, contents_items:(b.contents_items || []).map(i => ({year:i.year, description:i.description, status:normCiStatus(i.status)})),
  room_code:b.room_code, cabinet_code:b.cabinet_code, shelf_code:b.shelf_code, sector_code:b.sector_code, notes:b.notes || '', tags:b.tags || '', quick:b.location_code || computeLocation(b) }; }
function scEditHTML(){
  const b = SC.rec.binder, d = SC.draft;
  const same = Array.from(new Set((SC.rec.siblings || []).map(x => locHead(b.room_code, b.cabinet_code) && x.shelf_code ? computeLocation({room_code:b.room_code, cabinet_code:b.cabinet_code, shelf_code:x.shelf_code, sector_code:x.sector_code}) : '').filter(Boolean))).slice(0, 6);
  const preview = computeLocation(d) || '—';
  return '<main class="sc-main sc-edit"><div class="sc-edit-h"><button type="button" class="sc-icon" data-s="cancel" aria-label="' + esc(t('sc_back')) + '">' + sic('back') + '</button><h1>' + esc(t('sc_edit_h', {c:b.speaking_code})) + '</h1></div>' + scMsgHTML() +
    (SC.stale ? '<div class="sc-msg warn">' + sic('alert') + '<span>' + esc(t('sc_stale')) + '</span></div>' : '') +
    (SC.conflict ? scConflictHTML() : '') +
    '<section class="sc-card"><h2>' + esc(t('sc_state')) + '</h2><div class="sc-seg" role="radiogroup" aria-label="' + esc(t('sc_state')) + '">' +
      STATES.map(s => '<button type="button" role="radio" data-s="state" data-v="' + s + '" aria-checked="' + (d.archive_state === s) + '" class="st-' + s + '">' + esc(t('s_' + s)) + '</button>').join('') + '</div></section>' +
    (d.contents_items.length ? '<section class="sc-card"><div class="sc-row"><h2>' + esc(t('sc_items')) + '</h2><button type="button" class="sc-link" data-s="all-archive">' + esc(t('sc_all_archive')) + '</button></div><ul class="sc-eitems">' +
      d.contents_items.map((i, k) => '<li><div class="sc-it"><span class="sc-y">' + esc(i.year || '') + '</span><span>' + esc(i.description || '') + '</span></div><div class="sc-seg sm" role="radiogroup" aria-label="' + esc(t('cis_label')) + '">' +
        CI_STATUSES.map(s => '<button type="button" role="radio" data-s="ci" data-i="' + k + '" data-v="' + s + '" aria-checked="' + (i.status === s) + '" class="st-' + s + '">' + esc(t('cis_' + s)) + '</button>').join('') + '</div></li>').join('') + '</ul></section>' : '') +
    '<section class="sc-card"><h2>' + esc(t('sc_pos')) + '</h2><label class="sc-field"><span class="sr">' + esc(t('sc_pos')) + '</span><input id="sc-quick" data-s-in="quick" value="' + esc(d.quick) + '" placeholder="' + esc(t('sc_pos_ph')) + '" autocomplete="off" autocapitalize="characters"></label>' +
      '<div class="sc-loc sm" id="sc-quick-prev">' + esc(preview) + '</div><div class="sc-hint">' + esc(t('sc_pos_hint')) + '</div>' +
      (same.length ? '<div class="sc-hint">' + esc(t('sc_pos_same')) + '</div><div class="sc-chips">' + same.map(l => '<button type="button" class="sc-tag sc-pick" data-s="pick-loc" data-v="' + esc(l) + '">' + esc(l) + '</button>').join('') + '</div>' : '') +
      '<details class="sc-det"><summary>' + esc(t('sc_pos_details')) + '</summary><div class="sc-grid4">' +
        [['room_code', 'sc_room'], ['cabinet_code', 'sc_cab'], ['shelf_code', 'sc_shelf'], ['sector_code', 'sc_sector']].map(([k, l]) => '<label class="sc-field"><span>' + esc(t(l)) + '</span><input data-s-in="' + k + '" id="sc-' + k + '" value="' + esc(d[k]) + '" autocomplete="off"></label>').join('') + '</div></details></section>' +
    '<section class="sc-card"><label class="sc-field"><span>' + esc(t('sc_notes')) + '</span><textarea id="sc-notes-in" data-s-in="notes" rows="3" placeholder="' + esc(t('sc_notes_ph')) + '">' + esc(d.notes) + '</textarea></label>' +
      '<label class="sc-field"><span>' + esc(t('sc_tags')) + '</span><input id="sc-tags-in" data-s-in="tags" value="' + esc(d.tags) + '" placeholder="' + esc(t('sc_tags_ph')) + '" autocomplete="off" autocapitalize="none"></label></section>' +
    '<div class="sc-bar"><button type="button" class="sc-btn" data-s="cancel">' + esc(t('sc_cancel')) + '</button><button type="button" class="sc-btn sc-primary" data-s="save" id="sc-save"' + (SC.busy ? ' disabled' : '') + '>' + sic('check') + esc(SC.busy ? t('sc_saving') : t('sc_save')) + '</button></div></main>';
}
function scConflictHTML(){
  const c = SC.conflict, cur = c.current && c.current.binder;
  const f = cur ? Object.keys(mobileDiff(SC.rec.binder, cur)).map(k => MOBILE_FIELD_IT[k] && S.lang === 'it' ? MOBILE_FIELD_IT[k] : k.replace(/_code$/, '').replace(/_/g, ' ')) : [];
  return '<div class="sc-card sc-conflict" role="alert" id="sc-conflict"><h2>' + sic('alert') + esc(t('sc_conflict_h')) + '</h2><p>' + esc(t('sc_conflict_p', {d:cur ? fmtDate(cur.updated_at, true) : '?'})) + '</p>' +
    (f.length ? '<p class="sc-muted">' + esc(t('sc_conflict_fields', {f:f.join(', ')})) + '</p>' : '') +
    '<div class="sc-stack"><button type="button" class="sc-btn sc-block" data-s="conflict-reload">' + esc(t('sc_reload')) + '</button><button type="button" class="sc-btn sc-danger sc-block" data-s="conflict-force">' + esc(t('sc_force')) + '</button></div></div>';
}
function scRender(){
  document.documentElement.lang = S.lang;
  document.title = t('sc_title');
  let body = '';
  switch (SC.view){
    case 'boot': body = '<main class="sc-main sc-center"><div class="sc-spin" aria-hidden="true"></div></main>'; break;
    case 'nousers': body = scInfoHTML('user', t('sc_nousers_h'), t('sc_nousers')); break;
    case 'nocrypto': body = scInfoHTML('alert', t('sc_nocrypto'), ''); break;
    case 'login': body = scLoginHTML(); break;
    case 'noqr': body = '<main class="sc-main">' + scUserBar() + '<div class="sc-card sc-info">' + '<div class="sc-lock">' + sic('qr') + '</div><h1>' + esc(t('sc_noqr_h')) + '</h1><p>' + esc(t('sc_noqr_p')) + '</p>' + scFindHTML() + '</div></main>'; break;
    case 'notfound': body = '<main class="sc-main">' + scUserBar() + '<div class="sc-card sc-info" id="sc-notfound"><div class="sc-lock">' + sic('alert') + '</div><h1>' + esc(t('sc_nf_h')) + '</h1><p>' + esc(t('sc_nf_p')) + '</p>' + scFindHTML() +
      '<button type="button" class="sc-btn sc-block" data-s="logout">' + sic('out') + esc(t('sc_logout')) + '</button></div></main>'; break;
    case 'card': body = scCardHTML(); break;
    case 'edit': body = scEditHTML(); break;
    default: body = scInfoHTML('alert', (SC.msg && SC.msg.text) || 'Error', '');
  }
  document.getElementById('app').innerHTML = scHeader() + body;
  if (SC.view === 'login'){ const u = document.getElementById('sc-user'), p = document.getElementById('sc-pin'); setTimeout(() => { (u && !u.value ? u : p) && (u && !u.value ? u : p).focus(); }, 30); }
}

/* ---------------- actions ---------------- */
async function scLogin(){
  if (SC.busy) return;
  const u = (document.getElementById('sc-user') || {}).value || '', p = (document.getElementById('sc-pin') || {}).value || '';
  if (!u.trim() || !p){ SC.loginErr = t('sc_bad'); return scRender(); }
  SC.busy = true; SC.loginErr = ''; SC.msg = null; scRender();
  try {
    await SC.P.auth.login(u, p);
    try { localStorage.setItem(SC_USER_LS, authNormUser(u)); } catch(e){}
    SC.busy = false; SC.loginErr = '';
    await scRoute();
  } catch(e){
    SC.busy = false;
    if (e.code === 'locked'){ SC.loginErr = t('sc_locked', {s:(e.data && e.data.retry_in) || 60}); scLockCountdown(u); }
    else if (e.code === 'no_users'){ SC.view = 'nousers'; }
    else if (e.code === 'unauthorized') SC.loginErr = e.data && e.data.left > 0 && e.data.left < AUTH_FREE_FAILS ? t('sc_bad_left', {n:e.data.left}) : t('sc_bad');
    else SC.loginErr = t('sc_err', {m:e.message || e.code});
    scRender();
    const pin = document.getElementById('sc-pin'); if (pin) pin.value = '';
    const usr = document.getElementById('sc-user'); if (usr) usr.value = u;
  }
}
function scLockCountdown(u){
  clearInterval(SC.lockTimer);
  SC.lockTimer = setInterval(() => {
    const li = SC.P.auth.lockInfo ? SC.P.auth.lockInfo(u) : {retry_in:0};
    const el = document.getElementById('sc-login-err');
    if (!el || SC.view !== 'login'){ clearInterval(SC.lockTimer); return; }
    if (li.retry_in > 0) el.textContent = SC.loginErr = t('sc_locked', {s:li.retry_in}); else { el.textContent = SC.loginErr = ''; clearInterval(SC.lockTimer); }
  }, 1000);
}
function scPatch(){
  const b = SC.rec.binder, d = SC.draft, p = {};
  if (d.archive_state !== b.archive_state) p.archive_state = d.archive_state;
  if (contentsToPipe(d.contents_items) !== contentsToPipe(b.contents_items)) p.contents_items = d.contents_items.map(i => ({year:i.year, description:i.description, status:i.status}));
  ['room_code', 'cabinet_code', 'shelf_code', 'sector_code'].forEach(k => { if (String(d[k] || '').trim() !== String(b[k] || '')) p[k] = String(d[k] || '').trim(); });
  if (String(d.notes).trim() !== String(b.notes || '')) p.notes = String(d.notes).trim();
  const tg = String(d.tags).split(',').map(x => x.trim()).filter(Boolean).join(',');
  if (tg !== String(b.tags || '')) p.tags = tg;
  return p;
}
async function scSave(force){
  if (SC.busy) return;
  if (!SC.P.auth.currentUser()){ SC.msg = {kind:'warn', text:t('sc_expired')}; return scRoute(); }
  if (!SC.P.auth.can('edit')) return;
  const patch = scPatch();
  if (!Object.keys(patch).length){ SC.msg = {kind:'warn', text:t('sc_nochange')}; SC.draft = null; SC.view = 'card'; return scRender(); }
  SC.busy = true; scRender();
  try {
    const r = await SC.P.data.saveBinderPatch(SC.rec.binder.id, patch, {etag:SC.rec.etag, user:SC.P.auth.currentUser(), force:!!force});
    SC.busy = false; SC.conflict = null; SC.stale = false; SC.draft = null;
    SC.rec = Object.assign({}, SC.rec, {binder:r.binder, etag:r.etag});
    SC.msg = {kind:'ok', text:t('sc_saved')}; SC.view = 'card';
    scRender(); scLoadPhoto(); window.scrollTo(0, 0);
    setTimeout(() => { if (SC.msg && SC.msg.text === t('sc_saved')){ SC.msg = null; const m = document.querySelector('.sc-msg.ok'); if (m) m.remove(); } }, 4000);
  } catch(e){
    SC.busy = false;
    if (e.code === 'conflict'){ SC.conflict = e.data || {}; scRender(); const c = document.getElementById('sc-conflict'); if (c && c.scrollIntoView) c.scrollIntoView({block:'center'}); return; }
    if (e.code === 'offline'){ scQueue(patch); SC.msg = {kind:'warn', text:t('sc_offline')}; SC.view = 'card'; SC.draft = null; return scRender(); }
    if (e.code === 'not_found'){ SC.msg = {kind:'err', text:t('sc_gone')}; SC.view = 'notfound'; return scRender(); }
    if (e.code === 'unauthorized'){ SC.msg = {kind:'warn', text:t('sc_expired')}; await SC.P.auth.logout(); return scRoute(); }
    SC.msg = {kind:'err', text:t('sc_err', {m:e.message || e.code})}; scRender();
  }
}
/* Offline outbox (remote mode): patches waiting for the network, sent in order with their original etag. */
function scQueue(patch){ try { const q = JSON.parse(localStorage.getItem(SC_OUTBOX_LS) || '[]'); q.push({id:uuid(), binder_id:SC.rec.binder.id, patch, etag:SC.rec.etag, at:nowISO()}); localStorage.setItem(SC_OUTBOX_LS, JSON.stringify(q)); } catch(e){} }
async function scFlushOutbox(){
  let q; try { q = JSON.parse(localStorage.getItem(SC_OUTBOX_LS) || '[]'); } catch(e){ q = []; }
  if (!q.length || !SC.P || !SC.P.auth.currentUser() || (navigator.onLine === false)) return;
  const left = [];
  for (const it of q){
    try { await SC.P.data.saveBinderPatch(it.binder_id, it.patch, {etag:it.etag, user:SC.P.auth.currentUser()}); }
    catch(e){ if (e.code === 'offline') left.push(it); /* conflicts are dropped and shown on next open: the server keeps the newer version */ }
  }
  try { localStorage.setItem(SC_OUTBOX_LS, JSON.stringify(left)); } catch(e){}
}
/* Desktop state changed in another tab (02-core's storage listener calls renderBanner) */
function renderBanner(){
  if (!SC.P || !SC.user || !SC.rec) return;
  if (SC.view === 'card'){ const k = SC.params.qr; (k ? SC.P.data.getBinderByQr(k) : SC.P.data.getBinderByCode(SC.params.code)).then(r => { if (SC.view !== 'card') return; if (!r){ SC.view = 'notfound'; return scRender(); } if (r.etag !== SC.rec.etag){ SC.rec = r; scRender(); scLoadPhoto(); } }).catch(() => {}); }
  else if (SC.view === 'edit'){ SC.P.data.getBinderByQr(SC.rec.binder.short_code).then(r => { if (r && r.etag !== SC.rec.etag && !SC.stale){ SC.stale = true; scSyncDraftFromDom(); scRender(); } }).catch(() => {}); }
}
function scSyncDraftFromDom(){ document.querySelectorAll('[data-s-in]').forEach(el => { const k = el.dataset.sIn; if (SC.draft && k in SC.draft) SC.draft[k] = el.value; }); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-s]'); if (!el || el.tagName === 'FORM') return;
  const a = el.dataset.s;
  if (a === 'lang'){ if (SC.view === 'edit') scSyncDraftFromDom(); return scSetLang(el.dataset.l); }
  if (a === 'logout'){ SC.draft = null; SC.msg = null; SC.conflict = null; SC.P.auth.logout().then(scRoute); return; }
  if (a === 'pw-toggle'){ const p = document.getElementById('sc-pin'); SC.showPw = !SC.showPw; if (p){ p.type = SC.showPw ? 'text' : 'password'; el.textContent = SC.showPw ? t('sc_hide') : t('sc_show'); } return; }
  if (a === 'edit'){ if (!SC.P.auth.can('edit')) return; SC.draft = scDraftFrom(SC.rec.binder); SC.msg = null; SC.conflict = null; SC.stale = false; SC.view = 'edit'; scRender(); window.scrollTo(0, 0); return; }
  if (a === 'cancel'){ SC.draft = null; SC.conflict = null; SC.stale = false; SC.msg = null; SC.view = 'card'; scRender(); scLoadPhoto(); return; }
  if (!SC.draft) return;
  scSyncDraftFromDom();
  if (a === 'state'){ SC.draft.archive_state = el.dataset.v; return scRender(); }
  if (a === 'ci'){ const it = SC.draft.contents_items[+el.dataset.i]; if (it) it.status = el.dataset.v; return scRender(); }
  if (a === 'all-archive'){ SC.draft.contents_items.forEach(i => i.status = 'archive'); return scRender(); }
  if (a === 'pick-loc'){ SC.draft.quick = el.dataset.v; scApplyQuick(); return scRender(); }
  if (a === 'save') return scSave(false);
  if (a === 'conflict-force'){ SC.rec.etag = SC.conflict && SC.conflict.current ? SC.conflict.current.etag : SC.rec.etag; return scSave(true); }
  if (a === 'conflict-reload'){ SC.conflict = null; SC.draft = null; SC.stale = false; SC.msg = null; SC.view = 'card'; return scRoute(); }
});
function scApplyQuick(){
  const d = SC.draft, rooms = [SC.rec.binder.room_code].filter(Boolean);
  Object.assign(d, scParseLoc(d.quick, rooms));
}
document.addEventListener('input', (e) => {
  const el = e.target; if (!el.dataset || !el.dataset.sIn || !SC.draft) return;
  const k = el.dataset.sIn; SC.draft[k] = el.value;
  if (k === 'quick') scApplyQuick();
  else if (['room_code', 'cabinet_code', 'shelf_code', 'sector_code'].includes(k)){ SC.draft.quick = computeLocation(SC.draft); const q = document.getElementById('sc-quick'); if (q) q.value = SC.draft.quick; }
  if (k === 'quick'){ ['room_code', 'cabinet_code', 'shelf_code', 'sector_code'].forEach(f => { const i = document.getElementById('sc-' + f); if (i) i.value = SC.draft[f]; }); }
  const pv = document.getElementById('sc-quick-prev'); if (pv) pv.textContent = computeLocation(SC.draft) || '—';
});
document.addEventListener('submit', (e) => {
  const f = e.target; e.preventDefault();
  if (f.dataset.s === 'login-form') return scLogin();
  if (f.dataset.s === 'find-form'){
    const v = String((document.getElementById('sc-find') || {}).value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!v) return;
    SC.findErr = '';
    const qs = new URLSearchParams(location.search); ['q', 'qr'].forEach(k => qs.delete(k)); qs.set('code', v);
    history.replaceState(null, '', 'scan.html?' + qs.toString());   // relative to <base>: leaves a /q/<code> path
    SC.params = scParams(); scRoute();
  }
});
window.addEventListener('storage', (e) => {
  if (e.key === VAULT_LS && SC.P && DocMapVault.isActive()) renderBanner();
  if (e.key === AUTH_LS && SC.P){ const was = SC.user && SC.user.id; SC.user = SC.P.auth.currentUser(); if ((SC.user && SC.user.id) !== was || (SC.view === 'nousers' || SC.view === 'login')) scRoute(); }
});
document.addEventListener('DOMContentLoaded', scBoot);
