/* =====================================================================
   DocMap 2026 — v12.6: "Primi passi" — guided first run as a checklist card at the top of the Archivio.
   Seven steps, each detected from the real data (nothing to tick by hand) and each with a button that starts the
   matching guided tour (08-guide.js) or opens the right page:
     1 studio name · 2 client list · 3 first real binder · 4 calibration test sheet · 5 first labels printed or PDF ·
     6 first backup · 7 (optional) online server.
   Done steps stay done (S.settings.firstSteps), also when the activity log is pruned. "Nascondi" hides the card
   (S.settings.firstStepsHidden); Impostazioni › Informazioni su DocMap and the help topic "first-run" show it again
   via the action 'fs-show'. Loaded by index.html after 06o-licence.js. Wrapper only (viewArchive).
   ===================================================================== */
Object.assign(I18N.it, {
  fs_h:'Primi passi', fs_p:'{d} di {n} fatti. Ogni passo ha la sua guida: clicca e segui le frecce.', fs_hide:'Nascondi', fs_show:'Mostra i primi passi', fs_go:'Guidami', fs_open:'Apri', fs_done:'Fatto',
  fs_all:'Tutti i primi passi sono fatti: DocMap è pronto. Puoi nascondere questo riquadro.',
  fs_s_studio:'Scrivi il nome dello studio', fs_s_studio_d:'Impostazioni › nome dello studio: compare sulle etichette e nei PDF.',
  fs_s_clients:'Importa l\'elenco dei clienti', fs_s_clients_d:'Un file CSV o Excel: crea i clienti (e, se vuoi, un faldone ciascuno).',
  fs_s_binder:'Crea il primo faldone vero', fs_s_binder_d:'I faldoni di esempio (tag demo) non contano e non si stampano.',
  fs_s_calib:'Stampa il foglio di prova', fs_s_calib_d:'Su carta normale, sovrapposto al foglio di etichette controluce: i bordi devono coincidere.',
  fs_s_print:'Stampa le prime etichette (o scarica il PDF)', fs_s_print_d:'Prova con poche etichette prima di un foglio intero.',
  fs_s_backup:'Salva il primo backup', fs_s_backup_d:'Copia il file su una chiavetta o in un\'altra cartella.',
  fs_s_server:'Collega il server online (facoltativo)', fs_s_server_d:'Per usare i telefoni e più PC sugli stessi dati.'
});
Object.assign(I18N.en, {
  fs_h:'First steps', fs_p:'{d} of {n} done. Each step has its own guide: click and follow the arrows.', fs_hide:'Hide', fs_show:'Show the first steps', fs_go:'Guide me', fs_open:'Open', fs_done:'Done',
  fs_all:'All first steps are done: DocMap is ready. You can hide this box.',
  fs_s_studio:'Write the studio name', fs_s_studio_d:'Settings › studio name: shown on labels and PDFs.',
  fs_s_clients:'Import the client list', fs_s_clients_d:'A CSV or Excel file: creates the clients (and, if you want, one binder each).',
  fs_s_binder:'Create the first real binder', fs_s_binder_d:'Sample binders (tag demo) do not count and are never printed.',
  fs_s_calib:'Print the test sheet', fs_s_calib_d:'On plain paper, laid over the label sheet against the light: the edges must match.',
  fs_s_print:'Print the first labels (or download the PDF)', fs_s_print_d:'Try a few labels before a full sheet.',
  fs_s_backup:'Save the first backup', fs_s_backup_d:'Copy the file to a USB stick or another folder.',
  fs_s_server:'Connect the online server (optional)', fs_s_server_d:'To use phones and several PCs on the same data.'
});

const FS_DEMO_STUDIO = 'Studio Demo Commercialisti Associati';
const fsLogHas = (re) => typeof LOG === 'object' && Array.isArray(LOG.entries) && LOG.entries.some(e => re.test(String(e.action || '')));
const FS_STEPS = [
  {id:'studio', guide:null, view:'settings', done:() => { const n = String((S.settings || {}).studioName || '').trim(); return !!n && n !== FS_DEMO_STUDIO; }},
  {id:'clients', guide:'import', done:() => (S.clients || []).length > 0},
  {id:'binder', guide:'create', done:() => (S.binders || []).some(b => !isDemo(b))},
  {id:'calib', guide:'calib', done:() => fsLogHas(/^print\.calibration$/)},
  {id:'print', guide:'print', done:() => fsLogHas(/^print\.(labels|pdf)$/)},
  {id:'backup', guide:'backup', done:() => !!S.lastExportAt},
  {id:'server', guide:'server', optional:true, done:() => (typeof dmConfig === 'function' && dmConfig().mode === 'web') || (typeof srvConf === 'function' && !!srvConf())}
];
/** Current state; newly detected steps are remembered in S.settings.firstSteps. */
function fsState(){
  const mem = S.settings.firstSteps || (S.settings.firstSteps = {});
  let changed = false;
  const rows = FS_STEPS.map(st => {
    let d = !!mem[st.id];
    if (!d){ try { d = !!st.done(); } catch(e){ d = false; } if (d){ mem[st.id] = nowISO(); changed = true; } }
    return {st, done:d};
  });
  if (changed) try { savePrefs(); } catch(e){}
  const need = rows.filter(r => !r.st.optional);
  return {rows, done:need.filter(r => r.done).length, total:need.length, all:need.every(r => r.done)};
}
function fsCardHTML(){
  if (S.settings.firstStepsHidden) return '';
  const s = fsState();
  const li = s.rows.map(({st, done}) => '<li class="fs-step' + (done ? ' fs-ok' : '') + '" data-fs="' + st.id + '"><span class="fs-mark" aria-hidden="true">' + (done ? '✓' : '') + '</span><div class="fs-txt"><b>' + esc(t('fs_s_' + st.id)) + '</b><div class="small muted">' + esc(t('fs_s_' + st.id + '_d')) + '</div></div>' +
    (done ? '<span class="small muted">' + esc(t('fs_done')) + '</span>' : '<button class="btn btn-sm" data-a="fs-go" data-id="' + st.id + '">' + esc(st.guide ? t('fs_go') : t('fs_open')) + '</button>') + '</li>').join('');
  return '<section class="card card-p fs-card" id="fs-card" aria-labelledby="fs-title"><div class="row between"><h2 id="fs-title" style="margin:0">' + esc(t('fs_h')) + '</h2><button class="btn btn-sm" data-a="fs-hide">' + esc(t('fs_hide')) + '</button></div>' +
    '<div class="small muted" id="fs-count">' + esc(s.all ? t('fs_all') : t('fs_p', {d:s.done, n:s.total})) + '</div><div class="fs-bar" aria-hidden="true"><span style="width:' + Math.round(100 * s.done / s.total) + '%"></span></div><ol class="fs-list">' + li + '</ol></section>';
}
const FS_ACTIONS = {
  'fs-go': (el) => {
    const st = FS_STEPS.find(x => x.id === el.dataset.id); if (!st) return;
    if (st.guide && typeof GUIDES !== 'undefined' && GUIDES[st.guide]) guideStart(st.guide);
    else { S.view = st.view || 'settings'; renderAll(); }
  },
  'fs-hide': () => { S.settings.firstStepsHidden = true; savePrefs(); renderView(); toast(t('fs_show') + ': ' + t('nav_settings_hint_fs'), 'ok', 5000); },
  'fs-show': () => { S.settings.firstStepsHidden = false; savePrefs(); S.view = 'archive'; renderAll(); }
};
Object.assign(I18N.it, {nav_settings_hint_fs:'Impostazioni › Dati e sicurezza › Informazioni su DocMap'});
Object.assign(I18N.en, {nav_settings_hint_fs:'Settings › Data & security › About DocMap'});
if (typeof ACTIONS === 'object') Object.assign(ACTIONS, FS_ACTIONS);
else document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS === 'object') Object.assign(ACTIONS, FS_ACTIONS); });

(function fsWrap(){
  if (typeof viewArchive === 'function'){
    const ov = viewArchive;
    window.viewArchive = function(){
      const h = ov.apply(this, arguments);
      try {
        const card = fsCardHTML(); if (!card) return h;
        const i = h.indexOf('<div class="demo-bar"');
        if (i >= 0) return h.slice(0, i) + card + h.slice(i);
        const m = h.match(/^<div class="page-h">[\s\S]*?data-a="new-binder"[\s\S]*?<\/div><\/div>/);
        return m ? m[0] + card + h.slice(m[0].length) : card + h;
      } catch(e){ console.warn('fs', e); return h; }
    };
  }
  if (typeof hxAboutHTML === 'function'){
    const oa = hxAboutHTML;
    window.hxAboutHTML = function(){ const h = oa.apply(this, arguments); return h + (S.settings.firstStepsHidden ? '<div style="margin-top:8px"><button class="btn btn-sm" data-a="fs-show" id="fs-show">' + esc(t('fs_show')) + '</button></div>' : ''); };
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'first-steps', guide:null, tags:['start'], related:['first-run', 'import', 'calib', 'backup', 'upgrade'],
    kw:{it:'primi passi inizio checklist cosa fare prima installazione aggiornatore aggiorna-docmap', en:'first steps start checklist what to do first install updater'},
    title:{it:'Primi passi: il riquadro nell\'Archivio e l\'aggiornamento con un doppio clic', en:'First steps: the box in the Archive and the double-click update'},
    body:{it:'<p>In cima all\'<b>Archivio</b> il riquadro <b>Primi passi</b> elenca 7 cose da fare all\'inizio: nome dello studio, elenco clienti, primo faldone vero, foglio di prova, prime etichette, primo backup e (facoltativo) server online. Ogni passo si spunta da solo quando DocMap vede che è fatto; <b>Guidami</b> avvia la guida con le frecce. <b>Nascondi</b> lo toglie; lo ritrovi in <b>Impostazioni › Dati e sicurezza › Informazioni su DocMap</b>.</p><p><b>Aggiornare il programma sul PC</b>: scarica lo zip nuovo, poi doppio clic su ' + HX_K('AGGIORNA-DOCMAP.bat') + ' nella cartella di DocMap (oppure trascina lo zip sopra). Lo script ti ricorda il backup, copia la versione attuale in ' + HX_K('DocMap-copie') + ', mette i file nuovi <b>nella stessa cartella</b> (i dati restano nel browser) e riapre DocMap. Per tornare indietro: ' + HX_K('AGGIORNA-DOCMAP.bat ripristina') + '.</p>',
          en:'<p>At the top of the <b>Archive</b> the <b>First steps</b> box lists 7 things to do at the start: studio name, client list, first real binder, test sheet, first labels, first backup and (optional) online server. Each step ticks itself when DocMap sees it is done; <b>Guide me</b> starts the tour with arrows. <b>Hide</b> removes it; find it again in <b>Settings › Data &amp; security › About DocMap</b>.</p><p><b>Updating the program on the PC</b>: download the new zip, then double-click ' + HX_K('AGGIORNA-DOCMAP.bat') + ' in the DocMap folder (or drop the zip on it). The script reminds you of the backup, copies the current version to ' + HX_K('DocMap-copie') + ', puts the new files <b>in the same folder</b> (data stays in the browser) and reopens DocMap. To go back: ' + HX_K('AGGIORNA-DOCMAP.bat ripristina') + '.</p>'} });
});
