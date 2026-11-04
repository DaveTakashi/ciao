/* =====================================================================
   DocMap 2026 — Help centre: "?" drawer, tagged how-to topics, mini wiki,
   contextual help dots and first-run onboarding.
   ===================================================================== */
Object.assign(I18N.it, {
  pr_popular:'più usato', g_fill:'Riempi A4 (margine sicuro 5 mm)', g_fill_d:'Calcola larghezza e altezza per riempire l\'A4 con colonne/righe e spazi attuali, lasciando 5 mm dal bordo (zona non stampabile delle stampanti desktop).',
  g_center:'Centra sul foglio', g_edge:'Attenzione: etichette a meno di 4 mm dal bordo. Le stampanti desktop di solito non stampano in quella fascia.',
  pr_quality:'Controllo qualità di stampa', q_qr:'QR {q} mm • modulo {m} mm', q_qr_small:'consigliato almeno 15 mm per la lettura con lo smartphone',
  q_code:'Codice parlante alto {s} mm ({p} pt)', q_text:'Testo più piccolo {s} mm ({p} pt)', q_text_small:'sotto 5 pt la lettura diventa difficile: usa un\'etichetta più grande o meno voci',
  q_tip:'Stampa in nero pieno, qualità "Alta", tipo carta "Etichette", scala 100%.',
  f_multi:'Codice Multi', f_multi_d:'Identificativo interno già assegnato al cliente o alla pratica nel gestionale. Facoltativo; se scegli un cliente esistente viene proposto da solo.', optional:'(facoltativo)',
  act_locate:'Dov\'è? Scaffale e foto', pr_tpl:'Template etichetta', pr_show_multi:'Mostra il Codice Multi sulle etichette (se compilato)',
  tp_classic:'Classico', tp_classic_d:'Codice, cliente, titolo, Multi e posizione', tp_multi:'Codice Multi in evidenza', tp_multi_d:'Il Multi è la chiave principale, il codice parlante sotto',
  tp_bold:'Codice gigante', tp_bold_d:'Leggibile a 3-4 m dallo scaffale', tp_min:'Essenziale', tp_min_d:'Solo codice, cliente, Multi e posizione',
  tp_note:'Il template cambia l\'etichetta frontale (A). Etichetta contenuti e unificata mostrano comunque il Multi.',
  db_ex_multi:'Faldoni per Codice Multi', db_ex_photos:'Foto per faldone', db_photos:'Foto nel database', db_photos_d:'{n} foto, {s}. Sono salvate nella copia locale e dentro ogni .sqlite scaricato (non nei JSON/CSV).',
  ph_orph:'{n} foto appartengono a faldoni eliminati.', ph_purge:'Elimina foto orfane', ph_purge_d:'Elimina definitivamente {n} foto di faldoni che non esistono più.',
  ph_add:'Aggiungi foto', ph_add_cab:'Foto dell\'armadio', ph_open:'Apri foto', ph_t:'Foto del faldone', ph_cab_t:'Foto armadio {c}', ph_binder:'Foto del faldone',
  ph_hint:'Le foto si salvano subito nel database locale (ridotte a 1400 px). Da telefono o tablet puoi scattarle direttamente.',
  ph_caption:'Didascalia', ph_caption_ph:'es. dorso, interno, etichetta vecchia', ph_size:'{w}×{h} px', ph_del_d:'Eliminare questa foto? L\'operazione non si può annullare.',
  ph_added:'{n} foto aggiunte', ph_bad:'Impossibile leggere {f}. Usa JPG o PNG (le foto HEIC di iPhone non sono supportate da Chrome su Windows).', ph_nodb:'Le foto richiedono il database SQLite, che non è attivo.',
  loc_t:'Dov\'è', loc_room:'Stanza', loc_cab:'Armadio', loc_shelf:'Ripiano', loc_sector:'Settore', loc_from_top:'{n}° dall\'alto', loc_sx:'sinistra', loc_cx:'centro', loc_dx:'destra',
  loc_none:'Questo faldone non ha ancora una posizione: compila stanza, armadio e ripiano.', loc_schema:'Armadio {c}', loc_photo:'Foto dell\'armadio',
  loc_nophoto:'Nessuna foto dell\'armadio {c}. Scattane una: potrai segnare dove si trova ogni ripiano.', loc_mark:'Segna {s} sulla foto', loc_mark_move:'Sposta il segno di {s}', loc_mark_now:'Ora clicca sulla foto…',
  loc_mark_hint:'Suggerimento: premi "Segna" e clicca sul punto della foto dove si trova il ripiano. Il segno resta per tutti i faldoni dello stesso ripiano.', loc_marked:'Posizione {s} segnata sulla foto',
  ed_discard_t:'Modifiche non salvate', ed_discard_d:'Hai modificato questo faldone. Se chiudi ora, le modifiche andranno perse.', ed_discard_ok:'Chiudi senza salvare',
  undo:'Annulla', undone:'Modifica annullata', 
  im_nohdr:'(senza intestazione: colonne nell\'ordine standard)', drop_here:'Rilascia il file per importarlo (CSV, JSON o .sqlite)',
  im_clip:'Incolla dagli appunti', im_clip_fail:'Il browser non ha permesso di leggere gli appunti: incolla con Ctrl+V nel riquadro.', im_ansi:'File letto come Windows-1252 (CSV salvato da Excel): controlla accenti e lettere greche nell\'anteprima.',
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
  pr_popular:'most used', g_fill:'Fill A4 (5 mm safe margin)', g_fill_d:'Compute width and height to fill A4 with the current columns/rows and gaps, keeping 5 mm from the edge (non-printable area of desktop printers).',
  g_center:'Centre on sheet', g_edge:'Warning: labels closer than 4 mm to the edge. Desktop printers usually cannot print there.',
  pr_quality:'Print quality check', q_qr:'QR {q} mm • module {m} mm', q_qr_small:'at least 15 mm recommended for phone scanning',
  q_code:'Speaking code {s} mm high ({p} pt)', q_text:'Smallest text {s} mm ({p} pt)', q_text_small:'below 5 pt reading gets hard: use a bigger label or fewer items',
  q_tip:'Print in solid black, "High" quality, paper type "Labels", scale 100%.',
  f_multi:'Multi code', f_multi_d:'Internal identifier already assigned to the client or practice in the management software. Optional; picking an existing client suggests it.', optional:'(optional)',
  act_locate:'Where is it? Shelf and photos', pr_tpl:'Label template', pr_show_multi:'Show the Multi code on labels (when filled in)',
  tp_classic:'Classic', tp_classic_d:'Code, client, title, Multi and location', tp_multi:'Multi code first', tp_multi_d:'Multi is the main key, speaking code below',
  tp_bold:'Giant code', tp_bold_d:'Readable from 3-4 m away', tp_min:'Essential', tp_min_d:'Only code, client, Multi and location',
  tp_note:'The template changes the front label (A). Contents and unified labels still show the Multi code.',
  db_ex_multi:'Binders per Multi code', db_ex_photos:'Photos per binder', db_photos:'Photos in the database', db_photos_d:'{n} photos, {s}. Saved in the local copy and inside every downloaded .sqlite (not in JSON/CSV).',
  ph_orph:'{n} photos belong to deleted binders.', ph_purge:'Delete orphan photos', ph_purge_d:'Permanently delete {n} photos of binders that no longer exist.',
  ph_add:'Add photo', ph_add_cab:'Cabinet photo', ph_open:'Open photo', ph_t:'Binder photo', ph_cab_t:'Cabinet {c} photo', ph_binder:'Binder photos',
  ph_hint:'Photos are saved immediately in the local database (resized to 1400 px). On a phone or tablet you can take them directly.',
  ph_caption:'Caption', ph_caption_ph:'e.g. spine, inside, old label', ph_size:'{w}×{h} px', ph_del_d:'Delete this photo? This cannot be undone.',
  ph_added:'{n} photos added', ph_bad:'Cannot read {f}. Use JPG or PNG (iPhone HEIC photos are not supported by Chrome on Windows).', ph_nodb:'Photos need the SQLite database, which is not running.',
  loc_t:'Where is', loc_room:'Room', loc_cab:'Cabinet', loc_shelf:'Shelf', loc_sector:'Sector', loc_from_top:'{n} from the top', loc_sx:'left', loc_cx:'centre', loc_dx:'right',
  loc_none:'This binder has no location yet: fill in room, cabinet and shelf.', loc_schema:'Cabinet {c}', loc_photo:'Cabinet photo',
  loc_nophoto:'No photo of cabinet {c}. Take one: you can then mark where each shelf is.', loc_mark:'Mark {s} on the photo', loc_mark_move:'Move the {s} mark', loc_mark_now:'Now click on the photo…',
  loc_mark_hint:'Tip: press "Mark" and click where the shelf is on the photo. The mark is shared by all binders on that shelf.', loc_marked:'Location {s} marked on the photo',
  ed_discard_t:'Unsaved changes', ed_discard_d:'You changed this binder. If you close now, the changes will be lost.', ed_discard_ok:'Close without saving',
  undo:'Undo', undone:'Change undone', 
  im_nohdr:'(no header: standard column order)', drop_here:'Drop the file to import it (CSV, JSON or .sqlite)',
  im_clip:'Paste from clipboard', im_clip_fail:'The browser did not allow reading the clipboard: paste with Ctrl+V in the box.', im_ansi:'File read as Windows-1252 (CSV saved by Excel): check accents and Greek letters in the preview.',
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

/* v6: split label MRINK143, printable fields, advanced print options, shelf styles, client register, demo data */
Object.assign(I18N.it, {
  ecc_L:'L · bassa (7%)', ecc_M:'M · media (15%) consigliata', ecc_Q:'Q · alta (25%)', ecc_H:'H · massima (30%)',
  qr_ecc_d:'Più correzione = il QR si legge anche se graffiato o sporco, ma i quadratini diventano più piccoli. M va bene quasi sempre; L se il QR è sotto 15 mm; Q/H solo con QR da 20 mm in su.',
  nav_clients:'Clienti', arch_n:'Archivio {n}',
  f_city:'Luogo ditta', f_year_ref:'Anno di riferimento', f_extra:'Codici extra', f_extra_ph:'es. Prot. 125/2025, Pratica 88',
  f_lines:'Una riga per voce', f_lines_hint:'Scrivi o incolla una voce per riga. Per l\'anno usa "2025: Descrizione" (facoltativo).',
  st_type:'Tipo di ripiano', st_number:'Numeri 1 2 3', st_letter:'Lettere A B C', st_greek:'Greche α β γ', st_emoji:'Emoji 🟥 🟧', st_symbol:'Simboli ★ ● ▲', st_text:'Nome libero',
  st_color:'Colore del ripiano', st_nocolor:'Nessun colore', st_text_ph:'es. Alto',
  pr_recommended:'Consigliato', pr_8mod:'{n} etichette da dividere ({s})', pr_more:'Altri fogli ({n})',
  cm_split:'Etichetta completa', cm_split_d:'Ogni etichetta stampata ha tutto: codice e QR in alto, categoria, ditta, luogo, Multi, posizione, titolo, contenuti, tag, data e codici. Su MRINK143 ogni etichetta fisica 105×148 ne contiene 2 (una per faldone), da separare con la taglierina: 8 per foglio.',
  pr_fields:'Campi da stampare', pr_fields_d:'Spunta solo quello che vuoi vedere sull\'etichetta. Il codice parlante c\'è sempre.',
  qr_url_s:'URL piccolo sotto il QR', f_title_s:'Descrizione / titolo', f_contents_s:'Contenuti', fl_location:'Posizione (stanza/armadio/ripiano)',
  f_date:'Data', fd_created:'Data di creazione', fd_updated:'Data di aggiornamento', fd_none:'Nessuna data',
  pr_adv:'Opzioni avanzate', pr_adv_d:'Geometria del foglio, verso di lettura, recupero fogli parziali e calibrazione. Di solito non serve toccarle.',
  pv_portrait:'Verticale', pv_landscape:'Orizzontale', pv_rot_d:'Solo anteprima: "Orizzontale" gira il foglio per leggere le etichette dritte. La stampa resta uguale.',
  f_empty:'Stampa anche i campi vuoti', f_empty_d:'Spento (consigliato): un campo facoltativo vuoto non compare, niente "Voce:" seguita dal nulla. Acceso: compare "Voce: ____" con lo spazio per scrivere a mano.',
  cm_pair_d:'Modulo A + Modulo B consecutivi (su MRINK143: A sopra e B sotto nella stessa etichetta fisica)',
  sp_h:'Verso di lettura e linea di taglio', sp_ratio:'Altezza modulo principale (%)', sp_rot:'Verso di lettura', sp_rot_l:'Ruota a sinistra (−90°)', sp_rot_r:'Ruota a destra (+90°)', sp_guides:'Linea di taglio appena visibile',
  cl_h:'Anagrafica clienti', cl_p:'L\'elenco clienti dello studio: scegliendo un cliente il faldone si compila da solo (Codice Multi, luogo, categoria).',
  cl_import:'Importa elenco clienti', cl_export:'Esporta CSV', cl_new:'Nuovo cliente', cl_edit:'Modifica cliente', cl_search:'Cerca per nome, Codice Multi, località…',
  cl_empty:'Nessun cliente. Importa il CSV dell\'elenco clienti (es. "CLIENTI STORICI ELENCO TIPIZZATO.csv").', cl_count:'{n} di {t} clienti', cl_more:'Altri {n} clienti: affina la ricerca.',
  cl_binder:'Nuovo faldone', cl_name:'Ragione sociale', cl_address:'Indirizzo', cl_city:'Località', cl_prov:'Provincia', cl_type:'Tipo',
  cl_prev:'Anteprima elenco clienti', cl_prev_d:'{n} righe riconosciute come anagrafica clienti (non faldoni).',
  cl_map:'Abbinamento colonne: Ditta → Codice Multi · Ragione_soc → Ragione sociale · Localita (Provincia) → Luogo · ETS_ENC / TIPO → Categoria · Indirizzo, Cap, Codice_com → dettagli. I faldoni esistenti non vengono toccati.',
  cl_apply:'Importa {n} clienti', cl_apply_d:'Aggiunge i nuovi e aggiorna quelli con lo stesso Codice Multi (o stesso nome). Annullabile.',
  cl_done:'Clienti: {a} aggiunti, {u} aggiornati', cl_del_d:'Eliminare il cliente "{n}" dall\'anagrafica? I faldoni restano.',
  cl_w_noname:'Ragione sociale mancante: riga saltata', cl_w_dup:'Cliente ripetuto nel file: riga saltata', cl_w_nomulti:'Senza codice Ditta/Multi',
  demo_shown:'{n} faldoni di esempio (tag "demo") sono visibili.', demo_hidden:'{n} faldoni di esempio (tag "demo") sono nascosti.', demo_show:'Mostra esempi', demo_hide:'Nascondi esempi',
  demo_delete:'Elimina esempi', demo_del_d:'Eliminare i {n} faldoni di esempio con tag "demo"? I tuoi faldoni non vengono toccati. Puoi annullare subito dopo.', demo_deleted:'{n} faldoni di esempio eliminati'
});
Object.assign(I18N.en, {
  ecc_L:'L · low (7%)', ecc_M:'M · medium (15%) recommended', ecc_Q:'Q · high (25%)', ecc_H:'H · maximum (30%)',
  qr_ecc_d:'More correction = the QR still reads when scratched or dirty, but its modules get smaller. M fits almost always; L if the QR is under 15 mm; Q/H only with QRs of 20 mm or more.',
  nav_clients:'Clients', arch_n:'Archive {n}',
  f_city:'Company place', f_year_ref:'Reference year', f_extra:'Extra codes', f_extra_ph:'e.g. Prot. 125/2025, Case 88',
  f_lines:'One line per item', f_lines_hint:'Type or paste one item per line. For a year use "2025: Description" (optional).',
  st_type:'Shelf style', st_number:'Numbers 1 2 3', st_letter:'Letters A B C', st_greek:'Greek α β γ', st_emoji:'Emoji 🟥 🟧', st_symbol:'Symbols ★ ● ▲', st_text:'Free name',
  st_color:'Shelf colour', st_nocolor:'No colour', st_text_ph:'e.g. Top',
  pr_recommended:'Recommended', pr_8mod:'{n} labels to cut apart ({s})', pr_more:'Other sheets ({n})',
  cm_split:'Complete label', cm_split_d:'Every printed label has everything: code and QR on top, category, company, place, Multi, location, title, contents, tags, date and codes. On MRINK143 each physical 105×148 label holds 2 of them (one per binder), cut apart with the trimmer: 8 per sheet.',
  pr_fields:'Fields to print', pr_fields_d:'Tick only what you want on the label. The speaking code is always there.',
  qr_url_s:'Small URL under the QR', f_title_s:'Description / title', f_contents_s:'Contents', fl_location:'Location (room/cabinet/shelf)',
  f_date:'Date', fd_created:'Creation date', fd_updated:'Last update', fd_none:'No date',
  pr_adv:'Advanced options', pr_adv_d:'Sheet geometry, reading direction, partial-sheet recovery and calibration. Usually no need to touch them.',
  pv_portrait:'Portrait', pv_landscape:'Landscape', pv_rot_d:'Preview only: "Landscape" turns the sheet so labels read straight. Printing is unchanged.',
  f_empty:'Print empty fields too', f_empty_d:'Off (recommended): an empty optional field does not appear, no "Field:" followed by nothing. On: "Field: ____" is printed with room to write by hand.',
  cm_pair_d:'Module A + Module B consecutive (on MRINK143: A on top and B below on the same physical label)',
  sp_h:'Reading direction and cut line', sp_ratio:'Main module height (%)', sp_rot:'Reading direction', sp_rot_l:'Rotate left (−90°)', sp_rot_r:'Rotate right (+90°)', sp_guides:'Barely visible cut line',
  cl_h:'Client register', cl_p:'The studio client list: picking a client fills in the binder (Multi code, place, category).',
  cl_import:'Import client list', cl_export:'Export CSV', cl_new:'New client', cl_edit:'Edit client', cl_search:'Search by name, Multi code, town…',
  cl_empty:'No clients yet. Import the client list CSV.', cl_count:'{n} of {t} clients', cl_more:'{n} more clients: refine the search.',
  cl_binder:'New binder', cl_name:'Company name', cl_address:'Address', cl_city:'Town', cl_prov:'Province', cl_type:'Type',
  cl_prev:'Client list preview', cl_prev_d:'{n} rows recognised as a client register (not binders).',
  cl_map:'Column mapping: Ditta → Multi code · Ragione_soc → Company name · Localita (Provincia) → Place · ETS_ENC / TIPO → Category · Indirizzo, Cap, Codice_com → details. Existing binders are not touched.',
  cl_apply:'Import {n} clients', cl_apply_d:'Adds new clients and updates those with the same Multi code (or same name). Can be undone.',
  cl_done:'Clients: {a} added, {u} updated', cl_del_d:'Delete client "{n}" from the register? Binders stay.',
  cl_w_noname:'Missing company name: row skipped', cl_w_dup:'Client repeated in the file: row skipped', cl_w_nomulti:'No Ditta/Multi code',
  demo_shown:'{n} sample binders (tag "demo") are visible.', demo_hidden:'{n} sample binders (tag "demo") are hidden.', demo_show:'Show samples', demo_hide:'Hide samples',
  demo_delete:'Delete samples', demo_del_d:'Delete the {n} sample binders tagged "demo"? Your binders are not touched. You can undo right after.', demo_deleted:'{n} sample binders deleted'
});

const L = (o) => (o && typeof o === 'object') ? (o[S.lang] || o.it) : o;
const HELP_TAGS = { label:{it:'Etichette',en:'Labels'}, print:{it:'Stampa',en:'Print'}, export:{it:'Esporta',en:'Export'}, import:{it:'Importa',en:'Import'}, qr:{it:'QR qr7.it',en:'QR qr7.it'},
  ai:{it:'AI',en:'AI'}, db:{it:'Database',en:'Database'}, safety:{it:'Sicurezza dati',en:'Data safety'}, archive:{it:'Archivio',en:'Archive'}, calib:{it:'Calibrazione',en:'Calibration'} };

const HELP_TOPICS = [
  { id:'split', guide:'print', tags:['label','print'], acts:['what','print'], pop:28, related:['fields','advanced','print'],
    title:{it:'Come funziona il foglio MRINK143 (8 etichette per foglio)', en:'How does the MRINK143 sheet work (8 labels per sheet)?'},
    body:{it:'<p>Il foglio predefinito è <b>MRINK143</b> e il contenuto predefinito è l\'<b>Etichetta informazioni</b> (vedi il suo argomento). Il foglio è un A4 con <b>4 etichette fisiche 105×148 mm</b> (A6, 2×2, senza spazi). Ogni etichetta fisica contiene <b>2 etichette stampate complete</b>, una per faldone, che separi con la taglierina lungo la linea a metà: da un foglio escono <b>8 etichette</b> da 105×74 mm.</p><ul><li>Con <b>Etichetta completa (classica)</b> ogni etichetta si legge con il foglio girato (74 di larghezza × 105 di altezza): in alto il <b>codice parlante</b> a sinistra e il <b>QR</b> a destra con l\'URL piccolo sotto; poi categoria, Codice Multi, posizione, ragione sociale, luogo, titolo con anno, contenuti e in fondo tag, codici extra, data e short code.</li><li>L\'ordine di stampa va per etichetta fisica: 1 sopra e 2 sotto nella prima, 3 e 4 nella seconda, e così via.</li><li>La <b>linea di taglio</b> è un tratteggio grigio chiarissimo; si toglie in Opzioni avanzate.</li><li>L\'anteprima è <b>verticale</b> come il foglio in stampante. Il pulsante <b>Orizzontale</b> gira solo l\'anteprima per leggere le etichette dritte.</li><li>Se in stampa il testo esce capovolto scegli l\'altra rotazione (+90°/−90°) in Opzioni avanzate.</li><li>Anche gli altri contenuti seguono lo stesso verso. Con "Coppia Sdoppiata" il Modulo A va sopra e il Modulo B sotto nella stessa etichetta fisica.</li></ul><p>In stampa: <b>Scala 100%</b> e <b>Margini: Nessuno</b>.</p>',
          en:'<p>The default sheet is <b>MRINK143</b> and the default content is the <b>Info label</b> (see its topic). The sheet is an A4 with <b>4 physical 105×148 mm labels</b> (A6, 2×2, no gaps). Each physical label holds <b>2 complete printed labels</b>, one per binder, cut apart with the trimmer along the middle line: one sheet gives <b>8 labels</b> of 105×74 mm.</p><ul><li>With <b>Complete label (classic)</b> each label is read with the sheet turned (74 wide × 105 tall): on top the <b>speaking code</b> on the left and the <b>QR</b> on the right with the small URL under it; then category, Multi code, location, company name, place, title with year, contents and at the bottom tags, extra codes, date and short code.</li><li>Print order goes by physical label: 1 on top and 2 below on the first, 3 and 4 on the second, and so on.</li><li>The <b>cut line</b> is a very light grey dash; it can be switched off in Advanced options.</li><li>The preview is <b>portrait</b> like the sheet in the printer. The <b>Landscape</b> button turns only the preview so labels read straight.</li><li>If the text comes out upside down choose the other rotation (+90°/−90°) in Advanced options.</li><li>The other contents follow the same direction. With "Split Pair" Module A goes on top and Module B below on the same physical label.</li></ul><p>When printing: <b>Scale 100%</b>, <b>Margins: None</b>.</p>'} },
  { id:'fields', guide:null, tags:['label','print'], acts:['how','edit','print'], pop:56, related:['split','templates'],
    title:{it:'Come scelgo i campi da stampare sull\'etichetta', en:'How do I choose the fields printed on the label?'},
    body:{it:'<p>In Stampa Etichette › <b>Campi da stampare</b> accendi o spegni ogni campo; l\'anteprima si aggiorna subito.</p><ul><li><b>Sempre</b>: codice parlante (iniziali cliente + progressivo, es. RC2).</li><li><b>Categoria</b>, <b>Luogo ditta</b>, <b>Codice Multi</b>, <b>URL piccolo sotto il QR</b>.</li><li><b>Descrizione / titolo</b>, <b>Contenuti</b>, <b>Tag</b> (facoltativi), <b>Anno di riferimento</b> (si riferisce ai contenuti, non alla data di creazione), <b>Codici extra</b>, <b>Posizione</b>.</li><li><b>Data</b>: di creazione, di aggiornamento o nessuna.</li></ul><p>Un campo vuoto non lascia spazi e non stampa "Voce:" senza niente dopo: l\'etichetta si ricompatta da sola. Se preferisci lo spazio da compilare a mano accendi <b>Stampa anche i campi vuoti</b>.</p>',
          en:'<p>In Print Labels › <b>Fields to print</b> switch each field on or off; the preview updates at once.</p><ul><li><b>Always</b>: speaking code (client initials + progressive, e.g. RC2).</li><li><b>Category</b>, <b>Company place</b>, <b>Multi code</b>, <b>Small URL under the QR</b>.</li><li><b>Description / title</b>, <b>Contents</b>, <b>Tags</b> (optional), <b>Reference year</b> (refers to the contents, not to the creation date), <b>Extra codes</b>, <b>Location</b>.</li><li><b>Date</b>: creation, last update or none.</li></ul><p>An empty field leaves no gap: the label re-flows by itself.</p>'} },
  { id:'advanced', guide:'calib', tags:['print','calib'], acts:['what','print'], pop:26, related:['calib','partial','split'],
    title:{it:'Cosa trovo in "Opzioni avanzate" della stampa', en:'What is in the print "Advanced options"?'},
    body:{it:'<p>La schermata di stampa mostra solo l\'essenziale: coda, foglio, contenuto, campi, QR e qualità. Tutto il resto è nel riquadro richiudibile <b>Opzioni avanzate</b> nella colonna di sinistra (resta aperto o chiuso come l\'hai lasciato):</p><ul><li><b>Geometria del foglio</b>: misure, margini, spazi, offset X/Y e margine interno.</li><li><b>Verso di lettura e linea di taglio</b>: rotazione −90°/+90° delle etichette sui fogli girati (MRINK143) e linea di taglio appena visibile.</li><li><b>Recupero fogli parziali</b>: clicca le etichette già usate per saltarle. Su MRINK143 ogni metà di etichetta fisica è una casella: puoi segnare anche solo la metà già usata.</li><li><b>Calibrazione</b>: prova quasi bianca da sovrapporre al foglio.</li></ul><p>Le guide aprono il riquadro da sole quando serve.</p>',
          en:'<p>The print screen shows only the essentials: queue, sheet, content, fields, QR and quality. Everything else is in the collapsible <b>Advanced options</b> box in the left column (it stays open or closed as you left it):</p><ul><li><b>Sheet geometry</b>: sizes, margins, gaps, X/Y offsets and inner padding.</li><li><b>Reading direction and cut line</b>: −90°/+90° rotation of labels on turned sheets (MRINK143) and barely visible cut line.</li><li><b>Partial sheet recovery</b>: click the labels already used to skip them.</li><li><b>Calibration</b>: near-white test to lay over the sheet.</li></ul><p>Guides open the box by themselves when needed.</p>'} },
  { id:'clients', guide:null, tags:['client','import'], acts:['how','io'], pop:72, related:['multi','import'],
    title:{it:'Come importo l\'elenco clienti dello studio', en:'How do I import the studio client list?'},
    body:{it:'<p>In <b>Informazioni › Clienti</b> premi <b>Importa elenco clienti</b> per caricare l\'elenco clienti (ad esempio <span class="kbd">CLIENTI STORICI ELENCO TIPIZZATO.csv</span>, intestazione <span class="kbd">TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC</span>). DocMap riconosce da solo che è un elenco clienti e non di faldoni.</p><ul><li><b>Ditta</b> → Codice Multi · <b>Ragione_soc</b> → ragione sociale · <b>Localita (Provincia)</b> → luogo ditta · <b>ETS_ENC</b> (o TIPO) → categoria.</li><li>Scrivendo la ragione sociale in un faldone nuovo, Codice Multi, luogo e categoria si compilano da soli. Dalla tabella clienti puoi anche premere <b>Nuovo faldone</b>.</li><li>Reimportare lo stesso file aggiorna i clienti (stesso codice Ditta o stesso nome), non li duplica.</li><li>Un cliente alla volta: <b>Nuovo cliente</b> nella stessa schermata (c\'è l\'azione guidata "Come creo un nuovo cliente").</li><li>L\'anagrafica è salvata nel browser, nel backup JSON e nella tabella <span class="kbd">clients</span> del database SQLite.</li></ul>',
          en:'<p>In <b>Information › Clients</b> press <b>Import client list</b> to load the client list (e.g. a CSV with header <span class="kbd">TIPO;Ditta;Ragione_soc;Indirizzo;Codice_com;Cap;Localita;Provincia;ETS_ENC</span>). DocMap recognises it as a client list, not binders.</p><ul><li><b>Ditta</b> → Multi code · <b>Ragione_soc</b> → company name · <b>Localita (Provincia)</b> → company place · <b>ETS_ENC</b> (or TIPO) → category.</li><li>Typing the company name in a new binder fills in Multi code, place and category. From the client table you can also press <b>New binder</b>.</li><li>Re-importing the same file updates clients (same Ditta code or same name), no duplicates.</li><li>One client at a time: <b>New client</b> on the same screen (see the guided action "How do I add a new client?").</li><li>The register is saved in the browser, in the JSON backup and in the SQLite <span class="kbd">clients</span> table.</li></ul>'} },
  { id:'demo', guide:null, tags:['archive','safety'], acts:['how','delete'], pop:24, related:['create','backup'],
    title:{it:'Come nascondo o elimino i faldoni di esempio', en:'How do I hide or delete the sample binders?'},
    body:{it:'<p>I faldoni di esempio hanno il tag <span class="kbd">demo</span>. Finché esistono, in Archivio compare una barra con <b>Nascondi esempi</b> (spariscono da elenco, mappa e coda di stampa ma restano salvati) ed <b>Elimina esempi</b> (li cancella tutti; puoi annullare subito dal messaggio in basso). I tuoi faldoni non vengono mai toccati.</p>',
          en:'<p>Sample binders carry the tag <span class="kbd">demo</span>. While they exist, the Archive shows a bar with <b>Hide samples</b> (they vanish from list, map and print queue but stay saved) and <b>Delete samples</b> (removes them all; you can undo right away from the message at the bottom). Your own binders are never touched.</p>'} },
  { id:'shelves', guide:'create', tags:['archive'], acts:['how','edit'], pop:40, related:['map','locate'],
    title:{it:'Come scrivo stanze, armadi e ripiani', en:'How do I write rooms, cabinets and shelves?'},
    body:{it:'<ul><li>Tutti i campi della posizione sono <b>facoltativi</b>.</li><li><b>Stanza</b>: una lettera (A) o un nome ("Ufficio 1", "Archivio"). Con un nome la posizione si scrive <span class="kbd">Ufficio 1 · 2-α</span>.</li><li><b>Ripiano</b>: nel menu a tendina scegli lo stile, cioè numeri (1 2 3), lettere (A B C), greche (α β γ), emoji, simboli o un nome libero. I pulsanti rapidi seguono lo stile scelto.</li><li><b>Colore del ripiano</b>: facoltativo, appare come striscia colorata nella Mappa Scaffali e nello schema "Dov\'è?" per riconoscere il ripiano a colpo d\'occhio.</li><li>Il <b>settore</b> SX/CX/DX resta facoltativo.</li></ul>',
          en:'<ul><li>All location fields are <b>optional</b>.</li><li><b>Room</b>: a letter (A) or a name ("Office 1", "Archive"). With a name the location reads <span class="kbd">Office 1 · 2-α</span>.</li><li><b>Shelf</b>: in the drop-down pick the style: numbers (1 2 3), letters (A B C), Greek (α β γ), emoji, symbols or a free name. Quick buttons follow the chosen style.</li><li><b>Shelf colour</b>: optional, shown as a coloured stripe in the Shelf Map and in the "Where is it?" schematic so the shelf is recognised at a glance.</li><li>The <b>sector</b> SX/CX/DX stays optional.</li></ul>'} },
  { id:'multi', guide:null, tags:['client','archive','label'], acts:['what'], pop:42, related:['templates','import','ai'],
    title:{it:'Cos\'è il Codice Multi e dove compare', en:'What is the Multi code and where does it appear?'},
    body:{it:'<p>Il <b>Codice Multi</b> è l\'identificativo interno che lo studio ha già assegnato al cliente o alla pratica nel gestionale. È <b>facoltativo</b>.</p><ul><li><b>Faldone</b>: campo accanto al codice parlante; scegliendo un cliente esistente viene proposto da solo.</li><li><b>Ricerca</b>: scrivi il Multi nella barra di ricerca dell\'archivio.</li><li><b>Etichette</b>: compare su tutte (frontale, contenuti, unificata). Si spegne in Stampa → "Mostra il Codice Multi". Con il template <i>Codice Multi in evidenza</i> diventa la scritta principale.</li><li><b>CSV / JSON</b>: colonna <code>multi_code</code> (riconosce anche <i>codice_multi</i>, <i>multi</i>, <i>codice_interno</i>).</li><li><b>Manifest qr7</b>: aggiunto nei tag come <code>multi-…</code>; nel modello di destinazione puoi usare <code>{multi_code}</code>.</li><li><b>SQLite</b>: colonna <code>binders.multi_code</code> con indice; esempio "Faldoni per Codice Multi" nella console.</li><li><b>Prompt AI</b>: l\'AI lo copia esattamente e non lo inventa mai.</li></ul>',
          en:'<p>The <b>Multi code</b> is the internal identifier the studio already assigned to the client or practice in its management software. It is <b>optional</b>.</p><ul><li><b>Binder</b>: field next to the speaking code; picking an existing client suggests it.</li><li><b>Search</b>: type the Multi code in the archive search bar.</li><li><b>Labels</b>: shown on all of them (front, contents, unified). Turn it off in Print → "Show the Multi code". With the <i>Multi code first</i> template it becomes the main text.</li><li><b>CSV / JSON</b>: column <code>multi_code</code> (also recognises <i>codice_multi</i>, <i>multi</i>, <i>codice_interno</i>).</li><li><b>qr7 manifest</b>: added to the tags as <code>multi-…</code>; the destination template accepts <code>{multi_code}</code>.</li><li><b>SQLite</b>: indexed column <code>binders.multi_code</code>; console example "Binders per Multi code".</li><li><b>AI prompt</b>: the AI copies it exactly and never invents it.</li></ul>'} },
  { id:'templates', guide:null, tags:['label','print'], acts:['how','print'], pop:48, related:['design','multi','print'],
    title:{it:'Come scelgo il modello del Modulo A', en:'How do I choose the Module A template?'},
    body:{it:'<p>La scelta del modello compare in Stampa etichette solo con i contenuti <b>Coppia Sdoppiata</b> e <b>Solo Modulo A</b>. L\'<b>Etichetta informazioni</b> (predefinita su MRINK143) ha già il suo layout.</p><ul><li><b>Classico</b>: codice parlante grande, cliente, titolo, Multi, posizione e categoria. Va bene quasi sempre.</li><li><b>Codice Multi in evidenza</b>: per chi cerca i faldoni con il codice del gestionale. Se un faldone non ha il Multi, usa il Classico.</li><li><b>Codice gigante</b>: per scaffali alti o lontani: il codice si legge a 3-4 metri. Ideale su L7163, L7165 e dorsi.</li><li><b>Essenziale</b>: pochissimo testo, molto pulito; per etichette piccole (L7160, L7159).</li></ul><p>Il template vale per l\'etichetta frontale. Controlla sempre il riquadro "Qualità di stampa" dopo averlo cambiato.</p>',
          en:'<p>The template choice appears in Print labels only with the <b>Split Pair</b> and <b>Module A only</b> contents. The <b>Info label</b> (default on MRINK143) has its own layout.</p><ul><li><b>Classic</b>: big speaking code, client, title, Multi, location and category. Fits almost every case.</li><li><b>Multi code first</b>: for people who look binders up by the management-software code. Binders without a Multi code fall back to Classic.</li><li><b>Giant code</b>: for high or distant shelves: readable from 3-4 metres. Ideal on L7163, L7165 and spines.</li><li><b>Essential</b>: very little text, very clean; for small labels (L7160, L7159).</li></ul><p>The template applies to the front label. Always check the "Print quality" box after changing it.</p>'} },
  { id:'locate', guide:'find', tags:['archive'], acts:['how','find'], pop:86, related:['map','multi'],
    title:{it:'Come trovo un faldone e il suo scaffale', en:'How do I find a binder and its shelf?'},
    body:{it:'<ul><li>In <b>Archivio</b> scrivi nella ricerca il codice parlante, il cliente, il Codice Multi, un tag o una voce del contenuto: l\'elenco si filtra mentre scrivi. Puoi filtrare anche per stato, stanza e categoria.</li><li>Premi l\'icona <b>segnaposto</b> di un faldone (o clicca un dorso nella Mappa Scaffali).</li><li>Si apre lo <b>schema dell\'armadio</b>: ripiani dall\'alto in basso (α in cima), settori SX/CX/DX, con il ripiano giusto evidenziato e lampeggiante.</li><li>Aggiungi una <b>foto dell\'armadio</b> (anche dall\'icona fotocamera nella mappa), premi <b>Segna</b> e clicca il punto del ripiano: da lì in poi la foto mostra un segnaposto rosso per tutti i faldoni di quel ripiano.</li><li>Ogni faldone può avere le sue <b>foto</b> (dorso, contenuto): aggiungile dal faldone o da "Dov\'è?".</li></ul><p>Le foto sono salvate nel database locale e nel file .sqlite scaricato, non nei backup JSON/CSV.</p>',
          en:'<ul><li>In <b>Archive</b> type the speaking code, client, Multi code, a tag or a contents item in the search box: the list filters as you type. You can also filter by state, room and category.</li><li>Press a binder\'s <b>pin</b> icon (or click a spine in the Shelf Map).</li><li>The <b>cabinet schematic</b> opens: shelves top to bottom (α at the top), sectors SX/CX/DX, with the right shelf highlighted and pulsing.</li><li>Add a <b>cabinet photo</b> (also from the camera icon in the map), press <b>Mark</b> and click where the shelf is: from then on the photo shows a red pin for every binder on that shelf.</li><li>Each binder can have its own <b>photos</b> (spine, contents): add them from the binder or from "Where is it?".</li></ul><p>Photos are saved in the local database and in the downloaded .sqlite file, not in JSON/CSV backups.</p>'} },
  { id:'design', guide:null, tags:['label','print'], acts:['what','print','fix'], pop:22, related:['print','calib'],
    title:{it:'Come rendo le etichette ben leggibili (font, misure, contrasto)', en:'How do I make labels easy to read (fonts, sizes, contrast)?'},
    body:{it:'<p>Regole usate da DocMap e consigli per stampanti desktop A4:</p><ul><li><b>Nero pieno su bianco</b> per tutto il testo e il QR: i grigi vengono retinati e perdono nitidezza. Il colore resta solo sulla banda del dorso.</li><li><b>Codice parlante</b> in JetBrains Mono ExtraBold, almeno <b>6 mm</b> di altezza: si legge a 2 metri dallo scaffale. Il mono evita confusioni tra 1/I e 0/O.</li><li><b>Testo</b> in Inter (incluso nel progetto, uguale su ogni PC): mai sotto <b>5 pt (1,8 mm)</b>.</li><li><b>QR</b> vettoriale, almeno <b>15 mm</b> di lato e modulo ≥ 0,4 mm, con margine bianco attorno. Correzione M di default; usa Q o H se l\'etichetta si rovina facilmente.</li><li><b>Margine interno</b> 2,5 mm e <b>almeno 4-5 mm dal bordo del foglio</b>: le stampanti desktop non stampano fino al bordo.</li><li>Nel dialogo di stampa: <b>Scala 100%</b>, Margini <b>Nessuno</b>, qualità <b>Alta</b>, tipo carta <b>Etichette</b>. Laser: fogli per laser; inkjet: fogli per inkjet (J8xxx).</li></ul><p>Il riquadro "Controllo qualità di stampa" in Stampa Etichette verifica queste soglie sul formato scelto.</p>',
          en:'<p>Rules DocMap follows and tips for desktop A4 printers:</p><ul><li><b>Solid black on white</b> for all text and the QR: greys get dithered and lose sharpness. Colour stays only on the spine band.</li><li><b>Speaking code</b> in JetBrains Mono ExtraBold, at least <b>6 mm</b> high: readable 2 m from the shelf. Mono avoids 1/I and 0/O confusion.</li><li><b>Text</b> in Inter (bundled, identical on every PC): never below <b>5 pt (1.8 mm)</b>.</li><li><b>QR</b> vector, at least <b>15 mm</b> wide and module ≥ 0.4 mm, with white margin. ECC M by default; use Q or H if labels get damaged.</li><li><b>Inner padding</b> 2.5 mm and <b>at least 4-5 mm from the sheet edge</b>: desktop printers can\'t print to the edge.</li><li>In the print dialog: <b>Scale 100%</b>, Margins <b>None</b>, quality <b>High</b>, paper type <b>Labels</b>. Laser sheets for laser, inkjet sheets (J8xxx) for inkjet.</li></ul><p>The "Print quality check" box in Print Labels checks these thresholds for the chosen format.</p>'} },
  { id:'create', guide:'create', tags:['label','archive'], acts:['how','create'], pop:100, related:['print','qr'],
    title:{it:'Come creo un nuovo faldone e la sua etichetta', en:'How do I create a new binder and its label?'},
    body:{it:'<p>Ogni faldone è una scheda con tre identità:</p><ul><li><b>Codice parlante</b> (es. <span class="kbd">BL1</span>): iniziali del cliente + numero progressivo. Si legge a colpo d\'occhio sullo scaffale.</li><li><b>Posizione</b> (es. <span class="kbd">A1-α</span>): stanza + armadio, poi ripiano (α β γ dall\'alto) e settore opzionale SX/CX/DX.</li><li><b>Short code QR</b> (es. <span class="kbd">dm26K8m2P9xL</span>): generato da solo, univoco, punta a <span class="kbd">https://qr7.it/…</span>.</li></ul><p>I <b>contenuti</b> (anno + descrizione) vanno in fondo all\'etichetta informazioni (le prime voci) e, se la accendi, sull\'<b>etichetta del contenuto</b>: quando cambiano ristampi solo quella.</p><ol><li>Archivio → <b>Nuovo Faldone</b>.</li><li>Scrivi il cliente: se è nell\'anagrafica si compilano Codice Multi, luogo e categoria, e il codice parlante viene suggerito.</li><li>Titolo, posizione, contenuti → <b>Salva</b>.</li></ol><p>Il faldone nuovo è già spuntato per la stampa: vai in <b>Stampa etichette</b> o premi <b>Scarica PDF</b>.</p>',
          en:'<p>Each binder is a record with three identities:</p><ul><li><b>Speaking code</b> (e.g. <span class="kbd">BL1</span>): client initials + progressive number, readable on the shelf.</li><li><b>Location</b> (e.g. <span class="kbd">A1-α</span>): room + cabinet, then shelf (α β γ from the top) and optional sector SX/CX/DX.</li><li><b>QR short code</b> (e.g. <span class="kbd">dm26K8m2P9xL</span>): generated automatically, unique, points to <span class="kbd">https://qr7.it/…</span>.</li></ul><p><b>Contents</b> (year + description) go at the bottom of the info label (the first items) and, if you switch it on, on the <b>contents label</b>: when they change you reprint only that one.</p><ol><li>Archive → <b>New Binder</b>.</li><li>Type the client: if it is in the register, Multi code, place and category are filled in and the speaking code is suggested.</li><li>Title, location, contents → <b>Save</b>.</li></ol><p>The new binder is already ticked for printing: go to <b>Print labels</b> or press <b>Download PDF</b>.</p>'} },
  { id:'print', guide:'print', tags:['print','label'], acts:['how','print'], pop:96, related:['calib','partial'],
    title:{it:'Come stampo le etichette', en:'How do I print the labels?'},
    body:{it:'<ol><li>In <b>Archivio</b> spunta i faldoni da stampare (casella a sinistra di ogni riga; i faldoni nuovi sono già spuntati).</li><li>Apri <b>Stampa etichette</b> e scegli il <b>foglio</b> che hai: consigliato MRINK143 (4 etichette A6 da dividere = 8 etichette); gli altri sono sotto "Altri fogli".</li><li>Scegli il <b>contenuto</b>: <b>Etichetta informazioni</b> (consigliata), Etichetta completa, Coppia Sdoppiata (Modulo A + Modulo B), solo A, solo B, unificata o Solo QR.</li><li>Scegli i <b>campi</b> da stampare e il <b>QR</b>: vettoriale, spazio bianco riservato o nessuno.</li><li>Controlla l\'anteprima e premi <b>Stampa etichette</b>, oppure <b>Scarica PDF</b> per stampare da un altro PC.</li></ol><p><b>Nel dialogo di stampa</b>: Scala 100% / Dimensioni effettive, Margini: Nessuno, intestazioni e piè di pagina disattivati. Altrimenti le misure non tornano.</p>',
          en:'<ol><li>In <b>Archive</b> tick the binders to print (box on the left of each row; new binders are already ticked).</li><li>Open <b>Print labels</b> and choose your <b>sheet</b>: MRINK143 is recommended (4 A6 labels to split = 8 labels); the others are under "Other sheets".</li><li>Choose the <b>content</b>: <b>Info label</b> (recommended), Complete label, Split Pair (Module A + Module B), A only, B only, unified or QR only.</li><li>Choose the <b>fields</b> to print and the <b>QR</b>: vector, reserved blank space or none.</li><li>Check the preview and press <b>Print labels</b>, or <b>Download PDF</b> to print from another PC.</li></ol><p><b>In the print dialog</b>: Scale 100% / Actual size, Margins: None, headers and footers off. Otherwise measurements will be off.</p>'} },
  { id:'calib', guide:'calib', tags:['print','calib'], acts:['how','print','fix'], pop:52, related:['print','partial'],
    title:{it:'Come verifico il foglio con la prova di calibrazione', en:'How do I check the sheet with the calibration test?'},
    body:{it:'<p>La <b>prova quasi bianca</b> stampa solo linee grigio chiaro sottilissime e micro-testo: quasi zero toner.</p><ol><li>Seleziona il preset uguale alla confezione (es. L7163 = 14 etichette 99,1×38,1).</li><li>Stampa la prova su un foglio normale.</li><li>Sovrapponilo al foglio di etichette controluce: ogni croce deve cadere al centro di un\'etichetta.</li><li>Leggi <span class="kbd">↑ ALTO / TOP</span>: ti dice da che lato inserire il foglio.</li><li>Se tutto è spostato (es. 1 mm a destra), imposta <b>Offset X −1</b> (passi da 0,5 mm). In basso c\'è un righello da 50 mm: se non misura 50 mm la stampante sta scalando.</li></ol>',
          en:'<p>The <b>near-white test</b> prints only very thin light-grey lines and micro-text: almost zero toner.</p><ol><li>Select the preset matching the box (e.g. L7163 = 14 labels 99.1×38.1).</li><li>Print the test on plain paper.</li><li>Lay it over the label sheet against the light: every cross should fall in the centre of a label.</li><li>Read <span class="kbd">↑ ALTO / TOP</span>: it shows which side to feed.</li><li>If everything is shifted (e.g. 1 mm right), set <b>Offset X −1</b> (0.5 mm steps). At the bottom there is a 50 mm ruler: if it doesn\'t measure 50 mm the printer is scaling.</li></ol>'} },
  { id:'partial', guide:'partial', tags:['print'], acts:['how','print','fix'], pop:54, related:['print','calib'],
    title:{it:'Come riuso un foglio di etichette già iniziato', en:'How do I reuse a partly used label sheet?'},
    body:{it:'<p>Nella sezione <b>Recupero fogli parziali</b> vedi la mappa del foglio. Clicca le caselle già staccate: diventano grigie barrate e la stampa le lascia vuote, partendo dalla prima libera. In alternativa usa <b>Inizia dalla casella N</b>.</p><p>Dopo la stampa DocMap ti propone di segnare da solo le caselle consumate, così la volta successiva riparti dal punto giusto. La mappa è salvata per ogni tipo di foglio.</p>',
          en:'<p>In <b>Partial sheet recovery</b> you see the sheet map. Click the slots already peeled: they turn grey and struck through, and printing leaves them blank, starting from the first free one. Or use <b>Start from slot N</b>.</p><p>After printing DocMap offers to mark the consumed slots for you, so next time you start at the right place. The map is saved per sheet type.</p>'} },
  { id:'manifest', guide:'manifest', tags:['export','qr'], acts:['how','io'], pop:46, related:['qr','backup'],
    title:{it:'Come esporto il manifest per qr7.it', en:'How do I export the manifest for qr7.it?'},
    body:{it:'<p>Il server qr7.it legge un CSV con punto e virgola e intestazione esatta <span class="kbd">short_code;short_url;final_destination;tags</span>.</p><ul><li><b>Scarica manifest_qr7_dm26.csv</b>: solo le righe DocMap.</li><li><b>Unisci al manifest.csv esistente</b>: carichi il file attuale del server, DocMap conserva tutte le altre righe (campagne, ecc.), aggiorna o aggiunge in fondo le righe dm26 e scarica il manifest.csv completo da ricaricare su SiteGround.</li></ul><p>La colonna final_destination nasce dal modello URL in Impostazioni.</p>',
          en:'<p>The qr7.it server reads a semicolon CSV with the exact header <span class="kbd">short_code;short_url;final_destination;tags</span>.</p><ul><li><b>Download manifest_qr7_dm26.csv</b>: DocMap rows only.</li><li><b>Merge into existing manifest.csv</b>: upload the server\'s current file, DocMap keeps every other row (campaigns, etc.), updates or appends the dm26 rows at the bottom and downloads the full manifest.csv to upload to SiteGround.</li></ul><p>The final_destination column comes from the URL template in Settings.</p>'} },
  { id:'qr', guide:null, tags:['qr'], acts:['what'], pop:30, related:['manifest','create'],
    title:{it:'Cos\'è il QR qr7.it/dm26… e come funziona', en:'What is the qr7.it/dm26… QR and how does it work?'},
    body:{it:'<p>Il QR stampato contiene un indirizzo <b>statico</b>: <span class="kbd">https://qr7.it/dm26K8m2P9xL</span>. Non cambia mai, anche se sposti il faldone o cambi sistema.</p><p>È il server qr7.it a fare il <b>redirect dinamico</b> verso la destinazione finale scritta nel manifest. Per cambiare dove porta un QR basta aggiornare il manifest, senza ristampare.</p><ul><li><span class="kbd">dm26</span> + 8 caratteri (A-Z, a-z, 2-9, senza I O l o) = 12 caratteri: non collide con i link brevi delle campagne (5-6 caratteri).</li><li>Il QR è vettoriale (SVG): nitido a qualsiasi risoluzione.</li></ul>',
          en:'<p>The printed QR holds a <b>static</b> address: <span class="kbd">https://qr7.it/dm26K8m2P9xL</span>. It never changes, even if you move the binder or switch systems.</p><p>The qr7.it server does the <b>dynamic redirect</b> to the final destination written in the manifest. To change where a QR leads you update the manifest, no reprint.</p><ul><li><span class="kbd">dm26</span> + 8 characters (A-Z, a-z, 2-9, no I O l o) = 12 characters: no clash with 5-6 character campaign links.</li><li>The QR is vector (SVG): sharp at any resolution.</li></ul>'} },
  { id:'ai', guide:'ai', tags:['ai','import'], acts:['how','create','io'], pop:20, related:['import'],
    title:{it:'Come genero i faldoni con l\'AI', en:'How do I generate binders with AI?'},
    body:{it:'<ol><li>Menu <b>⚙ Funzioni avanzate › Genera con AI</b> → <b>Copia Prompt Completo</b>.</li><li>Incollalo in ChatGPT, Claude o Gemini. In fondo, nella sezione italiana, scrivi i clienti e i documenti o allega le foto degli scaffali.</li><li>L\'AI risponde con un blocco CSV: copialo.</li><li>⚙ Funzioni avanzate › Importa → incolla → <b>Analizza</b> → controlla l\'anteprima → <b>Aggiungi e Aggiorna</b>.</li></ol><p>I codici dm26 mancanti vengono generati da DocMap; i codici parlanti già usati non vengono duplicati.</p>',
          en:'<ol><li>Menu <b>⚙ Advanced tools › Generate with AI</b> → <b>Copy Full Prompt</b>.</li><li>Paste it into ChatGPT, Claude or Gemini. At the bottom, in the Italian section, write clients and documents or attach shelf photos.</li><li>The AI replies with a CSV block: copy it.</li><li>Import → paste → <b>Analyse</b> → check the preview → <b>Add & Update</b>.</li></ol><p>Missing dm26 codes are generated by DocMap; speaking codes already in use are not duplicated.</p>'} },
  { id:'import', guide:'import', tags:['import'], acts:['how','io'], pop:88, related:['ai','backup'],
    title:{it:'Come importo un elenco di faldoni (CSV o JSON)', en:'How do I import a list of binders (CSV or JSON)?'},
    body:{it:'<p>Accetta file .csv (punto e virgola, virgola o tab) e .json (workspace DocMap o elenco di righe), oppure testo incollato, anche dentro un blocco ```csv di una chat.</p><ul><li><b>Aggiungi e Aggiorna</b>: i faldoni con lo stesso codice parlante vengono aggiornati, i nuovi aggiunti. Nessuna perdita.</li><li><b>Sostituisci Tutto</b>: svuota l\'archivio e carica il file (chiede conferma). Gli short code già stampati vengono mantenuti quando il codice parlante coincide.</li></ul><p>Le intestazioni in italiano (cliente, posizione, contenuti…) sono riconosciute. Funzionano anche i CSV di Excel con la riga <code>sep=;</code>, i file ANSI/UTF-16 e le righe incollate senza intestazione (colonne nell\'ordine standard).</p><p>Puoi <b>trascinare un file ovunque</b> nella finestra: CSV/JSON vanno all\'anteprima, un .sqlite apre il database. Dopo l\'importazione compare <b>Annulla</b> per tornare indietro.</p>',
          en:'<p>Accepts .csv files (semicolon, comma or tab) and .json (DocMap workspace or a list of rows), or pasted text, even inside a ```csv block from a chat.</p><ul><li><b>Add & Update</b>: binders with the same speaking code are updated, new ones added. Nothing lost.</li><li><b>Replace All</b>: clears the archive and loads the file (asks for confirmation). Printed short codes are kept when the speaking code matches.</li></ul><p>Italian headers (cliente, posizione, contenuti…) are recognised. Excel CSVs with a <code>sep=;</code> line, ANSI/UTF-16 files and rows pasted without a header (standard column order) work too.</p><p>You can <b>drop a file anywhere</b> in the window: CSV/JSON go to the preview, a .sqlite opens the database. After importing, <b>Undo</b> lets you go back.</p>'} },
  { id:'session', guide:'session', tags:['db','safety'], acts:['how','io'], pop:18, related:['backup'],
    title:{it:'Come salvo una sessione nel database SQLite', en:'How do I save a session in the SQLite database?'},
    body:{it:'<p>DocMap include un database <b>SQLite</b> vero che gira nel browser: niente server, funziona anche offline.</p><ul><li>Le tabelle (binders, contents_items…) si aggiornano da sole a ogni modifica.</li><li>Una <b>sessione</b> è una fotografia completa con nome: la ripristini quando vuoi.</li><li><b>Scarica docmap.sqlite</b> per avere il file da archiviare, copiare su chiavetta o aprire con DB Browser for SQLite.</li><li>Su Chrome/Edge puoi <b>collegare un file sul disco</b>: DocMap ci scrive a ogni modifica.</li></ul><p>Il database locale funziona senza Internet. Il server online dello studio (server-php), se lo usate, ha un suo database: si allinea con <b>⚙ Funzioni avanzate › Sincronizzazione › Sincronizza con il server</b>.</p>',
          en:'<p>DocMap includes a real <b>SQLite</b> database running in the browser: no server, works offline.</p><ul><li>Tables (binders, contents_items…) update on every change.</li><li>A <b>session</b> is a full named snapshot you can restore any time.</li><li><b>Download docmap.sqlite</b> to archive it, copy it to a USB stick or open it with DB Browser for SQLite.</li><li>On Chrome/Edge you can <b>link a file on disk</b>: DocMap writes to it on every change.</li></ul><p>The local database works without Internet. The studio\'s online server (server-php), if you use it, has its own database: it is aligned with <b>⚙ Advanced tools › Sync › Sync with the server</b>.</p>'} },
  { id:'backup', guide:'backup', tags:['safety','export'], acts:['how','io','fix'], pop:80, related:['session','import'],
    title:{it:'Come faccio il backup dei dati', en:'How do I back up my data?'},
    body:{it:'<ul><li>Ogni modifica è salvata subito nel browser (con una copia di sicurezza della versione precedente).</li><li>In alto a destra compare <b>Da esportare</b> (arancione) quando hai modifiche non ancora scaricate: premi <b>Salva backup</b> lì accanto (o Ctrl+S) per scaricare un JSON completo. Quando è tutto scaricato si legge <b>Esportato</b> (verde).</li><li>Se chiudi la scheda con modifiche non scaricate, il browser ti avvisa.</li><li>Ogni eliminazione o sostituzione chiede conferma, e subito dopo compare <b>Annulla</b> per qualche secondo.</li><li>Se chiudi un faldone modificato senza salvare, DocMap te lo chiede prima.</li><li>Il CSV di backup è protetto dalle formule di Excel (le celle che iniziano con = + - @ hanno un apostrofo davanti, tolto di nuovo all\'importazione).</li><li>Per un archivio a lungo termine scarica anche <b>docmap.sqlite</b>.</li></ul><p>Attenzione: svuotare i dati del browser cancella la copia locale. Tieni sempre un backup scaricato.</p>',
          en:'<ul><li>Every change is saved immediately in the browser (with a safety copy of the previous version).</li><li><b>Not exported</b> (amber) appears at the top right when you have changes not yet downloaded: press <b>Save backup</b> next to it (or Ctrl+S) to download a full JSON. When everything is downloaded it reads <b>Exported</b> (green).</li><li>If you close the tab with undownloaded changes, the browser warns you.</li><li>Every delete or replace asks for confirmation, and <b>Undo</b> appears right after for a few seconds.</li><li>If you close an edited binder without saving, DocMap asks first.</li><li>The backup CSV is protected from Excel formulas (cells starting with = + - @ get a leading apostrophe, removed again on import).</li><li>For long-term archiving also download <b>docmap.sqlite</b>.</li></ul><p>Note: clearing browser data deletes the local copy. Always keep a downloaded backup.</p>'} },
  { id:'register', guide:'register', tags:['export','print'], acts:['how','print','io'], pop:34, related:['manifest'],
    title:{it:'Come stampo il Registro generale d\'archivio', en:'How do I print the Master Archive Register?'},
    body:{it:'<p>Menu <b>⚙ Funzioni avanzate › Esporta e Salva</b> → <b>Apri Registro e Stampa</b>. È una tabella A4 con codice, posizione, cliente, contenuti, QR, short code e URL. Puoi stamparla o salvarla in PDF dal dialogo di stampa (Salva come PDF). Spunta "Solo faldoni selezionati" per un registro parziale.</p>',
          en:'<p>Menu <b>⚙ Advanced tools › Export &amp; Save</b> → <b>Open Register & Print</b>. It is an A4 table with code, location, client, contents, QR, short code and URL. Print it or save it as PDF from the print dialog. Tick "Only selected binders" for a partial register.</p>'} },
  { id:'map', guide:null, tags:['archive'], acts:['what','find'], pop:38, related:['create'],
    title:{it:'Come leggo la mappa scaffali e i codici posizione', en:'How do I read the shelf map and location codes?'},
    body:{it:'<p>Il codice <span class="kbd">B2-β-SX</span> si legge: stanza <b>B</b>, armadio <b>2</b>, ripiano <b>β</b> (secondo dall\'alto), settore <b>SX</b> (sinistra).</p><p>In Archivio → <b>Mappa Scaffali</b> vedi ogni stanza con armadi e ripiani e i dorsi colorati dei faldoni. I faldoni prelevati sono tratteggiati. Clicca un dorso per aprire "Dov\'è?": schema dell\'armadio con il ripiano evidenziato, foto e pulsante Modifica. L\'icona fotocamera accanto all\'armadio aggiunge o apre la sua foto.</p>',
          en:'<p>The code <span class="kbd">B2-β-SX</span> reads: room <b>B</b>, cabinet <b>2</b>, shelf <b>β</b> (second from the top), sector <b>SX</b> (left).</p><p>In Archive → <b>Shelf Map</b> you see every room with cabinets, shelves and coloured binder spines. Checked-out binders are dashed. Click a spine to open "Where is it?": cabinet schematic with the shelf highlighted, photos and an Edit button. The camera icon next to the cabinet adds or opens its photo.</p>'} }
];

/* v9 (stream T): label templates — info label (default), contents label, edge / cut compensation */
Object.assign(I18N.it, {
  cm_info:'Etichetta informazioni (consigliata)', cm_info_d:'Fatta per leggersi da lontano: Codice Multi grande in alto, ragione sociale grandissima che va a capo senza mai spezzare le parole, categoria e codice parlante, QR con l\'indirizzo sotto, tag e data. In fondo, se vuoi, le prime voci del contenuto.',
  cm_split:'Etichetta completa (classica)', tpl_rec:'Consigliata',
  k_info:'Etichetta informazioni', k_contents:'Etichetta contenuto',
  l_code_cap:'Codice', l_contents_cap:'Contenuto', l_updated_long:'Aggiornato il',
  io_items:'Voci del contenuto in fondo', io_none:'Nessuna', io_items_d:'Quante voci dell\'elenco contenuti stampare in piccolo in fondo all\'etichetta (le prime dell\'elenco).',
  io_pair:'Stampa anche l\'etichetta del contenuto', io_pair_d:'Per ogni faldone esce anche una seconda etichetta con tutto il contenuto e la data dell\'ultimo aggiornamento. Le due vanno sulle due metà della stessa etichetta fisica 105×148, da separare con la taglierina.',
  edge_h:'Bordi uguali su tutte le etichette', edge_on:'Compensa il bordo non stampabile e il taglio a mano',
  edge_on_d:'La stampante non stampa i 4 mm vicino al bordo del foglio e il taglio a mano non è mai perfetto: senza correzione le etichette staccate a sinistra hanno un bordino bianco a sinistra, quelle a destra a destra, quelle al centro nessuno. Acceso: ogni etichetta lascia lo stesso spazio bianco su tutti i lati, così sono tutte uguali e centrate, ovunque stiano sul foglio.',
  edge_outer:'Bordo che la stampante non stampa (mm)', edge_cut:'Margine di sicurezza per il taglio (mm)',
  edge_sum:'Su ogni etichetta, come la leggi: {a} mm bianchi in alto e in basso, {b} mm a sinistra e a destra. In anteprima il tratteggio azzurro mostra l\'area stampata (non esce in stampa).',
  edge_off_sum:'Spento: il testo usa il "Padding interno" della geometria, le etichette ai bordi del foglio possono avere un bordino bianco diverso.',
  edge_def_on:'Per questo foglio è consigliato acceso (etichette separate a mano).', edge_def_off:'Per questo foglio è consigliato spento: le etichette prefustellate sono già tutte uguali e lontane dal bordo.'
});
Object.assign(I18N.en, {
  cm_info:'Info label (recommended)', cm_info_d:'Made to be read from a distance: big Multi code on top, very large company name that wraps without ever breaking a word, category and speaking code, QR with its address under it, tags and date. Optionally the first contents items at the bottom.',
  cm_split:'Complete label (classic)', tpl_rec:'Recommended',
  k_info:'Info label', k_contents:'Contents label',
  l_code_cap:'Code', l_contents_cap:'Contents', l_updated_long:'Updated',
  io_items:'Contents items at the bottom', io_none:'None', io_items_d:'How many items of the contents list to print small at the bottom of the label (the first ones).',
  io_pair:'Also print the contents label', io_pair_d:'Each binder also gets a second label with the full contents and the date of the last update. The two go on the two halves of the same 105×148 physical label, cut apart with the trimmer.',
  edge_h:'Same borders on every label', edge_on:'Compensate the unprintable border and the hand cut',
  edge_on_d:'The printer cannot print the 4 mm near the sheet edge and a hand cut is never perfect: without correction labels peeled from the left get a white strip on the left, those on the right on the right, the middle ones none. On: every label keeps the same white space on all sides, so they are all identical and centred wherever they sit on the sheet.',
  edge_outer:'Border the printer cannot print (mm)', edge_cut:'Safety margin for the cut (mm)',
  edge_sum:'On every label, as you read it: {a} mm white at top and bottom, {b} mm left and right. In the preview the dashed blue outline shows the printed area (not printed).',
  edge_off_sum:'Off: text uses the geometry "Inner padding"; labels at the sheet edges may get a different white strip.',
  edge_def_on:'Recommended on for this sheet (labels separated by hand).', edge_def_off:'Recommended off for this sheet: die-cut labels are already identical and away from the edge.'
});
HELP_TOPICS.push(
  { id:'infolabel', guide:'print', tags:['label','print'], acts:['what','print'], pop:62, related:['split','edge','fields'],
    title:{it:'Cos\'è l\'etichetta informazioni (consigliata)', en:'What is the info label (recommended)?'},
    body:{it:'<p>È il modello predefinito per il foglio <b>MRINK143</b> (Stampa etichette › <b>Contenuto etichette</b>). Si legge da lontano sullo scaffale:</p><ul><li>In alto a sinistra il <b>Codice Multi</b> grande, con la scritta piccola "MULTI". Se il faldone non ha il Multi, lì va il <b>codice parlante</b> (scritta "CODICE").</li><li>Sotto: <b>categoria</b> e codice parlante.</li><li>A destra il <b>QR</b> con l\'indirizzo qr7.it/… sotto. Il codice breve da solo non viene più stampato.</li><li>La <b>ragione sociale</b> è grandissima: DocMap prova la dimensione più grande che entra, andando a capo <b>solo tra una parola e l\'altra</b>, mai a metà parola. Solo se una parola da sola è più larga dell\'etichetta il testo rimpicciolisce ancora.</li><li>Poi luogo e posizione, titolo e anno (se accesi nei Campi da stampare), le prime <b>voci del contenuto</b> (0, 1 o 2: scegli tu), in fondo tag e data.</li><li><b>Stampa anche l\'etichetta del contenuto</b> (spento di serie): ogni faldone riceve anche una seconda etichetta con tutto il contenuto e la data di aggiornamento, sull\'altra metà della stessa etichetta fisica.</li></ul><p>L\'etichetta di prima resta disponibile come <b>Etichetta completa (classica)</b>.</p>',
          en:'<p>The default template for the <b>MRINK143</b> sheet (Print labels › <b>Label content</b>). It reads from a distance on the shelf:</p><ul><li>Top left the <b>Multi code</b>, big, with a small "MULTI" caption. Without a Multi code the <b>speaking code</b> goes there ("CODE").</li><li>Below: <b>category</b> and speaking code.</li><li>On the right the <b>QR</b> with the qr7.it/… address under it. The bare short code is no longer printed.</li><li>The <b>company name</b> is very large: DocMap picks the largest size that fits, wrapping <b>only between words</b>, never inside a word. It shrinks further only when a single word is wider than the label.</li><li>Then place and location, title and year (if on in Fields to print), the first <b>contents items</b> (0, 1 or 2), and at the bottom tags and date.</li><li><b>Also print the contents label</b> (off by default): each binder also gets a second label with the full contents and the update date, on the other half of the same physical label.</li></ul><p>The previous label is still available as <b>Complete label (classic)</b>.</p>'} },
  { id:'edge', guide:'calib', tags:['print','calib','label'], acts:['how','print','fix'], pop:44, related:['infolabel','advanced','calib'],
    title:{it:'Come ottengo bordi uguali su tutte le etichette', en:'How do I get equal borders on every label?'},
    body:{it:'<p>Una normale stampante non riesce a stampare gli ultimi <b>4 mm circa</b> vicino al bordo del foglio A4. Sul foglio MRINK143 le etichette toccano il bordo: quella che stacchi a sinistra avrebbe un bordino bianco a sinistra, quella a destra a destra, quelle in mezzo nessuno. In più il <b>taglio a mano</b> a metà dell\'etichetta fisica sposta sempre di un millimetro.</p><p>Con <b>Compensa il bordo non stampabile e il taglio a mano</b> (Opzioni avanzate) DocMap lascia <b>lo stesso spazio bianco su tutti i lati di ogni etichetta</b>: il più grande tra il padding e il bordo non stampabile, più il margine di taglio sui lati tagliati a mano (su tutte le etichette, per tenerle uguali). Risultato: tutte le etichette hanno il testo della stessa misura e centrato, ovunque stiano sul foglio.</p><ul><li>Valori di serie: bordo <b>4 mm</b>, taglio <b>1 mm</b>. Se la tua stampante taglia di più, alza il bordo.</li><li>In anteprima un tratteggio azzurro mostra l\'area che verrà stampata; il tratteggio non esce in stampa.</li><li>Di serie è <b>acceso</b> sui fogli da tagliare a mano (MRINK143, A4 adesivo intero) e <b>spento</b> sui prefustellati, che sono già uguali e lontani dal bordo. La scelta vale per il foglio selezionato.</li></ul>',
          en:'<p>A normal printer cannot print the last <b>~4 mm</b> near the edge of an A4 sheet. On MRINK143 the labels touch the edge: the one peeled from the left would get a white strip on the left, the right one on the right, the middle ones none. On top of that the <b>hand cut</b> across the physical label always wanders by a millimetre.</p><p>With <b>Compensate the unprintable border and the hand cut</b> (Advanced options) DocMap keeps <b>the same white space on every side of every label</b>: the larger of padding and unprintable border, plus the cut margin on the hand-cut sides (on all labels, to keep them identical). Result: every label has text of the same size, centred, wherever it sits on the sheet.</p><ul><li>Defaults: border <b>4 mm</b>, cut <b>1 mm</b>. If your printer clips more, raise the border.</li><li>The preview shows the printed area with a dashed blue outline; it is not printed.</li><li>On by default for sheets cut by hand (MRINK143, full adhesive A4), off for die-cut sheets, which are already identical and away from the edge. The choice is kept per sheet.</li></ul>'} }
);
(function(){ const s = HELP_TOPICS.find(x => x.id === 'split'); if (s && !s.related.includes('infolabel')) s.related.unshift('infolabel', 'edge'); })();
/* =====================================================================
   v10 (stream G) — help centre: popularity order, favourites, two tag
   filters (topic tags + colour-coded action tags), forgiving search.

   Topic fields (all optional except id/title/body; other files may push
   topics at DOMContentLoaded and they are normalised lazily by helpEnsure):
     tags:[keys of HELP_TAGS]     what the topic is about   (default ['other'])
     acts:[keys of HELP_ACTS]     what the user wants to do (default: guessed from the title)
     pop: 0..100                  seeded popularity          (default 20)
     guide:'guideId'|null, related:[ids]
   HELP_META below adds acts/pop/clearer titles to topics defined in other files.
   Per-installation memory (usage counts, favourites per operator, resume point,
   sort) lives in localStorage key HELP_LS, never in S: it is UI telemetry of this
   PC, not archive data, so it must not travel in backups, sessions, undo or sync.
   ===================================================================== */
Object.assign(I18N.it, {
  help_search:'Cerca: etichetta, stampa, cliente, QR, backup…', help_none:'Nessun argomento trovato. Prova con un\'altra parola, ad esempio "etichetta", "cliente" o "backup".',
  help_sort:'Ordina', help_sort_pop:'Popolari', help_sort_fav:'Preferiti', help_sort_az:'A-Z',
  help_f_topic:'Argomento', help_f_act:'Cosa vuoi fare', help_favs:'Preferiti', help_guides:'Azioni guidate', help_topics:'Argomenti',
  help_more_g:'Mostra tutte ({n})', help_less_g:'Mostra meno', help_steps:'{n} passi', help_guided:'guidata', help_results:'{n} risultati',
  help_fav_add:'Aggiungi ai preferiti', help_fav_del:'Togli dai preferiti', help_fav_none:'Nessun preferito ancora: premi la stella accanto a un\'azione guidata o a un argomento.',
  help_fav_who:'Preferiti di {w}', help_fav_pc:'Preferiti di questo PC',
  help_legend:'Grigio = argomento, colore = cosa vuoi fare. Quando cerchi, restano accese solo le etichette dei risultati.',
  help_resume:'Hai lasciato a metà "{g}" al passo {n} di {t}.', help_resume_btn:'Riprendi la guida', help_resume_forget:'Lascia stare'
});
Object.assign(I18N.en, {
  help_search:'Search: label, print, client, QR, backup…', help_none:'No topic found. Try another word, e.g. "label", "client" or "backup".',
  help_sort:'Sort', help_sort_pop:'Popular', help_sort_fav:'Favourites', help_sort_az:'A-Z',
  help_f_topic:'Topic', help_f_act:'What do you want to do', help_favs:'Favourites', help_guides:'Guided actions', help_topics:'Topics',
  help_more_g:'Show all ({n})', help_less_g:'Show less', help_steps:'{n} steps', help_guided:'guided', help_results:'{n} results',
  help_fav_add:'Add to favourites', help_fav_del:'Remove from favourites', help_fav_none:'No favourites yet: press the star next to a guided action or a topic.',
  help_fav_who:'Favourites of {w}', help_fav_pc:'Favourites of this PC',
  help_legend:'Grey = topic, colour = what you want to do. While you search only the tags of the results stay lit.',
  help_resume:'You left "{g}" halfway, at step {n} of {t}.', help_resume_btn:'Resume the guide', help_resume_forget:'Never mind'
});
Object.assign(ICONS, {
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  play:'<polygon points="6 3 20 12 6 21 6 3"/>'
});
Object.assign(HELP_TAGS, { client:{it:'Clienti',en:'Clients'}, help:{it:'Guida',en:'Help'}, other:{it:'Altro',en:'Other'} });
/* Action tags: colour pairs are dark text on a light tint of the same hue (contrast ≥ 4.5:1, checked by the suite). */
const HELP_ACTS = {
  how:   {it:'Come fare', en:'How to',        c:'#1D4ED8', bg:'#DBEAFE'},
  what:  {it:'Cos\'è', en:'What is',          c:'#6D28D9', bg:'#EDE9FE'},
  create:{it:'Creare', en:'Create',           c:'#047857', bg:'#D1FAE5'},
  edit:  {it:'Modificare', en:'Edit',         c:'#92400E', bg:'#FEF3C7'},
  delete:{it:'Eliminare', en:'Delete',        c:'#B91C1C', bg:'#FEE2E2'},
  print: {it:'Stampare', en:'Print',          c:'#0E7490', bg:'#CFFAFE'},
  io:    {it:'Importare / Esportare', en:'Import / Export', c:'#3730A3', bg:'#E0E7FF'},
  find:  {it:'Trovare', en:'Find',            c:'#9A3412', bg:'#FFEDD5'},
  fix:   {it:'Risolvere problemi', en:'Troubleshoot', c:'#9D174D', bg:'#FCE7F3'}
};
const HELP_META = {
  nav:         {acts:['find'], pop:60, title:{it:'Dove trovo Importa, Esporta, Sincronizzazione, Database e Impostazioni', en:'Where are Import, Export, Sync, Database and Settings?'}},
  info:        {acts:['what','edit','delete'], pop:36, tags:['client'], title:{it:'Cos\'è la scheda Informazioni (clienti, tag, categorie, anni, luoghi, codici)', en:'What is the Information tab (clients, tags, categories, years, places, codes)?'}},
  'qr-reprint':{acts:['how','print','fix'], pop:66, title:{it:'Come ristampo solo i QR rovinati', en:'How do I reprint only damaged QR codes?'}},
  excel:       {acts:['how','io'], pop:74, title:{it:'Come importo un file Excel (.xlsx) e abbino le colonne', en:'How do I import an Excel file (.xlsx) and match the columns?'}},
  pdf:         {acts:['how','print','io'], pop:84, guide:'pdf', title:{it:'Come scarico il PDF delle etichette (per stampare da un altro PC)', en:'How do I download the labels as PDF (to print from another PC)?'}},
  colors:      {acts:['how','edit','what'], pop:40, tags:['label'], title:{it:'Come funzionano i colori dei dorsi (spettro, regole colore, colori bloccati)', en:'How do spine colours work (spectrum, colour rules, locked colours)?'}},
  log:         {acts:['what','find'], pop:32, title:{it:'Cos\'è il registro attività (chi ha fatto cosa)', en:'What is the activity log (who did what)?'}}
};
HELP_TOPICS.push(
  { id:'client-new', guide:'client', tags:['client','archive'], acts:['how','create'], pop:92, related:['clients','create','multi'],
    title:{it:'Come creo un nuovo cliente', en:'How do I add a new client?'},
    body:{it:'<ol><li>Apri <b>Informazioni</b> (barra in alto) e la sotto-scheda <b>Clienti</b>.</li><li>Premi <b>Nuovo cliente</b>.</li><li>Scrivi la <b>ragione sociale</b> (obbligatoria) e, se li hai, <b>Codice Multi</b> (il codice del cliente nel gestionale), indirizzo, località e provincia, tipo e categoria.</li><li>Premi <b>Salva</b>.</li></ol><ul><li>Da quel momento, scrivendo il nome in un faldone nuovo, Codice Multi, luogo e categoria si compilano da soli. Nella riga del cliente il pulsante <b>Nuovo faldone</b> apre direttamente la scheda già compilata.</li><li>Se poi cambi nome, Codice Multi o località del cliente, i faldoni collegati si aggiornano da soli (con <b>Annulla</b>).</li><li>Hai già l\'elenco in Excel o CSV? Usa <b>Importa elenco clienti</b>: vedi "Come importo l\'elenco clienti dello studio".</li></ul>',
          en:'<ol><li>Open <b>Information</b> (top bar) and the <b>Clients</b> sub-tab.</li><li>Press <b>New client</b>.</li><li>Type the <b>company name</b> (required) and, if you have them, the <b>Multi code</b> (the client code in your management software), address, town and province, type and category.</li><li>Press <b>Save</b>.</li></ol><ul><li>From then on, typing the name in a new binder fills in Multi code, place and category. The <b>New binder</b> button in the client row opens a form already filled in.</li><li>If you later change the client name, Multi code or town, the linked binders follow (with <b>Undo</b>).</li><li>Already have the list in Excel or CSV? Use <b>Import client list</b>: see "How do I import the studio client list?".</li></ul>'} },
  { id:'edit', guide:'edit', tags:['archive','label'], acts:['how','edit','delete'], pop:82, related:['create','print','backup'],
    title:{it:'Come modifico, duplico o elimino un faldone', en:'How do I edit, duplicate or delete a binder?'},
    body:{it:'<p>In <b>Archivio</b> ogni riga ha a destra le sue azioni: <b>Dov\'è?</b> (segnaposto), <b>Mostra QR</b>, <b>Modifica</b> (matita), <b>Duplica</b> ed <b>Elimina</b> (cestino).</p><ul><li><b>Modifica</b>: si apre la scheda del faldone; cambia i campi e premi <b>Salva</b> (o Ctrl+S). Se chiudi con modifiche non salvate DocMap te lo chiede prima.</li><li>Dopo una modifica il faldone torna in coda di stampa: ristampa l\'etichetta se è cambiato qualcosa che si vede.</li><li><b>Duplica</b> crea una copia con un nuovo codice parlante e un nuovo QR: comodo per l\'anno successivo dello stesso cliente.</li><li><b>Elimina</b> chiede conferma; subito dopo compare <b>Annulla</b> per qualche secondo. Per eliminarne tanti insieme spuntali e usa <b>Elimina selezionati</b>.</li><li>Ogni modifica finisce nel <b>Registro attività</b> con i campi cambiati (prima → dopo).</li></ul>',
          en:'<p>In <b>Archive</b> each row has its actions on the right: <b>Where is it?</b> (pin), <b>Show QR</b>, <b>Edit</b> (pencil), <b>Duplicate</b> and <b>Delete</b> (bin).</p><ul><li><b>Edit</b>: the binder form opens; change the fields and press <b>Save</b> (or Ctrl+S). If you close with unsaved changes DocMap asks first.</li><li>After an edit the binder goes back into the print queue: reprint the label if something visible changed.</li><li><b>Duplicate</b> makes a copy with a new speaking code and a new QR: handy for next year of the same client.</li><li><b>Delete</b> asks for confirmation; right after, <b>Undo</b> appears for a few seconds. To delete many at once tick them and use <b>Delete selected</b>.</li><li>Every edit is recorded in the <b>Activity log</b> with the changed fields (before → after).</li></ul>'} },
  { id:'guide-help', guide:null, tags:['help'], acts:['how','what'], pop:35, related:['create','print','nav'],
    title:{it:'Come uso la guida e le azioni guidate', en:'How do I use help and guided actions?'},
    body:{it:'<ul><li>Apri la guida con il pulsante <b>?</b> in alto o con <b>F1</b>. Gli argomenti più usati sono in cima e l\'ordine si adatta a quello che usi davvero su questo PC. Puoi ordinare anche per <b>Preferiti</b> o <b>A-Z</b>.</li><li><b>Stella</b>: aggiunge un argomento o un\'azione guidata ai preferiti. Se in Impostazioni hai scritto il tuo nome (operatore), i preferiti sono solo tuoi.</li><li><b>Filtri</b>: le etichette grigie sono gli argomenti (Stampa, Etichette, Clienti…), quelle colorate dicono cosa vuoi fare (Creare, Modificare, Eliminare, Stampare…). Quando scrivi nella ricerca i filtri si azzerano e restano accese solo le etichette dei risultati.</li><li>La ricerca capisce accenti, singolare e plurale e i sinonimi più comuni: faldone / raccoglitore / archivio, cliente / ditta / azienda, stampa / stampare, QR / codice QR.</li><li><b>Azioni guidate</b>: fai tu l\'azione vera, la guida evidenzia il punto giusto. <b>Avanti</b> (o Invio / freccia destra), <b>Indietro</b> (freccia sinistra), i pallini per saltare a un passo. Cliccare un campo di un altro passo ti porta a quel passo.</li><li>Non esci mai per sbaglio: Esc, la ✕ o un clic fuori ti chiedono prima conferma. Se esci a metà, la guida ricorda il passo: trovi <b>Riprendi la guida</b> qui in cima.</li></ul>',
          en:'<ul><li>Open help with the <b>?</b> button at the top or <b>F1</b>. The most used topics come first and the order adapts to what is really used on this PC. You can also sort by <b>Favourites</b> or <b>A-Z</b>.</li><li><b>Star</b>: adds a topic or a guided action to your favourites. If you typed your name (operator) in Settings, the favourites are yours only.</li><li><b>Filters</b>: grey tags are topics (Print, Labels, Clients…), coloured tags say what you want to do (Create, Edit, Delete, Print…). When you type in the search box the filters reset and only the tags of the results stay lit.</li><li>Search understands accents, singular and plural and common synonyms: binder / folder / archive, client / company, print / printing, QR / QR code.</li><li><b>Guided actions</b>: you perform the real action, the guide highlights the right spot. <b>Next</b> (or Enter / right arrow), <b>Back</b> (left arrow), the dots to jump to a step. Clicking a field of another step takes you to that step.</li><li>You never leave by accident: Esc, the ✕ or a click outside ask first. If you leave halfway the guide remembers the step: <b>Resume the guide</b> appears at the top here.</li></ul>'} }
);
function helpTopic(id){ helpEnsure(); return HELP_TOPICS.find(x => x.id === id); }
const HELP = { open:false, q:'', tag:'', act:'', topic:null, sort:'', allGuides:false };
const HELP_LS = 'docmap_v26_help';
let HELP_MEM = null;

/* ---------- normalisation of topics registered by any file ---------- */
const helpUniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
function helpGuessActs(tp){
  const s = helpNorm(((tp.title || {}).it || '') + ' ' + ((tp.title || {}).en || ''));
  const a = [];
  if (/^(come|how)\b/.test(s)) a.push('how');
  if (/^(cos e|cosa|what)\b/.test(s)) a.push('what');
  [['create', /\b(crea|nuov|aggiung|create|new|add)/], ['edit', /\b(modific|cambi|rinomin|edit|change|rename)/], ['delete', /\b(elimin|cancell|delete|remove)/],
   ['print', /\b(stamp|print|pdf)/], ['io', /\b(import|esport|export|scaric|download|sincron|sync|backup)/], ['find', /\b(trov|cerc|dove|find|search|where)/],
   ['fix', /\b(problem|errore|risolv|fix|trouble)/]].forEach(([k, re]) => { if (re.test(s)) a.push(k); });
  return a.length ? a : ['what'];
}
function helpEnsure(){
  HELP_TOPICS.forEach(tp => {
    if (tp._g) return;
    const m = HELP_META[tp.id] || {};
    if (m.title) tp.title = m.title;
    if (m.guide && !tp.guide) tp.guide = m.guide;
    tp.tags = helpUniq((Array.isArray(tp.tags) ? tp.tags : []).concat(m.tags || []));
    if (!tp.tags.length) tp.tags = ['other'];
    if (!Array.isArray(tp.acts) || !tp.acts.length) tp.acts = m.acts || helpGuessActs(tp);
    if (typeof tp.pop !== 'number') tp.pop = typeof m.pop === 'number' ? m.pop : 20;
    if (!Array.isArray(tp.related)) tp.related = [];
    Object.defineProperty(tp, '_g', {value:1, enumerable:false, configurable:true});
  });
}
const helpTagLabel = (k) => HELP_TAGS[k] ? L(HELP_TAGS[k]) : k.charAt(0).toUpperCase() + k.slice(1);
const helpActLabel = (k) => HELP_ACTS[k] ? L(HELP_ACTS[k]) : k;

/* ---------- per-installation memory (localStorage, wrapped) ---------- */
function helpStore(){
  if (HELP_MEM) return HELP_MEM;
  let o = null; try { o = JSON.parse(localStorage.getItem(HELP_LS) || 'null'); } catch(e){}
  HELP_MEM = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  ['usage', 'fav', 'resume', 'sort'].forEach(k => { if (!HELP_MEM[k] || typeof HELP_MEM[k] !== 'object') HELP_MEM[k] = {}; });
  HELP_MEM.v = 1;
  return HELP_MEM;
}
function helpSave(){ try { localStorage.setItem(HELP_LS, JSON.stringify(helpStore())); } catch(e){} }
/* favourites, sort and resume point belong to the operator (Impostazioni › Il tuo nome) when set, else to this PC */
function helpWho(){ const op = S && S.settings ? String(S.settings.operator || '').trim().toLowerCase() : ''; return op ? 'op:' + op : 'pc'; }
const HELP_HALF_DAYS = 60, HELP_USE_W = 6;   // usage halves every 60 days; each recent use = 6 popularity points
function helpUseCount(key){ const u = helpStore().usage[key]; if (!u || !(u.n > 0)) return 0; const days = Math.max(0, (Date.now() - (u.t || 0)) / 864e5); return u.n * Math.pow(0.5, days / HELP_HALF_DAYS); }
function helpUse(key){ helpStore().usage[key] = {n:Math.round((helpUseCount(key) + 1) * 1000) / 1000, t:Date.now()}; helpSave(); }
function helpScore(tp){ return tp.pop + HELP_USE_W * (helpUseCount('t:' + tp.id) + (tp.guide ? helpUseCount('g:' + tp.guide) : 0)); }
function guidePop(id){
  const g = GUIDES[id]; let p = g && typeof g.pop === 'number' ? g.pop : 0;
  if (!p){ helpEnsure(); HELP_TOPICS.forEach(tp => { if (tp.guide === id) p = Math.max(p, tp.pop); }); }
  return p + HELP_USE_W * helpUseCount('g:' + id);
}
function helpFavs(){ const a = helpStore().fav[helpWho()]; return Array.isArray(a) ? a : []; }
function helpIsFav(k){ return helpFavs().includes(k); }
function helpToggleFav(k){ const s = helpStore(), w = helpWho(), a = helpFavs().slice(), i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.unshift(k); s.fav[w] = a; helpSave(); return i < 0; }
function helpSortMode(){ const v = HELP.sort || helpStore().sort[helpWho()]; return ['pop', 'fav', 'az'].includes(v) ? v : 'pop'; }

/* ---------- forgiving search: accents, plurals, synonyms, prefixes ---------- */
const HELP_STOP = new Set(('come cosa cos il lo la i gli le un una uno di del dello della dei degli delle a ad al allo alla ai agli alle da dal dalla in nel nello nella nei con su sul sulla per tra fra e ed o che mi si ci ' +
  'faccio fare posso devo voglio how do does i a an the to of in on for and or my can what is where which').split(' '));
const HELP_SYN = [
  ['faldone','faldoni','raccoglitore','raccoglitori','archivio','archiviare','cartella','album','scatola','binder','folder','archive'],
  ['cliente','clienti','ditta','ditte','azienda','aziende','societa','ragione','client','company','customer'],
  ['stampa','stampare','stampo','stampante','stampanti','print','printer','printing'],
  ['qr','qrcode','qr7','codiceqr'],
  ['etichetta','etichette','adesivo','label','sticker'],
  ['importa','importare','importo','carica','caricare','import','upload','excel','xlsx','csv'],
  ['esporta','esportare','esporto','scarica','scaricare','scarico','export','download'],
  ['elimina','eliminare','elimino','cancella','cancellare','cancello','rimuovi','delete','remove'],
  ['modifica','modificare','modifico','cambia','cambiare','cambio','correggi','rinomina','edit','change','rename'],
  ['crea','creare','creo','nuovo','nuova','aggiungi','aggiungere','create','new','add'],
  ['backup','salvataggio','salvare','salvo','save'],
  ['trova','trovare','trovo','cerca','cercare','cerco','dove','scaffale','find','search','where','shelf'],
  ['calibrazione','calibrare','prova','offset','calibration','test']
];
function helpNorm(s){ return String(s == null ? '' : s).replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
const HELP_SUF = ['azioni','azione','mente','ando','endo','are','ere','ire','ato','ata','ati','ate','ing','es','i','e','a','o','s'];
function helpStem(w){ if (w.length <= 4) return w; for (const x of HELP_SUF){ if (w.length - x.length >= 4 && w.endsWith(x)) return w.slice(0, -x.length); } return w; }
const HELP_SYN_STEMS = HELP_SYN.map(g => helpUniq(g.map(helpStem)));
/* query → list of terms, each term = list of acceptable stems (the word plus its synonyms) */
function helpQueryTerms(q){
  let toks = helpNorm(q).split(' ').filter(Boolean);
  const content = toks.filter(w => !HELP_STOP.has(w));
  if (content.length) toks = content;
  return toks.map(w => {
    const s = helpStem(w), set = [s];
    HELP_SYN_STEMS.forEach(g => { if (g.some(m => m === s || (s.length >= 3 && m.startsWith(s)) || (m.length >= 4 && s.startsWith(m)))) g.forEach(m => { if (!set.includes(m)) set.push(m); }); });
    return set;
  });
}
function helpIndex(tp){
  const key = S.lang + '|' + L(tp.title) + '|' + L(tp.body).length + '|' + tp.tags.join() + tp.acts.join();
  if (tp._ix && tp._ix.key === key) return tp._ix;
  const toks = (s) => helpUniq(helpNorm(s).split(' ').filter(Boolean).map(helpStem));
  const ix = {key, title:toks(L(tp.title)), tags:toks(tp.tags.map(helpTagLabel).concat(tp.acts.map(helpActLabel)).join(' ') + ' ' + tp.tags.join(' ')), body:toks(L(tp.body))};
  Object.defineProperty(tp, '_ix', {value:ix, writable:true, enumerable:false, configurable:true});
  return ix;
}
/* score > 0 when every term matches the title, the tags or the body (prefix match on stems);
   the word as typed (term[0]) weighs more than its synonyms */
function helpMatch(tp, terms){
  const ix = helpIndex(tp); let score = 0;
  const hit = (arr, term) => arr.some(tk => tk.startsWith(term[0])) ? 1 : arr.some(tk => term.some(e => tk.startsWith(e))) ? 0.6 : 0;
  for (const term of terms){
    const w = Math.max(6 * hit(ix.title, term), 3 * hit(ix.tags, term), hit(ix.body, term));
    if (!w) return 0;
    score += w;
  }
  return score;
}
function helpSearching(){ return !!HELP.q.trim(); }
function helpList(){
  helpEnsure();
  if (helpSearching()){
    const terms = helpQueryTerms(HELP.q);
    if (!terms.length) return helpSorted(HELP_TOPICS);
    return HELP_TOPICS.map(tp => ({tp, s:helpMatch(tp, terms)})).filter(x => x.s > 0).sort((a, b) => b.s - a.s || helpScore(b.tp) - helpScore(a.tp)).map(x => x.tp);
  }
  return helpSorted(HELP_TOPICS.filter(tp => (!HELP.tag || tp.tags.includes(HELP.tag)) && (!HELP.act || tp.acts.includes(HELP.act))));
}
function helpCmpTitle(a, b){ return a.localeCompare(b, S.lang === 'en' ? 'en' : 'it', {sensitivity:'base'}); }
function helpSorted(list){
  const mode = helpSortMode(), az = (a, b) => helpCmpTitle(L(a.title), L(b.title));
  const pop = (a, b) => helpScore(b) - helpScore(a) || az(a, b);
  if (mode === 'az') return list.slice().sort(az);
  if (mode === 'fav'){ const f = (tp) => helpIsFav('t:' + tp.id) ? 0 : 1; return list.slice().sort((a, b) => f(a) - f(b) || pop(a, b)); }
  return list.slice().sort(pop);
}
/* guided actions shown in the panel: by popularity (or the order of the topic results while searching/filtering) */
function helpGuideList(topics){
  const filtering = helpSearching() || HELP.tag || HELP.act, mode = helpSortMode();
  let ids;
  if (filtering){ ids = []; topics.forEach(tp => { if (tp.guide && GUIDES[tp.guide] && !ids.includes(tp.guide)) ids.push(tp.guide); }); return ids; }
  ids = Object.keys(GUIDES).sort((a, b) => guidePop(b) - guidePop(a));
  if (mode === 'az') ids.sort((a, b) => helpCmpTitle(L(GUIDES[a].title), L(GUIDES[b].title)));
  if (mode === 'fav'){ const f = (id) => helpIsFav('g:' + id) ? 0 : 1; ids = ids.map((id, i) => [id, i]).sort((a, b) => f(a[0]) - f(b[0]) || a[1] - b[1]).map(x => x[0]); }
  return ids;
}

/* ---------- rendering ---------- */
function helpDot(id){ return ' <button class="help-dot" data-a="help-topic" data-id="' + id + '" title="' + esc(t('help')) + '" aria-label="' + esc(t('help')) + '">?</button>'; }
function helpOpen(topicId){
  HELP.open = true; HELP.topic = topicId || null;
  if (topicId && helpTopic(topicId)) helpUse('t:' + topicId);
  renderHelp();
  setTimeout(() => { const i = $('#help-q'); if (i && !topicId) i.focus(); else { const h = $('.help-title'); if (h) h.focus(); } }, 60);
}
function helpClose(){ HELP.open = false; renderHelp(); }
const helpActStyle = (k) => { const a = HELP_ACTS[k]; return a ? ' style="--hc:' + a.c + ';--hb:' + a.bg + '"' : ''; };
function helpChipsHTML(tp, lit){
  return tp.tags.map(tg => '<span class="htag' + (lit && lit.tag === tg ? ' on' : '') + '">' + esc(helpTagLabel(tg)) + '</span>').join('') +
    tp.acts.map(a => '<span class="hact"' + helpActStyle(a) + ' data-act="' + esc(a) + '">' + esc(helpActLabel(a)) + '</span>').join('') +
    (tp.guide && GUIDES[tp.guide] ? '<span class="htag guide">' + ic('sparkles') + esc(t('help_guided')) + '</span>' : '');
}
function helpStarHTML(k, label){
  const on = helpIsFav(k), tip = t(on ? 'help_fav_del' : 'help_fav_add');
  return '<button type="button" class="help-star' + (on ? ' on' : '') + '" data-a="help-fav" data-k="' + esc(k) + '" aria-pressed="' + on + '" title="' + esc(tip) + '" aria-label="' + esc(tip + ': ' + label) + '">' + ic('star') + '</button>';
}
function helpTopicRow(tp){
  return '<div class="help-row"><button class="help-item" data-a="help-topic" data-id="' + esc(tp.id) + '"><span class="hi-t">' + esc(L(tp.title)) + '</span><span class="hi-tags">' + helpChipsHTML(tp) + '</span></button>' + helpStarHTML('t:' + tp.id, L(tp.title)) + '</div>';
}
function helpGuideRow(id){
  const g = GUIDES[id];
  return '<div class="help-row g"><button class="help-g" data-a="guide-start" data-id="' + esc(id) + '"><span class="hg-ic">' + ic('play') + '</span><span class="hi-t">' + esc(L(g.title)) + '</span><span class="hg-n">' + esc(t('help_steps', {n:g.steps.length})) + '</span></button>' + helpStarHTML('g:' + id, L(g.title)) + '</div>';
}
function helpFilterHTML(results){
  helpEnsure();
  const searching = helpSearching();
  const litT = new Set(), litA = new Set();
  if (searching) results.forEach(tp => { tp.tags.forEach(x => litT.add(x)); tp.acts.forEach(x => litA.add(x)); });
  const cnt = {}; HELP_TOPICS.forEach(tp => tp.tags.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; }));
  const known = Object.keys(HELP_TAGS), tags = Object.keys(cnt).sort((a, b) => (cnt[b] - cnt[a]) || (known.indexOf(a) - known.indexOf(b)));
  const usedActs = Object.keys(HELP_ACTS).filter(a => HELP_TOPICS.some(tp => tp.acts.includes(a)));
  const st = (on, lit) => searching ? (lit ? ' lit' : ' nomatch') : (on ? ' on' : '');
  const pressed = (on) => ' aria-pressed="' + (!searching && on) + '"';
  return '<div class="hf-row" role="group" aria-label="' + esc(t('help_f_topic')) + '"><span class="hf-l">' + esc(t('help_f_topic')) + '</span>' +
      '<button class="htag btn-tag' + (searching ? ' nomatch' : (!HELP.tag && !HELP.act ? ' on' : '')) + '" data-a="help-tag" data-t=""' + pressed(!HELP.tag && !HELP.act) + '>' + esc(t('help_all')) + '</button>' +
      tags.map(tg => '<button class="htag btn-tag' + st(HELP.tag === tg, litT.has(tg)) + '" data-a="help-tag" data-t="' + esc(tg) + '"' + pressed(HELP.tag === tg) + (searching && !litT.has(tg) ? ' aria-hidden="true" tabindex="-1"' : '') + '>' + esc(helpTagLabel(tg)) + '</button>').join('') + '</div>' +
    '<div class="hf-row" role="group" aria-label="' + esc(t('help_f_act')) + '"><span class="hf-l">' + esc(t('help_f_act')) + '</span>' +
      usedActs.map(a => '<button class="hact btn-tag' + st(HELP.act === a, litA.has(a)) + '" data-a="help-act" data-t="' + a + '"' + helpActStyle(a) + pressed(HELP.act === a) + (searching && !litA.has(a) ? ' aria-hidden="true" tabindex="-1"' : '') + '>' + esc(helpActLabel(a)) + '</button>').join('') + '</div>' +
    '<div class="hf-legend">' + (searching ? '<b>' + esc(t('help_results', {n:results.length})) + '</b> · ' : '') + esc(t('help_legend')) + '</div>';
}
function renderHelpList(){
  const box = $('#help-list'); if (!box) return;
  const list = helpList(), filtering = helpSearching() || HELP.tag || HELP.act, mode = helpSortMode();
  const fb = $('#help-filters'); if (fb) fb.innerHTML = helpFilterHTML(list);
  let html = '';
  if (!filtering){
    const favs = helpFavs().filter(k => k.startsWith('g:') ? GUIDES[k.slice(2)] : helpTopic(k.slice(2)));
    if (favs.length) html += '<div class="help-sec"><div class="lbl">' + ic('star') + ' ' + esc(t('help_favs')) + '</div><div class="stack" style="gap:6px">' + favs.map(k => k.startsWith('g:') ? helpGuideRow(k.slice(2)) : helpTopicRow(helpTopic(k.slice(2)))).join('') + '</div><div class="tiny muted" style="margin-top:4px">' + esc(helpWho() === 'pc' ? t('help_fav_pc') : t('help_fav_who', {w:S.settings.operator.trim()})) + '</div></div>';
    else if (mode === 'fav') html += '<div class="help-sec"><div class="hint">' + esc(t('help_fav_none')) + '</div></div>';
  }
  const gids = helpGuideList(list), shown = (filtering || HELP.allGuides) ? gids : gids.slice(0, 5);
  if (gids.length) html += '<div class="help-sec" id="help-guides"><div class="lbl">' + ic('sparkles') + ' ' + esc(t('help_guides')) + '</div><div class="stack" style="gap:6px">' + shown.map(helpGuideRow).join('') + '</div>' +
    (!filtering && gids.length > 5 ? '<button class="btn btn-sm btn-ghost" style="margin-top:4px" data-a="help-more-g">' + esc(HELP.allGuides ? t('help_less_g') : t('help_more_g', {n:gids.length})) + '</button>' : '') + '</div>';
  html += '<div class="help-sec" id="help-topics"><div class="lbl">' + ic('book') + ' ' + esc(t('help_topics')) + '</div><div class="stack" style="gap:8px">' +
    (list.length ? list.map(helpTopicRow).join('') : '<div class="empty" style="padding:24px">' + esc(t('help_none')) + '</div>') + '</div></div>';
  box.innerHTML = html;
}
function helpResumeHTML(){
  const r = typeof guideResumeInfo === 'function' ? guideResumeInfo() : null; if (!r) return '';
  const g = GUIDES[r.id];
  return '<div class="help-resume" role="status">' + ic('play') + '<div style="flex:1"><div class="small"><b>' + esc(t('help_resume', {g:L(g.title), n:r.i + 1, t:g.steps.length})) + '</b></div>' +
    '<div class="row" style="gap:8px;margin-top:8px"><button class="btn btn-sm btn-primary" data-a="guide-resume">' + ic('play') + esc(t('help_resume_btn')) + '</button><button class="btn btn-sm btn-ghost" data-a="guide-forget">' + esc(t('help_resume_forget')) + '</button></div></div></div>';
}
function renderHelp(){
  const root = $('#help-root');
  if (!HELP.open){ root.innerHTML = ''; document.body.classList.remove('help-open'); return; }
  helpEnsure();
  document.body.classList.add('help-open');
  const tp = HELP.topic && helpTopic(HELP.topic);
  let inner;
  if (tp){
    const g = tp.guide && GUIDES[tp.guide];
    inner = '<button class="btn btn-sm btn-ghost" data-a="help-back" style="margin-bottom:10px">← ' + esc(t('help_back')) + '</button>' +
      '<div class="help-title-row"><h3 class="help-title" tabindex="-1">' + esc(L(tp.title)) + '</h3>' + helpStarHTML('t:' + tp.id, L(tp.title)) + '</div><div class="hi-tags" style="margin-bottom:14px">' + helpChipsHTML(tp) + '</div>' +
      (g ? '<div class="guide-cta"><div class="row" style="gap:8px;flex-wrap:nowrap"><button class="btn btn-lg btn-primary btn-block" data-a="guide-start" data-id="' + esc(tp.guide) + '">' + ic('sparkles') + esc(t('help_start')) + '</button>' + helpStarHTML('g:' + tp.guide, L(g.title)) + '</div><div class="hint" style="margin-top:6px">' + esc(L(g.title)) + ' · ' + esc(t('help_steps', {n:g.steps.length})) + '. ' + esc(t('help_start_d')) + '</div></div>' : '') +
      '<div class="lbl" style="margin:18px 0 6px">' + esc(t('help_wiki')) + '</div><div class="wiki">' + L(tp.body) + '</div>' +
      (tp.related.length ? '<div class="lbl" style="margin:18px 0 6px">' + esc(t('help_related')) + '</div><div class="stack" style="gap:6px">' + helpUniq(tp.related).map(r => helpTopic(r)).filter(Boolean).map(r => '<button class="help-item" data-a="help-topic" data-id="' + esc(r.id) + '"><span class="hi-t">' + esc(L(r.title)) + '</span></button>').join('') + '</div>' : '');
  } else {
    const mode = helpSortMode();
    inner = '<div class="search" style="min-width:0">' + ic('search') + '<input class="inp" id="help-q" type="search" value="' + esc(HELP.q) + '" placeholder="' + esc(t('help_search')) + '" aria-label="' + esc(t('help_search')) + '" aria-controls="help-list"></div>' +
      helpResumeHTML() +
      '<div class="help-sort"><span class="hf-l">' + esc(t('help_sort')) + '</span><div class="seg" role="group" aria-label="' + esc(t('help_sort')) + '">' +
        [['pop', 'help_sort_pop'], ['fav', 'help_sort_fav'], ['az', 'help_sort_az']].map(([v, k]) => '<button data-a="help-sort" data-v="' + v + '" class="' + (mode === v ? 'on' : '') + '" aria-pressed="' + (mode === v) + '">' + (v === 'fav' ? ic('star') : '') + esc(t(k)) + '</button>').join('') + '</div></div>' +
      '<div id="help-filters" class="help-filters"></div>' +
      '<div id="help-list" aria-live="polite"></div>';
  }
  root.innerHTML = '<div class="help-backdrop" data-a="help-close"></div><aside class="help-drawer" role="dialog" aria-label="' + esc(t('help_h')) + '"><div class="help-head"><div class="row" style="gap:10px">' + ic('info') + '<b>' + esc(t('help_h')) + '</b></div><button class="icon-btn" data-a="help-close" aria-label="' + esc(t('close')) + '">' + ic('x') + '</button></div><div class="help-body">' + inner + '</div></aside>';
  if (!tp) renderHelpList();
}
/* Search has priority over the tag filters: typing resets them, the tags then only light up for the results. */
document.addEventListener('input', (e) => {
  if (e.target.id !== 'help-q') return;
  HELP.q = e.target.value;
  if (HELP.q.trim()){ HELP.tag = ''; HELP.act = ''; }
  renderHelpList();
});
function helpRefocus(sel){ const el = sel && $(sel); if (el) el.focus(); }
const HELP_ACTIONS = {
  'help-tag': (el) => {
    const v = el.dataset.t || '';
    if (v === '') { HELP.tag = ''; HELP.act = ''; } else HELP.tag = HELP.tag === v ? '' : v;
    if (HELP.q){ HELP.q = ''; const i = $('#help-q'); if (i) i.value = ''; }
    renderHelpList(); helpRefocus('[data-a="help-tag"][data-t="' + v + '"]');
  },
  'help-act': (el) => {
    const v = el.dataset.t || '';
    HELP.act = HELP.act === v ? '' : v;
    if (HELP.q){ HELP.q = ''; const i = $('#help-q'); if (i) i.value = ''; }
    renderHelpList(); helpRefocus('[data-a="help-act"][data-t="' + v + '"]');
  },
  'help-sort': (el) => { HELP.sort = el.dataset.v; helpStore().sort[helpWho()] = HELP.sort; helpSave(); renderHelp(); helpRefocus('[data-a="help-sort"][data-v="' + HELP.sort + '"]'); },
  'help-fav': (el, e) => { if (e) e.stopPropagation(); const k = el.dataset.k; helpToggleFav(k); if (HELP.topic) renderHelp(); else renderHelpList(); helpRefocus('[data-a="help-fav"][data-k="' + k + '"]'); },
  'help-more-g': () => { HELP.allGuides = !HELP.allGuides; renderHelpList(); },
  'help-back': () => { HELP.topic = null; renderHelp(); }
};
document.addEventListener('DOMContentLoaded', () => { if (typeof ACTIONS !== 'undefined') Object.assign(ACTIONS, HELP_ACTIONS); });

/* ---------------- Onboarding (first run) ---------------- */
function maybeOnboard(){
  if (S.onboarded) return;
  const card = (gid, icon, title, desc) => '<button class="ob-card" data-a="ob-go" data-id="' + gid + '"><span class="ob-ic">' + ic(icon, 'lg') + '</span><span><b>' + esc(title) + '</b><br><span class="small muted">' + esc(desc) + '</span></span>' + ic('arrowRight') + '</button>';
  openModal({ title:t('ob_title'), size:'', dismissable:false, autofocus:false,
    body:'<p style="margin-top:0">' + esc(t('ob_p')) + '</p><div class="stack" style="gap:10px">' + card('create', 'plus', t('ob_1'), t('ob_1d')) + card('print', 'printer', t('ob_2'), t('ob_2d')) + card('calib', 'crosshair', t('ob_3'), t('ob_3d')) + '</div><div class="hint" style="margin-top:14px">' + esc(t('ob_note')) + '</div>',
    buttons:[{label:t('ob_skip'), cls:'btn', fn:() => { S.onboarded = true; savePrefs(); closeModal(); }}] });
}
