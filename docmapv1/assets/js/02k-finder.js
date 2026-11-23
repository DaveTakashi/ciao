/* =====================================================================
   DocMap 2026 — v12.10 «Faldone smarrito» (lost-item QR), shared by index.html and scan.html (after 02j-pick.js).

   A stranger who finds a binder and scans its QR reaches scan.html without an account. With this switched on
   (Impostazioni › Faldone smarrito, S.settings.finder) the page shows, above the sign-in, ONLY the studio contact
   chosen here and buttons to call / WhatsApp / SMS / e-mail with the label code already written in the message.
   No binder data, no client name, and the page never says whether the code exists.
   Sources, first that is on: the studio settings (local mode: this browser; web mode: public server route
   `finder`, from the shared settings subset), else docmap.config.js `finder` {name, phone, email, whatsapp, note}.
   S.settings.finder = {on:bool, name, phone, email, whatsapp, note}; S.settings.finderAt = ISO (sync: newer wins).
   ===================================================================== */
'use strict';

const FD_MAX = {name:120, phone:40, email:120, whatsapp:40, note:400};

Object.assign(I18N.it, {
  fd_h:'Hai trovato questo faldone?', fd_p:'Grazie! Contatta lo studio che lo custodisce: il codice dell\'etichetta è già scritto nel messaggio.',
  fd_code:'Codice dell\'etichetta', fd_call:'Chiama', fd_wa:'WhatsApp', fd_sms:'SMS', fd_mail:'E-mail',
  fd_msg:'Buongiorno, ho trovato un faldone con l\'etichetta {c}. Come posso restituirlo?', fd_msg0:'Buongiorno, ho trovato un vostro faldone. Come posso restituirlo?',
  fd_subj:'Faldone trovato {c}', fd_staff:'Sei dello studio? Accedi qui sotto.', fd_privacy:'Questa pagina non mostra alcun dato del faldone.'
});
Object.assign(I18N.en, {
  fd_h:'Did you find this binder?', fd_p:'Thank you! Please contact the office that keeps it: the label code is already in the message.',
  fd_code:'Label code', fd_call:'Call', fd_wa:'WhatsApp', fd_sms:'SMS', fd_mail:'E-mail',
  fd_msg:'Hello, I found a binder with the label {c}. How can I return it?', fd_msg0:'Hello, I found one of your binders. How can I return it?',
  fd_subj:'Binder found {c}', fd_staff:'Do you work here? Sign in below.', fd_privacy:'This page shows no data about the binder.'
});

function fdStr(v, max){ return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
/** Clean contact block, or null when off / empty. `implicitOn`: docmap.config.js blocks need no `on`. */
function fdNorm(f, implicitOn, studio){
  if (!f || typeof f !== 'object') return null;
  if (!(f.on === true || (implicitOn && f.on !== false))) return null;
  const o = {};
  Object.keys(FD_MAX).forEach(k => { o[k] = fdStr(f[k], FD_MAX[k]); });
  if (!o.name) o.name = fdStr(studio || '', FD_MAX.name);
  if (o.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(o.email)) o.email = '';
  if (!o.phone && !o.email && !o.whatsapp) return null;
  return o;
}
const fdDigits = (v) => String(v || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
/** Code shown and put in the messages: a plain label code only (never anything else from the address bar). */
function fdCode(v){ v = String(v || '').trim(); return /^[A-Za-z0-9._-]{1,40}$/.test(v) ? v : ''; }
function fdLinks(f, code){
  code = fdCode(code);
  const msg = code ? t('fd_msg', {c:code}) : t('fd_msg0'), out = [];
  const tel = fdDigits(f.phone), wa = fdDigits(f.whatsapp || '').replace(/^\+/, '');
  if (tel) out.push({k:'call', href:'tel:' + tel, label:t('fd_call')});
  if (wa) out.push({k:'wa', href:'https://wa.me/' + wa + '?text=' + encodeURIComponent(msg), label:t('fd_wa')});
  if (tel) out.push({k:'sms', href:'sms:' + tel + '?body=' + encodeURIComponent(msg), label:t('fd_sms')});
  if (f.email) out.push({k:'mail', href:'mailto:' + f.email + '?subject=' + encodeURIComponent(t('fd_subj', {c:code}).trim()) + '&body=' + encodeURIComponent(msg), label:t('fd_mail')});
  return out;
}
/** The card the finder sees (also the live preview in the PC settings). `btn`: class of the buttons. */
function fdCardHTML(f, code, btn){
  code = fdCode(code);
  const L = fdLinks(f, code);
  return '<section class="fd-card" id="fd-card" aria-labelledby="fd-h"><h2 id="fd-h">' + esc(t('fd_h')) + '</h2>' +
    '<p class="fd-p">' + esc(t('fd_p')) + '</p>' +
    '<div class="fd-who"><b>' + esc(f.name) + '</b>' + (f.phone ? '<span>' + esc(f.phone) + '</span>' : '') + (f.email ? '<span>' + esc(f.email) + '</span>' : '') + '</div>' +
    (f.note ? '<p class="fd-note">' + esc(f.note) + '</p>' : '') +
    (code ? '<div class="fd-code"><small>' + esc(t('fd_code')) + '</small><b class="mono">' + esc(code) + '</b></div>' : '') +
    '<div class="fd-btns">' + L.map(x => '<a class="' + esc(btn || 'btn') + ' fd-' + x.k + '" href="' + esc(x.href) + '"' + (x.k === 'wa' ? ' target="_blank" rel="noopener"' : '') + '>' + esc(x.label) + '</a>').join('') + '</div>' +
    '<p class="fd-priv">' + esc(t('fd_privacy')) + '</p></section>';
}
