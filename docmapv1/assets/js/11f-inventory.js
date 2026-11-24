/* =====================================================================
   DocMap 2026 — v12.8 "Inventario rapido" on the phone (scan.html). Model: 02f-inventory.js. CSS: css-inventory.css.

   scan.html?inv=<project id>   Scatola → Faldoni screen of a project (scan.html?inv=1: pick the project)
   Flow (target < 5 s per binder, the operator never waits for the network or the AI):
     1. continuous camera (DMCamScanner); the QR of a BOX label makes it the active box (first scan creates the
        location record), the QR of a BINDER label grabs a photo of the frame, beeps and creates the binder record
        at once (in the active box; in mode 'capture' the box is optional);
     2. quick tags, the year bar and push-to-talk voice change the LAST binder (or, with "Mantieni", every next one);
     3. everything goes through an outbox (localStorage docmap_v26_inv_outbox + photos in IndexedDB docmap_v26_inv):
        lane 'rec' = photo upload + record push, lane 'ai' = AI reading of the spine (server route ai_spine) whose
        result fills only the fields the operator left empty and sets inv.st = proposed (confidence ≥ the project's
        auto_confirm) or review; offline → it waits and leaves by itself when the network is back;
     4. "Annulla" within 10 s removes the binder (tombstone if it was already sent).
   Records have deterministic ids 'inv-' + short code, so two phones (or a re-scan) never create two binders for
   one label; the project route returns the labels already scanned (scanned[]) and they are not created again.
   Local mode (same browser as the PC, file://): the records are written in the stored state and travel in the
   activity-log line (details.records) that the open desktop merges live (06q-inventory.js logMerge wrapper);
   the photos stay in IndexedDB docmap_v26_inv on this browser; no AI (it needs the server).
   ===================================================================== */
'use strict';

const IV_OUTBOX_LS = 'docmap_v26_inv_outbox', IV_RECENT_LS = 'docmap_v26_inv_recent', IV_PREFS_LS = 'docmap_v26_inv_prefs';
const IV_UNDO_MS = 10000, IV_RECENT_MAX = 300, IV_AMEND_MS = 1200;
// v12.14: photos already on the server kept on the phone (the newest ones), retry back-off, AI tries
const IV_SENT_LS = 'docmap_v26_inv_sent', IV_SENT_KEEP = 30, IV_BACKOFF_MAX = 300000, IV_AI_TRIES = 3;

if (typeof SC !== 'undefined' && typeof scRoute === 'function'){
  (function(){
    Object.assign(I18N.it, {
      iv_full:'Memoria del telefono piena: le nuove acquisizioni sono ferme. Tocca lo stato della coda e salva la copia di sicurezza, poi libera spazio.',
      iv_low:'Memoria del telefono quasi piena: invia la coda (serve la rete) o salva la copia di sicurezza.', iv_q_auth:'Accesso scaduto: entra di nuovo, la coda resta salvata e riparte da sola.',
      iv_h_rec:'Faldoni e scatole da inviare', iv_h_ai:'Letture AI in attesa', iv_h_oldest:'Il più vecchio in coda', iv_h_store:'Memoria usata', iv_h_store_v:'{u} MB su {q} MB', iv_h_keep:'Memoria protetta dal browser',
      iv_h_yes:'sì', iv_h_no:'no (il browser potrebbe liberarla se serve spazio)', iv_h_now:'adesso', iv_h_min:'{n} min fa', iv_h_hours:'{n} ore fa', iv_h_retry:'Riprova adesso', iv_h_rescue:'Salva copia di sicurezza',
      iv_h_rescue_p:'Il file contiene i faldoni non ancora inviati con le foto. Sul PC: Progetti › il progetto › Lavoro › Importa dal telefono. Si può importare anche due volte: niente doppioni.',
      iv_h_saved:'Copia salvata: {n} record in {f}',
      iv_title:('' + brandName() + ' — Inventario'), iv_pick_h:'Inventario rapido', iv_pick_p:'Scegli il progetto su cui lavori.', iv_pick_none:'Nessun progetto aperto. Crealo sul PC: Progetti › Nuovo progetto.',
      iv_open:'Apri l\'inventario {p}', iv_label_of:'Questa etichetta è del progetto {p} e non è ancora stata scansionata.',
      iv_cam_on:'Avvia la fotocamera', iv_cam_off:'Ferma la fotocamera', iv_cam_err:'Fotocamera non disponibile: {m}', iv_cam_hint:'Inquadra il QR: prima la scatola, poi un faldone dopo l\'altro, con la costa ben visibile.',
      iv_box:'Scatola', iv_nobox:'Nessuna scatola attiva: scansiona il QR della scatola.', iv_box_n:'{n} faldoni in questa scatola', iv_box_1:'1 faldone in questa scatola', iv_box_set:'Scatola attiva: {c}', iv_box_new:'Nuova scatola: {c}',
      iv_ok:'{c} acquisito', iv_ok_box:'{c} in {b}', iv_dup:'{c} è già stato acquisito', iv_other:'Etichetta di un altro progetto ({c})', iv_unknown:'QR sconosciuto: {c}', iv_range:'{c}: numero oltre le etichette generate (controlla i lotti sul PC)',
      iv_need_box:'Prima la scatola: scansiona il QR della scatola.', iv_ro:'Con il tuo ruolo puoi solo consultare: chiedi a un amministratore il ruolo "editor".', iv_closed:'Il progetto è chiuso: riaprilo dal PC per acquisire.',
      iv_last:'Ultimo faldone', iv_none:'Ancora nessun faldone in questa sessione.', iv_undo:'Annulla', iv_undone:'Annullato: {c}', iv_session:'In questa sessione: {n}', iv_total:'Acquisiti nel progetto: {n}', iv_pace:'{s} s a faldone (mediana)',
      iv_tags:'Tag rapidi', iv_years:'Anni', iv_keep:'Mantieni per i prossimi', iv_voice:'Tieni premuto e parla', iv_voice_on:'Ti ascolto…', iv_voice_no:'Il riconoscimento vocale non è disponibile in questo browser: scrivi nel campo sotto.', iv_voice_err:'Voce non riconosciuta: {m}',
      iv_note_ph:'Descrizione (es. fatture acquisti 2019)', iv_typed:'Oppure scrivi o leggi il codice (lettore Bluetooth)', iv_typed_ph:'dm26… o ROSSI24-0042',
      iv_st_captured:'acquisito', iv_st_proposed:'proposta AI', iv_st_review:'da rivedere', iv_st_confirmed:'confermato', iv_st_sending:'in invio', iv_st_ai:'lettura AI…',
      iv_q_wait:'{n} in attesa di rete', iv_q_send:'{n} in invio', iv_q_err:'{n} non inviati: {m}', iv_q_ok:'Tutto inviato', iv_ai_off:'Lettura AI spenta: si cataloga dal PC',
      iv_done:'Fine', iv_change:'Cambia progetto', iv_log_cap:'Acquisito con l\'inventario rapido il faldone {c}', iv_log_box:'Nuova scatola dell\'inventario {c}', iv_log_undo:'Annullata l\'acquisizione di {c}', iv_log_upd:'Aggiornato dall\'inventario rapido il faldone {c}',
      iv_err:'Non salvato: {m}', iv_mode_capture:'Modalità: cattura ora, cataloga dopo', iv_mode_box:'Modalità: scatola → faldoni',
      iv_mode_station:'Modalità: stazione fissa', iv_mode_chain:'Modalità: catena a due persone',
      iv_station_hint:'Stazione fissa: appoggia il telefono (o usa la webcam del PC) e passa i faldoni davanti alla fotocamera, uno alla volta. Bip = fatto.',
      iv_chain_hint:'Catena a due persone: tu scansioni, la seconda persona corregge sul PC (Progetti › In diretta).', iv_more:'Tag, anni e voce',
      iv_folder:'Faldone aperto', iv_folder_set:'Faldone aperto: {c} (ora i documenti)', iv_folder_n:'{n} documenti', iv_folder_1:'1 documento', iv_folder_close:'Chiudi il faldone',
      iv_need_folder:'Prima il faldone: scansiona il QR del faldone che contiene il documento.', iv_doc_ok:'Documento {c} in {f}', iv_jolly:'Le etichette jolly diventano', iv_j_binder:'Faldone', iv_j_doc:'Documento',
      iv_box_closed:'Chiusa {b}: {n} faldoni{y}', iv_box_years:', anni {y}', iv_page:'Foto della prima pagina', iv_page_ok:'Seconda foto di {c}: l\'AI la legge',
      iv_hid:'Lettore Bluetooth pronto: leggi un\'etichetta.', iv_st_doc:'documento',
      iv_v_start:'Verifica una scatola', iv_v_h:'Verifica', iv_v_p:'Scansiona la scatola da controllare, poi tutti i faldoni che contiene. Alla fine vedi cosa manca e cosa è fuori posto.',
      iv_v_load:'Carico l\'elenco del progetto…', iv_v_box:'Scatola in verifica: {c}', iv_v_need_box:'Prima la scatola da verificare.', iv_v_found:'{c}: c\'è', iv_v_again:'{c} già contato',
      iv_v_mis:'{c} è registrato in {b}: fuori posto', iv_v_nobox:'{c} non ha una scatola registrata', iv_v_unknown:'{c} non è ancora inventariato', iv_v_doc:'{c} è un documento: in verifica contano i faldoni',
      iv_v_k_found:'Trovati', iv_v_k_missing:'Mancano', iv_v_k_mis:'Fuori posto', iv_v_k_unknown:'Non inventariati', iv_v_missing:'Mancano', iv_v_move:'Sposta qui', iv_v_move_all:'Sposta qui tutti ({n})',
      iv_v_moved:'{c} spostato in {b}', iv_v_cap:'Acquisisci qui', iv_v_close:'Chiudi la verifica', iv_v_exit:'Torna all\'inventario', iv_v_done:'Verifica {b}: {f} su {e} trovati, {m} mancanti, {x} fuori posto',
      iv_v_err:'Elenco non disponibile: {m}', iv_log_verify:'Verificata la scatola {b}: {f} su {e} trovati', iv_log_move:'Spostato {c} nella scatola {b} (verifica)', iv_log_doc:'Acquisito il documento {c} nel faldone {f}'
    });
    Object.assign(I18N.en, {
      iv_full:'Phone memory full: new captures are stopped. Tap the queue status and save the rescue copy, then free some space.',
      iv_low:'Phone memory almost full: send the queue (network needed) or save the rescue copy.', iv_q_auth:'Sign-in expired: sign in again, the queue stays saved and restarts by itself.',
      iv_h_rec:'Binders and boxes to send', iv_h_ai:'AI readings waiting', iv_h_oldest:'Oldest in the queue', iv_h_store:'Memory used', iv_h_store_v:'{u} MB of {q} MB', iv_h_keep:'Memory protected by the browser',
      iv_h_yes:'yes', iv_h_no:'no (the browser may clear it when space is needed)', iv_h_now:'now', iv_h_min:'{n} min ago', iv_h_hours:'{n} hours ago', iv_h_retry:'Retry now', iv_h_rescue:'Save rescue copy',
      iv_h_rescue_p:'The file holds the binders not sent yet, with their photos. On the PC: Projects › the project › Job › Import from the phone. Importing twice is fine: no duplicates.',
      iv_h_saved:'Copy saved: {n} records in {f}',
      iv_title:('' + brandName() + ' — Inventory'), iv_pick_h:'Rapid inventory', iv_pick_p:'Pick the project you are working on.', iv_pick_none:'No open project. Create it on the PC: Projects › New project.',
      iv_open:'Open the inventory {p}', iv_label_of:'This label belongs to project {p} and has not been scanned yet.',
      iv_cam_on:'Start the camera', iv_cam_off:'Stop the camera', iv_cam_err:'Camera not available: {m}', iv_cam_hint:'Frame the QR: first the box, then one binder after the other, with the spine in view.',
      iv_box:'Box', iv_nobox:'No active box: scan the box QR.', iv_box_n:'{n} binders in this box', iv_box_1:'1 binder in this box', iv_box_set:'Active box: {c}', iv_box_new:'New box: {c}',
      iv_ok:'{c} captured', iv_ok_box:'{c} in {b}', iv_dup:'{c} was already captured', iv_other:'Label of another project ({c})', iv_unknown:'Unknown QR: {c}', iv_range:'{c}: number beyond the labels generated (check the batches on the PC)',
      iv_need_box:'Box first: scan the box QR.', iv_ro:'Your role can only view: ask an administrator for the "editor" role.', iv_closed:'The project is closed: reopen it on the PC to capture.',
      iv_last:'Last binder', iv_none:'No binder in this session yet.', iv_undo:'Undo', iv_undone:'Undone: {c}', iv_session:'This session: {n}', iv_total:'Captured in the project: {n}', iv_pace:'{s} s per binder (median)',
      iv_tags:'Quick tags', iv_years:'Years', iv_keep:'Keep for the next ones', iv_voice:'Hold and speak', iv_voice_on:'Listening…', iv_voice_no:'Speech recognition is not available in this browser: type in the field below.', iv_voice_err:'Voice not recognised: {m}',
      iv_note_ph:'Description (e.g. purchase invoices 2019)', iv_typed:'Or type or read the code (Bluetooth scanner)', iv_typed_ph:'dm26… or ROSSI24-0042',
      iv_st_captured:'captured', iv_st_proposed:'AI proposal', iv_st_review:'to review', iv_st_confirmed:'confirmed', iv_st_sending:'sending', iv_st_ai:'AI reading…',
      iv_q_wait:'{n} waiting for the network', iv_q_send:'{n} sending', iv_q_err:'{n} not sent: {m}', iv_q_ok:'All sent', iv_ai_off:'AI reading off: catalogue on the PC',
      iv_done:'Done', iv_change:'Change project', iv_log_cap:'Binder {c} captured with the rapid inventory', iv_log_box:'New inventory box {c}', iv_log_undo:'Capture of {c} undone', iv_log_upd:'Binder {c} updated by the rapid inventory',
      iv_err:'Not saved: {m}', iv_mode_capture:'Mode: capture now, catalogue later', iv_mode_box:'Mode: box → binders',
      iv_mode_station:'Mode: fixed station', iv_mode_chain:'Mode: two-person chain',
      iv_station_hint:'Fixed station: put the phone on a stand (or use the PC webcam) and pass the binders in front of the camera, one at a time. Beep = done.',
      iv_chain_hint:'Two-person chain: you scan, the second person corrects on the PC (Projects › Live).', iv_more:'Tags, years and voice',
      iv_folder:'Open binder', iv_folder_set:'Open binder: {c} (documents now)', iv_folder_n:'{n} documents', iv_folder_1:'1 document', iv_folder_close:'Close the binder',
      iv_need_folder:'Binder first: scan the QR of the binder that holds the document.', iv_doc_ok:'Document {c} in {f}', iv_jolly:'Jolly labels become', iv_j_binder:'Binder', iv_j_doc:'Document',
      iv_box_closed:'Closed {b}: {n} binders{y}', iv_box_years:', years {y}', iv_page:'Photo of the first page', iv_page_ok:'Second photo of {c}: the AI reads it',
      iv_hid:'Bluetooth scanner ready: read a label.', iv_st_doc:'document',
      iv_v_start:'Check a box', iv_v_h:'Check', iv_v_p:'Scan the box to check, then every binder in it. At the end you see what is missing and what is misplaced.',
      iv_v_load:'Loading the project list…', iv_v_box:'Box being checked: {c}', iv_v_need_box:'Scan the box to check first.', iv_v_found:'{c}: present', iv_v_again:'{c} already counted',
      iv_v_mis:'{c} is recorded in {b}: misplaced', iv_v_nobox:'{c} has no box recorded', iv_v_unknown:'{c} is not inventoried yet', iv_v_doc:'{c} is a document: the check counts binders',
      iv_v_k_found:'Found', iv_v_k_missing:'Missing', iv_v_k_mis:'Misplaced', iv_v_k_unknown:'Not inventoried', iv_v_missing:'Missing', iv_v_move:'Move here', iv_v_move_all:'Move all here ({n})',
      iv_v_moved:'{c} moved to {b}', iv_v_cap:'Capture here', iv_v_close:'Close the check', iv_v_exit:'Back to the inventory', iv_v_done:'Check {b}: {f} of {e} found, {m} missing, {x} misplaced',
      iv_v_err:'List not available: {m}', iv_log_verify:'Box {b} checked: {f} of {e} found', iv_log_move:'{c} moved to box {b} (check)', iv_log_doc:'Document {c} captured in binder {f}'
    });
    Object.assign(SC_ICONS, {
      mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
      tag:'<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
      download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
      inv:'<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>', cloud:'<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>'
    });
    ['box', 'cam', 'undo', 'stop', 'scan'].forEach(k => { if (!SC_ICONS[k]) SC_ICONS[k] = SC_ICONS.qr; });

    const IV = { pid:'', proj:null, scanned:new Map(), box:null, list:[], last:null, msg:null, cam:null, busy:Promise.resolve(), projects:null,
      tags:new Set(), years:[], keep:false, rec:null, listening:false, undoTimer:0, amendTimer:0, flushing:{rec:false, ai:false}, q:{wait:0, send:0, err:0, errMsg:''}, wake:null, label:null,
      folder:null, jolly:'binder', verify:null,
      health:false, full:false, auth:false, store:null, low:false, persisted:false, rescued:0 };   // v12.14: phone health   // v12.12: open binder (document level), jolly labels, box verification
    window.IV = IV;   // tests and debugging

    /* ---------------- small helpers ---------------- */
    const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch(e){ return d; } };
    const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } };
    const ivWho = () => { const u = SC.P && SC.P.auth.currentUser() || {}; return u.display_name || u.username || 'Mobile'; };
    const ivCan = () => !!(SC.user && SC.P && SC.P.auth.can('edit'));
    function ivDevice(){ let d = ''; try { d = localStorage.getItem('docmap_v26_scan_device') || ''; if (!d){ d = 'phone-' + uuid().slice(0, 8); localStorage.setItem('docmap_v26_scan_device', d); } } catch(e){ d = 'phone'; } return d; }
    /** A timestamp strictly after prev (records are newest-wins everywhere). */
    function ivTs(prev){ let at = nowISO(); if (prev && at <= prev) at = new Date(Date.parse(prev) + 1).toISOString(); return at; }
    function ivParam(){ const v = String(new URLSearchParams(location.search || '').get('inv') || '').trim(); return /^[A-Za-z0-9._:@-]{1,100}$/.test(v) ? v : ''; }
    const ivOutbox = () => { const q = lsGet(IV_OUTBOX_LS, []); return Array.isArray(q) ? q : []; };
    /** v12.14: the queue is never lost silently. When the phone memory is full the recent cache is trimmed and the write
        retried; if it still fails, new captures stop with a clear message (the rescue file still saves what is pending). */
    const ivOutboxSet = (q) => {
      if (lsSet(IV_OUTBOX_LS, q.length ? q : null)){ if (IV.full){ IV.full = false; } return true; }
      try { const r = ivRecent(), keys = Object.keys(r).sort((a, b) => String(r[a].updated_at).localeCompare(String(r[b].updated_at))); keys.slice(0, Math.max(0, keys.length - 40)).forEach(k => delete r[k]); localStorage.setItem(IV_RECENT_LS, JSON.stringify(r)); } catch(e){}
      if (lsSet(IV_OUTBOX_LS, q.length ? q : null)) return true;
      IV.full = true; return false;
    };
    function ivRecent(){ const r = lsGet(IV_RECENT_LS, {}); return r && typeof r === 'object' ? r : {}; }
    function ivRecentPut(rec){
      const r = ivRecent(); r[rec.short_code] = rec;
      const keys = Object.keys(r); if (keys.length > IV_RECENT_MAX) keys.sort((a, b) => String(r[a].updated_at).localeCompare(String(r[b].updated_at))).slice(0, keys.length - IV_RECENT_MAX).forEach(k => delete r[k]);
      lsSet(IV_RECENT_LS, r);
    }
    function ivPrefs(){ const p = lsGet(IV_PREFS_LS, {}); return p && typeof p === 'object' ? p : {}; }
    function ivPrefsSave(){ const p = ivPrefs(); p[IV.pid] = {box:IV.box, keep:IV.keep, tags:IV.keep ? Array.from(IV.tags) : [], years:IV.keep ? IV.years : [], folder:IV.folder, jolly:IV.jolly, at:nowISO()}; lsSet(IV_PREFS_LS, p); }

    /* ---------------- providers ---------------- */
    LocalDataProvider.prototype.invList = async function(){
      const {st} = await this.readState(); if (!st) return [];
      return (st.archives || []).filter(a => invIsProject(a) && a.inv.status !== 'closed').map(a => ({id:a.id, name:a.name || '', code:a.code || '', prefix:a.inv.prefix, client:a.inv.client || '', status:a.inv.status || 'open'}));
    };
    LocalDataProvider.prototype.invGet = async function(id){
      const {st} = await this.readState(); const a = st && (st.archives || []).find(x => x.id === id && invIsProject(x)); if (!a) return null;
      const sc = []; const p = a.inv.prefix;
      (st.binders || []).forEach(b => { const x = invParseCode(b.short_code); if (x && x.prefix === p && x.kind === 'binder') sc.push(Object.assign({t:'b', c:b.short_code, u:b.updated_at, l:b.location_id || '', n:b.speaking_code || ''}, invLevel(b) === 'doc' ? {d:1} : {})); });
      (st.locations || []).forEach(l => { const x = invParseCode(l.short_code); if (x && x.prefix === p && x.kind === 'box') sc.push({t:'l', c:l.short_code, u:l.updated_at, id:l.id}); });
      return {project:a, scanned:sc};
    };
    /** Same browser as the desktop: write the records in the stored state + one pending log line carrying them. */
    LocalDataProvider.prototype.invPush = async function(records, tombs, entry){
      const {raw, st} = await this.readState(); if (!st) throw new DMError('not_found');
      invApplyRecords(st, records, tombs);
      st.hasUnexportedChanges = true;
      try { if (DocMapVault.isActive()) await DocMapVault.saveState(st); else { if (raw) localStorage.setItem(LS_PREV, raw); localStorage.setItem(LS_KEY, JSON.stringify(st)); } }
      catch(e){ throw new DMError('storage', 'quota'); }
      if (!entry){ const r0 = records[0] || {}; entry = ivEntry('inventory.update', {type:r0._type === 'location' ? 'location' : 'binder', id:r0.id || '', code:r0.speaking_code || r0.code || ''}, t('iv_log_upd', {c:r0.speaking_code || r0.code || ''}), {project:IV.pid}); }   // local mode: the log line carries the records to the desktop
      entry.details = Object.assign({}, entry.details, {records, tombstones:tombs});
      try { if (DocMapVault.isActive()) await DocMapVault.appendLog(entry); else { const p = lsGetJSON('docmap_v26_log_pending', []); (Array.isArray(p) ? p : []).push(entry); lsSetJSON('docmap_v26_log_pending', p); } } catch(e){}
      return {ok:true};
    };
    LocalDataProvider.prototype.invGetBinder = async function(code){ const {st} = await this.readState(); const b = st && (st.binders || []).find(x => x.short_code === code); return b ? Object.assign({}, b) : null; };
    LocalDataProvider.prototype.invPhotoPut = async function(){ return {local:true}; };   // already in IndexedDB on this browser
    LocalDataProvider.prototype.invAi = async function(){ return {enabled:false}; };
    RemoteDataProvider.prototype.invList = async function(){ const r = await this.srv.call('project'); return Array.isArray(r.items) ? r.items : []; };
    RemoteDataProvider.prototype.invGet = async function(id){
      try { const r = await this.srv.call('project', {q:Object.assign({id}, arguments[1] && arguments[1].detail ? {detail:'1'} : {})}); return {project:r.project, scanned:Array.isArray(r.scanned) ? r.scanned : []}; }
      catch(e){ if (e.code === 'not_found') return null; throw e; }
    };
    RemoteDataProvider.prototype.invPush = async function(records, tombs, entry){
      const r = await this.srv.call('push', {method:'POST', body:{records:records.map(d => ({type:d._type, id:d.id, updated_at:d.updated_at, data:ivData(d)})), tombstones:tombs, activity_log:entry ? [entry] : [], deviceId:ivDevice(), operator:ivWho()}});
      const bad = (r.rejected || []).filter(x => x.reason !== 'older' && x.reason !== 'tie');
      if (bad.length) throw new DMError('invalid', bad[0].reason || 'rejected');
      return {ok:true};
    };
    RemoteDataProvider.prototype.invGetBinder = async function(code){ try { const r = await this.srv.call('binder', {q:{qr:code, via:'qr'}}); return r && r.binder ? r.binder : null; } catch(e){ if (e.code === 'not_found') return null; throw e; } };
    RemoteDataProvider.prototype.invPhotoPut = function(o){ return this.srv.call('photo_put', {method:'POST', body:o, timeout:60000}); };
    RemoteDataProvider.prototype.invAi = function(o){ return this.srv.call('ai_spine', {method:'POST', body:o, timeout:90000}); };

    const ivData = invRecData;

    /* ---------------- loading ---------------- */
    async function ivOpen(pid){
      IV.pid = pid; IV.msg = null;
      const r = await SC.P.data.invGet(pid);
      if (!r){ IV.proj = null; return false; }
      IV.proj = r.project; IV.proj.inv = normalizeInv(IV.proj.inv);
      IV.scanned = new Map(r.scanned.map(x => [x.c, x]));
      ivOutbox().forEach(j => { if (j.p === pid && j.kind === 'rec') (j.recs || []).forEach(d => IV.scanned.set(d.short_code, {t:d._type === 'location' ? 'l' : 'b', c:d.short_code, u:d.updated_at, id:d.id})); });
      const pr = ivPrefs()[pid] || {};
      IV.box = pr.box && pr.box.short_code && invParseCode(pr.box.short_code) ? pr.box : null;
      IV.keep = !!pr.keep; IV.tags = new Set(IV.keep ? pr.tags || [] : []); IV.years = IV.keep && Array.isArray(pr.years) ? pr.years : [];
      IV.folder = IV.proj.inv.doc && pr.folder && pr.folder.short_code && IV.scanned.has(pr.folder.short_code) ? pr.folder : null;
      IV.jolly = pr.jolly === 'doc' ? 'doc' : 'binder'; IV.verify = null;
      ivStorage().then(() => ivQueueStats());
      return true;
    }
    function ivBoxCount(){ return IV.box ? IV.list.filter(x => !x.undone && x.box === IV.box.code).length : 0; }
    function ivTotal(){ let n = 0; IV.scanned.forEach(x => { if (x.t === 'b') n++; }); return n; }

    /* ---------------- records ---------------- */
    function ivNewBox(code, n){
      const inv = IV.proj.inv, num = invNumber(inv, 'box', n), at = ivTs('');
      const l = normalizeLocation({id:'inv-' + code, parent_id:'', level:0, kind:'box', name:num, seg:locSegClean(num), code:locSegClean(num), short_code:code, archive_id:IV.pid, created_at:at, updated_at:at});
      l._type = 'location'; return l;
    }
    function ivNewBinder(code, n, photoId, lvl){
      const inv = IV.proj.inv, at = ivTs(''), yr = ivYearStr(IV.years), doc = lvl === 'doc' && IV.folder;
      const b = normalizeBinder({id:'inv-' + code, short_code:code, speaking_code:invNumber(inv, 'binder', n), archive_id:IV.pid, company_name:inv.client || '',
        location_id:doc ? IV.folder.loc || '' : IV.box ? IV.box.id : '', tags:Array.from(IV.tags).join(', '), ref_year:yr, created_at:at, updated_at:at});
      b.id = 'inv-' + code; b.updated_at = at; b.created_at = at;
      b.inv = {p:IV.pid, st:'captured', ph:photoId || '', ai:null, voice:'', by:ivWho(), dev:ivDevice(), at, n, box:doc ? IV.folder.box || '' : IV.box ? IV.box.code : ''};
      if (doc) Object.assign(b.inv, {lvl:'doc', parent:IV.folder.id, folder:IV.folder.code});   // v12.12: a document inside the open binder
      b._type = 'binder'; return b;
    }
    function ivYearStr(ys){ const a = (ys || []).filter(Boolean).map(Number).sort((x, y) => x - y); return !a.length ? '' : a[0] === a[a.length - 1] ? String(a[0]) : a[0] + '-' + a[a.length - 1]; }

    /* ---------------- outbox ---------------- */
    function ivEnqueue(job){
      const q = ivOutbox();
      if (job.kind === 'rec' && job.amend){   // a later version of a record still waiting: replace it in place
        const i = q.findIndex(j => j.kind === 'rec' && !j.inflight && j.recs.length === 1 && j.recs[0].id === job.recs[0].id);
        if (i >= 0){ q[i].recs = job.recs; ivOutboxSet(q); return ivFlushSoon(); }
      }
      q.push(Object.assign({id:uuid(), at:nowISO(), tries:0, p:IV.pid}, job)); const ok = ivOutboxSet(q); ivFlushSoon();
      if (!ok) ivSay('err', t('iv_full'));
      return ok;
    }
    function ivFlushSoon(){ setTimeout(() => { ivFlush('rec'); ivFlush('ai'); }, 0); ivQueueStats(); }
    function ivQueueStats(){
      const q = ivOutbox(); IV.q = {wait:q.filter(j => j.wait).length, send:q.filter(j => !j.wait && !j.err).length, err:q.filter(j => j.err).length, errMsg:(q.find(j => j.err) || {}).err || '', oldest:q.reduce((m, j) => !m || j.at < m ? j.at : m, ''), ai:q.filter(j => j.kind === 'ai').length};
      const el = document.getElementById('iv-q'); if (el) el.outerHTML = ivQueueHTML();
    }
    /** One lane at a time ('rec' in order: photo then record; 'ai' in parallel to it). Offline → wait, retried later. */
    async function ivFlush(lane){
      if (IV.flushing[lane] || !SC.P || !SC.user) return;
      IV.flushing[lane] = true;
      try {
        for (let guard = 0; guard < 500; guard++){
          const q = ivOutbox(), now = Date.now(), job = q.find(j => (lane === 'ai' ? j.kind === 'ai' : j.kind !== 'ai') && !j.err && !j.inflight && !(j.next > now) && (lane !== 'ai' || !q.some(r => r.kind === 'rec' && r.recs && r.recs.some(d => d.short_code === j.code))));
          if (!job) break;
          ivJobMark(job.id, {inflight:true}); ivQueueStats();
          try {
            await ivRunJob(job);
            ivJobDone(job.id); IV.auth = false;
            if (lane === 'rec') setTimeout(() => ivFlush('ai'), 0);   // an AI reading may have been waiting for this record
          } catch(e){
            // v12.14: only a real refusal stops a job. Network, server busy (5xx, 429) and timeouts wait and retry with a
            // growing pause; an expired sign-in waits for the next sign-in; the AI gives up after a few tries (never blocks).
            const c = (e && e.code) || '', tries = (job.tries || 0) + 1, msg = String(e && (e.message || e.code) || e).slice(0, 120);
            if (c === 'offline'){ ivJobMark(job.id, {inflight:false, wait:true, tries}); ivQueueStats(); break; }
            if (lane === 'ai' && tries >= IV_AI_TRIES && c !== 'unauthorized'){ ivJobDone(job.id); ivListSet(job.code, {ai:'fail'}); ivQueueStats(); continue; }
            if (c === 'server' || c === 'locked' || lane === 'ai'){
              const wait = Math.min(IV_BACKOFF_MAX, Math.max(5000, (e.data && e.data.retry_in || 0) * 1000, 5000 * Math.pow(2, tries - 1)));
              ivJobMark(job.id, {inflight:false, wait:true, next:Date.now() + wait, tries, last:msg}); ivQueueStats(); break;
            }
            if (c === 'unauthorized'){ IV.auth = true; ivJobMark(job.id, {inflight:false, wait:true, tries, last:msg}); ivQueueStats(); break; }
            ivJobMark(job.id, {inflight:false, err:msg, tries});
          }
          ivQueueStats(); ivRenderLive();
        }
      } finally { IV.flushing[lane] = false; ivQueueStats(); }
    }
    function ivJobMark(id, patch){ const q = ivOutbox(), j = q.find(x => x.id === id); if (j){ Object.assign(j, patch); if (patch.inflight) delete j.wait; ivOutboxSet(q); } }
    function ivJobDone(id){ ivOutboxSet(ivOutbox().filter(x => x.id !== id)); }
    async function ivRunJob(job){
      if (job.kind === 'rec'){
        for (const d of job.recs){
          if (d._type !== 'binder' || !d.inv || job.photoSent) continue;
          for (const pid of [d.inv.ph, d.inv.ph2].filter(Boolean)){   // v12.12: ph2 = photo of the first page
            const ph = await IVDB.get(pid).catch(() => null);
            if (ph && ph.data && !ph.sent){
              const m = String(ph.data).match(/^data:([^;]+);base64,(.*)$/);
              if (m){ const r = await SC.P.data.invPhotoPut({id:pid, binder_id:d.id, mime:m[1], data:m[2]}); if (!r.local){ ph.sent = true; await IVDB.put(pid, ph).catch(() => {}); ivPhotoSent(pid); } }
            }
          }
          ivJobMark(job.id, {photoSent:true});
        }
        await SC.P.data.invPush(job.recs, job.tombs || [], job.entry || null);
        job.recs.forEach(d => { if (IV.list.some(x => x.code === d.short_code)) ivListSet(d.short_code, {sent:true}); });
        return;
      }
      if (job.kind === 'tomb'){ await SC.P.data.invPush([], job.tombs, job.entry || null); return; }
      if (job.kind === 'ai'){
        ivListSet(job.code, {ai:'run'}); ivRenderLive();
        const r = await SC.P.data.invAi({photo_id:job.ph || undefined, voice:job.voice || '', hints:job.hints || {}});
        if (!r || !r.enabled){ ivListSet(job.code, {ai:'off'}); return; }
        const mine = ivRecent()[job.code]; if (!mine || mine._gone) return;
        // the binder may have been edited elsewhere meanwhile (PC review, another phone): fill the newest version
        let cur = mine;
        try { const srv = await SC.P.data.invGetBinder(job.code); if (srv && String(srv.updated_at || '') > String(mine.updated_at || '')) cur = Object.assign({}, srv, {_type:'binder', inv:Object.assign({}, mine.inv, srv.inv || {})}); }
        catch(e){ if (e && e.code === 'offline') throw e; }
        const res = r.result || {}, rec = Object.assign({}, cur), proj = IV.proj && IV.proj.id === job.p ? IV.proj : null;
        Object.assign(rec, invFieldsFromAi(res, rec));
        if (res.tags && res.tags.length) rec.tags = invTagsJoin(rec.tags, res.tags);
        const th = proj ? proj.inv.auto_confirm : INV_AUTO_CONFIRM;
        rec.inv = Object.assign({}, rec.inv, {ai:Object.assign({}, res, {model:r.model || '', ms:r.ms || 0, at:nowISO()}), st:rec.inv.st === 'confirmed' ? 'confirmed' : (res.confidence >= th && !res.empty_spine) || rec.inv.voice ? 'proposed' : 'review'});
        rec.updated_at = ivTs(cur.updated_at);
        ivRecentPut(rec);
        if (IV.last && IV.last.short_code === rec.short_code) IV.last = rec;
        ivListSet(job.code, {ai:'done', st:rec.inv.st, title:rec.binder_title || rec.company_name || ''});
        await SC.P.data.invPush([rec], [], null);
      }
    }

    /* ---------------- v12.14: health of the phone (queue, memory, rescue file) ---------------- */
    /** Jobs whose pause is over go back in the line (every 15 s, and when the network comes back). */
    function ivWake(){
      const q = ivOutbox(), now = Date.now(); let ch = false;
      q.forEach(j => { if (j.wait && !(j.next > now) && !(IV.auth && !j.next)){ delete j.wait; delete j.next; ch = true; } });
      if (ch){ ivOutboxSet(q); ivFlushSoon(); }
    }
    /** A photo the server has: remember it; only the newest IV_SENT_KEEP stay on the phone (the server keeps them all). */
    function ivPhotoSent(id){
      const l = lsGet(IV_SENT_LS, []), a = Array.isArray(l) ? l.filter(x => x !== id) : [];
      a.push(id);
      const drop = a.length > IV_SENT_KEEP + 10 ? a.splice(0, a.length - IV_SENT_KEEP) : [];
      lsSet(IV_SENT_LS, a);
      drop.forEach(x => IVDB.del(x).catch(() => {}));
    }
    /** Asks the browser not to clear this site's storage, and reads how full it is (both optional, never blocking). */
    async function ivStorage(){
      try { if (navigator.storage && navigator.storage.persist && !IV.persisted) IV.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch(e){}
      try { if (navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); IV.store = {usage:e.usage || 0, quota:e.quota || 0}; } } catch(e){}
      const st = IV.store; IV.low = !!(st && st.quota && (st.usage / st.quota > 0.85 || st.quota - st.usage < 50 * 1048576));
    }
    function ivAge(iso){ const ms = Date.now() - Date.parse(iso || ''); if (!isFinite(ms) || ms < 0) return ''; const m = Math.round(ms / 60000); return m < 1 ? t('iv_h_now') : m < 120 ? t('iv_h_min', {n:m}) : t('iv_h_hours', {n:Math.round(m / 60)}); }
    function ivHealthHTML(){
      if (!IV.health) return '';
      const q = IV.q, st = IV.store, mb = (x) => (x / 1048576).toFixed(0);
      const rows = [[t('iv_h_rec'), String(Math.max(0, q.wait + q.send + q.err - q.ai))], [t('iv_h_ai'), String(q.ai)], [t('iv_h_oldest'), q.oldest ? ivAge(q.oldest) : '—'],
        [t('iv_h_store'), st && st.quota ? t('iv_h_store_v', {u:mb(st.usage), q:mb(st.quota)}) : '—'], [t('iv_h_keep'), IV.persisted ? t('iv_h_yes') : t('iv_h_no')]];
      return '<div class="iv-health" id="iv-health"><dl>' + rows.map(x => '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>').join('') + '</dl>' +
        '<div class="iv-health-b"><button type="button" class="sc-btn" data-s="iv-retry" id="iv-h-retry">' + esc(t('iv_h_retry')) + '</button>' +
        '<button type="button" class="sc-btn" data-s="iv-rescue" id="iv-rescue">' + sic('download') + esc(t('iv_h_rescue')) + '</button></div><p class="sc-muted small">' + esc(t('iv_h_rescue_p')) + '</p></div>';
    }
    /** Rescue file: every record of this project the server has not confirmed yet, with its photos. */
    async function ivRescueData(){
      const q = ivOutbox().filter(j => j.p === IV.pid && j.kind !== 'ai'), recs = new Map(), rc = ivRecent();
      q.forEach(j => (j.recs || []).forEach(d => recs.set(d.id, d)));
      IV.list.filter(x => !x.sent && !x.undone).forEach(x => { const d = rc[x.code]; if (d && !recs.has(d.id)) recs.set(d.id, d); });
      const photos = {};
      for (const d of recs.values()) for (const id of [d.inv && d.inv.ph, d.inv && d.inv.ph2].filter(Boolean)){ const ph = await IVDB.get(id).catch(() => null); if (ph && ph.data) photos[id] = ph.data; }
      return {format:INV_RESCUE_FORMAT, v:1, at:nowISO(), device:ivDevice(), who:ivWho(), project:{id:IV.pid, code:IV.proj ? IV.proj.inv.code : '', name:IV.proj ? IV.proj.name || '' : ''}, recs:Array.from(recs.values()), photos};
    }
    async function ivRescueSave(){
      const d = await ivRescueData(), name = (typeof brandFile === 'function' ? brandFile('inventario_' + (d.project.code || 'progetto') + '_' + nowISO().slice(0, 16).replace(/[:T]/g, '-'), 'json') : 'inventario.json');
      const blob = new Blob([JSON.stringify(d)], {type:'application/json'}), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      ivSay('ok', t('iv_h_saved', {n:d.recs.length, f:name})); IV.rescued = d.recs.length; ivRenderLive();
      return d;
    }
    function ivListSet(code, patch){ const x = IV.list.find(y => y.code === code); if (x) Object.assign(x, patch); }

    /* ---------------- scanning ---------------- */
    function ivHandle(text, via){ IV.busy = IV.busy.then(() => ivHandleOne(text, via)).catch(e => console.warn('inv', e)); return IV.busy; }
    function ivSay(kind, text){
      IV.msg = {kind, text, at:Date.now()}; dmScanFeedback(kind === 'ok' ? 'ok' : kind === 'switch' ? 'switch' : 'warn');
      // v12.12 fixed station: the whole screen flashes, readable from a distance
      if (IV.proj && IV.proj.inv.mode === 'station' && document.body){
        const o = document.createElement('div'); o.className = 'iv-burst ' + kind; o.setAttribute('aria-hidden', 'true'); o.textContent = text.split(' · ').pop().slice(0, 60);
        document.body.appendChild(o); setTimeout(() => o.remove(), 900);
      }
    }
    async function ivHandleOne(text, via){
      if (!IV.proj) return;
      if (!ivCan()){ ivSay('err', t('iv_ro')); return ivRenderLive(); }
      if (IV.proj.inv.status === 'closed'){ ivSay('err', t('iv_closed')); return ivRenderLive(); }
      let p = invParseScan(text), x = p && invParseCode(p.code);
      if (!x && p && p.type === 'text'){   // typed speaking code ROSSI24-0042 / ROSSI24-S003
        const m = String(p.code).match(/^([A-Z0-9]{1,12})-(S?)(\d{1,7})$/);
        if (m && m[1] === invCodeClean(IV.proj.inv.code)){ const kind = m[2] ? 'box' : 'binder', n = +m[3]; p = {type:kind === 'box' ? 'location' : 'binder', code:invLabelCode(IV.proj.inv.prefix, kind, n)}; x = {kind, prefix:IV.proj.inv.prefix, n}; }
      }
      if (!x){ ivSay('err', t('iv_unknown', {c:String(p && p.code || text || '').slice(0, 40)})); return ivRenderLive(); }
      if (x.prefix !== IV.proj.inv.prefix){ ivSay('err', t('iv_other', {c:p.code})); return ivRenderLive(); }
      const inv = IV.proj.inv, to = x.kind === 'box' ? inv.box_to : inv.binder_to;
      if (!(x.n >= 1 && x.n <= to)){ ivSay('err', t('iv_range', {c:invNumber(inv, x.kind, x.n)})); return ivRenderLive(); }
      if (IV.verify) return x.kind === 'box' ? ivVerifyBox(p.code, x.n) : ivVerifyScan(p.code, x.n, via);
      if (x.kind === 'box') return ivSetBox(p.code, x.n);
      return ivCapture(p.code, x.n, via);
    }
    /** v12.12: summary of the box being left (this session): binders + years, said when the next box is scanned. */
    function ivBoxSummary(b){
      if (!b) return '';
      const L = IV.list.filter(x => !x.undone && x.box === b.code && x.lvl !== 'doc'); if (!L.length) return '';
      const ys = []; L.forEach(x => { const r = ivRecent()[x.code]; (String(r && r.ref_year || '').match(/\b(1[89]|2[01])\d\d\b/g) || []).forEach(y => ys.push(+y)); });
      const y = ys.length ? t('iv_box_years', {y:Math.min(...ys) === Math.max(...ys) ? Math.min(...ys) : Math.min(...ys) + '-' + Math.max(...ys)}) : '';
      return t('iv_box_closed', {b:b.code, n:L.length, y});
    }
    function ivSetBox(code, n){
      const num = invNumber(IV.proj.inv, 'box', n), seen = IV.scanned.get(code);
      const closed = IV.box && IV.box.short_code !== code ? ivBoxSummary(IV.box) : '';
      if (IV.folder && IV.box && IV.box.short_code !== code) IV.folder = null;   // a new box closes the open binder
      IV.box = {id:seen && seen.id ? seen.id : 'inv-' + code, code:num, short_code:code, n};
      if (!seen){
        const l = ivNewBox(code, n); IV.box.id = l.id;
        IV.scanned.set(code, {t:'l', c:code, u:l.updated_at, id:l.id});
        ivEnqueue({kind:'rec', recs:[l], entry:ivEntry('inventory.box', {type:'location', id:l.id, code:num}, t('iv_log_box', {c:num}), {project:IV.pid, short_code:code})});
        ivSay('switch', (closed ? closed + ' · ' : '') + t('iv_box_new', {c:num}));
      } else ivSay('switch', (closed ? closed + ' · ' : '') + t('iv_box_set', {c:num}));
      ivPrefsSave(); ivRenderLive();
    }
    function ivEntry(action, target, summary, details){ return {id:uuid(), at:nowISO(), who:ivWho(), action, target, summary, details:Object.assign({user_id:(SC.user || {}).id || ''}, details || {}), source:MOBILE_LOG_SOURCE}; }
    /** v12.12: level of a binder-shaped label: its batch (doc / binder) or, for a jolly label, the choice on the phone. */
    function ivLevelOf(n){
      const inv = IV.proj.inv, k = invBatchKind(inv, n);
      if (k === 'doc') return 'doc';
      if (k === 'any' && inv.doc && IV.jolly === 'doc') return 'doc';
      return 'binder';
    }
    function ivFolderSet(code, num, loc, box){ IV.folder = {id:'inv-' + code, code:num, short_code:code, loc:loc || '', box:box || ''}; ivPrefsSave(); }
    async function ivCapture(code, n, via){
      const num = invNumber(IV.proj.inv, 'binder', n), inv = IV.proj.inv, lvl = ivLevelOf(n);
      if (IV.scanned.has(code)){
        const s0 = IV.scanned.get(code);
        // document level: scanning a binder already captured opens it (its documents follow)
        if (inv.doc && s0.t === 'b' && !s0.d && lvl !== 'doc'){
          const r = ivRecent()[code] || {}, loc = s0.l || r.location_id || '', bx = (r.inv && r.inv.box) || '';
          ivFolderSet(code, num, loc, bx); ivSay('switch', t('iv_folder_set', {c:num})); return ivRender();
        }
        ivSay('warn', t('iv_dup', {c:num})); return ivRenderLive();
      }
      if (IV.full && !ivOutboxSet(ivOutbox())){ ivSay('err', t('iv_full')); return ivRenderLive(); }   // v12.14: memory full, nothing is captured that could be lost
      if (lvl === 'doc' && !IV.folder){ ivSay('warn', t('iv_need_folder')); return ivRenderLive(); }
      if (lvl !== 'doc' && inv.mode !== 'capture' && !IV.box){ ivSay('warn', t('iv_need_box')); return ivRenderLive(); }
      // 1. photo of this very frame (the QR and the spine are in it), before anything else
      let photo = '', phId = '';
      if (IV.cam && IV.cam.video){ photo = invGrabFrame(IV.cam.video, 1280, 0.72); if (photo){ phId = 'ph-' + code + '-' + Date.now().toString(36); try { await IVDB.put(phId, {id:phId, mime:'image/jpeg', data:photo, at:nowISO(), binder_id:'inv-' + code, project:IV.pid}); } catch(e){ phId = ''; } } }
      // 2. the record, at once (tags / years chosen for the previous binder carry over only with "Mantieni")
      if (!IV.keep){ IV.tags = new Set(); IV.years = []; }
      const b = ivNewBinder(code, n, phId, lvl), doc = lvl === 'doc';
      IV.scanned.set(code, Object.assign({t:'b', c:code, u:b.updated_at, l:b.location_id || ''}, doc ? {d:1} : {}));
      ivRecentPut(b); IV.last = b;
      IV.list.forEach(y => { y.thumb = ''; });   // only the last photo stays in memory
      IV.list.push({code, num, box:doc ? b.inv.box : IV.box ? IV.box.code : '', at:Date.now(), thumb:photo, st:'captured', sent:false, ai:IV.proj.inv.ai && phId ? 'wait' : '', via, lvl, folder:doc ? IV.folder.id : ''});
      const queued = ivEnqueue({kind:'rec', recs:[b], entry:doc ? ivEntry('inventory.capture', {type:'binder', id:b.id, code:num}, t('iv_log_doc', {c:num, f:IV.folder.code}), {project:IV.pid, short_code:code, folder:IV.folder.code, level:'doc', photo:!!phId, via})
        : ivEntry('inventory.capture', {type:'binder', id:b.id, code:num}, t('iv_log_cap', {c:num}), {project:IV.pid, short_code:code, box:IV.box ? IV.box.code : '', photo:!!phId, via})});
      if (!queued){   // v12.14: memory full: undo this capture so the label can be scanned again later (nothing half-saved)
        IV.scanned.delete(code); IV.list.pop(); IV.last = null;
        { const r = ivRecent(); if (r[code] === undefined || r[code].id === b.id){ delete r[code]; lsSet(IV_RECENT_LS, r); } }
        if (phId) IVDB.del(phId).catch(() => {});
        ivSay('err', t('iv_full')); return ivRender();
      }
      ivPaceMark(via);
      if (IV.list.length % 25 === 0) ivStorage();
      if (doc) ivSay('ok', t('iv_doc_ok', {c:num, f:IV.folder.code}));
      else ivSay('ok', IV.box ? t('iv_ok_box', {c:num, b:IV.box.code}) : t('iv_ok', {c:num}));
      if (IV.proj.inv.ai && phId) ivEnqueue({kind:'ai', code, ph:phId, voice:'', hints:{tags:IV.proj.inv.tags, year_from:IV.proj.inv.year_from, year_to:IV.proj.inv.year_to, client:IV.proj.inv.client, kind:doc ? 'doc' : 'spine'}});
      if (!doc && inv.doc) ivFolderSet(code, num, b.location_id, b.inv.box);   // document level: the new binder is open for its documents
      ivArmUndo(); ivPrefsSave(); ivRender();
    }
    /** v12.9 stopwatch: seconds between two binders in a row (a gap over DMT_PAUSE_MS is a pause, not a sample). */
    function ivPaceMark(via){
      const now = Date.now(), gap = IV.capAt ? now - IV.capAt : 0;
      if (gap > 0 && typeof DMT_PAUSE_MS !== 'undefined' && gap <= DMT_PAUSE_MS){ (IV.pace = IV.pace || []).push(gap); if (typeof dmtAdd === 'function') dmtAdd('catalog', gap, via || 'scan'); }
      IV.capAt = now;
    }
    function ivPaceHTML(){
      const v = (IV.pace || []).slice().sort((x, y) => x - y);
      return v.length >= 2 && typeof dmtPct === 'function' ? ' · <span class="iv-pace" id="iv-pace">' + esc(t('iv_pace', {s:dmtSec(dmtPct(v, 0.5))})) + '</span>' : '';
    }
    function ivArmUndo(){ clearTimeout(IV.undoTimer); IV.undoTimer = setTimeout(() => { IV.undoTimer = 0; const u = document.getElementById('iv-undo'); if (u) u.remove(); }, IV_UNDO_MS); }
    async function ivUndo(){
      const b = IV.last; if (!b || !IV.undoTimer) return;
      clearTimeout(IV.undoTimer); IV.undoTimer = 0;
      const code = b.short_code, num = b.speaking_code;
      const q = ivOutbox(), pending = q.filter(j => !j.inflight && ((j.kind === 'rec' && j.recs.length === 1 && j.recs[0].short_code === code) || (j.kind === 'ai' && j.code === code)));
      const sentAlready = !(pending.some(j => j.kind === 'rec')) || q.some(j => j.inflight && j.kind === 'rec' && j.recs.some(d => d.short_code === code));
      ivOutboxSet(q.filter(j => !pending.includes(j)));
      if (sentAlready) ivEnqueue({kind:'tomb', tombs:[{type:'binder', id:b.id, code:num, deletedAt:ivTs(b.updated_at), who:ivWho()}], entry:ivEntry('inventory.undo', {type:'binder', id:b.id, code:num}, t('iv_log_undo', {c:num}), {project:IV.pid, short_code:code})});
      if (b.inv && b.inv.ph) IVDB.del(b.inv.ph).catch(() => {});
      const r = ivRecent(); if (r[code]){ r[code]._gone = true; lsSet(IV_RECENT_LS, r); }
      IV.scanned.delete(code); ivListSet(code, {undone:true}); IV.last = null;
      if (IV.folder && IV.folder.short_code === code) IV.folder = null;
      IV.msg = {kind:'warn', text:t('iv_undone', {c:num}), at:Date.now()}; dmScanFeedback('warn'); ivQueueStats(); ivRender();
    }
    /** Quick tags / years / voice change the last binder (debounced: one record version per burst of taps). */
    function ivAmend(fn){
      const b = IV.last; if (!b) return;
      const cur = Object.assign({}, ivRecent()[b.short_code] || b); if (cur._gone) return;
      fn(cur); cur.updated_at = ivTs(cur.updated_at); ivRecentPut(cur); IV.last = cur;
      clearTimeout(IV.amendTimer);
      IV.amendTimer = setTimeout(() => { const c = ivRecent()[cur.short_code]; if (c && !c._gone) ivEnqueue({kind:'rec', recs:[c], amend:true}); }, IV_AMEND_MS);
    }
    function ivToggleTag(tag){
      const on = !IV.tags.has(tag); if (on) IV.tags.add(tag); else IV.tags.delete(tag);
      ivAmend(c => { const list = invNormTags(String(c.tags || '').split(',')); const i = list.findIndex(x => x.toLowerCase() === tag.toLowerCase()); if (on && i < 0) list.push(tag); if (!on && i >= 0) list.splice(i, 1); c.tags = list.join(', '); });
      ivPrefsSave(); ivRender();
    }
    function ivToggleYear(y){
      y = +y; const i = IV.years.indexOf(y); if (i >= 0) IV.years.splice(i, 1); else IV.years.push(y);
      if (IV.years.length > 2){ const a = IV.years.slice().sort((p, q) => p - q); IV.years = [a[0], a[a.length - 1]]; }
      ivAmend(c => { c.ref_year = ivYearStr(IV.years); });
      ivPrefsSave(); ivRender();
    }
    function ivApplyVoice(text){
      const v = invParseVoice(text, IV.proj.inv); if (!v.text) return;
      v.tags.forEach(tg => IV.tags.add(tg)); if (v.years) IV.years = v.years[0] === v.years[1] ? [v.years[0]] : v.years;
      ivAmend(c => {
        c.inv = Object.assign({}, c.inv, {voice:v.text, st:c.inv && c.inv.st === 'captured' ? 'proposed' : c.inv && c.inv.st || 'proposed'});
        if (!c.binder_title) c.binder_title = v.text.slice(0, 160); else c.notes = (c.notes ? c.notes + '\n' : '') + v.text;
        c.tags = invTagsJoin(c.tags, v.tags); if (v.years) c.ref_year = ivYearStr(v.years);
      });
      ivListSet(IV.last && IV.last.short_code, {title:v.text, st:'proposed'});
      ivRender();
    }

    /* ---------------- v12.12: second photo (first page, when the spine says nothing) ---------------- */
    async function ivPagePhoto(){
      const b = IV.last; if (!b || !IV.cam || !IV.cam.video) return;
      const photo = invGrabFrame(IV.cam.video, 1600, 0.75); if (!photo) return;
      const pid = 'ph-' + b.short_code + '-p' + Date.now().toString(36);
      try { await IVDB.put(pid, {id:pid, mime:'image/jpeg', data:photo, at:nowISO(), binder_id:b.id, project:IV.pid}); } catch(e){ return; }
      ivAmend(c => { c.inv = Object.assign({}, c.inv, {ph2:pid}); });
      clearTimeout(IV.amendTimer); const c = ivRecent()[b.short_code]; if (c && !c._gone) ivEnqueue({kind:'rec', recs:[c], amend:true});   // the photo leaves now
      if (IV.proj.inv.ai) ivEnqueue({kind:'ai', code:b.short_code, ph:pid, voice:(b.inv && b.inv.voice) || '', hints:{tags:IV.proj.inv.tags, year_from:IV.proj.inv.year_from, year_to:IV.proj.inv.year_to, client:IV.proj.inv.client, kind:'page'}});
      ivListSet(b.short_code, {thumb:photo, ai:IV.proj.inv.ai ? 'wait' : ''});
      ivSay('ok', t('iv_page_ok', {c:b.speaking_code})); ivRender();
    }

    /* ---------------- v12.12: verification of a box (mode 6) ---------------- */
    /* IV.verify = {map: code → {l, n, d}, box:{id, code, short_code}, seen:[codes], expected:[codes], moved:{}} */
    async function ivVerifyStart(){
      IV.verify = {loading:true, map:new Map(), box:null, seen:[], expected:[], err:''}; ivRender();
      try {
        const r = await SC.P.data.invGet(IV.pid, {detail:true});
        IV.verify.map = new Map(((r && r.scanned) || []).map(x => [x.c, x]));
      } catch(e){ IV.verify.err = e && e.code === 'offline' ? t('sc_srv_off') : String(e && (e.message || e.code) || e); }
      // what this phone captured and has not sent yet counts too
      ivOutbox().forEach(j => { if (j.kind === 'rec') (j.recs || []).forEach(d => { if (d._type !== 'location') IV.verify.map.set(d.short_code, Object.assign({t:'b', c:d.short_code, l:d.location_id || '', n:d.speaking_code || ''}, invLevel(d) === 'doc' ? {d:1} : {})); }); });
      IV.verify.loading = false; ivRender();
    }
    function ivBoxNum(locId){ const x = invParseCode(String(locId || '').replace(/^inv-/, '')); return x && x.kind === 'box' ? invNumber(IV.proj.inv, 'box', x.n) : (locId ? String(locId) : ''); }
    function ivVerifyResult(){
      const V = IV.verify, where = {};
      V.seen.forEach(c => { const m = V.map.get(c); if (m && !V.expected.includes(c)) where[c] = m.l ? ivBoxNum(m.l) : '—'; });
      return invVerify(V.expected, V.seen, where);
    }
    function ivVerifyBox(code, n){
      const V = IV.verify; if (!V || V.loading) return;
      if (V.box && V.box.short_code === code){ ivSay('switch', t('iv_v_box', {c:V.box.code})); return ivRenderLive(); }
      if (V.box && V.seen.length) ivVerifyClose(true);
      const id = 'inv-' + code, num = invNumber(IV.proj.inv, 'box', n);
      V.box = {id, code:num, short_code:code}; V.seen = [];
      V.expected = Array.from(V.map.values()).filter(x => x.t === 'b' && !x.d && x.l === id).map(x => x.c).sort();
      ivSay('switch', t('iv_v_box', {c:num})); ivRender();
    }
    function ivVerifyScan(code, n, via){
      const V = IV.verify; if (!V || V.loading) return;
      const num = invNumber(IV.proj.inv, 'binder', n);
      if (!V.box){ ivSay('warn', t('iv_v_need_box')); return ivRenderLive(); }
      if (V.seen.includes(code)){ ivSay('warn', t('iv_v_again', {c:num})); return ivRenderLive(); }
      const m = V.map.get(code);
      if (m && m.d){ ivSay('warn', t('iv_v_doc', {c:num})); return ivRenderLive(); }
      V.seen.push(code);
      if (V.expected.includes(code)) ivSay('ok', t('iv_v_found', {c:num}));
      else if (m && m.l) ivSay('err', t('iv_v_mis', {c:num, b:ivBoxNum(m.l)}));
      else if (m) ivSay('warn', t('iv_v_nobox', {c:num}));
      else ivSay('warn', t('iv_v_unknown', {c:num}));
      ivRender();
    }
    /** Move a binder recorded elsewhere into the box being checked (newest version, then the outbox). */
    async function ivVerifyMove(code){
      const V = IV.verify; if (!V || !V.box || !ivCan()) return;
      let cur = ivRecent()[code] || null;
      try { const srv = await SC.P.data.invGetBinder(code); if (srv && (!cur || String(srv.updated_at || '') >= String(cur.updated_at || ''))) cur = Object.assign({}, srv, {_type:'binder'}); } catch(e){ if (!cur) { ivSay('err', t('iv_err', {m:e.code || e.message})); return ivRenderLive(); } }
      if (!cur){ ivSay('err', t('iv_v_unknown', {c:code})); return ivRenderLive(); }
      const from = cur.location_id ? ivBoxNum(cur.location_id) : '—';
      const rec = Object.assign({}, cur, {_type:'binder', location_id:V.box.id, updated_at:ivTs(cur.updated_at)});
      rec.inv = Object.assign({}, rec.inv || {}, {box:V.box.code});
      ivRecentPut(rec);
      ivEnqueue({kind:'rec', recs:[rec], entry:ivEntry('inventory.move', {type:'binder', id:rec.id, code:rec.speaking_code || code}, t('iv_log_move', {c:rec.speaking_code || code, b:V.box.code}), {project:IV.pid, short_code:code, from, to:V.box.code, via:'verify'})});
      const m = V.map.get(code) || {t:'b', c:code}; m.l = V.box.id; V.map.set(code, m);
      if (!V.expected.includes(code)) V.expected.push(code);
      ivSay('ok', t('iv_v_moved', {c:rec.speaking_code || code, b:V.box.code})); ivRender();
    }
    /** Capture a label not inventoried yet into the box being checked. */
    async function ivVerifyCapture(code){
      const V = IV.verify, x = invParseCode(code); if (!V || !V.box || !x) return;
      const keep = IV.box; IV.box = {id:V.box.id, code:V.box.code, short_code:V.box.short_code, n:(invParseCode(V.box.short_code) || {}).n || 0};
      const vv = IV.verify; IV.verify = null;
      try { await ivCapture(code, x.n, 'verify'); } finally { IV.verify = vv; IV.box = keep; }
      const b = ivRecent()[code]; if (b && !b._gone){ V.map.set(code, {t:'b', c:code, l:V.box.id, n:b.speaking_code}); if (!V.expected.includes(code)) V.expected.push(code); }
      ivRender();
    }
    /** Close the check: one activity-log line with the result (the PC lists it in the project and in the report). */
    function ivVerifyClose(quiet){
      const V = IV.verify; if (!V || !V.box) return;
      const r = ivVerifyResult(), nm = (c) => { const m = V.map.get(c); return (m && m.n) || ((x) => x ? invNumber(IV.proj.inv, 'binder', x.n) : c)(invParseCode(c)); };
      const sum = {b:V.box.code, f:r.found.length, e:V.expected.length, m:r.missing.length, x:r.misplaced.length};
      ivEnqueue({kind:'rec', recs:[], entry:ivEntry('inventory.verify', {type:'location', id:V.box.id, code:V.box.code}, t('iv_log_verify', sum),
        {project:IV.pid, box:V.box.code, box_id:V.box.id, expected:V.expected.length, found:r.found.length, missing:r.missing.map(nm), misplaced:r.misplaced.map(x => ({c:nm(x.c), from:x.from})), unknown:r.unknown.map(nm)})});
      if (!quiet) ivSay('switch', t('iv_v_done', sum));
      V.box = null; V.seen = []; V.expected = [];
      if (!quiet) ivRender();
    }

    /* ---------------- v12.12: Bluetooth / USB scanner (keyboard wedge) ---------------- */
    /* A scanner types the QR text very fast and presses Enter. Keys typed outside any field, less than 60 ms apart, are
       one reading; a person typing is slower and is ignored here (the code field below works as before). */
    const HID = {buf:'', at:0};
    document.addEventListener('keydown', (e) => {
      if (SC.view !== 'inv' || !IV.proj) return;
      const tg = e.target, tag = tg && tg.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
      const now = Date.now();
      if (e.key === 'Enter'){
        const v = HID.buf; HID.buf = '';
        if (v.length >= 8 && now - HID.at < 200){ e.preventDefault(); ivHandle(v, 'phone-hid'); }
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (now - HID.at > 60) HID.buf = '';
      HID.buf += e.key; HID.at = now;
    }, true);

    /* ---------------- voice (Web Speech API) ---------------- */
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    function ivVoiceStart(){
      if (!SR){ IV.msg = {kind:'warn', text:t('iv_voice_no'), at:Date.now()}; return ivRenderLive(); }
      if (IV.listening) return;
      try {
        rec = new SR(); rec.lang = S.lang === 'en' ? 'en-GB' : 'it-IT'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
        let got = '';
        rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) got += (got ? ' ' : '') + e.results[i][0].transcript; };
        rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted'){ IV.msg = {kind:'warn', text:t('iv_voice_err', {m:e.error}), at:Date.now()}; } };
        rec.onend = () => { IV.listening = false; rec = null; if (got) ivApplyVoice(got); else ivRender(); };
        rec.start(); IV.listening = true; ivRender();
      } catch(e){ IV.listening = false; IV.msg = {kind:'warn', text:t('iv_voice_err', {m:e.message || e}), at:Date.now()}; ivRender(); }
    }
    function ivVoiceStop(){ if (rec) try { rec.stop(); } catch(e){} }

    /* ---------------- camera + wake lock ---------------- */
    async function ivCamToggle(){
      if (IV.cam){ ivCamStop(); return ivRender(); }
      const cam = new DMCamScanner({dedupeMs:IV.proj && IV.proj.inv.mode === 'station' ? 8000 : 4000, onCode:(txt) => (typeof onTagScanned === 'function' && onTagScanned(txt, 'qr')) || ivHandle(txt, 'phone-camera')});
      IV.cam = cam;
      try { await cam.start(); try { if (navigator.wakeLock) IV.wake = await navigator.wakeLock.request('screen'); } catch(e){} ivRender(); }
      catch(e){ IV.cam = null; try { cam.stop(); } catch(x){} IV.msg = {kind:'err', text:t('iv_cam_err', {m:e && e.message || e}), at:Date.now()}; ivRender(); }
    }
    function ivCamStop(){ if (IV.cam){ try { IV.cam.stop(); } catch(e){} IV.cam = null; } if (IV.wake){ try { IV.wake.release(); } catch(e){} IV.wake = null; } }
    try { if (typeof TAG_SCAN_HANDLERS !== 'undefined' && Array.isArray(TAG_SCAN_HANDLERS) && !TAG_SCAN_HANDLERS.some(h => h && h.id === 'inventory'))
      TAG_SCAN_HANDLERS.unshift({id:'inventory', active:() => SC.view === 'inv' && !!IV.proj, handle:(code, via) => { ivHandle(code, via === 'nfc' ? 'phone-nfc' : via === 'keyboard' ? 'phone-typed' : 'phone-camera'); return true; }}); } catch(e){}

    /* ---------------- rendering ---------------- */
    function ivQueueHTML(){
      const q = IV.q, cls = q.err ? 'err' : q.wait ? 'warn' : q.send ? 'busy' : 'ok';
      const txt = q.err ? t('iv_q_err', {n:q.err, m:q.errMsg}) : q.wait ? t('iv_q_wait', {n:q.wait + q.send}) : q.send ? t('iv_q_send', {n:q.send}) : t('iv_q_ok');
      const warn = IV.full ? t('iv_full') : IV.auth ? t('iv_q_auth') : IV.low ? t('iv_low') : '';
      return '<div class="iv-q-w" id="iv-q"><div class="iv-q ' + (IV.full ? 'err' : cls) + '" role="status">' + sic(q.err || IV.full ? 'alert' : q.wait ? 'cloud' : 'check') + '<button type="button" class="iv-q-t" data-s="iv-health" id="iv-q-t" aria-expanded="' + (IV.health ? 'true' : 'false') + '">' + esc(txt) + '</button>' + (q.err || q.wait ? '<button type="button" class="iv-q-retry" data-s="iv-retry">↻</button>' : '') + '</div>' +
        (warn ? '<div class="iv-q-warn" id="iv-q-warn">' + esc(warn) + '</div>' : '') + ivHealthHTML() + '</div>';
    }
    function ivMsgHTML(){ const m = IV.msg; return m && Date.now() - m.at < 15000 ? '<div class="iv-flash ' + esc(m.kind) + '" id="iv-flash" role="status">' + sic(m.kind === 'ok' ? 'check' : m.kind === 'switch' ? 'box' : 'alert') + '<span>' + esc(m.text) + '</span></div>' : '<div class="iv-flash idle" id="iv-flash">' + esc(t('iv_cam_hint')) + '</div>'; }
    function ivBoxHTML(){
      return IV.box ? '<div class="iv-box" id="iv-box">' + sic('box') + '<div><b>' + esc(IV.box.code) + '</b><small>' + esc(ivBoxCount() === 1 ? t('iv_box_1') : t('iv_box_n', {n:ivBoxCount()})) + '</small></div></div>'
        : '<div class="iv-box none" id="iv-box">' + sic('box') + '<div><b>' + esc(t('iv_box')) + '</b><small>' + esc(t('iv_nobox')) + '</small></div></div>';
    }
    function ivLastHTML(){
      const x = IV.list.slice().reverse().find(y => !y.undone);
      if (!x || !IV.last) return '<section class="iv-last empty" id="iv-last"><small>' + esc(t('iv_none')) + '</small></section>';
      const b = ivRecent()[x.code] || IV.last, st = x.ai === 'run' ? 'ai' : !x.sent ? 'sending' : (b.inv && b.inv.st) || x.st;
      const page = IV.cam && !IV.verify ? '<button type="button" class="sc-btn iv-page" data-s="iv-page" id="iv-page">' + sic('cam') + esc(t('iv_page')) + '</button>' : '';
      return '<section class="iv-last' + (x.lvl === 'doc' ? ' doc' : '') + '" id="iv-last">' + (x.thumb ? '<img class="iv-thumb" src="' + esc(x.thumb) + '" alt="">' : '<div class="iv-thumb none">' + sic('qr') + '</div>') +
        '<div class="iv-last-t"><b class="iv-code" id="iv-last-code">' + esc(x.num) + '</b><span class="iv-st st-' + esc(st) + '" id="iv-last-st">' + esc(t('iv_st_' + st)) + '</span>' +
        '<div class="iv-last-f">' + esc([x.lvl === 'doc' ? t('iv_st_doc') + ' · ' + (b.inv && b.inv.folder || '') : '', b.company_name, b.binder_title, b.ref_year, b.tags].filter(Boolean).join(' · ') || '—') + '</div>' + page + '</div>' +
        (IV.undoTimer ? '<button type="button" class="iv-undo" data-s="iv-undo" id="iv-undo">' + sic('undo') + esc(t('iv_undo')) + '</button>' : '') + '</section>';
    }
    function ivYearsList(){
      const inv = IV.proj.inv, now = new Date().getFullYear();
      let lo = inv.year_from || inv.year_to || now - 11, hi = inv.year_to || inv.year_from || now;
      if (hi - lo > 40) lo = hi - 40;
      const a = []; for (let y = hi; y >= lo; y--) a.push(y); return a;
    }
    function ivControlsHTML(){
      const inv = IV.proj.inv;
      const html = ivControlsInner();
      // station and chain: the operator does not touch the phone; the controls stay one tap away
      return inv.mode === 'station' || inv.mode === 'chain' ? '<details class="iv-more" id="iv-more"><summary>' + esc(t('iv_more')) + '</summary>' + html + '</details>' : html;
    }
    function ivFolderHTML(){
      const inv = IV.proj.inv; if (!inv.doc) return '';
      const n = IV.folder ? IV.list.filter(x => !x.undone && x.folder === IV.folder.id).length : 0;
      const jolly = inv.batches.some(b => b.kind === 'any') ? '<div class="iv-jolly" id="iv-jolly"><small>' + esc(t('iv_jolly')) + '</small><div class="sc-seg">' + ['binder', 'doc'].map(k => '<button type="button" data-s="iv-jolly" data-v="' + k + '" class="' + (IV.jolly === k ? 'on' : '') + '" aria-pressed="' + (IV.jolly === k) + '">' + esc(t(k === 'doc' ? 'iv_j_doc' : 'iv_j_binder')) + '</button>').join('') + '</div></div>' : '';
      return '<div class="iv-folder' + (IV.folder ? '' : ' none') + '" id="iv-folder">' + sic('inv') + '<div><b>' + esc(IV.folder ? IV.folder.code : t('iv_folder')) + '</b><small>' + esc(IV.folder ? (n === 1 ? t('iv_folder_1') : t('iv_folder_n', {n})) : t('iv_need_folder')) + '</small></div>' +
        (IV.folder ? '<button type="button" class="sc-btn" data-s="iv-folder-close" id="iv-folder-close">' + esc(t('iv_folder_close')) + '</button>' : '') + '</div>' + jolly;
    }
    function ivVerifyHTML(){
      const V = IV.verify, nm = (c) => { const m = V.map.get(c); const x = invParseCode(c); return (m && m.n) || (x ? invNumber(IV.proj.inv, 'binder', x.n) : c); };
      if (V.loading) return '<section class="sc-card iv-verify" id="iv-verify"><p class="sc-muted">' + esc(t('iv_v_load')) + '</p></section>';
      if (V.err) return '<section class="sc-card iv-verify" id="iv-verify"><div class="sc-msg err">' + esc(t('iv_v_err', {m:V.err})) + '</div><button type="button" class="sc-btn sc-block" data-s="iv-verify-exit">' + esc(t('iv_v_exit')) + '</button></section>';
      const r = V.box ? ivVerifyResult() : {found:[], missing:[], misplaced:[], unknown:[]};
      const k = (n, lab, cls) => '<div class="' + (cls || '') + '"><b>' + n + '</b><small>' + esc(t(lab)) + '</small></div>';
      const mis = r.misplaced.map(x => '<li><span class="iv-l-code">' + esc(nm(x.c)) + '</span><span class="iv-l-t">' + esc(x.from) + '</span><button type="button" class="sc-btn" data-s="iv-v-move" data-c="' + esc(x.c) + '">' + esc(t('iv_v_move')) + '</button></li>').join('');
      const unk = r.unknown.map(c => '<li><span class="iv-l-code">' + esc(nm(c)) + '</span><span class="iv-l-t">' + esc(t('iv_v_k_unknown')) + '</span><button type="button" class="sc-btn" data-s="iv-v-cap" data-c="' + esc(c) + '">' + esc(t('iv_v_cap')) + '</button></li>').join('');
      return '<section class="sc-card iv-verify" id="iv-verify"><h2>' + sic('check') + esc(V.box ? t('iv_v_box', {c:V.box.code}) : t('iv_v_h')) + '</h2>' + (V.box ? '' : '<p class="sc-muted">' + esc(t('iv_v_p')) + '</p>') +
        (V.box ? '<div class="iv-vk" id="iv-vk">' + k(r.found.length + ' / ' + V.expected.length, 'iv_v_k_found', 'ok') + k(r.missing.length, 'iv_v_k_missing', r.missing.length ? 'warn' : '') + k(r.misplaced.length, 'iv_v_k_mis', r.misplaced.length ? 'err' : '') + k(r.unknown.length, 'iv_v_k_unknown', r.unknown.length ? 'warn' : '') + '</div>' +
          (mis ? '<ul class="iv-vl" id="iv-v-mis">' + mis + '</ul>' + (r.misplaced.length > 1 ? '<button type="button" class="sc-btn sc-block" data-s="iv-v-move-all">' + esc(t('iv_v_move_all', {n:r.misplaced.length})) + '</button>' : '') : '') +
          (unk ? '<ul class="iv-vl" id="iv-v-unk">' + unk + '</ul>' : '') +
          (r.missing.length ? '<details class="iv-more" id="iv-v-missing"><summary>' + esc(t('iv_v_missing')) + ' (' + r.missing.length + ')</summary><ul class="iv-vl">' + r.missing.map(c => '<li><span class="iv-l-code">' + esc(nm(c)) + '</span></li>').join('') + '</ul></details>' : '') +
          '<button type="button" class="sc-btn sc-primary sc-block" data-s="iv-verify-close" id="iv-verify-close">' + sic('check') + esc(t('iv_v_close')) + '</button>' : '') +
        '<button type="button" class="sc-btn sc-block" data-s="iv-verify-exit" id="iv-verify-exit">' + esc(t('iv_v_exit')) + '</button></section>';
    }
    function ivControlsInner(){
      const inv = IV.proj.inv;
      return '<section class="iv-ctl"><h2>' + sic('tag') + esc(t('iv_tags')) + '</h2><div class="iv-tags" id="iv-tags">' + inv.tags.map(tg => '<button type="button" class="iv-tag' + (IV.tags.has(tg) ? ' on' : '') + '" data-s="iv-tag" data-v="' + esc(tg) + '" aria-pressed="' + IV.tags.has(tg) + '">' + esc(tg) + '</button>').join('') + '</div>' +
        '<h2>' + esc(t('iv_years')) + '</h2><div class="iv-years" id="iv-years">' + ivYearsList().map(y => '<button type="button" class="iv-year' + (IV.years.includes(y) ? ' on' : '') + '" data-s="iv-year" data-v="' + y + '" aria-pressed="' + IV.years.includes(y) + '">' + y + '</button>').join('') + '</div>' +
        '<label class="iv-keep"><input type="checkbox" data-s="iv-keep" id="iv-keep"' + (IV.keep ? ' checked' : '') + '> ' + esc(t('iv_keep')) + '</label>' +
        '<button type="button" class="iv-mic' + (IV.listening ? ' on' : '') + '" data-s="iv-mic" id="iv-mic">' + sic('mic') + '<span>' + esc(IV.listening ? t('iv_voice_on') : t('iv_voice')) + '</span></button>' +
        '<form class="iv-note" data-s="iv-note-form"><input id="iv-note" autocomplete="off" placeholder="' + esc(t('iv_note_ph')) + '"><button type="submit" class="sc-btn">OK</button></form></section>';
    }
    function ivListHTML(){
      const L = IV.list.filter(x => !x.undone).slice(-25).reverse();
      if (!L.length) return '';
      return '<section class="sc-card iv-list"><h2>' + esc(t('iv_session', {n:IV.list.filter(x => !x.undone).length})) + ' · ' + esc(t('iv_total', {n:ivTotal()})) + ivPaceHTML() + '</h2><ul id="iv-list">' +
        L.map(x => { const b = ivRecent()[x.code] || {}, st = x.ai === 'run' ? 'ai' : !x.sent ? 'sending' : (b.inv && b.inv.st) || x.st;
          return '<li' + (x.lvl === 'doc' ? ' class="doc"' : '') + '><span class="iv-l-code">' + esc(x.num) + '</span><span class="iv-l-t">' + esc((x.lvl === 'doc' ? '↳ ' : '') + (x.title || b.binder_title || x.box || '')) + '</span><span class="iv-st st-' + esc(st) + '">' + esc(t('iv_st_' + st)) + '</span></li>'; }).join('') + '</ul></section>';
    }
    function ivHTML(){
      const P = IV.proj, inv = P.inv;
      const V = IV.verify, hint = !V && (inv.mode === 'station' || inv.mode === 'chain') ? '<div class="sc-msg ok iv-mode-hint" id="iv-mode-hint">' + esc(t(inv.mode === 'station' ? 'iv_station_hint' : 'iv_chain_hint')) + '</div>' : '';
      return '<main class="sc-main iv-main' + (inv.mode === 'station' && !V ? ' iv-station' : '') + '" id="iv-main"><div class="iv-head"><div><h1 id="iv-name">' + esc(P.name || inv.code) + '</h1><small>' + esc(inv.code) + (inv.client ? ' · ' + esc(inv.client) : '') + ' · ' + esc(V ? t('iv_v_h') : t('iv_mode_' + inv.mode)) + '</small></div>' +
          '<div class="iv-head-b">' + (V ? '' : '<button type="button" class="sc-btn" data-s="iv-verify" id="iv-verify-b">' + sic('check') + esc(t('iv_v_start')) + '</button>') + '<button type="button" class="sc-btn" data-s="iv-done" id="iv-done">' + esc(t('iv_done')) + '</button></div></div>' +
        ivQueueHTML() + (inv.ai || V ? '' : '<div class="iv-ai-off sc-muted">' + esc(t('iv_ai_off')) + '</div>') + hint +
        (V ? '' : ivBoxHTML() + ivFolderHTML()) + '<div class="iv-cam' + (IV.cam ? ' on' : '') + '" id="iv-video">' + (IV.cam ? '' : '<button type="button" class="sc-btn sc-primary sc-block" data-s="iv-cam" id="iv-cam">' + sic('cam') + esc(t('iv_cam_on')) + '</button>') + '</div>' +
        ivMsgHTML() + (V ? ivVerifyHTML() : ivLastHTML() + ivControlsHTML()) +
        (IV.cam ? '<button type="button" class="sc-btn sc-block" data-s="iv-cam" id="iv-cam-off">' + sic('stop') + esc(t('iv_cam_off')) + '</button>' : '') +
        '<form class="sa-typed" data-s="iv-typed-form"><label class="sc-field"><span>' + esc(t('iv_typed')) + '</span><input id="iv-typed" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="' + esc(t('iv_typed_ph')) + '"></label></form>' +
        (V ? '' : ivListHTML()) + '</main>';
    }
    function ivPickHTML(){
      const L = IV.projects || [];
      return '<main class="sc-main"><section class="sc-card iv-pick"><div class="sc-lock">' + sic('inv') + '</div><h1>' + esc(t('iv_pick_h')) + '</h1><p class="sc-muted">' + esc(L.length ? t('iv_pick_p') : t('iv_pick_none')) + '</p>' + scMsgHTML() +
        '<div class="sc-stack" id="iv-pick">' + L.map(p => '<button type="button" class="sc-btn sc-block iv-pick-b" data-s="iv-pick" data-id="' + esc(p.id) + '"><b>' + esc(p.name || p.code) + '</b><small>' + esc([p.code, p.client].filter(Boolean).join(' · ')) + '</small></button>').join('') + '</div></section></main>';
    }
    /** Fast partial refresh (keeps the video playing). */
    function ivRenderLive(){
      if (SC.view !== 'inv'){ return; }
      const swap = (id, html) => { const el = document.getElementById(id); if (el) el.outerHTML = html; };
      swap('iv-flash', ivMsgHTML());
      if (IV.verify){ swap('iv-verify', ivVerifyHTML()); ivQueueStats(); return; }
      swap('iv-box', ivBoxHTML()); swap('iv-last', ivLastHTML()); swap('iv-folder', ivFolderHTML());
      const l = document.querySelector('.iv-list'); if (l) l.outerHTML = ivListHTML(); else { const m = document.getElementById('iv-main'); if (m && IV.list.length) m.insertAdjacentHTML('beforeend', ivListHTML()); }
      ivQueueStats();
    }
    function ivRender(){ if (SC.view === 'inv') scRender(); }

    /* ---------------- routing ---------------- */
    const scRouteBase = scRoute;
    scRoute = async function(){
      const pid = ivParam();
      SC.user = SC.P.auth.currentUser();
      if (!pid || !SC.user || (SC.P.server && !DocMapVault.srvToken())){
        if (SC.view === 'inv' || SC.view === 'invpick') ivCamStop();
        await scRouteBase();
        if (SC.view === 'notfound' || SC.view === 'locnf') ivLabelHint();
        return;
      }
      try {
        if (pid === '1' || pid === 'pick'){ IV.projects = await SC.P.data.invList(); SC.view = 'invpick'; return scRender(); }
        if (!(await ivOpen(pid))){ IV.projects = await SC.P.data.invList(); SC.msg = {kind:'warn', text:t('sc_nf_h')}; SC.view = 'invpick'; return scRender(); }
      } catch(e){
        if (SC.P.server && e.code === 'unauthorized'){ SC.view = 'token'; SC.loginErr = t('sc_e_token'); return scRender(); }
        SC.view = 'error'; SC.msg = {kind:'err', text:e.code === 'offline' ? t('sc_srv_off') : t('sc_err', {m:e.message || e.code})}; return scRender();
      }
      SC.view = 'inv'; scRender(); ivFlushSoon();
    };
    /** "Not found" page of a project label not scanned yet: offer to open its inventory. */
    async function ivLabelHint(){
      const x = invParseCode(SC.params.qr || ''); if (!x) return;
      let p = null; try { p = (await SC.P.data.invList()).find(y => y.prefix === x.prefix) || null; } catch(e){ p = null; }
      if (!p) return;
      IV.label = p;
      const box = document.querySelector('#sc-notfound, .sc-main .sc-card'); if (!box || document.getElementById('iv-open')) return;
      box.insertAdjacentHTML('afterbegin', '<div class="sc-msg ok iv-hint">' + sic('inv') + '<span>' + esc(t('iv_label_of', {p:p.name || p.code})) + '</span></div><button type="button" class="sc-btn sc-primary sc-block" data-s="iv-go" data-id="' + esc(p.id) + '" id="iv-open">' + sic('scan') + esc(t('iv_open', {p:p.name || p.code})) + '</button>');
    }
    function ivGo(pid){ const qs = new URLSearchParams(location.search); ['q', 'qr', 'code'].forEach(k => qs.delete(k)); qs.set('inv', pid); history.pushState(null, '', 'scan.html?' + qs.toString()); SC.params = scParams(); IV.list = []; IV.last = null; scRoute(); }

    const scRenderBase = scRender;
    scRender = function(){
      if (SC.view === 'inv' || SC.view === 'invpick'){
        document.documentElement.lang = S.lang; document.title = t('iv_title');
        const y = window.scrollY;
        document.getElementById('app').innerHTML = scHeader() + (SC.view === 'inv' && IV.proj ? ivHTML() : ivPickHTML());
        if (SC.view === 'inv' && IV.cam) IV.cam.attach(document.getElementById('iv-video'));
        window.scrollTo(0, y);
        return;
      }
      ivCamStop();
      scRenderBase();
    };

    /* ---------------- events ---------------- */
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-s]'); if (!el) return;
      const a = el.dataset.s; if (!/^iv-/.test(a) || a === 'iv-keep') return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'iv-pick' || a === 'iv-go') return ivGo(el.dataset.id);
      if (a === 'iv-cam') return ivCamToggle();
      if (a === 'iv-undo') return ivUndo();
      if (a === 'iv-page') return ivPagePhoto();
      if (a === 'iv-jolly'){ IV.jolly = el.dataset.v === 'doc' ? 'doc' : 'binder'; ivPrefsSave(); return ivRender(); }
      if (a === 'iv-folder-close'){ IV.folder = null; ivPrefsSave(); return ivRender(); }
      if (a === 'iv-verify') return ivVerifyStart();
      if (a === 'iv-verify-close') return ivVerifyClose(false);
      if (a === 'iv-verify-exit'){ if (IV.verify && IV.verify.box && IV.verify.seen.length) ivVerifyClose(true); IV.verify = null; return ivRender(); }
      if (a === 'iv-v-move') return ivVerifyMove(el.dataset.c);
      if (a === 'iv-v-move-all'){ const r = ivVerifyResult(); return r.misplaced.reduce((p, x) => p.then(() => ivVerifyMove(x.c)), Promise.resolve()); }
      if (a === 'iv-v-cap') return ivVerifyCapture(el.dataset.c);
      if (a === 'iv-tag') return ivToggleTag(el.dataset.v);
      if (a === 'iv-year') return ivToggleYear(el.dataset.v);
      if (a === 'iv-mic'){ if (Date.now() - pttAt < 1500) return; if (IV.listening) ivVoiceStop(); else ivVoiceStart(); return; }   // pointer presses are handled below
      if (a === 'iv-retry'){ IV.auth = false; ivOutboxSet(ivOutbox().map(j => { delete j.err; delete j.wait; delete j.inflight; delete j.next; return j; })); return ivFlushSoon(); }
      if (a === 'iv-health'){ IV.health = !IV.health; return ivRenderLive(); }
      if (a === 'iv-rescue') return ivRescueSave();
      if (a === 'iv-done'){ ivCamStop(); const qs = new URLSearchParams(location.search); qs.set('inv', '1'); history.pushState(null, '', 'scan.html?' + qs.toString()); SC.params = scParams(); return scRoute(); }
    }, true);
    // push-to-talk: hold the button (pointer) — a tap toggles (handled by the click above)
    // push-to-talk: press = listen; released after 0.6 s = stop (hold mode); a short tap keeps listening until the
    // phrase ends by itself; pressing again while listening stops. The click that follows a press is ignored.
    let pttAt = 0, pttDown = 0;
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-s="iv-mic"]'); if (!el) return;
      pttAt = Date.now(); if (IV.listening){ pttDown = 0; ivVoiceStop(); } else { pttDown = pttAt; ivVoiceStart(); }
    }, true);
    document.addEventListener('pointerup', () => { if (!pttDown) return; const held = Date.now() - pttDown; pttDown = 0; pttAt = Date.now(); if (held > 600) ivVoiceStop(); }, true);
    document.addEventListener('change', (e) => { const el = e.target; if (el && el.dataset && el.dataset.s === 'iv-keep'){ IV.keep = !!el.checked; ivPrefsSave(); } }, true);
    document.addEventListener('submit', (e) => {
      const f = e.target; if (f.dataset.s !== 'iv-typed-form' && f.dataset.s !== 'iv-note-form') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (f.dataset.s === 'iv-note-form'){ const i = document.getElementById('iv-note'), v = i ? i.value : ''; if (i) i.value = ''; if (String(v).trim()) ivApplyVoice(v); return; }
      const i = document.getElementById('iv-typed'), v = i ? i.value : ''; if (i){ i.value = ''; setTimeout(() => { const j = document.getElementById('iv-typed'); if (j) j.focus(); }, 30); }
      if (String(v).trim()) ivHandle(v, 'phone-typed');
    }, true);
    window.addEventListener('online', () => { ivOutboxSet(ivOutbox().map(j => { delete j.wait; delete j.next; return j; })); ivFlushSoon(); });
    setInterval(ivWake, 15000);
    window.addEventListener('pagehide', ivCamStop);
    document.addEventListener('visibilitychange', async () => { if (!document.hidden && IV.cam && !IV.wake && navigator.wakeLock) try { IV.wake = await navigator.wakeLock.request('screen'); } catch(e){} });
    // jobs left inflight by a closed page are retried
    try { const q = ivOutbox(); if (q.some(j => j.inflight)) ivOutboxSet(q.map(j => { delete j.inflight; return j; })); } catch(e){}
    window.IV_API = {ivHandle, ivOpen, ivFlush, ivUndo, ivApplyVoice, ivToggleTag, ivToggleYear, ivOutbox, ivRecent, IV_OUTBOX_LS, IV_RECENT_LS,
      ivPagePhoto, ivWake, ivPhotoSent, ivStorage, ivRescueData, ivRescueSave, IV_SENT_LS, ivVerifyStart, ivVerifyBox, ivVerifyScan, ivVerifyMove, ivVerifyCapture, ivVerifyClose, ivVerifyResult, ivLevelOf};
  })();
}
