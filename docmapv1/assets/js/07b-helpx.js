/* =====================================================================
   DocMap 2026 — v11.1 (stream H): knowledge base, guided tours, "Informazioni su DocMap", a11y helpers

   Loaded by index.html right after 08-guide.js (needs HELP_TOPICS / HELP_TAGS / HELP_SYN of 07-help.js and
   GUIDES / navStep of 08-guide.js). Not loaded by scan.html. No data model, storage, DB or API change.

   1. Help topics (HELP_TOPICS, same shape as 07-help.js):
        first-run · server · multi-device · upgrade · scanner · troubleshoot · about
      plus two new topic tags (HELP_TAGS.start "Primi passi", HELP_TAGS.online "Online e sincronizzazione"),
      extra tags / popularity for topics of other files (HELPX_META, merged into HELP_META), extra search synonyms
      (HELP_SYN + HELP_SYN_STEMS) and per-topic search keywords:
        tp.kw = {it:'…', en:'…'}   words indexed like the topic tags (weight 3) but never shown.
   2. Guided tours (GUIDES): firstrun (Impostazioni → nome dispositivo), server (collegare il server online),
      journal (Registro sincronizzazioni). They follow the 08-guide.js rules: a missing target is skipped.
   3. Contextual help: INFO_TAB_HELP maps an Informazioni sub-tab to the topic opened by the "?" next to the
      page title (06d-info.js reads it); the Server online and Registro cards carry their own "?".
   4. "Informazioni su DocMap" (Impostazioni › Dati e sicurezza, and the "about" help topic): app version, local
      SQLite schema (expected DB_SCHEMA_VERSION and the value stored in meta), server API / schema from the last
      ping (HX.ping, filled by a wrapper of DMServer.prototype.call — read only), device name / id, program path
      and storage key, upgrade guides. "Copia dati per l'assistenza" copies a plain-text summary (never tokens).
        HX = { ping:null | {at, url, api, version, schema, php, features}, pingErr:'' }   (memory only)
   5. Accessibility: a persistent polite live region (#hx-live) repeats the association-mode feedback
      (locAssocInput / locAssocUndo of 06h-locations.js re-render their box, which screen readers may not announce).
   ===================================================================== */
'use strict';

const HX = { ping:null, pingErr:'', busy:false };
const HX_SERVER_SCHEMA = 3;   // server-php/api.php DM_SCHEMA this client knows (1 = v10.1, 2 = v11, 3 = v12 access_log)
const HX_UPGRADE_DOCS = ['docs/AGGIORNAMENTI.md', 'docs/AGGIORNAMENTO-v10-v12.md', 'docs/AGGIORNARE-IL-SERVER.md', 'docs/AGGIORNAMENTO-v12.4-v12.5.md', 'docs/AGGIORNAMENTO-v12.3-v12.4.md', 'docs/GUIDA-SINCRONIZZAZIONE.md'];

Object.assign(I18N.it, {
  hx_about:'Informazioni su DocMap', hx_about_d:'Versione, database e dispositivo: utile per gli aggiornamenti e per l\'assistenza.',
  hx_ver:'Versione del programma', hx_db:'Database locale (SQLite)', hx_db_v:'schema {v}', hx_db_exp:'atteso {v}', hx_db_wait:'in avvio…', hx_db_err:'non disponibile: {m}',
  hx_srv:'Server online', hx_srv_none:'non collegato (i dati restano su questo PC)', hx_srv_cfg:'configurato, non ancora verificato', hx_srv_v:'API {v} · schema {s}',
  hx_srv_old:'Il server ha uno schema più vecchio di questo programma: aggiorna prima il server (vedi la guida di aggiornamento).',
  hx_srv_new:'Il server è più recente di questo programma: aggiorna anche questo PC.', hx_srv_at:'verificato il {d}', hx_srv_err:'Verifica non riuscita: {m}',
  hx_ping:'Verifica server', hx_pinging:'Verifico…', hx_dev:'Questo dispositivo', hx_mode:'Modalità', hx_mode_local:'Programma sul PC (file locale)', hx_mode_web:'Web app (online)',
  hx_path:'Percorso del programma', hx_path_d:'I dati sono legati a questo percorso e a questo browser: apri sempre lo stesso index.html.',
  hx_key:'Chiave dei dati nel browser', hx_counts:'Contenuto', hx_counts_v:'{b} faldoni · {c} clienti · {l} ubicazioni',
  hx_docs:'Guide di aggiornamento', hx_docs_d:'Nella cartella docs del pacchetto: la procedura che vale sempre e quella della versione.',
  hx_copy:'Copia dati per l\'assistenza', hx_copied:'Dati per l\'assistenza copiati negli appunti', hx_details:'Dettagli e assistenza', hx_upg_help:'Come aggiornare senza perdere dati',
  hx_live_lbl:'Esito dell\'ultima scansione',
  hx_jr_empty:'Ancora nessuno scambio di dati su questo dispositivo. Il registro si riempie da solo quando usi "Sincronizza con il server" o esporti / importi un pacchetto (sopra).',
  hx_help_jr:'Come si legge e come si risolve una contestazione',
  la_in_box1:'1 faldone qui'
});
Object.assign(I18N.en, {
  hx_about:'About DocMap', hx_about_d:'Version, database and device: useful for upgrades and support.',
  hx_ver:'Program version', hx_db:'Local database (SQLite)', hx_db_v:'schema {v}', hx_db_exp:'expected {v}', hx_db_wait:'starting…', hx_db_err:'not available: {m}',
  hx_srv:'Online server', hx_srv_none:'not connected (data stays on this PC)', hx_srv_cfg:'configured, not checked yet', hx_srv_v:'API {v} · schema {s}',
  hx_srv_old:'The server schema is older than this program: upgrade the server first (see the upgrade guide).',
  hx_srv_new:'The server is newer than this program: upgrade this PC too.', hx_srv_at:'checked on {d}', hx_srv_err:'Check failed: {m}',
  hx_ping:'Check server', hx_pinging:'Checking…', hx_dev:'This device', hx_mode:'Mode', hx_mode_local:'Program on the PC (local file)', hx_mode_web:'Web app (online)',
  hx_path:'Program path', hx_path_d:'Data is tied to this path and this browser: always open the same index.html.',
  hx_key:'Browser data key', hx_counts:'Content', hx_counts_v:'{b} binders · {c} clients · {l} locations',
  hx_docs:'Upgrade guides', hx_docs_d:'In the docs folder of the package: the procedure that always applies and the one of this release.',
  hx_copy:'Copy support details', hx_copied:'Support details copied to the clipboard', hx_details:'Details and support', hx_upg_help:'How to upgrade without losing data',
  hx_live_lbl:'Result of the last scan',
  hx_jr_empty:'No data exchange on this device yet. The journal fills itself when you use "Sync with the server" or export / import a package (above).',
  hx_help_jr:'How to read it and settle a dispute',
  la_in_box1:'1 binder here'
});

/* ---------------- 1. knowledge base ---------------- */
Object.assign(HELP_TAGS, { start:{it:'Primi passi', en:'Getting started'}, online:{it:'Online e sincronizzazione', en:'Online & sync'} });
/* extra synonym groups for the forgiving search (07-help.js helpQueryTerms reads HELP_SYN_STEMS) */
[
  ['server','online','internet','web','cloud','hosting','siteground','condiviso','shared'],
  ['sincronizza','sincronizzare','sincronizzo','sincronizzazione','sync','allinea','allineare','synchronise','synchronize'],
  ['aggiorna','aggiornare','aggiorno','aggiornamento','upgrade','update','migrazione','migrare','versione','version'],
  ['lettore','pistola','scanner','barcode','lettura'],
  ['problema','problemi','errore','errori','guasto','risoluzione','troubleshooting','faq','problem','error','issue'],
  ['contestazione','contestazioni','controversia','disputa','dispute','reclamo'],
  ['ubicazione','ubicazioni','magazzino','scansia','location','locations','warehouse'],
  ['telefono','telefoni','smartphone','cellulare','phone','mobile'],
  ['fotocamera','webcam','camera','videocamera'],
  ['installa','installare','installazione','avvio','primo','inizio','install','setup','start']
].forEach(g => { HELP_SYN.push(g); HELP_SYN_STEMS.push(helpUniq(g.map(helpStem))); });

/* tags / popularity for topics registered by other files (merged into HELP_META before helpEnsure runs) */
const HELPX_META = {
  sync:{tags:['online'], pop:44}, journal:{tags:['online'], pop:42, acts:['what', 'find', 'fix']}, mobile:{tags:['online']}, locations:{tags:['start']},
  'client-new':{tags:['start']}, create:{tags:['start']}, backup:{tags:['start']}, log:{tags:['online']}
};
Object.keys(HELPX_META).forEach(id => {
  const m = HELP_META[id] || {}, x = HELPX_META[id];
  HELP_META[id] = Object.assign({}, m, x, {tags:helpUniq((m.tags || []).concat(x.tags || []))});
});
/* index tp.kw like tags (hidden keywords: error codes, colloquial words) */
(function(){
  const o = window.helpIndex;
  window.helpIndex = function(tp){
    const ix = o(tp);
    if (tp.kw && ix._kw !== S.lang){ const add = helpUniq(helpNorm(L(tp.kw)).split(' ').filter(Boolean).map(helpStem)); ix.tags = helpUniq(ix.tags.concat(add)); ix._kw = S.lang; }
    return ix;
  };
})();

const HX_B = (s) => '<b>' + s + '</b>', HX_K = (s) => '<span class="kbd">' + s + '</span>';
HELP_TOPICS.push(
  { id:'first-run', guide:'firstrun', tags:['start', 'safety'], acts:['how'], pop:78, related:['client-new', 'create', 'backup', 'server', 'troubleshoot'],
    kw:{it:'installare primo avvio nuovo pc zip cartella doppio clic chrome edge inizio configurazione', en:'install first start new pc zip folder double click chrome edge setup'},
    title:{it:'Come inizio: primo avvio sul PC', en:'How do I start: first run on the PC'},
    body:{it:'<ol><li><b>Scegli una cartella fissa</b> e lasciala lì per sempre, ad esempio ' + HX_K('C:\\DocMap') + ' o ' + HX_K('Documenti\\DocMap') + '. Estrai lo zip in quella cartella (non aprirlo dalla cartella Download né dall\'anteprima dello zip).</li>' +
            '<li>Apri ' + HX_K('index.html') + ' con un <b>doppio clic</b>, con <b>Chrome</b> o <b>Edge</b>. Crea un collegamento sul desktop: d\'ora in poi apri sempre <b>quel file</b>, con <b>quel browser</b>.</li>' +
            '<li>Nella prima finestra scegli da dove partire (crea un faldone, stampa, calibra) oppure chiudila.</li>' +
            '<li>In <b>⚙ Funzioni avanzate › Impostazioni</b> scrivi il <b>nome dello studio</b> e il <b>tuo nome</b> (compare nel Registro attività). In fondo, <b>Informazioni su DocMap</b> mostra versione e percorso.</li>' +
            '<li>In <b>⚙ Funzioni avanzate › Sincronizzazione</b> dai un nome a questo PC (<b>Nome del dispositivo</b>, es. "PC Reception"): lo vedrai nel Registro sincronizzazioni.</li>' +
            '<li>Importa l\'elenco clienti (<b>Informazioni › Clienti › Importa elenco clienti</b>), poi crea o importa i faldoni. I 5 faldoni di esempio (tag ' + HX_K('demo') + ') si eliminano dalla barra in Archivio.</li>' +
            '<li>Se lo studio ha il server online, collegalo <b>dopo</b> aver eliminato i faldoni di esempio (vedi "Come collego il PC al server online").</li></ol>' +
            '<p>Dove sono i dati? <b>Nel browser</b> di questo PC (memoria locale + database SQLite), legati al percorso di ' + HX_K('index.html') + '. Un altro browser, un\'altra cartella o una finestra anonima mostrano un archivio vuoto. Per questo fai spesso <b>Salva backup</b> e, se c\'è, sincronizza con il server.</p>',
          en:'<ol><li><b>Choose a fixed folder</b> and leave it there for good, e.g. ' + HX_K('C:\\DocMap') + ' or ' + HX_K('Documents\\DocMap') + '. Extract the zip into that folder (do not open it from Downloads or from the zip preview).</li>' +
            '<li>Open ' + HX_K('index.html') + ' with a <b>double click</b>, in <b>Chrome</b> or <b>Edge</b>. Make a desktop shortcut: from now on always open <b>that file</b> with <b>that browser</b>.</li>' +
            '<li>In the first window choose where to start (create a binder, print, calibrate) or close it.</li>' +
            '<li>In <b>⚙ Advanced tools › Settings</b> type the <b>studio name</b> and <b>your name</b> (shown in the Activity log). At the bottom, <b>About DocMap</b> shows version and path.</li>' +
            '<li>In <b>⚙ Advanced tools › Sync</b> name this PC (<b>Device name</b>, e.g. "Reception PC"): you will see it in the Sync journal.</li>' +
            '<li>Import the client list (<b>Information › Clients › Import client list</b>), then create or import binders. The 5 sample binders (tag ' + HX_K('demo') + ') are deleted from the bar in Archive.</li>' +
            '<li>If the studio has the online server, connect it <b>after</b> deleting the sample binders (see "How do I connect the PC to the online server").</li></ol>' +
            '<p>Where is the data? <b>In the browser</b> of this PC (local storage + SQLite database), tied to the path of ' + HX_K('index.html') + '. Another browser, another folder or a private window show an empty archive. That is why you should <b>Save backup</b> often and, if available, sync with the server.</p>'} },
  { id:'server', guide:'server', tags:['online', 'safety'], acts:['how'], pop:62, related:['multi-device', 'journal', 'sync', 'mobile', 'troubleshoot'],
    kw:{it:'collegare server online token codice di accesso indirizzo api.php prova connessione', en:'connect online server token access code address api.php test connection'},
    title:{it:'Come collego il PC al server online', en:'How do I connect the PC to the online server'},
    body:{it:'<p>Il server online (cartella ' + HX_K('server-php') + ' sul vostro hosting) è il database condiviso dello studio. L\'amministratore lo installa una volta (docs/DEPLOY-WEB.md) e ti dà due cose: l\'<b>indirizzo</b> e un <b>codice di accesso</b> personale.</p>' +
            '<ol><li>Apri <b>⚙ Funzioni avanzate › Sincronizzazione</b> e scorri fino a <b>Server online</b>.</li>' +
            '<li><b>Indirizzo del server</b>: ad esempio ' + HX_K('https://docmap.pr-it.it/studio-de/server-php/api.php') + ' (basta anche l\'indirizzo della cartella: DocMap aggiunge ' + HX_K('server-php/api.php') + ').</li>' +
            '<li><b>Codice di accesso (token)</b>: incollalo così com\'è. Resta solo in questo browser: non va nei backup né nei CSV.</li>' +
            '<li>Premi <b>Salva</b> e poi <b>Prova connessione</b>: deve comparire "Connesso come … (ruolo)".</li>' +
            '<li>Premi <b>Sincronizza con il server</b>. La prima volta, se il server è vuoto, DocMap propone di caricare tutto l\'archivio di questo PC: conferma solo sul PC "principale". Sugli altri PC il primo Sincronizza scarica l\'archivio comune.</li></ol>' +
            '<ul><li><b>Ruoli</b>: Solo lettura (non invia modifiche), Può modificare, Amministratore (vede il registro del server di tutti e crea i codici con <b>Codici di accesso</b>).</li>' +
            '<li><b>Protezione con password della cartella</b>: compilala solo se l\'hosting chiede utente e password (es. SiteGround) e la sincronizzazione viene bloccata.</li>' +
            '<li>La <b>web app</b> e i <b>telefoni</b> lavorano direttamente sul server, in automatico; il PC sincronizza quando premi il pulsante.</li>' +
            '<li>Errori: vedi "Risoluzione problemi" (codice rifiutato, troppi tentativi, orologio, server non raggiungibile).</li></ul>',
          en:'<p>The online server (the ' + HX_K('server-php') + ' folder on your hosting) is the studio\'s shared database. The administrator installs it once (docs/DEPLOY-WEB.md) and gives you two things: the <b>address</b> and a personal <b>access code</b>.</p>' +
            '<ol><li>Open <b>⚙ Advanced tools › Sync</b> and scroll to <b>Online server</b>.</li>' +
            '<li><b>Server address</b>: e.g. ' + HX_K('https://docmap.pr-it.it/studio-de/server-php/api.php') + ' (the folder address is enough too: DocMap appends ' + HX_K('server-php/api.php') + ').</li>' +
            '<li><b>Access code (token)</b>: paste it as it is. It stays only in this browser: never in backups or CSV.</li>' +
            '<li>Press <b>Save</b>, then <b>Test connection</b>: "Connected as … (role)" must appear.</li>' +
            '<li>Press <b>Sync with the server</b>. The first time, with an empty server, DocMap offers to upload this PC\'s whole archive: confirm only on the "main" PC. On the other PCs the first sync downloads the shared archive.</li></ol>' +
            '<ul><li><b>Roles</b>: Read only (sends no changes), Can edit, Administrator (sees everybody\'s server journal and creates codes with <b>Access codes</b>).</li>' +
            '<li><b>Folder password protection</b>: fill it in only if the hosting asks for user and password (e.g. SiteGround) and the sync is blocked.</li>' +
            '<li>The <b>web app</b> and the <b>phones</b> work on the server directly, automatically; the PC syncs when you press the button.</li>' +
            '<li>Errors: see "Troubleshooting" (code refused, too many attempts, clock, server unreachable).</li></ul>'} },
  { id:'multi-device', guide:null, tags:['online'], acts:['how', 'what'], pop:50, related:['server', 'journal', 'sync', 'mobile', 'locations'],
    kw:{it:'piu pc più computer colleghi condivisione telefoni asincrono offline conflitto vince il piu recente', en:'several pcs computers colleagues sharing phones asynchronous offline conflict most recent wins'},
    title:{it:'Come lavoriamo in più PC e telefoni sullo stesso archivio', en:'How do several PCs and phones work on the same archive'},
    body:{it:'<p>Ogni PC ha la sua copia locale dell\'archivio; il <b>server online</b> è il punto d\'incontro. Telefoni e web app scrivono direttamente sul server, i PC si allineano quando premono <b>Sincronizza con il server</b>. Si può lavorare anche senza rete: le modifiche aspettano e partono alla sincronizzazione successiva ("Modifiche da inviare").</p>' +
            '<ol><li>Collega ogni PC al server con il <b>suo</b> codice di accesso e un <b>nome del dispositivo</b> riconoscibile.</li>' +
            '<li>Su un PC nuovo <b>elimina i faldoni di esempio</b> prima della prima sincronizzazione, altrimenti finiscono anche sul server.</li>' +
            '<li>Sincronizza <b>a inizio e a fine lavoro</b> (meglio anche dopo una sessione di etichette o di associazioni). Ogni sincronizzazione riceve prima le novità, poi invia le tue.</li>' +
            '<li>Telefoni: inquadrano il QR, accedono con utente e PIN e salvano subito sul server (anche la modalità associazione delle scatole).</li></ol>' +
            '<ul><li><b>Regola</b>: per ogni faldone, cliente o ubicazione vince la modifica <b>più recente</b>. Per questo data e ora dei dispositivi devono essere giuste: DocMap avvisa se l\'orologio differisce di oltre 2 minuti da quello del server.</li>' +
            '<li><b>Conflitto</b>: lo stesso faldone è cambiato qui e altrove dopo l\'ultima sincronizzazione. Si apre una finestra con i campi affiancati: <b>Tieni locale</b> o <b>Tieni importato</b>.</li>' +
            '<li><b>Tracciabilità</b>: ogni invio e ricezione finisce nel <b>Registro sincronizzazioni</b> con dispositivo, utente, ora e decisione presa; l\'amministratore vede anche quello del server, di tutti.</li>' +
            '<li><b>Senza server</b>: puoi scambiare pacchetti cifrati (Sincronizzazione › 1 Copia export / 2 Importa dati), con le stesse regole.</li></ul>',
          en:'<p>Each PC holds its own local copy of the archive; the <b>online server</b> is the meeting point. Phones and the web app write to the server directly, PCs catch up when they press <b>Sync with the server</b>. You can also work offline: changes wait and leave with the next sync ("Changes to send").</p>' +
            '<ol><li>Connect every PC to the server with <b>its own</b> access code and a recognisable <b>device name</b>.</li>' +
            '<li>On a new PC <b>delete the sample binders</b> before the first sync, otherwise they reach the server too.</li>' +
            '<li>Sync <b>when you start and when you finish</b> (ideally also after a labelling or association session). Every sync first receives the news, then sends yours.</li>' +
            '<li>Phones: scan the QR, log in with user and PIN and save on the server at once (box association mode included).</li></ol>' +
            '<ul><li><b>Rule</b>: for each binder, client or location the <b>most recent</b> change wins. So device date and time must be right: DocMap warns when the clock differs by more than 2 minutes from the server.</li>' +
            '<li><b>Conflict</b>: the same binder changed here and elsewhere since the last sync. A window shows the fields side by side: <b>Keep local</b> or <b>Keep imported</b>.</li>' +
            '<li><b>Traceability</b>: every send and receive goes into the <b>Sync journal</b> with device, user, time and decision; the administrator also sees the server\'s, for everybody.</li>' +
            '<li><b>Without a server</b>: exchange encrypted packages (Sync › 1 Export copy / 2 Import data), with the same rules.</li></ul>'} },
  { id:'upgrade', guide:null, tags:['safety', 'start'], acts:['how', 'fix'], pop:64, related:['backup', 'about', 'server', 'troubleshoot'],
    kw:{it:'nuova versione aggiornamento sostituire file zip migrazione non perdere dati installare sopra', en:'new version upgrade replace files zip migration keep data install over'},
    title:{it:'Come aggiorno DocMap a una nuova versione senza perdere i dati', en:'How do I upgrade DocMap to a new version without losing data'},
    body:{it:'<p>I tuoi dati <b>non sono dentro i file del programma</b>: sono nel browser (e sul server, se lo usate). Aggiornare vuol dire sostituire i file del programma <b>nello stesso percorso</b>: il browser ritrova i dati e la nuova versione li completa da sola (migrazioni solo aggiuntive, niente viene tolto).</p>' +
            '<ol><li><b>Prima</b>, con la versione vecchia: <b>Salva backup</b> (JSON) e, da Database, scarica il file ' + HX_K('.sqlite') + ' (contiene anche le foto). Annota quanti faldoni e clienti hai. Se usate il server: <b>Sincronizza con il server</b>.</li>' +
            '<li>Chiudi tutte le schede di DocMap. Copia da parte la cartella vecchia (per tornare indietro).</li>' +
            '<li>Estrai la nuova versione <b>sopra</b> la cartella di sempre, sovrascrivendo: ' + HX_K('index.html') + ', ' + HX_K('scan.html') + ', ' + HX_K('assets') + ', ' + HX_K('vendor') + ', ' + HX_K('docs') + '. Non rinominare né spostare la cartella. Se avevi personalizzato ' + HX_K('docmap.config.js') + ' (web app), tieni il tuo.</li>' +
            '<li>Riapri lo <b>stesso</b> ' + HX_K('index.html') + ' con lo stesso browser. In <b>Impostazioni › Informazioni su DocMap</b> controlla la nuova versione, poi numero di faldoni e clienti.</li>' +
            '<li><b>Server</b>: si aggiorna <b>per primo</b>. Carica i nuovi file sopra i vecchi <b>senza cancellare</b> ' + HX_K('server-php/config.php') + ' né la cartella dati (' + HX_K('docmap.sqlite') + '); non rieseguire setup.php. Il server aggiorna da solo il suo database alla prima richiesta e continua ad accettare i PC e i telefoni della versione precedente.</li>' +
            '<li>Sincronizza di nuovo e prova un telefono.</li></ol>' +
            '<p><b>Tornare indietro</b>: rimetti la cartella vecchia nello stesso percorso; se serve ripristina il backup. La procedura completa è in ' + HX_K('docs/AGGIORNAMENTI.md') + ', le differenze di ogni versione in ' + HX_K('docs/AGGIORNAMENTO-vX-vY.md') + '.</p>',
          en:'<p>Your data is <b>not inside the program files</b>: it lives in the browser (and on the server, if you use it). Upgrading means replacing the program files <b>at the same path</b>: the browser finds the data again and the new version completes it by itself (additive migrations only, nothing is removed).</p>' +
            '<ol><li><b>First</b>, with the old version: <b>Save backup</b> (JSON) and, from Database, download the ' + HX_K('.sqlite') + ' file (it also holds the photos). Note how many binders and clients you have. If you use the server: <b>Sync with the server</b>.</li>' +
            '<li>Close every DocMap tab. Copy the old folder aside (to go back).</li>' +
            '<li>Extract the new version <b>over</b> the usual folder, overwriting: ' + HX_K('index.html') + ', ' + HX_K('scan.html') + ', ' + HX_K('assets') + ', ' + HX_K('vendor') + ', ' + HX_K('docs') + '. Do not rename or move the folder. If you customised ' + HX_K('docmap.config.js') + ' (web app), keep yours.</li>' +
            '<li>Reopen the <b>same</b> ' + HX_K('index.html') + ' with the same browser. In <b>Settings › About DocMap</b> check the new version, then the number of binders and clients.</li>' +
            '<li><b>Server</b>: it is upgraded <b>first</b>. Upload the new files over the old ones <b>without deleting</b> ' + HX_K('server-php/config.php') + ' or the data folder (' + HX_K('docmap.sqlite') + '); do not run setup.php again. The server upgrades its own database on the first request and keeps accepting PCs and phones of the previous version.</li>' +
            '<li>Sync again and try a phone.</li></ol>' +
            '<p><b>Going back</b>: put the old folder back at the same path; restore the backup if needed. The full procedure is in ' + HX_K('docs/AGGIORNAMENTI.md') + ', the differences of each release in ' + HX_K('docs/AGGIORNAMENTO-vX-vY.md') + '.</p>'} },
  { id:'scanner', guide:null, tags:['qr', 'archive'], acts:['how', 'find', 'fix'], pop:26, related:['locations', 'locate', 'troubleshoot'],
    kw:{it:'lettore pistola usb bluetooth barcode scanner tastiera invio associazione scatole', en:'reader gun usb bluetooth barcode scanner keyboard enter association boxes'},
    title:{it:'Come uso un lettore QR USB o Bluetooth (pistola)', en:'How do I use a USB or Bluetooth QR reader (scan gun)'},
    body:{it:'<p>Quasi tutti i lettori a pistola, USB o Bluetooth, funzionano <b>come una tastiera</b>: "scrivono" il contenuto del QR e premono Invio. Non servono driver.</p>' +
            '<ol><li><b>Prova</b>: apri Blocco note e leggi un\'etichetta. Deve comparire l\'indirizzo intero, ad esempio ' + HX_K('https://qr7.it/dm26K8m2P9xL') + ', e il cursore deve andare a capo.</li>' +
            '<li>Se compaiono caratteri sbagliati (es. ' + HX_K('httpsç--qr7.it') + ') il lettore usa la tastiera americana: imposta la <b>tastiera italiana</b> con il codice di configurazione del manuale. Se non va a capo, abilita il suffisso <b>Invio (CR)</b>.</li>' +
            '<li>Bluetooth: abbinalo in modalità <b>HID / tastiera</b>.</li></ol>' +
            '<ul><li><b>Associare i faldoni alle scatole</b>: Informazioni › Ubicazioni › <b>Modalità associazione</b>. Il campo "Lettore QR / codice + Invio" è già pronto: leggi il QR della scatola, poi quelli dei faldoni. Il campo resta pronto da solo; ogni lettura conferma con un suono e un messaggio.</li>' +
            '<li><b>Cercare un faldone</b>: clicca la ricerca dell\'Archivio e leggi il QR: compare il faldone.</li>' +
            '<li>Funziona anche con il codice scritto: digita ' + HX_K('BL1') + ' (codice parlante) o il codice della scatola e premi Invio.</li>' +
            '<li>Se la lettura "non entra", il cursore non è nel campo: cliccalo e riprova.</li></ul>',
          en:'<p>Almost every scan gun, USB or Bluetooth, works <b>like a keyboard</b>: it "types" the QR content and presses Enter. No drivers needed.</p>' +
            '<ol><li><b>Test</b>: open Notepad and read a label. The whole address must appear, e.g. ' + HX_K('https://qr7.it/dm26K8m2P9xL') + ', and the cursor must move to a new line.</li>' +
            '<li>If wrong characters appear the reader uses another keyboard layout: set the <b>layout of your PC keyboard</b> with the configuration code in its manual. If it does not move to a new line, enable the <b>Enter (CR) suffix</b>.</li>' +
            '<li>Bluetooth: pair it in <b>HID / keyboard</b> mode.</li></ol>' +
            '<ul><li><b>Put binders into boxes</b>: Information › Locations › <b>Association mode</b>. The "QR reader / code + Enter" field is ready: read the box QR, then the binder QR codes. The field stays ready by itself; every read confirms with a sound and a message.</li>' +
            '<li><b>Find a binder</b>: click the Archive search and read the QR: the binder shows up.</li>' +
            '<li>Typed codes work too: type ' + HX_K('BL1') + ' (speaking code) or the box code and press Enter.</li>' +
            '<li>If a read "does not go in", the cursor is not in the field: click it and try again.</li></ul>'} },
  { id:'troubleshoot', guide:null, tags:['safety', 'online'], acts:['fix'], pop:76, related:['first-run', 'upgrade', 'server', 'multi-device', 'scanner', 'about'],
    kw:{it:'faq domande frequenti non vedo i dati spariti vuoto fotocamera bloccata 401 403 429 orologio conflitto errore non funziona aiuto', en:'faq frequently asked data missing gone empty camera blocked 401 403 429 clock conflict error not working help'},
    title:{it:'Risoluzione problemi: domande frequenti', en:'Troubleshooting: frequently asked questions'},
    body:{it:'<dl class="hx-faq">' +
            '<dt>Non vedo più i miei faldoni (archivio vuoto o solo gli esempi)</dt><dd>I dati sono nel browser e legati al percorso del file. Hai aperto DocMap da un\'altra cartella (Download, chiavetta, zip non estratto), con un altro browser, un altro utente di Windows o in una finestra anonima? Riapri l\'' + HX_K('index.html') + ' di sempre (il percorso è in Impostazioni › Informazioni su DocMap). Se i dati non ci sono davvero: <b>Impostazioni › Ripristina da backup JSON</b>, oppure <b>Sincronizza con il server</b>.</dd>' +
            '<dt>"Da esportare" resta arancione</dt><dd>Ci sono modifiche salvate solo nel browser: premi <b>Salva backup</b> (o Ctrl+S). Diventa verde.</dd>' +
            '<dt>La fotocamera non parte</dt><dd>Il browser l\'ha bloccata: clicca l\'icona della fotocamera o del lucchetto nella barra degli indirizzi › <b>Consenti</b> e ricarica. Chiudi le app che la usano (Teams, Zoom). Sul telefono la fotocamera funziona solo con la pagina in <b>https</b> (server dello studio); in alternativa usa la fotocamera del telefono per aprire il QR.</dd>' +
            '<dt>"Il server ha rifiutato il codice di accesso" (errore 401 / 403)</dt><dd>Codice sbagliato, incompleto o revocato. Chiedi all\'amministratore un nuovo codice (Codici di accesso) e incollalo in Sincronizzazione › Server online, poi <b>Prova connessione</b>.</dd>' +
            '<dt>"Troppi codici errati da questa rete" (errore 429)</dt><dd>Il server blocca per qualche minuto la rete dopo molti tentativi sbagliati: aspetta i secondi indicati e riprova con il codice giusto.</dd>' +
            '<dt>"Server non raggiungibile"</dt><dd>Niente rete o indirizzo sbagliato. Controlla l\'indirizzo (deve finire con ' + HX_K('server-php/api.php') + ' o con la cartella). Le modifiche restano su questo PC e partono alla prossima sincronizzazione.</dd>' +
            '<dt>Avviso sull\'orologio</dt><dd>Data e ora di questo dispositivo differiscono da quelle del server: la regola "vince il più recente" potrebbe sbagliare. In Windows: Impostazioni › Data e ora › <b>Imposta automaticamente</b>.</dd>' +
            '<dt>Si apre una finestra di conflitto</dt><dd>Lo stesso faldone è stato cambiato qui e altrove. Guarda i campi affiancati e scegli <b>Tieni locale</b> o <b>Tieni importato</b>; la scelta resta scritta nel Registro sincronizzazioni e si può ripristinare.</dd>' +
            '<dt>Le etichette escono spostate o più piccole</dt><dd>Nel dialogo di stampa: Scala 100% / Dimensioni effettive, Margini: Nessuno. Poi fai la prova di calibrazione.</dd>' +
            '<dt>Il telefono non legge il QR</dt><dd>QR troppo piccolo o rovinato: almeno 15 mm, nero pieno. Ristampa solo quei QR da Informazioni › QR.</dd>' +
            '<dt>Mi serve aiuto</dt><dd>Impostazioni › Informazioni su DocMap › <b>Copia dati per l\'assistenza</b> e incolla il testo nel messaggio: contiene versione, database e dispositivo, mai i codici di accesso.</dd></dl>',
          en:'<dl class="hx-faq">' +
            '<dt>My binders are gone (empty archive or only the samples)</dt><dd>Data lives in the browser, tied to the path of the file. Did you open DocMap from another folder (Downloads, a USB stick, an unextracted zip), with another browser, another Windows user or in a private window? Reopen the usual ' + HX_K('index.html') + ' (its path is in Settings › About DocMap). If the data is really missing: <b>Settings › Restore from JSON backup</b>, or <b>Sync with the server</b>.</dd>' +
            '<dt>"Not exported" stays amber</dt><dd>Some changes are saved only in the browser: press <b>Save backup</b> (or Ctrl+S). It turns green.</dd>' +
            '<dt>The camera does not start</dt><dd>The browser blocked it: click the camera or padlock icon in the address bar › <b>Allow</b> and reload. Close apps using it (Teams, Zoom). On a phone the camera only works with the page on <b>https</b> (the studio server); otherwise use the phone camera to open the QR.</dd>' +
            '<dt>"The server refused the access code" (error 401 / 403)</dt><dd>Wrong, incomplete or revoked code. Ask the administrator for a new code (Access codes), paste it in Sync › Online server, then <b>Test connection</b>.</dd>' +
            '<dt>"Too many wrong codes from this network" (error 429)</dt><dd>After many wrong attempts the server blocks the network for a few minutes: wait the seconds shown and retry with the right code.</dd>' +
            '<dt>"Server unreachable"</dt><dd>No network or wrong address. Check the address (it must end with ' + HX_K('server-php/api.php') + ' or with the folder). Changes stay on this PC and leave with the next sync.</dd>' +
            '<dt>Clock warning</dt><dd>This device\'s date and time differ from the server\'s: the "most recent wins" rule could pick the wrong version. In Windows: Settings › Date & time › <b>Set automatically</b>.</dd>' +
            '<dt>A conflict window opens</dt><dd>The same binder was changed here and elsewhere. Compare the fields side by side and choose <b>Keep local</b> or <b>Keep imported</b>; the choice is recorded in the Sync journal and can be restored.</dd>' +
            '<dt>Labels come out shifted or smaller</dt><dd>In the print dialog: Scale 100% / Actual size, Margins: None. Then run the calibration test.</dd>' +
            '<dt>The phone does not read the QR</dt><dd>QR too small or damaged: at least 15 mm, solid black. Reprint only those QR codes from Information › QR.</dd>' +
            '<dt>I need help</dt><dd>Settings › About DocMap › <b>Copy support details</b> and paste the text in your message: it holds version, database and device, never access codes.</dd></dl>'} },
  { id:'about', guide:null, tags:['safety', 'help'], acts:['what', 'find'], pop:30, related:['upgrade', 'troubleshoot', 'server'],
    kw:{it:'versione numero schema database assistenza supporto informazioni su docmap dispositivo', en:'version number schema database support about docmap device'},
    title:{it:'Dove vedo la versione di DocMap e i dati per l\'assistenza', en:'Where do I see the DocMap version and the support details'},
    body:{it:'<p>In <b>⚙ Funzioni avanzate › Impostazioni</b>, nel riquadro <b>Dati e sicurezza</b>, trovi <b>Informazioni su DocMap</b>: versione del programma, schema del database locale, stato del server online, nome e ID di questo dispositivo. <b>Dettagli e assistenza</b> aggiunge il percorso del programma, la chiave dei dati nel browser e le guide di aggiornamento.</p>' +
            '<ul><li><b>Verifica server</b> interroga il server (senza codice di accesso) e mostra versione dell\'API e schema del suo database: se è più vecchio di questo programma, aggiorna prima il server.</li>' +
            '<li><b>Copia dati per l\'assistenza</b> copia un riepilogo in testo semplice da incollare in una mail: niente codici di accesso, password o dati dei clienti.</li></ul>' +
            '<p><button class="btn btn-sm" data-a="hx-about" type="button">' + 'Apri Informazioni su DocMap' + '</button></p>',
          en:'<p>In <b>⚙ Advanced tools › Settings</b>, in the <b>Data &amp; safety</b> box, you find <b>About DocMap</b>: program version, local database schema, online server status, name and ID of this device. <b>Details and support</b> adds the program path, the browser data key and the upgrade guides.</p>' +
            '<ul><li><b>Check server</b> queries the server (without access code) and shows its API version and database schema: if it is older than this program, upgrade the server first.</li>' +
            '<li><b>Copy support details</b> copies a plain-text summary to paste into an email: no access codes, passwords or client data.</li></ul>' +
            '<p><button class="btn btn-sm" data-a="hx-about" type="button">' + 'Open About DocMap' + '</button></p>'} }
);

/* ---------------- 2. guided tours ---------------- */
Object.assign(GUIDES, {
  firstrun: { pop:70, title:{it:'Primo avvio: prepara DocMap su questo PC', en:'First run: set DocMap up on this PC'}, steps:[
    navStep('settings', {it:'Apri Impostazioni', en:'Open Settings'}, {it:'Apri "Impostazioni".', en:'Open "Settings".'}),
    { target:() => { const el = $('#se-studio'); return el && el.closest('.field'); }, title:{it:'Nome dello studio', en:'Studio name'}, text:{it:'Scrivi il nome dello studio: compare sulla pagina del telefono e nei PDF.', en:'Type the studio name: it shows on the phone page and in the PDFs.'} },
    { target:() => { const el = $('#se-operator'); return el && el.closest('.field'); }, title:{it:'Il tuo nome', en:'Your name'}, text:{it:'Scrivi il tuo nome: il Registro attività dirà chi ha fatto ogni operazione da questo PC.', en:'Type your name: the Activity log will say who did each operation from this PC.'} },
    { target:'#hx-about', title:{it:'Informazioni su DocMap', en:'About DocMap'}, text:{it:'Qui vedi versione, database e dispositivo. "Dettagli e assistenza" mostra anche il percorso del programma: aprilo sempre da lì, con lo stesso browser.', en:'Here you see version, database and device. "Details and support" also shows the program path: always open it from there, with the same browser.'} },
    navStep('sync', {it:'Apri Sincronizzazione', en:'Open Sync'}, {it:'Apri "Sincronizzazione".', en:'Open "Sync".'}),
    { target:() => { const el = $('#sy-label'); return el && el.closest('.field'); }, title:{it:'Nome del dispositivo', en:'Device name'}, text:{it:'Dai un nome a questo PC, ad esempio "PC Reception": lo vedrai nel Registro sincronizzazioni e sul server.', en:'Name this PC, e.g. "Reception PC": you will see it in the Sync journal and on the server.'} },
    { final:true, title:{it:'DocMap è pronto ✓', en:'DocMap is ready ✓'}, text:{it:'Ora importa l\'elenco clienti o crea il primo cliente. Se lo studio ha il server online, collegalo dopo aver eliminato i faldoni di esempio.', en:'Now import the client list or create the first client. If the studio has the online server, connect it after deleting the sample binders.'}, chain:'client' }
  ]},
  server: { pop:62, title:{it:'Collega il PC al server online', en:'Connect the PC to the online server'}, steps:[
    navStep('sync', {it:'Apri Sincronizzazione', en:'Open Sync'}, {it:'Apri "Sincronizzazione".', en:'Open "Sync".'}),
    { target:() => $('#srv-card'), title:{it:'Server online', en:'Online server'}, text:{it:'Questo riquadro collega il PC al database condiviso dello studio. Ti servono indirizzo e codice di accesso dati dall\'amministratore.', en:'This box connects the PC to the studio\'s shared database. You need the address and access code given by the administrator.'} },
    { target:() => { const el = $('#srv-url'); return el && el.closest('.grid'); }, title:{it:'Indirizzo e codice', en:'Address and code'}, text:{it:'Indirizzo: es. https://…/server-php/api.php. Codice di accesso: incollalo così com\'è; resta solo in questo browser.', en:'Address: e.g. https://…/server-php/api.php. Access code: paste it as it is; it stays only in this browser.'} },
    { target:'[data-a="srv-test"]', title:{it:'Prova connessione', en:'Test connection'}, text:{it:'Premi "Prova connessione": deve comparire "Connesso come … (ruolo)". Se compare un errore, apri "Risoluzione problemi" nella guida.', en:'Press "Test connection": "Connected as … (role)" must appear. If an error shows, open "Troubleshooting" in help.'} },
    { target:'#srv-sync', title:{it:'Sincronizza', en:'Sync'}, text:{it:'"Sincronizza con il server" riceve le novità e invia le tue. La prima volta, con il server vuoto, propone di caricare tutto l\'archivio.', en:'"Sync with the server" receives the news and sends yours. The first time, with an empty server, it offers to upload the whole archive.'} },
    { target:() => $('#jr-card'), title:{it:'Registro sincronizzazioni', en:'Sync journal'}, text:{it:'Ogni sincronizzazione lascia qui una traccia: dispositivo, utente, ora e cosa è successo a ogni faldone.', en:'Every sync leaves a trace here: device, user, time and what happened to each binder.'} },
    { final:true, title:{it:'Server collegato ✓', en:'Server connected ✓'}, text:{it:'Sincronizza a inizio e fine lavoro. I telefoni e la web app lavorano direttamente sul server.', en:'Sync when you start and finish work. Phones and the web app work on the server directly.'}, chain:'journal' }
  ]},
  journal: { pop:42, title:{it:'Leggi il Registro sincronizzazioni', en:'Read the Sync journal'}, steps:[
    navStep('sync', {it:'Apri Sincronizzazione', en:'Open Sync'}, {it:'Apri "Sincronizzazione".', en:'Open "Sync".'}),
    { target:() => $('#jr-card'), title:{it:'Il registro', en:'The journal'}, text:{it:'In fondo alla pagina: ogni scambio di dati (server, pacchetti, telefoni) con ora, dispositivo, utente ed esito.', en:'At the bottom of the page: every data exchange (server, packages, phones) with time, device, user and result.'} },
    { target:() => $('#jr-card .jr-filters'), title:{it:'Filtri', en:'Filters'}, text:{it:'Per una contestazione scrivi il codice del faldone (es. BL1) e, se serve, le date o l\'utente.', en:'For a dispute type the binder code (e.g. BL1) and, if needed, the dates or the user.'} },
    { target:() => $('#jr-list'), title:{it:'Voci e dettagli', en:'Entries and details'}, text:{it:'"Dettagli" mostra i campi prima e dopo e quale versione è stata tenuta; da lì puoi ripristinare una versione (diventa una nuova modifica, registrata).', en:'"Details" shows the fields before and after and which version was kept; from there you can restore a version (it becomes a new, recorded change).'} },
    { target:() => $('#jr-card .jr-exp'), title:{it:'Esporta la prova', en:'Export the evidence'}, text:{it:'"Esporta CSV" o "Esporta JSON" salvano le voci filtrate, da conservare o inviare.', en:'"Export CSV" or "Export JSON" save the filtered entries, to keep or send.'} },
    { final:true, title:{it:'Fatto ✓', en:'Done ✓'}, text:{it:'L\'amministratore, collegato al server, vede anche il registro del server di tutti i dispositivi (pulsante "Server").', en:'The administrator, connected to the server, also sees the server journal of all devices ("Server" button).'} }
  ]}
});

/* ---------------- 3. contextual help ---------------- */
/** Informazioni sub-tab → topic opened by the "?" next to the page title (06d-info.js viewInfo). */
const INFO_TAB_HELP = { clients:'clients', qr:'qr-reprint', loc:'locations' };

/* ---------------- 4. Informazioni su DocMap ---------------- */
function hxDbSchema(){
  if (typeof DB === 'undefined') return {state:'none'};
  if (DB.error) return {state:'err', msg:String(DB.error.message || DB.error)};
  if (!DB.ready) return {state:'wait'};
  let v = ''; try { const r = dbQuery("SELECT value FROM meta WHERE key = 'schema_version'"); v = r[0] ? String(r[0].value) : ''; } catch(e){ v = ''; }
  return {state:'ok', stored:v, expected:String(typeof DB_SCHEMA_VERSION !== 'undefined' ? DB_SCHEMA_VERSION : '')};
}
function hxServerUrl(){
  if (typeof dmConfig !== 'function') return '';
  const c = dmConfig();
  if (c.mode === 'web') return c.apiBase && typeof dmServerUrl === 'function' ? dmServerUrl(c.apiBase) : '';
  const lc = typeof srvLocalConf === 'function' ? srvLocalConf() : {};
  return lc.url && typeof srvNormUrl === 'function' ? srvNormUrl(lc.url) : '';
}
function hxDevice(){
  return {name:typeof syncDeviceLabel === 'function' ? syncDeviceLabel() : '', id:typeof syncDeviceId === 'function' ? syncDeviceId() : '',
    mode:typeof dmConfig === 'function' && dmConfig().mode === 'web' ? 'web' : 'local'};
}
function hxProgramPath(){ try { return decodeURIComponent(location.pathname || ''); } catch(e){ return location.pathname || ''; } }
/** Plain facts shown by the panel and copied for support. Never tokens, passwords or archive contents. */
function hxFacts(){
  const db = hxDbSchema(), url = hxServerUrl(), dev = hxDevice(), pg = HX.ping && HX.ping.url === url ? HX.ping : null;
  return {version:APP_VERSION, db, url, ping:pg, dev, path:hxProgramPath(), key:typeof LS_KEY !== 'undefined' ? LS_KEY : '',
    counts:{b:S.binders.length, c:(S.clients || []).length, l:(S.locations || []).length}, ua:navigator.userAgent};
}
function hxDbText(db){
  if (db.state === 'ok') return t('hx_db_v', {v:db.stored || '?'}) + (db.stored !== db.expected ? ' (' + t('hx_db_exp', {v:db.expected}) + ')' : '');
  if (db.state === 'wait') return t('hx_db_wait');
  return t('hx_db_err', {m:db.msg || '—'});
}
function hxSrvText(f){
  if (!f.url) return t('hx_srv_none');
  if (f.ping) return t('hx_srv_v', {v:f.ping.version || f.ping.api || '?', s:f.ping.schema != null ? f.ping.schema : '?'});
  return t('hx_srv_cfg');
}
function hxSrvWarn(f){
  if (!f.ping || f.ping.schema == null) return '';
  const s = +f.ping.schema;
  return s < HX_SERVER_SCHEMA ? t('hx_srv_old') : s > HX_SERVER_SCHEMA ? t('hx_srv_new') : '';
}
/** Compact block inside Impostazioni › Dati e sicurezza (replaces the old one-line "se_about"). */
function hxAboutHTML(){
  const f = hxFacts(), w = hxSrvWarn(f);
  const row = (k, v, id) => '<div class="hx-kv"><dt>' + esc(k) + '</dt><dd' + (id ? ' id="' + id + '"' : '') + '>' + v + '</dd></div>';
  return '<section class="hx-about" id="hx-about" aria-labelledby="hx-about-h"><h3 id="hx-about-h">' + ic('info') + esc(t('hx_about')) + helpDot('about') + '</h3><dl class="hx-dl">' +
      row(t('hx_ver'), '<b class="mono" id="hx-ver">' + esc(f.version) + '</b>') +
      row(t('hx_db'), esc(hxDbText(f.db)), 'hx-db') +
      row(t('hx_srv'), esc(hxSrvText(f)), 'hx-srv') +
      row(t('hx_dev'), esc(f.dev.name) + (f.dev.id ? ' <span class="mono tiny muted">' + esc(f.dev.id.slice(0, 12)) + '…</span>' : ''), 'hx-dev') + '</dl>' +
      (w ? '<div class="warn-box small" id="hx-srv-warn">' + ic('alert') + '<div>' + esc(w) + '</div></div>' : '') +
      '<div class="row hx-acts"><button class="btn btn-sm" data-a="hx-about" id="hx-about-btn">' + ic('info') + esc(t('hx_details')) + '</button>' +
      '<button class="btn btn-sm" data-a="hx-copy">' + ic('copy') + esc(t('hx_copy')) + '</button></div></section>';
}
function hxAboutBody(){
  const f = hxFacts(), w = hxSrvWarn(f);
  const row = (k, v, id) => '<div class="hx-kv"><dt>' + esc(k) + '</dt><dd' + (id ? ' id="' + id + '"' : '') + '>' + v + '</dd></div>';
  return '<p class="small muted" style="margin-top:0">' + esc(t('hx_about_d')) + '</p><dl class="hx-dl hx-dl-full">' +
      row(t('hx_ver'), '<b class="mono">' + esc(f.version) + '</b>', 'hx-m-ver') +
      row(t('hx_db'), esc(hxDbText(f.db)), 'hx-m-db') +
      row(t('hx_counts'), esc(t('hx_counts_v', f.counts))) +
      row(t('hx_srv'), (f.url ? '<span class="mono small hx-break">' + esc(f.url) + '</span><br>' : '') + '<span id="hx-m-srv">' + esc(hxSrvText(f)) + '</span>' +
        (f.ping ? ' <span class="tiny muted">· ' + esc(t('hx_srv_at', {d:fmtDate(f.ping.at, true)})) + (f.ping.php ? ' · PHP ' + esc(f.ping.php) : '') + '</span>' : '') +
        (HX.pingErr ? '<div class="err-t small" id="hx-m-err">' + esc(t('hx_srv_err', {m:HX.pingErr})) + '</div>' : '') +
        (f.url ? '<div style="margin-top:6px"><button class="btn btn-sm" data-a="hx-ping" id="hx-ping"' + (HX.busy ? ' disabled' : '') + '>' + ic('refresh') + esc(HX.busy ? t('hx_pinging') : t('hx_ping')) + '</button></div>' : '')) +
      row(t('hx_dev'), esc(f.dev.name) + '<br><span class="mono tiny hx-break">' + esc(f.dev.id) + '</span>') +
      row(t('hx_mode'), esc(t(f.dev.mode === 'web' ? 'hx_mode_web' : 'hx_mode_local'))) +
      row(t('hx_path'), '<span class="mono small hx-break" id="hx-m-path">' + esc(f.path) + '</span><div class="hint">' + esc(t('hx_path_d')) + '</div>') +
      row(t('hx_key'), '<span class="mono small">' + esc(f.key) + '</span>') +
      row(t('hx_docs'), HX_UPGRADE_DOCS.map(d => '<span class="kbd">' + esc(d) + '</span>').join(' ') + '<div class="hint">' + esc(t('hx_docs_d')) + '</div>') + '</dl>' +
    (w ? '<div class="warn-box small">' + ic('alert') + '<div>' + esc(w) + '</div></div>' : '') +
    '<div class="row hx-acts" style="margin-top:12px"><button class="btn btn-sm" data-a="hx-help" data-id="upgrade">' + ic('book') + esc(t('hx_upg_help')) + '</button></div>';
}
function hxSupportText(){
  const f = hxFacts();
  return ['DocMap 2026 ' + f.version, t('hx_mode') + ': ' + t(f.dev.mode === 'web' ? 'hx_mode_web' : 'hx_mode_local'),
    t('hx_db') + ': ' + hxDbText(f.db), t('hx_counts') + ': ' + t('hx_counts_v', f.counts),
    t('hx_srv') + ': ' + (f.url ? f.url + ' · ' : '') + hxSrvText(f) + (f.ping ? ' · ' + t('hx_srv_at', {d:fmtDate(f.ping.at, true)}) + (f.ping.php ? ' · PHP ' + f.ping.php : '') : ''),
    t('hx_dev') + ': ' + f.dev.name + ' (' + f.dev.id + ')', t('hx_path') + ': ' + f.path, t('hx_key') + ': ' + f.key,
    'Browser: ' + f.ua, nowISO()].join('\n');
}
function hxAboutOpen(){
  if (typeof helpClose === 'function' && HELP.open) helpClose();
  openModal({ title:t('hx_about'), size:'', body:'<div id="hx-about-body">' + hxAboutBody() + '</div>',
    buttons:[{label:t('hx_copy'), cls:'btn', icon:'copy', fn:() => { hxCopy(); return false; }}, {label:t('close'), cls:'btn btn-primary', fn:() => closeModal()}] });
}
function hxRefresh(){
  const b = document.getElementById('hx-about-body'); if (b) b.innerHTML = hxAboutBody();
  const a = document.getElementById('hx-about'); if (a) a.outerHTML = hxAboutHTML();
}
async function hxCopy(){ await copyText(hxSupportText()); toast(t('hx_copied')); }
/** Ask the configured server for ?r=ping (public route, no token sent). Result kept in memory only. */
async function hxPing(){
  const url = hxServerUrl(); if (!url || typeof DMServer !== 'function' || HX.busy) return null;
  const web = dmConfig().mode === 'web', lc = !web && typeof srvLocalConf === 'function' ? srvLocalConf() : {};
  HX.busy = true; HX.pingErr = ''; hxRefresh();
  try { await new DMServer(url, '', {simple:!web, basic:lc.basic || ''}).call('ping', {timeout:15000}); }
  catch(e){ HX.pingErr = (e && (e.message || e.code)) || 'error'; }
  finally { HX.busy = false; hxRefresh(); }
  return HX.ping;
}
/* remember every successful ping (also the one srvSync makes) — read only, nothing else changes */
function hxWrapPing(){
  if (typeof DMServer !== 'function' || DMServer.prototype.call.__hx) return;
  const o = DMServer.prototype.call;
  DMServer.prototype.call = async function(route){
    const r = await o.apply(this, arguments);
    if (route === 'ping' && r && typeof r === 'object') HX.ping = {at:nowISO(), url:this.base, api:r.api || '', version:r.version || '', schema:r.schema != null ? r.schema : null, php:r.php || '', features:Array.isArray(r.features) ? r.features : []};
    return r;
  };
  Object.keys(o).forEach(k => { DMServer.prototype.call[k] = o[k]; });
  DMServer.prototype.call.__hx = true;
}

/* ---------------- 5. accessibility: association feedback live region ---------------- */
function hxLive(text){
  let el = document.getElementById('hx-live');
  if (!el){ el = document.createElement('div'); el.id = 'hx-live'; el.className = 'sr-only'; el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); el.setAttribute('aria-label', t('hx_live_lbl')); document.body.appendChild(el); }
  el.textContent = ''; setTimeout(() => { el.textContent = text || ''; }, 30);
}
function hxWrapAssoc(){
  ['locAssocInput', 'locAssocUndo'].forEach(n => {
    const o = window[n]; if (typeof o !== 'function' || o.__hx) return;
    window[n] = function(){ const r = o.apply(this, arguments); try { const m = typeof LUI !== 'undefined' && LUI.assoc && LUI.assoc.msg; if (m && m.text) hxLive(m.text); } catch(e){} return r; };
    window[n].__hx = true;
  });
}

const HX_ACTIONS = {
  'hx-about': () => hxAboutOpen(),
  'hx-copy': () => hxCopy(),
  'hx-ping': () => hxPing(),
  'hx-help': (el, e) => { if (e) e.stopPropagation(); while (topModal()) closeModal(true); helpOpen(el.dataset.id); }
};
document.addEventListener('DOMContentLoaded', () => {
  if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, HX_ACTIONS);
  hxWrapPing(); hxWrapAssoc();
  hxLive('');
  // "Vedi anche" links from older topics to the new ones (after every module has pushed its topics)
  setTimeout(() => {
    const link = {sync:['server', 'multi-device'], mobile:['multi-device', 'server'], info:['locations'], backup:['upgrade'], session:['upgrade'], locations:['scanner'], nav:['about'], log:['journal']};
    Object.keys(link).forEach(id => { const tp = HELP_TOPICS.find(x => x.id === id); if (tp) tp.related = helpUniq((tp.related || []).concat(link[id])); });
  }, 0);
});
