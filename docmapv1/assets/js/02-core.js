/* =====================================================================
   DocMap 2026 — core: i18n, state, persistence, data model helpers
   ===================================================================== */
'use strict';
const APP_VERSION = '26.6.0';
const LS_KEY = 'docmap_v26_state';
const LS_PREV = 'docmap_v26_state_prev';
const SC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const SC_RE = /^dm26[A-Za-z0-9]{8}$/;
const COLORS = ['#2563EB','#059669','#D97706','#7C3AED','#DC2626','#0891B2','#DB2777','#475569'];
const GREEK = ['α','β','γ','δ','ε','ζ','η','θ'];
const CATEGORIES = ['Ordinaria','Semplificata','Societario','Lavoro','Dichiarativi','Contenzioso','Privati'];
const CAT_COLOR = {Ordinaria:'#2563EB',Semplificata:'#059669',Societario:'#7C3AED',Lavoro:'#D97706',Dichiarativi:'#DC2626'};
const STATES = ['CURRENT','HISTORICAL','CHECKED_OUT'];
const CSV_COLUMNS = ['speaking_code','multi_code','company_name','company_city','category','binder_title','ref_year','room_code','cabinet_code','shelf_code','sector_code','location_code','archive_state','contents','tags','color_hex','short_code','short_url','final_destination','extra_codes','shelf_color','selected_for_print','id','created_at','updated_at'];
/* Shelf naming styles: the quick-pick buttons in the binder form follow the chosen style. */
const SHELF_TYPES = {
  number:['1','2','3','4','5','6','7','8'], letter:['A','B','C','D','E','F','G','H'], greek:GREEK,
  emoji:['🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜'], symbol:['★','●','▲','■','◆','♥','✚','✱'], text:[]
};
const SHELF_COLORS = ['#EF4444','#F59E0B','#EAB308','#22C55E','#3B82F6','#8B5CF6','#EC4899','#64748B'];
const DEMO_TAG = 'demo';
const isDemo = (b) => String(b.tags || '').split(',').map(x => x.trim().toLowerCase()).includes(DEMO_TAG);

/* ---------------- i18n ---------------- */
const I18N = {
  it:{
    brand_s:'Phygital Archive & Precision Label Studio',
    nav_archive:'Archivio', nav_print:'Stampa Etichette', nav_import:'Importa', nav_export:'Esporta e Salva', nav_ai:'Genera con AI', nav_settings:'Impostazioni',
    st_ok:'Salvato in memoria • Esportato', st_dirty:'Modifiche non ancora scaricate in CSV/JSON', quick_backup:'Salva Backup Rapido',
    other_tab:'Attenzione: i dati sono stati modificati in un\'altra scheda del browser. Ricarica per evitare di sovrascriverli.', reload:'Ricarica ora',
    storage_fail:'Impossibile salvare in memoria locale (spazio esaurito o modalità privata). Esporta subito un backup JSON!',
    // archive
    arch_h:'Archivio Faldoni', arch_p:'Ogni faldone ha un codice parlante (es. BL1), una posizione sullo scaffale (es. A1-α) e un QR qr7.it univoco (dm26…).',
    new_binder:'Nuovo Faldone', search_ph:'Cerca per codice, cliente, contenuto, tag, posizione, dm26…', all_states:'Tutti gli stati', all_rooms:'Tutte le stanze', all_cats:'Tutte le categorie',
    view_table:'Tabella', view_map:'Mappa Scaffali',
    k_total:'Faldoni', k_clients:'Clienti', k_out:'Prelevati', k_print:'In coda di stampa',
    th_code:'Codice', th_client:'Cliente / Faldone', th_loc:'Posizione', th_contents:'Contenuti', th_state:'Stato', th_qr:'Short code qr7.it',
    sel_all:'Seleziona tutti (filtrati)', sel_none:'Deseleziona tutti', go_print:'Vai alla stampa', del_sel:'Elimina selezionati',
    no_results:'Nessun faldone corrisponde ai filtri.', empty_arch:'Archivio vuoto. Crea un faldone o importa un CSV.',
    s_CURRENT:'Archivio Corrente', s_HISTORICAL:'Archivio Storico', s_CHECKED_OUT:'In uso / Prelevato',
    items_n:'{n} voci', no_contents:'Nessun contenuto', unplaced:'Senza posizione',
    act_edit:'Modifica', act_dup:'Duplica', act_qr:'Mostra QR', act_del:'Elimina', act_toggle_print:'Includi in stampa',
    copied:'Copiato negli appunti', copy_fail:'Copia automatica non riuscita: seleziona il testo e premi Ctrl+C.',
    // editor
    ed_new:'Nuovo faldone', ed_edit:'Modifica faldone', f_speaking:'Codice parlante', f_suggest:'Suggerisci', f_company:'Cliente / Ragione sociale', f_category:'Categoria',
    f_color:'Colore dorso', f_title:'Titolo faldone (Macro)', f_room:'Stanza / Zona', f_cabinet:'Armadio', f_shelf:'Ripiano', f_sector:'Settore (opz.)',
    f_location:'Coordinata calcolata', f_state:'Stato archivio', f_contents:'Contenuti (Modulo B)', f_add_item:'Aggiungi voce', f_pipe:'Modifica rapida (testo con |)',
    f_pipe_hint:'Formato: 2025: Fatture Acquisto|2025: Liquidazioni IVA', f_year:'Anno', f_desc:'Descrizione documento', f_tags:'Tag (separati da virgola)',
    f_short:'Short code qr7.it', f_regen:'Rigenera', f_shorturl:'Short URL', f_dest:'Destinazione finale (vuoto = da modello)', f_selprint:'Selezionato per la stampa',
    preview:'Anteprima etichette', save:'Salva', cancel:'Annulla', close:'Chiudi', confirm:'Conferma', delete:'Elimina',
    e_req_code:'Il codice parlante è obbligatorio.', e_dup_code:'Codice parlante già usato da un altro faldone.', e_req_company:'Il cliente è obbligatorio.',
    e_sc_format:'Formato non valido: deve essere dm26 + 8 caratteri alfanumerici.', e_sc_dup:'Short code già assegnato a un altro faldone.',
    saved:'Faldone salvato', deleted:'Eliminato', duplicated:'Faldone duplicato',
    // confirm
    c_title:'Conferma operazione', c_text:'Sei sicuro? Questa azione modificherà o cancellerà dati non ancora esportati...',
    c_dirty:'Hai modifiche non ancora scaricate in CSV/JSON. Ti consigliamo un backup rapido prima di procedere.',
    c_del_one:'Stai per eliminare il faldone {c}.', c_del_many:'Stai per eliminare {n} faldoni selezionati.',
    // print
    pr_h:'Studio di Stampa Millimetrica', pr_p:'Motore CSS @page 210×297 mm, margini zero. Nel dialogo di stampa imposta: Scala 100% / Dimensioni effettive, Margini: Nessuno, intestazioni e piè di pagina disattivati.',
    pr_sheet:'1 · Foglio e preset', pr_geo:'2 · Geometria (mm) e calibrazione', pr_content:'3 · Contenuto etichette', pr_qr:'4 · Modalità QR', pr_slots:'5 · Recupero fogli parziali', pr_queue:'Coda di stampa',
    pr_full:'A4 intero adesivo', pr_die:'Prefustellato', pr_custom:'Personalizzato',
    g_mt:'Margine alto', g_ml:'Margine sinistro', g_w:'Larghezza', g_h:'Altezza', g_cols:'Colonne', g_rows:'Righe', g_gx:'Spazio X', g_gy:'Spazio Y', g_pad:'Padding interno', g_rad:'Raggio angoli',
    g_ox:'Offset calibrazione X', g_oy:'Offset calibrazione Y', g_cut:'Linee di taglio tratteggiate', g_modified:'modificato', g_reset:'Ripristina preset', g_savepreset:'Salva come preset',
    g_preset_name:'Nome del preset personalizzato', g_del_preset:'Elimina preset', preset_saved:'Preset salvato',
    cm_pair:'Coppia Sdoppiata', cm_pair_d:'Modulo A + Modulo B consecutivi', cm_a:'Solo Modulo A', cm_a_d:'Cliente, codice, posizione, QR', cm_b:'Solo Modulo B', cm_b_d:'Contenuti + data aggiornamento', cm_u:'Etichetta Unificata', cm_u_d:'Master + contenuti insieme',
    qm_live:'QR vettoriale live', qm_live_d:'qr7.it/dm26… in SVG', qm_ph:'Spazio bianco riservato', qm_ph_d:'Riquadro con tacche (18%)', qm_none:'Nessun QR', qm_none_d:'Solo codice e testo',
    qr_url:'Mostra short URL sotto il QR', qr_ecc:'Correzione errore QR', copies:'Copie per faldone',
    sl_avail:'Disponibili', sl_used:'Già usata', sl_all_free:'Segna tutte disponibili', sl_start:'Inizia dalla casella', sl_apply:'Applica', sl_hint:'Clicca una casella per segnarla come già usata/staccata. Le caselle usate restano bianche e la stampa parte dalla prima disponibile.',
    sl_count:'{a} disponibili su {n}',
    pr_go:'Stampa Etichette', pr_calib:'Stampa Prova di Calibrazione (Quasi Bianca)', pr_calib_d:'Linee #D1D5DB a 0,25pt e micro-testo: quasi zero toner. Verifica il lato ALTO e lo scostamento della stampante, poi correggi gli offset.',
    pr_none:'Nessun faldone selezionato per la stampa. Vai in Archivio e spunta i faldoni.', pr_sum:'{l} etichette • {s} fogli • {u} caselle saltate',
    pv_labels:'Etichette', pv_calib:'Prova calibrazione', pv_sheet:'Foglio {n} di {t}', pv_more:'Anteprima limitata ai primi {n} fogli.',
    after_print_t:'Aggiornare la mappa del foglio parziale?', after_print_p:'Se la stampa è riuscita, posso segnare come "già usate" le {n} caselle consumate sull\'ultimo foglio, così la prossima stampa ripartirà dalla casella {s}.',
    after_print_full:'L\'ultimo foglio è stato usato completamente: la mappa verrà azzerata per un foglio nuovo.', yes_update:'Sì, aggiorna mappa', no_thanks:'No, lascia così',
    queue_sel:'{n} faldoni selezionati', manage_sel:'Gestisci selezione',
    // label texts
    l_contents:'Contenuti', l_created:'Creata', l_archive:'Archivio', l_updated:'Agg.', l_more:'+{n} altre voci', l_hist:'STORICO',
    // import
    im_h:'Importa CSV / JSON', im_p:'Carica un file oppure incolla il testo generato da un\'AI (ChatGPT, Claude, Gemini). Vedrai un\'anteprima prima di confermare.',
    im_drop:'Trascina qui un file .csv o .json, oppure clicca per sceglierlo', im_paste:'…oppure incolla qui il testo CSV/JSON', im_paste_ph:'speaking_code;company_name;category;…\nBL4;Barbieri Luigi S.r.l.;Ordinaria;…',
    im_analyze:'Analizza e mostra anteprima', im_clear:'Svuota', im_prev:'Anteprima importazione', im_rows:'{n} righe lette', im_new:'NUOVO', im_upd:'AGGIORNA', im_err:'ERRORE',
    im_merge:'Aggiungi e Aggiorna (Merge/Upsert)', im_merge_d:'Aggiorna i faldoni con lo stesso codice parlante e aggiunge i nuovi. Nessun dato esistente viene perso.',
    im_replace:'Sostituisci Tutto (Replace)', im_replace_d:'Elimina l\'archivio attuale e lo sostituisce con il contenuto importato.',
    im_restore_all:'Ripristina anche impostazioni, preset e mappa fogli (file workspace JSON)', im_done:'Importazione completata: {a} nuovi, {u} aggiornati.',
    im_c_upd:'L\'importazione sovrascriverà {u} faldoni esistenti con lo stesso codice parlante.', im_c_rep:'L\'importazione sostituirà tutti i {n} faldoni attuali con {m} faldoni importati.',
    im_none:'Nessuna riga valida trovata. Controlla intestazione e delimitatore (; oppure ,).', im_detect:'Formato rilevato: {f} • delimitatore "{d}"',
    im_w_sc:'short code dm26 generato', im_w_sc_dup:'short code duplicato → rigenerato', im_w_code:'codice parlante generato', im_w_color:'colore assegnato da categoria', im_w_skip:'riga senza cliente: saltata',
    // export
    ex_h:'Esporta e Salva', ex_p:'Quattro uscite distinte. Ogni esportazione CSV/JSON azzera l\'avviso "modifiche non scaricate".',
    ex1:'Manifest qr7.it (redirect)', ex1_d:'CSV con delimitatore punto e virgola e intestazione esatta short_code;short_url;final_destination;tags, pronto per il server qr7.it.',
    ex1_btn:'Scarica manifest_qr7_dm26.csv', ex1_merge:'Unisci al manifest.csv esistente', ex1_merge_d:'Carica il tuo manifest.csv attuale: tutte le righe esistenti (es. 1TSE0G, Oliva01) vengono conservate, le righe dm26 vengono aggiornate o aggiunte in fondo senza duplicati.',
    ex1_merge_btn:'Carica manifest.csv e unisci', ex1_prune:'Rimuovi le righe dm26 non più presenti in DocMap',
    ex1_merged:'manifest.csv aggiornato: {k} righe conservate, {u} dm26 aggiornate, {a} dm26 aggiunte{r}.', ex1_removed:', {n} dm26 rimosse',
    ex2:'Database completo CSV', ex2_d:'Tutti i campi (contenuti separati da |). Reimportabile in DocMap e apribile in Excel (UTF-8, punto e virgola).', ex2_btn:'Scarica docmap_full_backup.csv',
    ex3:'Sessione completa JSON', ex3_d:'Copia integrale senza perdite: faldoni, impostazioni studio, preset geometrici personalizzati e mappa fogli parziali.', ex3_btn:'Scarica docmap_workspace.json',
    ex4:'Registro Generale d\'Archivio (A4 / PDF)', ex4_d:'Tabella riassuntiva stampabile con codice, posizione, cliente, contenuti, QR, short code e URL qr7.it.', ex4_btn:'Apri Registro e Stampa',
    ex_last:'Ultima esportazione: {d}', ex_never:'Nessuna esportazione eseguita in questa sessione',
    ex_done:'File scaricato: {f}', ex_sel_only:'Solo faldoni selezionati per la stampa',
    reg_t:'Registro Generale d\'Archivio', reg_print:'Stampa Registro', reg_gen:'Generato il {d}', reg_tot:'{n} faldoni',
    reg_cols:['Codice','Posizione','Cliente & Faldone','Contenuti','QR','Short code','URL qr7.it'],
    // ai
    ai_h:'Genera con AI', ai_p:'Copia con un clic un prompt ingegnerizzato + lo schema CSV esatto. Incollalo in ChatGPT, Claude o Gemini, aggiungi le tue note o le foto degli scaffali in fondo, poi reimporta il CSV ottenuto.',
    ai_copy:'Copia Prompt Completo negli Appunti', ai_copy_tpl:'Copia Solo Modello CSV Vuoto', ai_go_import:'Ho la risposta: vai a Importa',
    ai_steps:['Clicca "Copia Prompt Completo negli Appunti".','Incollalo nella chat dell\'AI e scrivi/allega le tue informazioni nella sezione italiana in fondo.','Copia il blocco CSV della risposta.','Vai su Importa, incolla il testo e conferma con Merge.'],
    ai_ctx:'Includi i codici già esistenti (evita duplicati)',
    // settings
    se_h:'Impostazioni Studio', se_p:'Preferenze salvate automaticamente insieme ai dati.', se_studio:'Nome studio / ente', se_dest:'Modello URL destinazione finale',
    se_dest_hint:'Segnaposto disponibili: {speaking_code} {multi_code} {short_code} {company} {location} {id}. Usato per la colonna final_destination del manifest.',
    se_dest_prev:'Esempio', se_apply_dest:'Applica il modello a tutti i faldoni (sovrascrive le destinazioni personalizzate)', se_lang:'Lingua interfaccia',
    se_data:'Dati e sicurezza', se_storage:'Spazio occupato in localStorage: {k} KB', se_restore:'Ripristina da backup JSON', se_demo:'Ricarica dataset demo', se_wipe:'Svuota area di lavoro',
    se_wiped:'Area di lavoro svuotata', se_demo_done:'Dataset demo caricato', se_prev_restore:'Ripristina snapshot precedente', se_prev_done:'Snapshot precedente ripristinato',
    se_prev_none:'Nessuno snapshot precedente disponibile', se_about:'DocMap 2026 (DM26) • versione {v} • file unico offline, nessun server. I dati restano nel tuo browser.',
    regenerated:'Nuovo short code generato', qr_modal:'QR Code', open_url:'Apri link'
  },
  en:{
    brand_s:'Phygital Archive & Precision Label Studio',
    nav_archive:'Archive', nav_print:'Print Labels', nav_import:'Import', nav_export:'Export & Save', nav_ai:'Generate with AI', nav_settings:'Settings',
    st_ok:'Saved in memory • Exported', st_dirty:'Changes not yet downloaded as CSV/JSON', quick_backup:'Quick Backup',
    other_tab:'Warning: data was changed in another browser tab. Reload to avoid overwriting it.', reload:'Reload now',
    storage_fail:'Could not save to local storage (quota exceeded or private mode). Export a JSON backup now!',
    arch_h:'Binder Archive', arch_p:'Every binder has a speaking code (e.g. BL1), a shelf position (e.g. A1-α) and a unique qr7.it QR (dm26…).',
    new_binder:'New Binder', search_ph:'Search code, client, contents, tags, location, dm26…', all_states:'All states', all_rooms:'All rooms', all_cats:'All categories',
    view_table:'Table', view_map:'Shelf Map',
    k_total:'Binders', k_clients:'Clients', k_out:'Checked out', k_print:'Print queue',
    th_code:'Code', th_client:'Client / Binder', th_loc:'Location', th_contents:'Contents', th_state:'State', th_qr:'qr7.it short code',
    sel_all:'Select all (filtered)', sel_none:'Deselect all', go_print:'Go to print', del_sel:'Delete selected',
    no_results:'No binder matches the filters.', empty_arch:'Archive is empty. Create a binder or import a CSV.',
    s_CURRENT:'Current Archive', s_HISTORICAL:'Historical Archive', s_CHECKED_OUT:'In use / Checked out',
    items_n:'{n} items', no_contents:'No contents', unplaced:'Unplaced',
    act_edit:'Edit', act_dup:'Duplicate', act_qr:'Show QR', act_del:'Delete', act_toggle_print:'Include in print',
    copied:'Copied to clipboard', copy_fail:'Automatic copy failed: select the text and press Ctrl+C.',
    ed_new:'New binder', ed_edit:'Edit binder', f_speaking:'Speaking code', f_suggest:'Suggest', f_company:'Client / Company name', f_category:'Category',
    f_color:'Spine colour', f_title:'Binder title (Macro)', f_room:'Room / Zone', f_cabinet:'Cabinet', f_shelf:'Shelf', f_sector:'Sector (opt.)',
    f_location:'Computed coordinate', f_state:'Archive state', f_contents:'Contents (Module B)', f_add_item:'Add item', f_pipe:'Quick edit (pipe text)',
    f_pipe_hint:'Format: 2025: Purchase invoices|2025: VAT settlements', f_year:'Year', f_desc:'Document description', f_tags:'Tags (comma separated)',
    f_short:'qr7.it short code', f_regen:'Regenerate', f_shorturl:'Short URL', f_dest:'Final destination (empty = from template)', f_selprint:'Selected for printing',
    preview:'Label preview', save:'Save', cancel:'Cancel', close:'Close', confirm:'Confirm', delete:'Delete',
    e_req_code:'Speaking code is required.', e_dup_code:'Speaking code already used by another binder.', e_req_company:'Client is required.',
    e_sc_format:'Invalid format: must be dm26 + 8 alphanumeric characters.', e_sc_dup:'Short code already assigned to another binder.',
    saved:'Binder saved', deleted:'Deleted', duplicated:'Binder duplicated',
    c_title:'Confirm action', c_text:'Are you sure? This action will modify or delete data that has not been exported yet...',
    c_dirty:'You have changes not yet downloaded as CSV/JSON. A quick backup is recommended before continuing.',
    c_del_one:'You are about to delete binder {c}.', c_del_many:'You are about to delete {n} selected binders.',
    pr_h:'Millimetre Print Studio', pr_p:'CSS @page engine 210×297 mm, zero margins. In the print dialog set: Scale 100% / Actual size, Margins: None, headers and footers off.',
    pr_sheet:'1 · Sheet & preset', pr_geo:'2 · Geometry (mm) & calibration', pr_content:'3 · Label content', pr_qr:'4 · QR mode', pr_slots:'5 · Partial sheet recovery', pr_queue:'Print queue',
    pr_full:'Full A4 adhesive', pr_die:'Die-cut', pr_custom:'Custom',
    g_mt:'Top margin', g_ml:'Left margin', g_w:'Width', g_h:'Height', g_cols:'Columns', g_rows:'Rows', g_gx:'Gap X', g_gy:'Gap Y', g_pad:'Inner padding', g_rad:'Corner radius',
    g_ox:'Calibration offset X', g_oy:'Calibration offset Y', g_cut:'Dashed cut lines', g_modified:'modified', g_reset:'Reset preset', g_savepreset:'Save as preset',
    g_preset_name:'Custom preset name', g_del_preset:'Delete preset', preset_saved:'Preset saved',
    cm_pair:'Split Pair', cm_pair_d:'Module A + Module B consecutive', cm_a:'Module A only', cm_a_d:'Client, code, location, QR', cm_b:'Module B only', cm_b_d:'Contents + update date', cm_u:'Unified Label', cm_u_d:'Master + contents together',
    qm_live:'Live vector QR', qm_live_d:'qr7.it/dm26… as SVG', qm_ph:'Reserved blank space', qm_ph_d:'Box with corner ticks (18%)', qm_none:'No QR', qm_none_d:'Code and text only',
    qr_url:'Show short URL under QR', qr_ecc:'QR error correction', copies:'Copies per binder',
    sl_avail:'Available', sl_used:'Already used', sl_all_free:'Mark all available', sl_start:'Start from slot', sl_apply:'Apply', sl_hint:'Click a slot to mark it as already used/peeled. Used slots stay blank and printing starts from the first available one.',
    sl_count:'{a} available of {n}',
    pr_go:'Print Labels', pr_calib:'Print Calibration Test (Near-White)', pr_calib_d:'#D1D5DB 0.25pt hairlines and micro-text: almost zero toner. Check the TOP side and printer shift, then adjust offsets.',
    pr_none:'No binder selected for printing. Go to Archive and tick the binders.', pr_sum:'{l} labels • {s} sheets • {u} slots skipped',
    pv_labels:'Labels', pv_calib:'Calibration test', pv_sheet:'Sheet {n} of {t}', pv_more:'Preview limited to the first {n} sheets.',
    after_print_t:'Update the partial sheet map?', after_print_p:'If printing succeeded, I can mark the {n} slots consumed on the last sheet as "used", so the next print starts from slot {s}.',
    after_print_full:'The last sheet was fully used: the map will be reset for a new sheet.', yes_update:'Yes, update map', no_thanks:'No, leave it',
    queue_sel:'{n} binders selected', manage_sel:'Manage selection',
    l_contents:'Contents', l_created:'Created', l_archive:'Archive', l_updated:'Upd.', l_more:'+{n} more items', l_hist:'HISTORICAL',
    im_h:'Import CSV / JSON', im_p:'Upload a file or paste text produced by an AI (ChatGPT, Claude, Gemini). You will see a preview before confirming.',
    im_drop:'Drop a .csv or .json file here, or click to choose', im_paste:'…or paste CSV/JSON text here', im_paste_ph:'speaking_code;company_name;category;…\nBL4;Barbieri Luigi S.r.l.;Ordinaria;…',
    im_analyze:'Analyse and preview', im_clear:'Clear', im_prev:'Import preview', im_rows:'{n} rows read', im_new:'NEW', im_upd:'UPDATE', im_err:'ERROR',
    im_merge:'Add & Update (Merge/Upsert)', im_merge_d:'Updates binders with the same speaking code and adds new ones. No existing data is lost.',
    im_replace:'Replace All', im_replace_d:'Deletes the current archive and replaces it with the imported content.',
    im_restore_all:'Also restore settings, presets and sheet map (workspace JSON file)', im_done:'Import complete: {a} new, {u} updated.',
    im_c_upd:'The import will overwrite {u} existing binders with the same speaking code.', im_c_rep:'The import will replace all {n} current binders with {m} imported binders.',
    im_none:'No valid row found. Check header and delimiter (; or ,).', im_detect:'Detected format: {f} • delimiter "{d}"',
    im_w_sc:'dm26 short code generated', im_w_sc_dup:'duplicate short code → regenerated', im_w_code:'speaking code generated', im_w_color:'colour assigned from category', im_w_skip:'row without client: skipped',
    ex_h:'Export & Save', ex_p:'Four distinct outputs. Every CSV/JSON export clears the "changes not downloaded" warning.',
    ex1:'qr7.it Manifest (redirect)', ex1_d:'Semicolon-delimited CSV with the exact header short_code;short_url;final_destination;tags, ready for the qr7.it server.',
    ex1_btn:'Download manifest_qr7_dm26.csv', ex1_merge:'Merge into existing manifest.csv', ex1_merge_d:'Upload your current manifest.csv: all existing rows (e.g. 1TSE0G, Oliva01) are preserved, dm26 rows are updated or appended at the bottom with no duplicates.',
    ex1_merge_btn:'Upload manifest.csv and merge', ex1_prune:'Remove dm26 rows no longer present in DocMap',
    ex1_merged:'manifest.csv updated: {k} rows preserved, {u} dm26 updated, {a} dm26 appended{r}.', ex1_removed:', {n} dm26 removed',
    ex2:'Complete database CSV', ex2_d:'All fields (contents pipe-separated). Re-importable into DocMap and opens in Excel (UTF-8, semicolon).', ex2_btn:'Download docmap_full_backup.csv',
    ex3:'Complete session JSON', ex3_d:'Lossless dump: binders, studio settings, custom geometry presets and partial sheet map.', ex3_btn:'Download docmap_workspace.json',
    ex4:'Master Archive Register (A4 / PDF)', ex4_d:'Printable summary table with code, location, client, contents, QR, short code and qr7.it URL.', ex4_btn:'Open Register & Print',
    ex_last:'Last export: {d}', ex_never:'No export done in this session yet',
    ex_done:'File downloaded: {f}', ex_sel_only:'Only binders selected for printing',
    reg_t:'Master Archive Register', reg_print:'Print Register', reg_gen:'Generated on {d}', reg_tot:'{n} binders',
    reg_cols:['Code','Location','Client & Binder','Contents','QR','Short code','qr7.it URL'],
    ai_h:'Generate with AI', ai_p:'Copy an engineered prompt + the exact CSV schema in one click. Paste it into ChatGPT, Claude or Gemini, add your notes or shelf photos at the bottom, then re-import the CSV you get.',
    ai_copy:'Copy Full Prompt to Clipboard', ai_copy_tpl:'Copy Empty CSV Template Only', ai_go_import:'I have the answer: go to Import',
    ai_steps:['Click "Copy Full Prompt to Clipboard".','Paste it into the AI chat and write/attach your information in the Italian section at the bottom.','Copy the CSV block from the reply.','Go to Import, paste the text and confirm with Merge.'],
    ai_ctx:'Include existing codes (avoid duplicates)',
    se_h:'Studio Settings', se_p:'Preferences are saved automatically together with the data.', se_studio:'Studio / organisation name', se_dest:'Final destination URL template',
    se_dest_hint:'Available placeholders: {speaking_code} {multi_code} {short_code} {company} {location} {id}. Used for the manifest final_destination column.',
    se_dest_prev:'Example', se_apply_dest:'Apply the template to all binders (overwrites custom destinations)', se_lang:'Interface language',
    se_data:'Data & safety', se_storage:'localStorage usage: {k} KB', se_restore:'Restore from JSON backup', se_demo:'Reload demo dataset', se_wipe:'Clear workspace',
    se_wiped:'Workspace cleared', se_demo_done:'Demo dataset loaded', se_prev_restore:'Restore previous snapshot', se_prev_done:'Previous snapshot restored',
    se_prev_none:'No previous snapshot available', se_about:'DocMap 2026 (DM26) • version {v} • single offline file, no server. Your data stays in your browser.',
    regenerated:'New short code generated', qr_modal:'QR Code', open_url:'Open link'
  }
};
function t(key, vars){
  const lang = (typeof S !== 'undefined' && S && S.lang) || 'it';
  let s = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key] : (I18N.it[key] !== undefined ? I18N.it[key] : key);
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
  return s;
}

/* ---------------- utils ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const r1 = (n) => Math.round(n * 100) / 100;
const fmtMM = (n) => (Math.round(n * 100) / 100).toFixed(Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? 1 : 2);
function uuid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.random() * 256 | 0);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
function randChars(n){
  const out = []; const buf = new Uint32Array(n * 2);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf); else for (let i = 0; i < buf.length; i++) buf[i] = Math.random() * 4294967296;
  for (let i = 0; out.length < n; i++){
    const v = buf[i % buf.length] >>> 0;
    const lim = 4294967296 - (4294967296 % SC_ALPHABET.length);
    if (v < lim || i >= buf.length) out.push(SC_ALPHABET[v % SC_ALPHABET.length]);
  }
  return out.join('');
}
function nowISO(){ return new Date().toISOString(); }
function fmtDate(iso, withTime){
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const loc = S.lang === 'en' ? 'en-GB' : 'it-IT';
  return withTime ? d.toLocaleString(loc, {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString(loc, {day:'2-digit',month:'2-digit',year:'numeric'});
}
function slugify(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/s\.?\s?r\.?\s?l\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function naturalCmp(a, b){ return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:'base'}); }
function normHex(c){
  if (!c) return '';
  let s = String(c).trim(); if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s.slice(1).split('').map(x => x + x).join('');
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : '';
}

/* ---------------- Binder helpers ---------------- */
/* Location code: short room letters glue to the cabinet (A + 1 → A1-3); room names stay readable ("Ufficio 1 · 2-4"). */
function locHead(room, cab){
  room = String(room || '').trim(); cab = String(cab || '').trim();
  if (!room || !cab) return room + cab;
  return /^[A-Za-z]{1,2}$/.test(room) && /^[0-9A-Za-z]{1,3}$/.test(cab) ? room + cab : room + ' · ' + cab;
}
function computeLocation(b){
  return [locHead(b.room_code, b.cabinet_code), String(b.shelf_code || '').trim(), String(b.sector_code || '').trim()].filter(Boolean).join('-');
}
function parseLocation(code){
  const s = String(code || '').trim(); if (!s) return null;
  let m = s.match(/^(.+?)\s*·\s*([^-]+)-([^-]+)(?:-(.+))?$/);
  if (m) return { room_code:m[1].trim(), cabinet_code:m[2].trim(), shelf_code:m[3].trim(), sector_code:(m[4] || '').trim() };
  m = s.match(/^([A-Za-z]*)(\d*)-([^-]+)(?:-(.+))?$/);
  if (!m) return null;
  return { room_code:m[1] || '', cabinet_code:m[2] || '', shelf_code:m[3] || '', sector_code:m[4] || '' };
}
function contentsToPipe(items){ return (items || []).map(i => (i.year ? i.year + ': ' : '') + (i.description || '')).filter(x => x.trim()).join('|'); }
function pipeToContents(str){
  if (Array.isArray(str)) return str.map(x => typeof x === 'string' ? pipeToContents(x)[0] : {year:String(x.year || '').trim(), description:String(x.description || x.desc || '').trim()}).filter(x => x && (x.year || x.description));
  return String(str || '').split(/\||\n/).map(p => p.trim()).filter(Boolean).map(p => {
    const m = p.match(/^(\d{4}(?:\s*[-\/]\s*\d{2,4})?)\s*[:\-–—]\s*(.+)$/);
    return m ? {year:m[1].replace(/\s+/g, ''), description:m[2].trim()} : {year:'', description:p};
  });
}
const STOP = new Set(['il','lo','la','i','gli','le','aps','ets','odv','onlus','asd','ssd','coop','srl','s','r','l','spa','p','a','snc','n','c','sas','di','de','del','della','dei','e','ed','&','the','and','of','studio','dott','dr','sig','geom','ing','avv','rag']);
function initialsOf(name){
  const clean = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/s\.\s?r\.\s?l\.?|s\.\s?p\.\s?a\.?|s\.\s?n\.\s?c\.?|s\.\s?a\.\s?s\.?/gi, ' ');
  const words = clean.split(/[^A-Za-z0-9]+/).filter(w => w && !STOP.has(w.toLowerCase()));
  let ini = words.slice(0, 3).map(w => w[0].toUpperCase()).join('');
  if (!ini) ini = 'DM';
  if (ini.length === 1 && words[0]) ini = words[0].slice(0, 2).toUpperCase();
  return ini;
}
function suggestSpeakingCode(company, extraTaken){
  const ini = initialsOf(company);
  const taken = new Set(S.binders.map(b => b.speaking_code.toUpperCase()).concat((extraTaken || []).map(x => String(x).toUpperCase())));
  let max = 0;
  taken.forEach(c => { const m = c.match(new RegExp('^' + ini + '(\\d+)$')); if (m) max = Math.max(max, +m[1]); });
  let n = max + 1; while (taken.has(ini + n)) n++;
  return ini + n;
}
function allShortCodes(excludeId){ const s = new Set(); S.binders.forEach(b => { if (b.id !== excludeId && b.short_code) s.add(b.short_code); }); return s; }
function newShortCode(extra){
  const taken = allShortCodes(); (extra || []).forEach(x => taken.add(x));
  let c; do { c = 'dm26' + randChars(8); } while (taken.has(c));
  return c;
}
/* Integrity guard: every binder gets a unique id, a unique non-empty speaking code and a unique valid short code.
   The SQLite mirror enforces the same constraints, so a duplicate here would block every sync. Returns the number of fixes. */
function ensureIntegrity(){
  const ids = new Set(), codes = new Set(), scs = new Set(); let fixed = 0;
  S.binders.forEach(b => {
    if (!b.id || ids.has(b.id)){ b.id = uuid(); fixed++; }
    ids.add(b.id);
    if (!b.speaking_code || codes.has(b.speaking_code)){ b.speaking_code = suggestSpeakingCode(b.company_name || b.speaking_code, Array.from(codes)); b.location_code = computeLocation(b); fixed++; }
    codes.add(b.speaking_code);
    if (!SC_RE.test(b.short_code) || scs.has(b.short_code)){ b.short_code = newShortCode(Array.from(scs)); fixed++; }
    scs.add(b.short_code); b.short_url = shortUrl(b.short_code);
  });
  return fixed;
}
/* Client register (anagrafica): imported from the studio's client list, used to fill new binders. */
function normalizeClient(c){
  const o = Object.assign({ id:uuid(), multi_code:'', name:'', address:'', cap:'', city:'', province:'', type:'', category:'', notes:'' }, c || {});
  Object.keys(o).forEach(k => { o[k] = String(o[k] == null ? '' : o[k]).replace(/\s+/g, ' ').trim(); });
  return o;
}
const clientPlace = (c) => c.city ? c.city + (c.province ? ' (' + c.province + ')' : '') : '';
function shortUrl(code){ return 'https://qr7.it/' + code; }
function destFor(b){
  if (b.final_destination && String(b.final_destination).trim()) return String(b.final_destination).trim();
  return renderDest(S.settings.destTemplate, b);
}
function renderDest(tpl, b){
  const enc = encodeURIComponent;
  return String(tpl || '').replace(/\{speaking_code\}/g, enc(b.speaking_code || '')).replace(/\{short_code\}/g, enc(b.short_code || ''))
    .replace(/\{multi_code\}/g, enc(b.multi_code || '')).replace(/\{company\}/g, enc(slugify(b.company_name))).replace(/\{location\}/g, enc(computeLocation(b))).replace(/\{id\}/g, enc(b.id || ''));
}
function manifestTags(b){ return ['docmap26', b.speaking_code, b.multi_code ? 'multi-' + slugify(b.multi_code) : '', slugify(b.company_name)].filter(Boolean).join(','); }
function normalizeBinder(b){
  const o = Object.assign({
    id:uuid(), speaking_code:'', multi_code:'', company_name:'', company_city:'', ref_year:'', extra_codes:'', shelf_color:'', category:'', color_hex:'#2563EB', binder_title:'', room_code:'', cabinet_code:'', shelf_code:'', sector_code:'',
    location_code:'', archive_state:'CURRENT', contents_items:[], tags:'', short_code:'', short_url:'', final_destination:'', selected_for_print:false,
    created_at:nowISO(), updated_at:nowISO()
  }, b || {});
  ['speaking_code','multi_code','company_name','company_city','ref_year','extra_codes','shelf_color','category','binder_title','room_code','cabinet_code','shelf_code','sector_code','tags','short_code','final_destination'].forEach(k => o[k] = String(o[k] == null ? '' : o[k]).trim());
  o.speaking_code = o.speaking_code.toUpperCase().replace(/\s+/g, '');
  if (/^[a-z]{1,2}$/i.test(o.room_code)) o.room_code = o.room_code.toUpperCase();   // short room letters (a → A); names like "Ufficio 1" stay as typed
  o.shelf_color = normHex(o.shelf_color);
  o.multi_code = o.multi_code.replace(/\s+/g, ' ');
  o.contents_items = pipeToContents(o.contents_items);
  o.color_hex = normHex(o.color_hex) || CAT_COLOR[o.category] || '#2563EB';
  if (!STATES.includes(o.archive_state)) o.archive_state = 'CURRENT';
  o.location_code = computeLocation(o);
  o.short_url = o.short_code ? shortUrl(o.short_code) : '';
  o.selected_for_print = !!o.selected_for_print;
  return o;
}

/* ---------------- Presets ---------------- */
/* Sheet presets, die-cut formats in order of popularity (Avery and compatible
   Herma/Tico/APLI codes share the same geometry). Values from manufacturer templates. */
const BUILTIN_PRESETS = [
  {id:'mrink143', kind:'die', recommended:1, name:'4 etichette 105×148 (A6) — 8 moduli da dividere · MRINK143', w:105, h:148, cols:2, rows:2, marginTop:0.5, marginLeft:0, gapX:0, gapY:0, radius:0, cut:false},
  {id:'l7160', kind:'die', popular:1, name:'21 etichette 63,5×38,1 (Avery L7160 / J8160)', w:63.5, h:38.1, cols:3, rows:7, marginTop:15.15, marginLeft:7.2, gapX:2.55, gapY:0, radius:2, cut:false},
  {id:'l7163', kind:'die', popular:2, name:'14 etichette 99,1×38,1 (Avery L7163 / J8163)', w:99.1, h:38.1, cols:2, rows:7, marginTop:15.15, marginLeft:4.65, gapX:2.5, gapY:0, radius:2, cut:false},
  {id:'l7165', kind:'die', popular:3, name:'8 etichette 99,1×67,7 (Avery L7165 / J8165)', w:99.1, h:67.7, cols:2, rows:4, marginTop:13.1, marginLeft:4.65, gapX:2.5, gapY:0, radius:2, cut:false},
  {id:'l7173', kind:'die', popular:4, name:'10 etichette 99,1×57 (Avery L7173 / J8173)', w:99.1, h:57, cols:2, rows:5, marginTop:6, marginLeft:4.65, gapX:2.5, gapY:0, radius:2, cut:false},
  {id:'l7161', kind:'die', name:'18 etichette 63,5×46,6 (Avery L7161 / J8161)', w:63.5, h:46.6, cols:3, rows:6, marginTop:8.7, marginLeft:7.2, gapX:2.55, gapY:0, radius:2, cut:false},
  {id:'l7159', kind:'die', name:'24 etichette 63,5×33,9 (Avery L7159 / J8159)', w:63.5, h:33.9, cols:3, rows:8, marginTop:12.9, marginLeft:7.2, gapX:2.55, gapY:0, radius:2, cut:false},
  {id:'l7162', kind:'die', name:'16 etichette 99,1×33,9 (Avery L7162 / J8162)', w:99.1, h:33.9, cols:2, rows:8, marginTop:12.9, marginLeft:4.65, gapX:2.5, gapY:0, radius:2, cut:false},
  {id:'l7169', kind:'die', name:'4 etichette 99,1×139 (Avery L7169 / J8169)', w:99.1, h:139, cols:2, rows:2, marginTop:9.5, marginLeft:4.65, gapX:2.5, gapY:0, radius:2, cut:false},
  {id:'l4760', kind:'die', name:'Dorso faldone 192×38 ×7 (Avery L4760)', w:192, h:38, cols:1, rows:7, marginTop:15.5, marginLeft:9, gapX:0, gapY:0, radius:2, cut:false},
  {id:'l4761', kind:'die', name:'Dorso faldone largo 192×61 ×4 (Avery L4761)', w:192, h:61, cols:1, rows:4, marginTop:26.5, marginLeft:9, gapX:0, gapY:0, radius:2, cut:false},
  {id:'l7167', kind:'die', name:'1 etichetta A4 199,6×289,1 (Avery L7167)', w:199.6, h:289.1, cols:1, rows:1, marginTop:3.95, marginLeft:5.2, gapX:0, gapY:0, radius:2, cut:false},
  {id:'a4-8',  kind:'full', name:'A4 adesivo intero — 8 etichette 97×67 (2×4)', w:97, h:67, cols:2, rows:4, marginTop:14.5, marginLeft:8, gapX:0, gapY:0, radius:0, cut:true},
  {id:'a4-14', kind:'full', name:'A4 adesivo intero — 14 etichette 97×38 (2×7)', w:97, h:38, cols:2, rows:7, marginTop:15.5, marginLeft:8, gapX:0, gapY:0, radius:0, cut:true},
  {id:'a4-10', kind:'full', name:'A4 adesivo intero — 10 etichette 97×54 (2×5)', w:97, h:54, cols:2, rows:5, marginTop:13.5, marginLeft:8, gapX:0, gapY:0, radius:0, cut:true},
  {id:'a4-21', kind:'full', name:'A4 adesivo intero — 21 etichette 64×38 (3×7)', w:64, h:38, cols:3, rows:7, marginTop:15.5, marginLeft:9, gapX:0, gapY:0, radius:0, cut:true},
  {id:'a4-5s', kind:'full', name:'A4 adesivo intero — 5 strisce dorso 190×54 (1×5)', w:190, h:54, cols:1, rows:5, marginTop:13.5, marginLeft:10, gapX:0, gapY:0, radius:0, cut:true},
  {id:'a4-4s', kind:'full', name:'A4 adesivo intero — 4 strisce dorso larghe 190×66 (1×4)', w:190, h:66, cols:1, rows:4, marginTop:16.5, marginLeft:10, gapX:0, gapY:0, radius:0, cut:true}
];
const DEFAULT_DEST = 'https://studiodallasta.it/docmap/?code={speaking_code}&qr={short_code}';
const OLD_DEFAULT_DESTS = ['https://archivio.studiodemo.it/view?code={speaking_code}&qr={short_code}'];
const GEO_KEYS = ['w','h','cols','rows','marginTop','marginLeft','gapX','gapY','radius'];
function allPresets(){ return BUILTIN_PRESETS.concat(S.customPresets || []); }
function findPreset(id){ return allPresets().find(p => p.id === id) || BUILTIN_PRESETS[0]; }
function geoFromPreset(p){ const g = {}; GEO_KEYS.forEach(k => g[k] = p[k]); g.cut = !!p.cut; return g; }

/* ---------------- Demo dataset ---------------- */
function demoBinders(){
  const mk = (o) => normalizeBinder(Object.assign({short_code:newShortCode(window.__demoTaken || (window.__demoTaken = []))}, o));
  window.__demoTaken = [];
  const list = [];
  const push = (o) => { const b = mk(o); window.__demoTaken.push(b.short_code); list.push(b); };
  push({speaking_code:'BL1', multi_code:'M-10234', company_name:'Barbieri Luigi S.r.l.', category:'Ordinaria', color_hex:'#2563EB', binder_title:'Fatture e Contabilità IVA', room_code:'A', cabinet_code:'1', shelf_code:'α', archive_state:'CURRENT',
    contents_items:'2025: Fatture Acquisto Q1-Q4|2025: Fatture Vendita Q1-Q4|2025: Liquidazioni IVA mensili|2025: Registri IVA e Corrispettivi', tags:'demo,iva,fatture,contabilità,2025', company_city:'Parma (PR)', ref_year:'2025', selected_for_print:true});
  push({speaking_code:'BL2', multi_code:'M-10234', company_name:'Barbieri Luigi S.r.l.', category:'Ordinaria', color_hex:'#2563EB', binder_title:'Bilancio e Dichiarativi', room_code:'A', cabinet_code:'1', shelf_code:'β', archive_state:'CURRENT',
    contents_items:'2024: Bilancio d\'esercizio e Nota integrativa|2025: Modello Redditi SC|2025: Dichiarazione IRAP|2025: F24 Versamenti|2025: Verbale approvazione bilancio', tags:'demo,bilancio,redditi,irap,2025', company_city:'Parma (PR)', ref_year:'2025', selected_for_print:true});
  push({speaking_code:'BL3', multi_code:'M-10234', company_name:'Barbieri Luigi S.r.l.', category:'Lavoro', color_hex:'#D97706', binder_title:'Paghe e Personale', room_code:'A', cabinet_code:'2', shelf_code:'α', sector_code:'SX', archive_state:'CURRENT',
    contents_items:'2025: Cedolini paga Gen-Dic|2025: Certificazione Unica dipendenti|2025: Modello 770|2025: Contratti e comunicazioni UNILAV', tags:'demo,paghe,lavoro,cu,770,2025', company_city:'Parma (PR)', ref_year:'2025', extra_codes:'INPS 1234567', selected_for_print:true});
  push({speaking_code:'RC1', multi_code:'M-20871', company_name:'Rossi Costruzioni S.p.A.', category:'Societario', color_hex:'#7C3AED', binder_title:'Atti Societari e Verbali', room_code:'B', cabinet_code:'1', shelf_code:'γ', archive_state:'HISTORICAL',
    contents_items:'2019: Atto costitutivo e Statuto|2022: Verbali assemblea soci|2023: Visure camerali|2023: Libro soci e Libro giornale', tags:'demo,societario,verbali,statuto,visure', company_city:'Fidenza (PR)', selected_for_print:true});
  push({speaking_code:'FSG1', company_name:'Farmacia San Giorgio', category:'Semplificata', color_hex:'#059669', binder_title:'Contabilità Semplificata', room_code:'B', cabinet_code:'2', shelf_code:'β', sector_code:'DX', archive_state:'CHECKED_OUT',
    contents_items:'2025: Registri IVA acquisti e vendite|2025: Corrispettivi telematici RT|2025: Spese sanitarie Sistema TS|2025: Modello Redditi PF', tags:'demo,farmacia,semplificata,corrispettivi,2025', company_city:'Noceto (PR)', ref_year:'2025', selected_for_print:true});
  delete window.__demoTaken;
  return list;
}

/* ---------------- State ---------------- */
function defaultState(){
  return {
    schema:26.6, app:'DocMap26', lang:'it', view:'archive',
    settings:{ studioName:'Studio Demo Commercialisti Associati', destTemplate:DEFAULT_DEST, qrEcc:'M' },
    binders:[],
    print:{ presetId:'mrink143', geometry:geoFromPreset(BUILTIN_PRESETS[0]), geometryModified:false, padding:4, offsetX:0, offsetY:0,
            contentMode:'split', template:'classic', showMulti:true, fields:{}, split:{ratio:0.5, rotate:-90, guides:true}, advanced:false, qrMode:'live', showQrUrl:true, copies:1, previewMode:'labels' },
    customPresets:[], usedSlots:{}, clients:[],
    hasUnexportedChanges:true, onboarded:false, lastExportAt:null, lastExportFile:null, lastSavedAt:null, archiveView:'table'
  };
}
let S = null;
window.S = null;
let storageOk = true;
let otherTabChanged = false;

function migrate(st){
  const d = defaultState();
  const o = Object.assign(d, st || {});
  o.settings = Object.assign(defaultState().settings, (st && st.settings) || {});
  if (OLD_DEFAULT_DESTS.includes(o.settings.destTemplate)) o.settings.destTemplate = DEFAULT_DEST;
  o.print = Object.assign(defaultState().print, (st && st.print) || {});
  o.print.geometry = Object.assign(geoFromPreset(BUILTIN_PRESETS[0]), o.print.geometry || {});
  if (!(BUILTIN_PRESETS.concat(o.customPresets || [])).some(p => p.id === o.print.presetId)){ o.print.presetId = BUILTIN_PRESETS[0].id; o.print.geometry = geoFromPreset(BUILTIN_PRESETS[0]); o.print.geometryModified = false; }
  o.customPresets = Array.isArray(o.customPresets) ? o.customPresets : [];
  o.usedSlots = (o.usedSlots && typeof o.usedSlots === 'object') ? o.usedSlots : {};
  o.clients = Array.isArray(o.clients) ? o.clients.map(normalizeClient) : [];
  o.print.fields = Object.assign({}, o.print.fields || {}); o.print.split = Object.assign({ratio:0.5, rotate:-90, guides:true}, o.print.split || {});
  // v6: the MRINK143 split label becomes the default sheet once
  if (!(st && st.schema >= 26.6)){ o.print.presetId = 'mrink143'; o.print.geometry = geoFromPreset(BUILTIN_PRESETS[0]); o.print.geometryModified = false; o.print.contentMode = 'split'; o.print.padding = 4; }
  o.schema = 26.6;
  o.binders = Array.isArray(o.binders) ? o.binders.map(normalizeBinder) : [];
  if (!['it','en'].includes(o.lang)) o.lang = 'it';
  return o;
}
function loadState(){
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch(e){ storageOk = false; }
  if (raw){
    try { return migrate(JSON.parse(raw)); }
    catch(e){
      try { const prev = localStorage.getItem(LS_PREV); if (prev) return migrate(JSON.parse(prev)); } catch(e2){}
    }
  }
  const st = defaultState(); S = st; window.S = st;
  st.binders = demoBinders();
  return st;
}
let saveTimer = null;
function persist(){
  S.lastSavedAt = nowISO();
  try {
    const cur = localStorage.getItem(LS_KEY);
    if (cur) localStorage.setItem(LS_PREV, cur);
    localStorage.setItem(LS_KEY, JSON.stringify(S));
    storageOk = true;
  } catch(e){
    storageOk = false;
    try { localStorage.removeItem(LS_PREV); localStorage.setItem(LS_KEY, JSON.stringify(S)); storageOk = true; } catch(e2){}
    if (!storageOk) toast(t('storage_fail'), 'err', 8000);
  }
  if (typeof dbScheduleSync === 'function') dbScheduleSync();
}
/** Commit a data change: marks dirty, saves immediately. */
function commit(opts){
  opts = opts || {};
  if (opts.dirty !== false) S.hasUnexportedChanges = true;
  persist();
  renderTopbar();
}
/** Save UI/preferences without marking data dirty. */
function savePrefs(){ persist(); }
function markExported(file){
  S.hasUnexportedChanges = false; S.lastExportAt = nowISO(); S.lastExportFile = file;
  persist(); renderTopbar();
}
window.addEventListener('beforeunload', (e) => {
  if (S && S.hasUnexportedChanges){ e.preventDefault(); e.returnValue = ''; return ''; }
});
window.addEventListener('storage', (e) => {
  if (e.key === LS_KEY && e.newValue && S){
    try { const other = JSON.parse(e.newValue); if (other.lastSavedAt !== S.lastSavedAt){ otherTabChanged = true; renderBanner(); } } catch(err){}
  }
});
