/* =====================================================================
   DocMap 2026 — Help centre: "?" drawer, tagged how-to topics, mini wiki,
   contextual help dots and first-run onboarding.
   ===================================================================== */
Object.assign(I18N.it, {
  nav_database:'Database',
  db_h:'Database SQLite locale', db_p:'Un vero database SQLite che gira nel browser, senza server e senza installazione. L\'archivio viene copiato nelle tabelle a ogni modifica; puoi salvare sessioni con un nome e scaricare o riaprire il file .sqlite.',
  db_status:'Stato del database', db_loading:'Avvio del motore SQLite…', db_err:'Il motore SQLite non si è avviato. Le altre funzioni (localStorage, CSV, JSON) restano disponibili.',
  db_items:'Voci contenuto', db_sessions:'Sessioni', db_size:'Dimensione', db_where:'copia di lavoro nel browser (IndexedDB)', db_last_sync:'ultima sincronizzazione {d}',
  db_save_h:'Salva una sessione', db_save_d:'Fotografa tutto (faldoni, impostazioni, preset, mappa fogli) dentro il database. Potrai ripristinarla in qualsiasi momento.',
  db_s_name:'Nome sessione', db_s_name_ph:'es. Inventario stanza A — novembre', db_s_note:'Nota (opzionale)', db_s_note_ph:'es. prima della riorganizzazione',
  db_save_btn:'Salva sessione nel database', db_saved:'Sessione salvata: {n}', db_need_name:'Scrivi un nome per la sessione.',
  db_list_h:'Sessioni salvate', db_none:'Nessuna sessione salvata.', db_restore:'Ripristina', db_date:'Data', db_restored:'Sessione ripristinata',
  db_restore_detail:'Ripristinare la sessione "{n}"? L\'archivio attuale ({c} faldoni) verrà sostituito.', db_del_detail:'Eliminare la sessione "{n}" dal database?',
  db_file_h:'File .sqlite', db_file_d:'Scarica il database completo (tabelle + sessioni) o riapri un file DocMap .sqlite salvato in precedenza.',
  db_download:'Scarica docmap.sqlite', db_open:'Apri file .sqlite', db_open_ok:'Apri e sostituisci', db_open_detail:'Aprire "{f}"? Contiene {n} faldoni e {s} sessioni. L\'archivio attuale ({c} faldoni) verrà sostituito.',
  db_opened:'Database aperto: {n} faldoni', db_bad_file:'Il file non è un database DocMap valido.',
  db_link_h:'Salvataggio automatico su disco', db_link:'Collega un file .sqlite sul PC', db_link_d:'Scegli dove salvare docmap.sqlite: da quel momento ogni modifica viene scritta nel file (Chrome / Edge).',
  db_linked:'File collegato: {f}', db_linked_ok:'Salvataggio automatico attivo • ultimo salvataggio {d}', db_linked_perm:'Il browser chiede di riautorizzare l\'accesso al file dopo il riavvio.',
  db_reauth:'Riautorizza', db_unlink:'Scollega', db_fsa_no:'Questo browser non permette di scrivere direttamente su un file del disco: usa "Scarica docmap.sqlite" (Chrome ed Edge supportano il collegamento).',
  db_console:'Console SQL (sola lettura)', db_console_d:'Interroga le tabelle con SELECT. Le modifiche si fanno dall\'interfaccia, così nulla va fuori sincronia.',
  db_run:'Esegui query', db_ro:'Sono permesse solo query di lettura (SELECT / WITH), una alla volta.',
  db_ex_rooms:'Faldoni per armadio', db_ex_manifest:'Vista manifest qr7', db_ex_year:'Contenuti 2025', db_ex_out:'Prelevati', db_schema:'Struttura tabelle',
  help:'Guida', help_h:'Guida e azioni guidate', help_search:'Cerca: etichetta, stampa, esporta, QR, backup…', help_all:'Tutti', help_back:'Tutti gli argomenti', help_start:'Avvia azione guidata',
  help_start_d:'Ti accompagna passo passo dentro l\'app: compili e clicchi tu, il risultato è reale.', help_related:'Vedi anche', help_none:'Nessun argomento trovato.', help_wiki:'Mini wiki',
  ob_title:'Benvenuto in DocMap 2026', ob_p:'Archivio fisico-digitale per faldoni: ogni faldone ha un codice parlante, una posizione sullo scaffale e un QR qr7.it. Da dove vuoi iniziare?',
  ob_1:'Crea il tuo primo faldone', ob_1d:'Azione guidata: compili la scheda e ottieni l\'etichetta.', ob_2:'Stampa le etichette demo', ob_2d:'5 faldoni di esempio sono già pronti.',
  ob_3:'Verifica il foglio in stampante', ob_3d:'Prova quasi bianca per calibrare.', ob_skip:'Esploro da solo', ob_note:'Puoi riaprire guida e azioni guidate in qualsiasi momento con il pulsante ? in alto (o F1).'
});
Object.assign(I18N.en, {
  nav_database:'Database',
  db_h:'Local SQLite database', db_p:'A real SQLite database running in the browser, no server, no install. The archive is copied into tables on every change; you can save named sessions and download or reopen the .sqlite file.',
  db_status:'Database status', db_loading:'Starting the SQLite engine…', db_err:'The SQLite engine did not start. Everything else (localStorage, CSV, JSON) still works.',
  db_items:'Content items', db_sessions:'Sessions', db_size:'Size', db_where:'working copy in the browser (IndexedDB)', db_last_sync:'last sync {d}',
  db_save_h:'Save a session', db_save_d:'Snapshot everything (binders, settings, presets, sheet map) inside the database. You can restore it at any time.',
  db_s_name:'Session name', db_s_name_ph:'e.g. Room A inventory — November', db_s_note:'Note (optional)', db_s_note_ph:'e.g. before reorganising',
  db_save_btn:'Save session to database', db_saved:'Session saved: {n}', db_need_name:'Type a name for the session.',
  db_list_h:'Saved sessions', db_none:'No saved sessions.', db_restore:'Restore', db_date:'Date', db_restored:'Session restored',
  db_restore_detail:'Restore session "{n}"? The current archive ({c} binders) will be replaced.', db_del_detail:'Delete session "{n}" from the database?',
  db_file_h:'.sqlite file', db_file_d:'Download the full database (tables + sessions) or reopen a DocMap .sqlite file saved earlier.',
  db_download:'Download docmap.sqlite', db_open:'Open .sqlite file', db_open_ok:'Open and replace', db_open_detail:'Open "{f}"? It contains {n} binders and {s} sessions. The current archive ({c} binders) will be replaced.',
  db_opened:'Database opened: {n} binders', db_bad_file:'The file is not a valid DocMap database.',
  db_link_h:'Automatic save to disk', db_link:'Link a .sqlite file on this PC', db_link_d:'Choose where to save docmap.sqlite: from then on every change is written to that file (Chrome / Edge).',
  db_linked:'File linked: {f}', db_linked_ok:'Automatic save on • last save {d}', db_linked_perm:'After a restart the browser asks you to re-authorise access to the file.',
  db_reauth:'Re-authorise', db_unlink:'Unlink', db_fsa_no:'This browser cannot write straight to a file on disk: use "Download docmap.sqlite" (Chrome and Edge support linking).',
  db_console:'SQL console (read-only)', db_console_d:'Query the tables with SELECT. Changes are made through the interface so nothing gets out of sync.',
  db_run:'Run query', db_ro:'Only read queries (SELECT / WITH) are allowed, one at a time.',
  db_ex_rooms:'Binders per cabinet', db_ex_manifest:'qr7 manifest view', db_ex_year:'2025 contents', db_ex_out:'Checked out', db_schema:'Table structure',
  help:'Help', help_h:'Help & guided actions', help_search:'Search: label, print, export, QR, backup…', help_all:'All', help_back:'All topics', help_start:'Start guided action',
  help_start_d:'Walks you through it inside the app: you fill in and click, the result is real.', help_related:'See also', help_none:'No topic found.', help_wiki:'Mini wiki',
  ob_title:'Welcome to DocMap 2026', ob_p:'A physical-digital archive for binders: each binder has a speaking code, a shelf position and a qr7.it QR. Where do you want to start?',
  ob_1:'Create your first binder', ob_1d:'Guided action: fill in the form and get the label.', ob_2:'Print the demo labels', ob_2d:'5 sample binders are ready.',
  ob_3:'Check the sheet in your printer', ob_3d:'Near-white test to calibrate.', ob_skip:'I\'ll explore', ob_note:'Reopen help and guided actions any time with the ? button at the top (or F1).'
});

const L = (o) => (o && typeof o === 'object') ? (o[S.lang] || o.it) : o;
const HELP_TAGS = { label:{it:'Etichette',en:'Labels'}, print:{it:'Stampa',en:'Print'}, export:{it:'Esporta',en:'Export'}, import:{it:'Importa',en:'Import'}, qr:{it:'QR qr7.it',en:'QR qr7.it'},
  ai:{it:'AI',en:'AI'}, db:{it:'Database',en:'Database'}, safety:{it:'Sicurezza dati',en:'Data safety'}, archive:{it:'Archivio',en:'Archive'}, calib:{it:'Calibrazione',en:'Calibration'} };

const HELP_TOPICS = [
  { id:'create', guide:'create', tags:['label','archive'], related:['print','qr'],
    title:{it:'Come creo un faldone e la sua etichetta?', en:'How do I create a binder and its label?'},
    body:{it:'<p>Ogni faldone è una scheda con tre identità:</p><ul><li><b>Codice parlante</b> (es. <span class="kbd">BL1</span>): iniziali del cliente + numero progressivo. Si legge a colpo d\'occhio sullo scaffale.</li><li><b>Posizione</b> (es. <span class="kbd">A1-α</span>): stanza + armadio, poi ripiano (α β γ dall\'alto) e settore opzionale SX/CX/DX.</li><li><b>Short code QR</b> (es. <span class="kbd">dm26K8m2P9xL</span>): generato da solo, univoco, punta a <span class="kbd">https://qr7.it/…</span>.</li></ul><p>I <b>contenuti</b> (anno + descrizione) finiscono sul Modulo B dell\'etichetta: quando cambiano ristampi solo quello.</p><ol><li>Archivio → <b>Nuovo Faldone</b>.</li><li>Scrivi il cliente: il codice parlante viene suggerito.</li><li>Titolo, posizione, contenuti → <b>Salva</b>.</li></ol><p>Il faldone nuovo è già spuntato per la stampa.</p>',
          en:'<p>Each binder is a record with three identities:</p><ul><li><b>Speaking code</b> (e.g. <span class="kbd">BL1</span>): client initials + progressive number, readable on the shelf.</li><li><b>Location</b> (e.g. <span class="kbd">A1-α</span>): room + cabinet, then shelf (α β γ from the top) and optional sector SX/CX/DX.</li><li><b>QR short code</b> (e.g. <span class="kbd">dm26K8m2P9xL</span>): generated automatically, unique, points to <span class="kbd">https://qr7.it/…</span>.</li></ul><p><b>Contents</b> (year + description) go on label Module B, so when they change you reprint only that.</p><ol><li>Archive → <b>New Binder</b>.</li><li>Type the client: the speaking code is suggested.</li><li>Title, location, contents → <b>Save</b>.</li></ol><p>The new binder is already ticked for printing.</p>'} },
  { id:'print', guide:'print', tags:['print','label'], related:['calib','partial'],
    title:{it:'Come stampo le etichette?', en:'How do I print the labels?'},
    body:{it:'<ol><li>In Archivio spunta i faldoni da stampare (colonna a sinistra).</li><li>Stampa Etichette → scegli il <b>foglio</b> che hai: A4 intero adesivo (con linee di taglio) o prefustellato tipo Avery.</li><li>Scegli il <b>contenuto</b>: Coppia Sdoppiata (Modulo A in alto sul faldone + Modulo B sotto), solo A, solo B o unificata.</li><li>Scegli il <b>QR</b>: vettoriale, spazio bianco riservato o nessuno.</li><li>Controlla l\'anteprima e premi <b>Stampa Etichette</b>.</li></ol><p><b>Nel dialogo di stampa</b>: Scala 100% / Dimensioni effettive, Margini: Nessuno, intestazioni e piè di pagina disattivati. Altrimenti le misure non tornano.</p>',
          en:'<ol><li>In Archive tick the binders to print (left column).</li><li>Print Labels → choose your <b>sheet</b>: full A4 adhesive (with cut lines) or Avery-type die-cut.</li><li>Choose the <b>content</b>: Split Pair (Module A on top of the binder + Module B below), A only, B only, or unified.</li><li>Choose the <b>QR</b>: vector, reserved blank space or none.</li><li>Check the preview and press <b>Print Labels</b>.</li></ol><p><b>In the print dialog</b>: Scale 100% / Actual size, Margins: None, headers and footers off. Otherwise measurements will be off.</p>'} },
  { id:'calib', guide:'calib', tags:['print','calib'], related:['print','partial'],
    title:{it:'Come sono sicuro che sia il foglio giusto (calibrazione)?', en:'How can I be sure it\'s the right sheet (calibration)?'},
    body:{it:'<p>La <b>prova quasi bianca</b> stampa solo linee grigio chiaro sottilissime e micro-testo: quasi zero toner.</p><ol><li>Seleziona il preset uguale alla confezione (es. L7163 = 14 etichette 99,1×38,1).</li><li>Stampa la prova su un foglio normale.</li><li>Sovrapponilo al foglio di etichette controluce: ogni croce deve cadere al centro di un\'etichetta.</li><li>Leggi <span class="kbd">↑ ALTO / TOP</span>: ti dice da che lato inserire il foglio.</li><li>Se tutto è spostato (es. 1 mm a destra), imposta <b>Offset X −1</b> (passi da 0,5 mm). In basso c\'è un righello da 50 mm: se non misura 50 mm la stampante sta scalando.</li></ol>',
          en:'<p>The <b>near-white test</b> prints only very thin light-grey lines and micro-text: almost zero toner.</p><ol><li>Select the preset matching the box (e.g. L7163 = 14 labels 99.1×38.1).</li><li>Print the test on plain paper.</li><li>Lay it over the label sheet against the light: every cross should fall in the centre of a label.</li><li>Read <span class="kbd">↑ ALTO / TOP</span>: it shows which side to feed.</li><li>If everything is shifted (e.g. 1 mm right), set <b>Offset X −1</b> (0.5 mm steps). At the bottom there is a 50 mm ruler: if it doesn\'t measure 50 mm the printer is scaling.</li></ol>'} },
  { id:'partial', guide:'partial', tags:['print'], related:['print','calib'],
    title:{it:'Come riuso un foglio di etichette già iniziato?', en:'How do I reuse a partly used label sheet?'},
    body:{it:'<p>Nella sezione <b>Recupero fogli parziali</b> vedi la mappa del foglio. Clicca le caselle già staccate: diventano grigie barrate e la stampa le lascia vuote, partendo dalla prima libera. In alternativa usa <b>Inizia dalla casella N</b>.</p><p>Dopo la stampa DocMap ti propone di segnare da solo le caselle consumate, così la volta successiva riparti dal punto giusto. La mappa è salvata per ogni tipo di foglio.</p>',
          en:'<p>In <b>Partial sheet recovery</b> you see the sheet map. Click the slots already peeled: they turn grey and struck through, and printing leaves them blank, starting from the first free one. Or use <b>Start from slot N</b>.</p><p>After printing DocMap offers to mark the consumed slots for you, so next time you start at the right place. The map is saved per sheet type.</p>'} },
  { id:'manifest', guide:'manifest', tags:['export','qr'], related:['qr','backup'],
    title:{it:'Come esporto il manifest per qr7.it?', en:'How do I export the manifest for qr7.it?'},
    body:{it:'<p>Il server qr7.it legge un CSV con punto e virgola e intestazione esatta <span class="kbd">short_code;short_url;final_destination;tags</span>.</p><ul><li><b>Scarica manifest_qr7_dm26.csv</b>: solo le righe DocMap.</li><li><b>Unisci al manifest.csv esistente</b>: carichi il file attuale del server, DocMap conserva tutte le altre righe (campagne, ecc.), aggiorna o aggiunge in fondo le righe dm26 e scarica il manifest.csv completo da ricaricare su SiteGround.</li></ul><p>La colonna final_destination nasce dal modello URL in Impostazioni.</p>',
          en:'<p>The qr7.it server reads a semicolon CSV with the exact header <span class="kbd">short_code;short_url;final_destination;tags</span>.</p><ul><li><b>Download manifest_qr7_dm26.csv</b>: DocMap rows only.</li><li><b>Merge into existing manifest.csv</b>: upload the server\'s current file, DocMap keeps every other row (campaigns, etc.), updates or appends the dm26 rows at the bottom and downloads the full manifest.csv to upload to SiteGround.</li></ul><p>The final_destination column comes from the URL template in Settings.</p>'} },
  { id:'qr', guide:null, tags:['qr'], related:['manifest','create'],
    title:{it:'Come funzionano i QR qr7.it/dm26…?', en:'How do the qr7.it/dm26… QR codes work?'},
    body:{it:'<p>Il QR stampato contiene un indirizzo <b>statico</b>: <span class="kbd">https://qr7.it/dm26K8m2P9xL</span>. Non cambia mai, anche se sposti il faldone o cambi sistema.</p><p>È il server qr7.it a fare il <b>redirect dinamico</b> verso la destinazione finale scritta nel manifest. Per cambiare dove porta un QR basta aggiornare il manifest, senza ristampare.</p><ul><li><span class="kbd">dm26</span> + 8 caratteri (A-Z, a-z, 2-9, senza I O l o) = 12 caratteri: non collide con i link brevi delle campagne (5-6 caratteri).</li><li>Il QR è vettoriale (SVG): nitido a qualsiasi risoluzione.</li></ul>',
          en:'<p>The printed QR holds a <b>static</b> address: <span class="kbd">https://qr7.it/dm26K8m2P9xL</span>. It never changes, even if you move the binder or switch systems.</p><p>The qr7.it server does the <b>dynamic redirect</b> to the final destination written in the manifest. To change where a QR leads you update the manifest, no reprint.</p><ul><li><span class="kbd">dm26</span> + 8 characters (A-Z, a-z, 2-9, no I O l o) = 12 characters: no clash with 5-6 character campaign links.</li><li>The QR is vector (SVG): sharp at any resolution.</li></ul>'} },
  { id:'ai', guide:'ai', tags:['ai','import'], related:['import'],
    title:{it:'Come genero i faldoni con l\'AI?', en:'How do I generate binders with AI?'},
    body:{it:'<ol><li>Genera con AI → <b>Copia Prompt Completo</b>.</li><li>Incollalo in ChatGPT, Claude o Gemini. In fondo, nella sezione italiana, scrivi i clienti e i documenti o allega le foto degli scaffali.</li><li>L\'AI risponde con un blocco CSV: copialo.</li><li>Importa → incolla → <b>Analizza</b> → controlla l\'anteprima → <b>Aggiungi e Aggiorna</b>.</li></ol><p>I codici dm26 mancanti vengono generati da DocMap; i codici parlanti già usati non vengono duplicati.</p>',
          en:'<ol><li>Generate with AI → <b>Copy Full Prompt</b>.</li><li>Paste it into ChatGPT, Claude or Gemini. At the bottom, in the Italian section, write clients and documents or attach shelf photos.</li><li>The AI replies with a CSV block: copy it.</li><li>Import → paste → <b>Analyse</b> → check the preview → <b>Add & Update</b>.</li></ol><p>Missing dm26 codes are generated by DocMap; speaking codes already in use are not duplicated.</p>'} },
  { id:'import', guide:'import', tags:['import'], related:['ai','backup'],
    title:{it:'Come importo un CSV o un JSON?', en:'How do I import a CSV or JSON?'},
    body:{it:'<p>Accetta file .csv (punto e virgola, virgola o tab) e .json (workspace DocMap o elenco di righe), oppure testo incollato, anche dentro un blocco ```csv di una chat.</p><ul><li><b>Aggiungi e Aggiorna</b>: i faldoni con lo stesso codice parlante vengono aggiornati, i nuovi aggiunti. Nessuna perdita.</li><li><b>Sostituisci Tutto</b>: svuota l\'archivio e carica il file (chiede conferma). Gli short code già stampati vengono mantenuti quando il codice parlante coincide.</li></ul><p>Le intestazioni in italiano (cliente, posizione, contenuti…) sono riconosciute.</p>',
          en:'<p>Accepts .csv files (semicolon, comma or tab) and .json (DocMap workspace or a list of rows), or pasted text, even inside a ```csv block from a chat.</p><ul><li><b>Add & Update</b>: binders with the same speaking code are updated, new ones added. Nothing lost.</li><li><b>Replace All</b>: clears the archive and loads the file (asks for confirmation). Printed short codes are kept when the speaking code matches.</li></ul><p>Italian headers (cliente, posizione, contenuti…) are recognised.</p>'} },
  { id:'session', guide:'session', tags:['db','safety'], related:['backup'],
    title:{it:'Come salvo una sessione nel database SQLite?', en:'How do I save a session in the SQLite database?'},
    body:{it:'<p>DocMap include un database <b>SQLite</b> vero che gira nel browser: niente server, funziona anche offline.</p><ul><li>Le tabelle (binders, contents_items…) si aggiornano da sole a ogni modifica.</li><li>Una <b>sessione</b> è una fotografia completa con nome: la ripristini quando vuoi.</li><li><b>Scarica docmap.sqlite</b> per avere il file da archiviare, copiare su chiavetta o aprire con DB Browser for SQLite.</li><li>Su Chrome/Edge puoi <b>collegare un file sul disco</b>: DocMap ci scrive a ogni modifica.</li></ul><p>Lo stesso file .sqlite servirà alla futura versione server (FastAPI).</p>',
          en:'<p>DocMap includes a real <b>SQLite</b> database running in the browser: no server, works offline.</p><ul><li>Tables (binders, contents_items…) update on every change.</li><li>A <b>session</b> is a full named snapshot you can restore any time.</li><li><b>Download docmap.sqlite</b> to archive it, copy it to a USB stick or open it with DB Browser for SQLite.</li><li>On Chrome/Edge you can <b>link a file on disk</b>: DocMap writes to it on every change.</li></ul><p>The same .sqlite file will be used by the future server version (FastAPI).</p>'} },
  { id:'backup', guide:'backup', tags:['safety','export'], related:['session','import'],
    title:{it:'Come proteggo i miei dati (backup)?', en:'How do I protect my data (backup)?'},
    body:{it:'<ul><li>Ogni modifica è salvata subito nel browser (con una copia di sicurezza della versione precedente).</li><li>Il badge in alto diventa <b>arancione</b> quando hai modifiche non ancora scaricate: premi <b>Salva Backup Rapido</b> per scaricare un JSON completo.</li><li>Se chiudi la scheda con modifiche non scaricate, il browser ti avvisa.</li><li>Ogni eliminazione o sostituzione chiede conferma.</li><li>Per un archivio a lungo termine scarica anche <b>docmap.sqlite</b>.</li></ul><p>Attenzione: svuotare i dati del browser cancella la copia locale. Tieni sempre un backup scaricato.</p>',
          en:'<ul><li>Every change is saved immediately in the browser (with a safety copy of the previous version).</li><li>The top badge turns <b>amber</b> when you have changes not yet downloaded: press <b>Quick Backup</b> to download a full JSON.</li><li>If you close the tab with undownloaded changes, the browser warns you.</li><li>Every delete or replace asks for confirmation.</li><li>For long-term archiving also download <b>docmap.sqlite</b>.</li></ul><p>Note: clearing browser data deletes the local copy. Always keep a downloaded backup.</p>'} },
  { id:'register', guide:'register', tags:['export','print'], related:['manifest'],
    title:{it:'Come stampo il Registro Generale d\'Archivio?', en:'How do I print the Master Archive Register?'},
    body:{it:'<p>Esporta e Salva → <b>Apri Registro e Stampa</b>. È una tabella A4 con codice, posizione, cliente, contenuti, QR, short code e URL. Puoi stamparla o salvarla in PDF dal dialogo di stampa (Salva come PDF). Spunta "Solo faldoni selezionati" per un registro parziale.</p>',
          en:'<p>Export & Save → <b>Open Register & Print</b>. It is an A4 table with code, location, client, contents, QR, short code and URL. Print it or save it as PDF from the print dialog. Tick "Only selected binders" for a partial register.</p>'} },
  { id:'map', guide:null, tags:['archive'], related:['create'],
    title:{it:'Come leggo la mappa scaffali e i codici posizione?', en:'How do I read the shelf map and location codes?'},
    body:{it:'<p>Il codice <span class="kbd">B2-β-SX</span> si legge: stanza <b>B</b>, armadio <b>2</b>, ripiano <b>β</b> (secondo dall\'alto), settore <b>SX</b> (sinistra).</p><p>In Archivio → <b>Mappa Scaffali</b> vedi ogni stanza con armadi e ripiani e i dorsi colorati dei faldoni. I faldoni prelevati sono tratteggiati. Clicca un dorso per aprire la scheda.</p>',
          en:'<p>The code <span class="kbd">B2-β-SX</span> reads: room <b>B</b>, cabinet <b>2</b>, shelf <b>β</b> (second from the top), sector <b>SX</b> (left).</p><p>In Archive → <b>Shelf Map</b> you see every room with cabinets, shelves and coloured binder spines. Checked-out binders are dashed. Click a spine to open the record.</p>'} }
];
const helpTopic = (id) => HELP_TOPICS.find(x => x.id === id);
const HELP = { open:false, q:'', tag:'', topic:null };

function helpDot(id){ return ' <button class="help-dot" data-a="help-topic" data-id="' + id + '" title="' + esc(t('help')) + '" aria-label="' + esc(t('help')) + '">?</button>'; }
function helpOpen(topicId){ HELP.open = true; HELP.topic = topicId || null; renderHelp(); setTimeout(() => { const i = $('#help-q'); if (i && !topicId) i.focus(); }, 60); }
function helpClose(){ HELP.open = false; renderHelp(); }
function helpList(){
  const q = HELP.q.trim().toLowerCase();
  return HELP_TOPICS.filter(tp => (!HELP.tag || tp.tags.includes(HELP.tag)) && (!q || (L(tp.title) + ' ' + L(tp.body).replace(/<[^>]+>/g, ' ') + ' ' + tp.tags.map(x => L(HELP_TAGS[x])).join(' ')).toLowerCase().indexOf(q) >= 0));
}
function helpTagChips(tags, active){ return tags.map(tg => '<span class="htag ' + (active === tg ? 'on' : '') + '">' + esc(L(HELP_TAGS[tg])) + '</span>').join(''); }
function renderHelpList(){
  const box = $('#help-list'); if (!box) return;
  const list = helpList();
  box.innerHTML = list.length ? list.map(tp => '<button class="help-item" data-a="help-topic" data-id="' + tp.id + '"><span class="hi-t">' + esc(L(tp.title)) + '</span><span class="hi-tags">' + helpTagChips(tp.tags) + (tp.guide ? '<span class="htag guide">' + ic('sparkles') + esc(S.lang === 'en' ? 'guided' : 'guidata') + '</span>' : '') + '</span></button>').join('')
    : '<div class="empty" style="padding:24px">' + esc(t('help_none')) + '</div>';
}
function renderHelp(){
  const root = $('#help-root');
  if (!HELP.open){ root.innerHTML = ''; document.body.classList.remove('help-open'); return; }
  document.body.classList.add('help-open');
  const tp = HELP.topic && helpTopic(HELP.topic);
  let inner;
  if (tp){
    inner = '<button class="btn btn-sm btn-ghost" data-a="help-back" style="margin-bottom:10px">← ' + esc(t('help_back')) + '</button>' +
      '<h3 class="help-title">' + esc(L(tp.title)) + '</h3><div class="hi-tags" style="margin-bottom:14px">' + helpTagChips(tp.tags) + '</div>' +
      (tp.guide ? '<div class="guide-cta"><button class="btn btn-lg btn-primary btn-block" data-a="guide-start" data-id="' + tp.guide + '">' + ic('sparkles') + esc(t('help_start')) + '</button><div class="hint" style="margin-top:6px">' + esc(t('help_start_d')) + '</div></div>' : '') +
      '<div class="lbl" style="margin:18px 0 6px">' + esc(t('help_wiki')) + '</div><div class="wiki">' + L(tp.body) + '</div>' +
      (tp.related && tp.related.length ? '<div class="lbl" style="margin:18px 0 6px">' + esc(t('help_related')) + '</div><div class="stack" style="gap:6px">' + tp.related.map(r => helpTopic(r)).filter(Boolean).map(r => '<button class="help-item" data-a="help-topic" data-id="' + r.id + '"><span class="hi-t">' + esc(L(r.title)) + '</span></button>').join('') + '</div>' : '');
  } else {
    const allTags = Object.keys(HELP_TAGS);
    inner = '<div class="search" style="min-width:0">' + ic('search') + '<input class="inp" id="help-q" type="search" value="' + esc(HELP.q) + '" placeholder="' + esc(t('help_search')) + '"></div>' +
      '<div class="hi-tags" style="margin:12px 0 14px;gap:6px"><button class="htag btn-tag ' + (!HELP.tag ? 'on' : '') + '" data-a="help-tag" data-t="">' + esc(t('help_all')) + '</button>' + allTags.map(tg => '<button class="htag btn-tag ' + (HELP.tag === tg ? 'on' : '') + '" data-a="help-tag" data-t="' + tg + '">' + esc(L(HELP_TAGS[tg])) + '</button>').join('') + '</div>' +
      '<div class="stack" style="gap:8px" id="help-list"></div>';
  }
  root.innerHTML = '<div class="help-backdrop" data-a="help-close"></div><aside class="help-drawer" role="dialog" aria-label="' + esc(t('help_h')) + '"><div class="help-head"><div class="row" style="gap:10px">' + ic('info') + '<b>' + esc(t('help_h')) + '</b></div><button class="icon-btn" data-a="help-close" aria-label="' + esc(t('close')) + '">' + ic('x') + '</button></div><div class="help-body">' + inner + '</div></aside>';
  if (!tp) renderHelpList();
}
document.addEventListener('input', (e) => { if (e.target.id === 'help-q'){ HELP.q = e.target.value; renderHelpList(); } });

/* ---------------- Onboarding (first run) ---------------- */
function maybeOnboard(){
  if (S.onboarded) return;
  const card = (gid, icon, title, desc) => '<button class="ob-card" data-a="ob-go" data-id="' + gid + '"><span class="ob-ic">' + ic(icon, 'lg') + '</span><span><b>' + esc(title) + '</b><br><span class="small muted">' + esc(desc) + '</span></span>' + ic('arrowRight') + '</button>';
  openModal({ title:t('ob_title'), size:'', dismissable:false, autofocus:false,
    body:'<p style="margin-top:0">' + esc(t('ob_p')) + '</p><div class="stack" style="gap:10px">' + card('create', 'plus', t('ob_1'), t('ob_1d')) + card('print', 'printer', t('ob_2'), t('ob_2d')) + card('calib', 'crosshair', t('ob_3'), t('ob_3d')) + '</div><div class="hint" style="margin-top:14px">' + esc(t('ob_note')) + '</div>',
    buttons:[{label:t('ob_skip'), cls:'btn', fn:() => { S.onboarded = true; savePrefs(); closeModal(); }}] });
}
