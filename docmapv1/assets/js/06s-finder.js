/* =====================================================================
   DocMap 2026 — v12.10 «Faldone smarrito» on the PC (index.html, after 06r-pick.js). Shared model: 02k-finder.js.
   Impostazioni › Faldone smarrito: switch, contact (name, phone, WhatsApp, e-mail, note) and a live preview of what
   a stranger sees after scanning a label. The block travels with the shared settings (sync packages + server,
   newer finderAt wins) so the server can answer the public route `finder` and other PCs keep the same contact.
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  fds_h:'Faldone smarrito: chi lo trova vi può contattare', fds_p:'Se qualcuno trova un faldone fuori posto (in auto, in tribunale, da un cliente) e inquadra il QR, senza accedere vede solo questo contatto e i pulsanti per chiamarvi o scrivervi, con il codice dell\'etichetta già nel messaggio. Nessun dato del faldone viene mostrato.',
  fds_on:'Mostra il contatto a chi trova un faldone', fds_name:'Nome mostrato', fds_name_ph:'es. Studio Rossi, segreteria', fds_phone:'Telefono', fds_wa:'WhatsApp (numero)', fds_mail:'E-mail', fds_note:'Messaggio (facoltativo)',
  fds_note_ph:'es. Siamo in Via Roma 1, aperti 9-18. Grazie!', fds_prev:'Anteprima: cosa vede chi lo trova', fds_need:'Scrivi almeno un telefono, un numero WhatsApp o un\'e-mail.',
  fds_web:('Funziona con la versione online o in sede (il QR apre la pagina del telefono). Con ' + brandName() + ' aperto da file vale solo su questo browser.'), fds_saved:'Contatto salvato', fds_log:'Contatto per i faldoni smarriti {s}', fds_on_w:'attivato', fds_off_w:'disattivato'
});
Object.assign(I18N.en, {
  fds_h:'Lost binder: people who find it can reach you', fds_p:'When someone finds a binder out of place and scans its QR, without signing in they see only this contact and buttons to call or write to you, with the label code already in the message. No data about the binder is shown.',
  fds_on:'Show the contact to people who find a binder', fds_name:'Name shown', fds_name_ph:'e.g. Rossi office, front desk', fds_phone:'Phone', fds_wa:'WhatsApp (number)', fds_mail:'E-mail', fds_note:'Message (optional)',
  fds_note_ph:'e.g. We are at 1 Main St, open 9-6. Thank you!', fds_prev:'Preview: what the finder sees', fds_need:'Write at least a phone, a WhatsApp number or an e-mail.',
  fds_web:('Works with the online or office version (the QR opens the phone page). With ' + brandName() + ' opened from a file it only works in this browser.'), fds_saved:'Contact saved', fds_log:'Lost-binder contact {s}', fds_on_w:'switched on', fds_off_w:'switched off'
});

function fdsGet(){ const f = S.settings.finder; return f && typeof f === 'object' ? f : {on:false}; }
function fdsPreviewHTML(){
  const f = fdsGet(), n = fdNorm(Object.assign({}, f, {on:true}), false, S.settings.studioName);
  if (!n) return '<div class="hint warn" id="fds-need">' + esc(t('fds_need')) + '</div>';
  return '<div class="fd-pc">' + fdCardHTML(n, 'dm26K8m2P9xL', 'btn btn-sm') + '</div>';
}
function fdsSettingsHTML(){
  const f = fdsGet(), v = (k) => esc(f[k] || '');
  const inp = (k, lbl, ph, type) => '<div class="field"><label for="fds-' + k + '">' + esc(t(lbl)) + '</label><input class="inp" id="fds-' + k + '" data-fd="' + k + '" value="' + v(k) + '"' + (ph ? ' placeholder="' + esc(t(ph)) + '"' : '') + (type ? ' type="' + type + '"' : '') + ' maxlength="' + FD_MAX[k] + '" autocomplete="off"></div>';
  return '<div class="card card-p stack" style="margin-top:16px" id="fds-set"><h2>' + esc(t('fds_h')) + helpDot('finder') + '</h2><p class="small muted">' + esc(t('fds_p')) + '</p>' +
    '<label class="chk"><input type="checkbox" id="fds-on" data-fd="on"' + (f.on ? ' checked' : '') + '>' + esc(t('fds_on')) + '</label>' +
    '<div class="g2">' + inp('name', 'fds_name', 'fds_name_ph') + inp('phone', 'fds_phone', '', 'tel') + inp('whatsapp', 'fds_wa', '', 'tel') + inp('email', 'fds_mail', '', 'email') + '</div>' +
    '<div class="field"><label for="fds-note">' + esc(t('fds_note')) + '</label><textarea class="inp" id="fds-note" data-fd="note" rows="2" maxlength="' + FD_MAX.note + '" placeholder="' + esc(t('fds_note_ph')) + '">' + v('note') + '</textarea></div>' +
    '<div class="hint">' + esc(t('fds_web')) + '</div>' +
    '<details class="fds-prev"' + (f.on ? ' open' : '') + '><summary>' + esc(t('fds_prev')) + '</summary><div id="fds-prev">' + fdsPreviewHTML() + '</div></details></div>';
}
function fdsSet(k, val){
  const f = Object.assign({on:false}, fdsGet());
  const was = !!f.on;
  if (k === 'on') f.on = !!val; else f[k] = String(val || '').slice(0, FD_MAX[k] || 120);
  S.settings.finder = f; S.settings.finderAt = nowISO();
  if (k === 'on' && was !== f.on) logAct('settings.finder', null, t('fds_log', {s:t(f.on ? 'fds_on_w' : 'fds_off_w')}), {on:f.on}, 'ui');
  commit({dirty:false});
  const p = $('#fds-prev'); if (p) p.innerHTML = fdsPreviewHTML();
}
document.addEventListener('input', (e) => { const el = e.target; if (el && el.dataset && el.dataset.fd && el.dataset.fd !== 'on') fdsSet(el.dataset.fd, el.value); });
document.addEventListener('change', (e) => { const el = e.target; if (el && el.dataset && el.dataset.fd === 'on'){ fdsSet('on', el.checked); const d = el.closest('#fds-set') && $('#fds-set details'); if (d && el.checked) d.open = true; } });

/** Shared settings subset (06f packages, 06g server): the finder block, newer finderAt wins. */
function fdsSyncSubset(){ const f = S.settings.finder; return f && typeof f === 'object' && S.settings.finderAt ? {finder:clone(f), finderAt:S.settings.finderAt} : {}; }
function fdsSyncApply(ss){
  if (!ss || !ss.finder || typeof ss.finder !== 'object' || !ss.finderAt) return;
  if (syTs(ss.finderAt) <= syTs(S.settings.finderAt || '')) return;
  const f = {on:ss.finder.on === true}; Object.keys(FD_MAX).forEach(k => { f[k] = fdStr(ss.finder[k], FD_MAX[k]); });
  S.settings.finder = f; S.settings.finderAt = ss.finderAt;
}

(function fdsWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  wrap('viewSettings', (o) => function(){ return o.apply(this, arguments) + fdsSettingsHTML(); });
  // locSyncSubset feeds both the sync packages (06f) and the server settings subset (06g)
  wrap('locSyncSubset', (o) => function(){ return Object.assign(o.apply(this, arguments), fdsSyncSubset()); });
  wrap('locSyncApply', (o) => function(ss){ const r = o.apply(this, arguments); try { fdsSyncApply(ss); } catch(e){} return r; });
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'finder')) return;
  HELP_TOPICS.push({ id:'finder', guide:null, tags:['online'], pop:40, related:['mobile', 'pick'],
    kw:{it:'smarrito perso trovato ritrovato faldone fuori posto contatto chi trova telefono whatsapp email etichetta qr estraneo restituire', en:'lost found binder misplaced contact finder phone whatsapp email label qr stranger return'},
    title:{it:'Se qualcuno trova un faldone smarrito, come ci contatta?', en:'If someone finds a lost binder, how do they reach us?'},
    body:{it:'<p><b>Impostazioni › Faldone smarrito</b>: spunta «Mostra il contatto a chi trova un faldone» e scrivi nome, telefono, WhatsApp o e-mail (anche uno solo) e un messaggio.</p>' +
      '<p>Chi trova il faldone inquadra il QR con la fotocamera: senza accedere vede <b>solo</b> questo contatto e i pulsanti <b>Chiama</b>, <b>WhatsApp</b>, <b>SMS</b>, <b>E-mail</b>, con il codice dell\'etichetta già scritto nel messaggio. Non vede il cliente, il contenuto né se il codice esiste; chi è dello studio accede come sempre sotto.</p>' +
      ('<p>Il contatto viaggia con le impostazioni condivise: dopo «Sincronizza con il server» vale anche sui telefoni e sugli altri PC. Funziona con la versione online o in sede; con ' + brandName() + ' aperto da file vale solo in questo browser. In alternativa l\'installatore può scriverlo in <span class="kbd">docmap.config.js</span> (<span class="kbd">finder</span>).</p>'),
      en:'<p><b>Settings › Lost binder</b>: tick «Show the contact…» and write a name, phone, WhatsApp or e-mail and a message.</p><p>Whoever finds the binder scans the QR: without signing in they see <b>only</b> this contact and Call / WhatsApp / SMS / E-mail buttons with the label code in the message. No binder data is shown. The contact travels with the shared settings (server sync).</p>'}
  });
});
