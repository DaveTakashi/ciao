/* =====================================================================
   DocMap 2026 — v12.11 «Ricerca a voce» on the PC (index.html, after 04d-palette.js). Roadmap K7.
   A microphone button in the Archivio search box and in «Cerca ovunque» (Ctrl+K): say what you are looking for,
   vsParse (02m-voice.js) turns it into the search language and the results appear, with a line saying what was
   heard and what was searched («Ho capito: … → cerco: …»). Shown only where the browser has speech recognition
   (Chrome, Edge); hidden elsewhere. The phone page uses the same parser (11d-search.js, srPhVoice).
   ===================================================================== */
'use strict';

Object.assign(I18N.it, {
  vs_mic:'Cerca a voce', vs_listen:'Ti ascolto… dimmi cosa cerchi (es. «fatture di Rossi del 2023 fuori archivio»)', vs_heard:'Ho capito «{s}» → cerco: {q}', vs_none:'Non ho sentito niente: riprova.',
  vs_note:'La dettatura usa il riconoscimento vocale del browser (Chrome / Edge possono inviare l\'audio al loro servizio). DocMap riceve solo il testo.'
});
Object.assign(I18N.en, {
  vs_mic:'Search by voice', vs_listen:'Listening… say what you are looking for (e.g. «Rossi invoices 2023 checked out»)', vs_heard:'Heard «{s}» → searching: {q}', vs_none:'Nothing heard: try again.',
  vs_note:'Dictation uses the browser\'s speech recognition (Chrome / Edge may send the audio to their service). DocMap only gets the text.'
});
if (typeof ICONS === 'object' && !ICONS.mic) ICONS.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>';

const VSU = {stop:null, where:'', heard:false};
const vsLang = () => (S.lang === 'en' ? 'en-GB' : 'it-IT');
function vsMicHTML(where){ return vsOk() ? '<button type="button" class="vs-mic" data-a="vs-mic" data-w="' + where + '" title="' + esc(t('vs_mic')) + '" aria-label="' + esc(t('vs_mic')) + '">' + ic('mic') + '</button>' : ''; }
/** Apply a spoken sentence: parse it and run it where it was said ('arch' = Archivio search, 'ck' = Ctrl+K). */
function vsApply(where, text){
  const r = vsParse(text); if (!r.q) return r;
  if (where === 'ck'){
    const i = document.getElementById('ck-q');
    if (i){ i.value = r.q; i.dispatchEvent(new Event('input', {bubbles:true})); i.focus(); }
  } else {
    if (S.view !== 'archive'){ S.view = 'archive'; savePrefs(); renderAll(); }
    if (typeof srSetQ === 'function') srSetQ(r.q, true); else { UI.q = r.q; renderArchiveResults(); }
  }
  toast(t('vs_heard', {s:r.said, q:r.q}), 'ok', 6000);
  if (typeof logAct === 'function') { try { logAct('search.voice', null, 'Ricerca a voce: ' + r.q, {said:r.said.slice(0, 200), q:r.q}, 'ui'); } catch(e){} }
  return r;
}
function vsMark(on){ $$('.vs-mic').forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
const VS_ACTIONS = {
  'vs-mic': (el) => {
    if (VSU.stop){ VSU.stop(); return; }
    const where = el.dataset.w || 'arch'; VSU.where = where; VSU.heard = false;
    VSU.stop = vsListen({lang:vsLang(), onText:(txt) => { VSU.heard = true; vsApply(where, txt); }, onEnd:() => { VSU.stop = null; vsMark(false); if (!VSU.heard) toast(t('vs_none'), 'warn'); }});
    if (VSU.stop){ vsMark(true); toast(t('vs_listen'), 'info', 5000); }
  },
};
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, VS_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, VS_ACTIONS); });

(function vsWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  wrap('viewArchive', (o) => function(){
    const h = o.apply(this, arguments); if (!vsOk()) return h;
    return h.replace(/(<div class="search">[\s\S]*?<input class="inp" type="search" data-bind="q"[^>]*>)/, '$1' + vsMicHTML('arch'));
  });
  wrap('ckOpen', (o) => function(){
    const r = o.apply(this, arguments);
    try { const k = document.querySelector('#ck .ck-in kbd'); if (k && vsOk() && !document.querySelector('#ck .vs-mic')) k.insertAdjacentHTML('beforebegin', vsMicHTML('ck')); } catch(e){}
    return r;
  });
})();
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'voice')) return;
  HELP_TOPICS.push({ id:'voice', guide:null, tags:['archive'], pop:44, related:['nav'],
    kw:{it:'voce vocale dettatura parlare microfono cerca a voce dire ricerca parlata', en:'voice speech dictation speak microphone search by voice'},
    title:{it:'Come cerco un faldone a voce?', en:'How do I search for a binder by voice?'},
    body:{it:'<p>Premi il <b>microfono</b> nella ricerca dell\'Archivio, in <b>Cerca ovunque</b> (Ctrl+K) o nella ricerca del telefono e di\' cosa cerchi, come lo diresti a un collega:</p><ul>' +
      '<li>«trovami le <b>fatture di Rossi del 2023</b>» → <code>fatture rossi anno:2023</code></li><li>«i faldoni <b>fuori archivio</b> di Bianchi» → <code>bianchi stato:fuori</code></li>' +
      '<li>«paghe <b>dal 2019 al 2021</b>» → <code>paghe anno:2019..2021</code>; «<b>prima del</b> 2015», «<b>dopo il</b> 2020»</li><li>«<b>codice</b> B L tre» → <code>bl3</code>; «<b>tag</b> iva», «<b>categoria</b> APS», «<b>stanza</b> B»</li></ul>' +
      '<p>DocMap scrive sotto cosa ha capito e cosa cerca; puoi correggere il testo a mano. Gli anni si possono dire anche in parole (duemilaventitré). Il microfono compare solo dove il browser sa riconoscere la voce (Chrome, Edge, Safari): il riconoscimento è del browser, che può inviare l\'audio al proprio servizio; DocMap riceve solo il testo.</p>',
      en:'<p>Press the <b>microphone</b> in the Archive search, in Ctrl+K or on the phone search and say what you need: «Rossi invoices 2023 checked out» → <code>rossi invoices anno:2023 stato:fuori</code>; ranges («from 2019 to 2021»), «before» / «after», spelled codes («code B L 3»), «tag», «category». The browser does the recognition; DocMap only gets the text.</p>'}
  });
});
