/* =====================================================================
   DocMap 2026 — Excel (.xlsx) reader + column-mapping import step (stream C: import)

   1. XLSX reader (offline, file://): a minimal ZIP reader (central directory,
      stored + deflate entries inflated with the browser's DecompressionStream
      ('deflate-raw', Chrome/Edge ≥ 103)) and an OOXML parser for workbook.xml,
      workbook.xml.rels, sharedStrings.xml, styles.xml and worksheets/sheetN.xml.
      Result:  { sheets:[ { name, hidden, rows:[ [cell text, …], … ] } ] }
      rows[i] is the Excel row i+1 (empty rows kept as [] so row numbers match Excel);
      every cell is a string: text exactly as typed (leading zeros, inner spaces,
      line breaks "\n"), numbers without float artefacts, dates "YYYY-MM-DD".
   2. Column mapping: every tabular import (xlsx, CSV file, pasted CSV/TSV) opens
      a mapping step unless the header is DocMap's own standard one.
      UI.imap = {
        open,          // mapping screen visible (true) or already confirmed (false)
        name, kind,    // file name, 'xlsx' | 'csv' | 'paste' | 'json'
        sheets:[{name, hidden, rows}], sheet,   // current sheet index
        delim,         // CSV delimiter ('' for xlsx)
        headerRow,     // index in rows of the header row, -1 = no header row
        target,        // 'binders' | 'clients'
        fields:[],     // per source column: DocMap field key or '' (ignored)
        how:[],        // per column: 'exact' | 'fuzzy' | 'value' | 'saved' | 'user' | ''
        remembered     // true when the mapping came from S.settings.importMappings
      }
      Remembered mappings (persisted with the state, no extra storage):
      S.settings.importMappings = { "<normalised headers joined by |>": {target, fields:[…], at:ISO} }
      Confirming turns mapped rows into records keyed by DocMap field names and feeds
      the existing pipeline: analyzeImportRecords() (binders) or analyzeClients() (clients).
   ===================================================================== */

/* ---------------- i18n ---------------- */
Object.assign(I18N.it, {
  im_h:'Importa Excel / CSV / JSON',
  im_p:'Carica un file Excel (.xlsx), un CSV o un JSON, oppure incolla il testo copiato da Excel o generato da un\'AI. Abbini le colonne e vedi un\'anteprima prima di confermare.',
  im_drop:'Trascina qui un file Excel (.xlsx), .csv o .json, oppure clicca per sceglierlo',
  im_drop_hint:'.xlsx (Excel) • .csv (; , tab) • .json (workspace / array)',
  im_paste:'…oppure incolla qui il testo CSV/JSON o le celle copiate da Excel',
  imx_title:'Abbina le colonne',
  imx_sub:'{rows} righe · {cols} colonne',
  imx_sheet:'Foglio',
  imx_sheet_rows:'{n} righe',
  imx_sheet_empty:'vuoto',
  imx_target:'Importa come',
  imx_t_binders:'Faldoni',
  imx_t_clients:'Anagrafica clienti',
  imx_hdr:'Riga di intestazione',
  imx_row:'Riga {n}',
  imx_nohdr:'La prima riga non è un\'intestazione (sono già dati)',
  imx_col:'Colonna {c}',
  imx_th_src:'Colonna nel file',
  imx_th_smp:'Esempi di valori',
  imx_th_dst:'Campo DocMap',
  imx_ignore:'— ignora —',
  imx_grp_main:'Campi del faldone',
  imx_grp_tech:'Campi tecnici',
  imx_grp_cl:'Campi anagrafica',
  imx_empty_col:'colonna vuota',
  imx_how_exact:'riconosciuta',
  imx_how_fuzzy:'nome simile',
  imx_how_value:'dai valori',
  imx_how_saved:'ricordata',
  imx_how_user:'scelta da te',
  imx_auto_info:'Abbinamento proposto automaticamente dai nomi delle colonne e dai valori: controlla e correggi i menu a destra, poi conferma.',
  imx_saved_info:'Abbinamento ricordato dall\'ultima importazione di un file con le stesse colonne. Basta confermare.',
  imx_summary:'{m} colonne importate · {i} ignorate',
  imx_need_b:'Abbina almeno «Cliente / Ragione sociale» o «Codice parlante».',
  imx_need_c:'Abbina almeno «Ragione sociale».',
  imx_dup:'Più colonne vanno nello stesso campo: i valori vengono uniti.',
  imx_confirm:'Conferma abbinamento',
  imx_cancel:'Annulla',
  imx_reset:'Ripristina abbinamento automatico',
  imx_edit:'Modifica abbinamento colonne',
  imx_bar:'Origine: {src}',
  imx_bar_std:'colonne standard DocMap',
  imx_bar_map:'{m} colonne abbinate',
  imx_reading:'Lettura del file Excel…',
  imx_xls:'Questo è un file Excel 97-2003 (.xls) o un file protetto da password, che DocMap non legge. Aprilo in Excel e usa File › Salva con nome › «Cartella di lavoro di Excel (.xlsx)» oppure «CSV (delimitato dal separatore di elenco)», poi importalo di nuovo.',
  imx_ods:'Questo è un foglio OpenDocument/Numbers. Aprilo e salvalo come .xlsx (Excel) o come CSV, poi importalo di nuovo.',
  imx_xlsb:'Il formato Excel binario (.xlsb) non è supportato: salva come .xlsx o CSV, poi importalo di nuovo.',
  imx_bad:'Il file non è un Excel .xlsx leggibile ({e}). Salva come .xlsx o CSV e riprova.',
  imx_nods:'Questo browser non sa decomprimere i file .xlsx: usa Chrome o Edge aggiornati, oppure salva come CSV.',
  imx_nosheet:'Il file Excel non contiene fogli con dati.',
  imx_fmt_xlsx:'Excel (.xlsx) · foglio «{s}»',
  imx_fmt_csv:'CSV (abbinamento colonne)'
});
Object.assign(I18N.en, {
  im_h:'Import Excel / CSV / JSON',
  im_p:'Upload an Excel file (.xlsx), a CSV or a JSON, or paste text copied from Excel or produced by an AI. You match the columns and see a preview before confirming.',
  im_drop:'Drop an Excel file (.xlsx), .csv or .json here, or click to choose',
  im_drop_hint:'.xlsx (Excel) • .csv (; , tab) • .json (workspace / array)',
  im_paste:'…or paste CSV/JSON text or cells copied from Excel here',
  imx_title:'Match the columns',
  imx_sub:'{rows} rows · {cols} columns',
  imx_sheet:'Sheet',
  imx_sheet_rows:'{n} rows',
  imx_sheet_empty:'empty',
  imx_target:'Import as',
  imx_t_binders:'Binders',
  imx_t_clients:'Client register',
  imx_hdr:'Header row',
  imx_row:'Row {n}',
  imx_nohdr:'The first row is not a header (it is already data)',
  imx_col:'Column {c}',
  imx_th_src:'Column in the file',
  imx_th_smp:'Sample values',
  imx_th_dst:'DocMap field',
  imx_ignore:'— ignore —',
  imx_grp_main:'Binder fields',
  imx_grp_tech:'Technical fields',
  imx_grp_cl:'Register fields',
  imx_empty_col:'empty column',
  imx_how_exact:'recognised',
  imx_how_fuzzy:'similar name',
  imx_how_value:'from values',
  imx_how_saved:'remembered',
  imx_how_user:'your choice',
  imx_auto_info:'Mapping proposed automatically from column names and values: check and fix the menus on the right, then confirm.',
  imx_saved_info:'Mapping remembered from the last import of a file with the same columns. Just confirm.',
  imx_summary:'{m} columns imported · {i} ignored',
  imx_need_b:'Map at least “Client / Company name” or “Speaking code”.',
  imx_need_c:'Map at least “Company name”.',
  imx_dup:'Several columns go to the same field: their values are joined.',
  imx_confirm:'Confirm mapping',
  imx_cancel:'Cancel',
  imx_reset:'Restore automatic mapping',
  imx_edit:'Edit column mapping',
  imx_bar:'Source: {src}',
  imx_bar_std:'standard DocMap columns',
  imx_bar_map:'{m} columns mapped',
  imx_reading:'Reading the Excel file…',
  imx_xls:'This is an Excel 97-2003 file (.xls) or a password-protected file, which DocMap cannot read. Open it in Excel and use File › Save As › “Excel Workbook (.xlsx)” or “CSV”, then import it again.',
  imx_ods:'This is an OpenDocument/Numbers spreadsheet. Open it and save it as .xlsx (Excel) or CSV, then import it again.',
  imx_xlsb:'The binary Excel format (.xlsb) is not supported: save as .xlsx or CSV, then import it again.',
  imx_bad:'The file is not a readable Excel .xlsx ({e}). Save as .xlsx or CSV and try again.',
  imx_nods:'This browser cannot decompress .xlsx files: use an up-to-date Chrome or Edge, or save as CSV.',
  imx_nosheet:'The Excel file contains no sheet with data.',
  imx_fmt_xlsx:'Excel (.xlsx) · sheet “{s}”',
  imx_fmt_csv:'CSV (column mapping)'
});

/* =====================================================================
   1. XLSX reader
   ===================================================================== */
const XLSX_READER = (() => {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000;
  /* Central directory → { name: {method, csize, lho, flags} } */
  function zipIndex(b){
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 5 && b[i + 3] === 6){ e = i; break; }
    if (e < 0) throw new Error('ZIP: end of central directory not found');
    const n = u16(b, e + 10), map = {};
    let o = u32(b, e + 16);
    for (let k = 0; k < n; k++){
      if (u32(b, o) !== 0x02014B50) throw new Error('ZIP: bad central directory');
      const nl = u16(b, o + 28), xl = u16(b, o + 30), cl = u16(b, o + 32);
      const name = new TextDecoder('utf-8').decode(b.subarray(o + 46, o + 46 + nl));
      map[name] = {flags:u16(b, o + 8), method:u16(b, o + 10), csize:u32(b, o + 20), lho:u32(b, o + 42)};
      o += 46 + nl + xl + cl;
    }
    return map;
  }
  async function inflateRaw(data){
    if (typeof DecompressionStream !== 'function') { const e = new Error('nods'); e.code = 'nods'; throw e; }
    const out = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function zipRead(b, ent){
    const o = ent.lho;
    if (u32(b, o) !== 0x04034B50) throw new Error('ZIP: bad local header');
    if (ent.flags & 1) throw new Error('ZIP: encrypted entry');
    const start = o + 30 + u16(b, o + 26) + u16(b, o + 28), data = b.subarray(start, start + ent.csize);   // sizes from the central directory (local ones may be 0)
    if (ent.method === 0) return data;
    if (ent.method === 8) return inflateRaw(data);
    throw new Error('ZIP: compression method ' + ent.method);
  }
  /* ---- XML helpers (namespace-agnostic: some writers prefix every tag, e.g. <x:c>) ---- */
  const parseXML = (txt) => { const d = new DOMParser().parseFromString(txt, 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('XML'); return d; };
  const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
  const kid = (node, name) => { for (const c of node.children) if (c.localName === name) return c; return null; };
  // OOXML escapes control characters as _xHHHH_ (e.g. _x000D_ = CR); _x005F_ escapes a literal "_".
  const unescX = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const nl = (s) => s.replace(/\r\n?/g, '\n');
  /* Text of a <si> / <is>: plain <t> or rich-text runs <r><t>; phonetic runs <rPh> are not part of the value. */
  function richText(node){
    if (!node) return '';
    let s = '';
    const walk = (n) => { for (const c of n.children){ if (c.localName === 'rPh' || c.localName === 'phoneticPr') continue; if (c.localName === 't') s += c.textContent; else walk(c); } };
    walk(node);
    return nl(unescX(s));
  }
  /* ---- Numbers and dates ---- */
  const BUILTIN_FMT = {0:'General', 1:'0', 2:'0.00', 3:'#,##0', 4:'#,##0.00', 9:'0%', 10:'0.00%', 11:'0.00E+00', 12:'# ?/?', 13:'# ??/??', 14:'mm-dd-yy', 15:'d-mmm-yy', 16:'d-mmm', 17:'mmm-yy', 18:'h:mm AM/PM', 19:'h:mm:ss AM/PM', 20:'h:mm', 21:'h:mm:ss', 22:'m/d/yy h:mm', 37:'#,##0 ;(#,##0)', 38:'#,##0 ;[Red](#,##0)', 39:'#,##0.00;(#,##0.00)', 40:'#,##0.00;[Red](#,##0.00)', 45:'mm:ss', 46:'[h]:mm:ss', 47:'mmss.0', 48:'##0.0E+0', 49:'@'};
  for (let i = 27; i <= 36; i++) BUILTIN_FMT[i] = 'yyyy-mm-dd';   // CJK locale date formats
  for (let i = 50; i <= 58; i++) BUILTIN_FMT[i] = 'yyyy-mm-dd';
  /* Strip quoted literals, escapes and [Red]/[$€-410] sections (keep [h] [mm] [ss] elapsed-time markers). */
  const fmtCore = (code) => String(code || '').split(';')[0].replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
  function fmtKind(code){
    if (!code || /^general$/i.test(code) || code === '@') return 'num';
    const c = fmtCore(code);
    const hasTime = /[hs]/i.test(c), hasDate = /[dy]/i.test(c) || (/m/i.test(c) && !hasTime);
    if (hasDate || hasTime) return hasDate ? (hasTime ? 'datetime' : 'date') : 'time';
    if (/%/.test(c)) return 'pct';
    if (/^0+$/.test(c)) return 'pad';         // "000" shows 7 as 007 (leading-zero codes stored as numbers)
    return 'num';
  }
  /* Excel stores 15 significant digits: 0.1+0.2 → "0.3", 43037 → "43037", never "4.3037E+4". */
  function cleanNum(v){
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    if (Number.isInteger(n) && Math.abs(n) < 1e21) return String(n);
    let s = String(parseFloat(n.toPrecision(15)));
    if (/e/i.test(s)) s = n.toFixed(20).replace(/\.?0+$/, '');
    return s;
  }
  function serialToISO(v, date1904, kind, code){
    let d = v + (date1904 ? 1462 : 0);
    if (d < 60) d += 1;                         // Excel's fictitious 1900-02-29
    const dt = new Date(Math.round((d - 25569) * 86400000));
    if (isNaN(dt)) return cleanNum(v);
    const iso = dt.toISOString(), date = iso.slice(0, 10), time = iso.slice(11, /s/i.test(fmtCore(code)) ? 19 : 16);
    if (kind === 'time') return time;
    if (kind === 'datetime' && v % 1) return date + ' ' + time;
    return date;
  }
  function numText(v, kind, code, date1904){
    if (kind === 'date' || kind === 'datetime' || kind === 'time') return serialToISO(Number(v), date1904, kind, code);
    if (kind === 'pct') return cleanNum(Number(v) * 100) + '%';
    if (kind === 'pad'){ const s = cleanNum(v); return /^\d+$/.test(s) ? s.padStart(fmtCore(code).length, '0') : s; }
    return cleanNum(v);
  }
  const colIndex = (ref) => { const m = /^([A-Z]+)/i.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const resolve = (base, target) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (base + target).split('/'), out = [];
    parts.forEach(p => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); });
    return out.join('/');
  };

  /* Read an .xlsx ArrayBuffer → { sheets:[{name, hidden, rows}] } */
  async function read(buf){
    const b = new Uint8Array(buf), zip = zipIndex(b);
    const text = async (name) => { const e = zip[name]; return e ? new TextDecoder('utf-8').decode(await zipRead(b, e)) : null; };
    const wbXml = await text('xl/workbook.xml');
    if (!wbXml) throw new Error('xl/workbook.xml missing');
    const wb = parseXML(wbXml);
    const pr = all(wb, 'workbookPr')[0], date1904 = !!pr && /^(1|true)$/.test(pr.getAttribute('date1904') || '');
    const rels = {}, relXml = await text('xl/_rels/workbook.xml.rels');
    if (relXml) all(parseXML(relXml), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = resolve('xl/', r.getAttribute('Target') || ''); });
    // shared strings
    const sst = [], sstXml = await text('xl/sharedStrings.xml');
    if (sstXml) all(parseXML(sstXml), 'si').forEach(si => sst.push(richText(si)));
    // styles: cell xf index → number format kind
    const xfKind = [], xfCode = [], stXml = await text('xl/styles.xml');
    if (stXml){
      const st = parseXML(stXml), fmts = Object.assign({}, BUILTIN_FMT);
      all(st, 'numFmt').forEach(f => { fmts[+f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
      const cx = all(st, 'cellXfs')[0];
      if (cx) Array.from(cx.children).filter(x => x.localName === 'xf').forEach(xf => { const code = fmts[+(xf.getAttribute('numFmtId') || 0)] || 'General'; xfCode.push(code); xfKind.push(fmtKind(code)); });
    }
    const sheets = [];
    for (const sh of all(wb, 'sheet')){
      const rid = sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || sh.getAttribute('r:id');
      const path = rels[rid] || ('xl/worksheets/sheet' + (sheets.length + 1) + '.xml');
      const xml = await text(path);
      const rows = xml ? sheetRows(parseXML(xml)) : [];
      sheets.push({name:sh.getAttribute('name') || ('Sheet' + (sheets.length + 1)), hidden:/hidden/i.test(sh.getAttribute('state') || ''), rows});
    }
    return {sheets};

    function sheetRows(doc){
      const rows = [];
      let ri = -1;
      all(doc, 'row').forEach(row => {
        const r = parseInt(row.getAttribute('r'), 10);
        ri = r > 0 ? r - 1 : ri + 1;
        const cells = [];
        let ci = -1;
        for (const c of row.children){
          if (c.localName !== 'c') continue;
          const ix = colIndex(c.getAttribute('r'));
          ci = ix >= 0 ? ix : ci + 1;
          const tp = c.getAttribute('t') || 'n', v = kid(c, 'v'), vs = v ? v.textContent : '';
          let s = '';
          if (tp === 's') s = sst[+vs] != null ? sst[+vs] : '';
          else if (tp === 'inlineStr') s = richText(kid(c, 'is'));
          else if (tp === 'str') s = nl(unescX(vs));
          else if (tp === 'b') s = vs === '1' ? 'TRUE' : vs === '0' ? 'FALSE' : '';
          else if (tp === 'e') s = '';                         // #N/A, #DIV/0!…: no usable value
          else if (tp === 'd') s = vs.slice(0, 10);            // ISO 8601 date cell (rare, strict OOXML)
          else if (vs !== ''){ const xi = +(c.getAttribute('s') || 0); s = numText(vs, xfKind[xi] || 'num', xfCode[xi] || 'General', date1904); }
          cells[ci] = s;
        }
        for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
        rows[ri] = cells;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return rows;
    }
  }
  return { read, zipIndex, cleanNum, fmtKind };
})();

/* =====================================================================
   2. Field catalogue (data-driven: built from HEADER_ALIASES / CLIENT_ALIASES,
      so fields added there by other modules show up automatically)
   ===================================================================== */
const IMAP_LABELS = {
  speaking_code:{it:'Codice parlante', en:'Speaking code'}, multi_code:{it:'Codice Multi', en:'Multi code'},
  company_name:{it:'Cliente / Ragione sociale', en:'Client / Company name'}, company_city:{it:'Luogo ditta', en:'Company place'},
  category:{it:'Categoria', en:'Category'}, ref_year:{it:'Anno di riferimento', en:'Reference year'}, extra_codes:{it:'Codici extra', en:'Extra codes'},
  shelf_color:{it:'Colore ripiano', en:'Shelf colour'}, binder_title:{it:'Titolo faldone', en:'Binder title'},
  room_code:{it:'Stanza / Zona', en:'Room / Zone'}, cabinet_code:{it:'Armadio', en:'Cabinet'}, shelf_code:{it:'Ripiano', en:'Shelf'}, sector_code:{it:'Settore', en:'Sector'},
  location_code:{it:'Posizione completa (es. C1-α-SX)', en:'Full location (e.g. C1-α-SX)'}, archive_state:{it:'Stato archivio', en:'Archive state'},
  contents_items:{it:'Contenuti (voci con | o a capo)', en:'Contents (items split by | or line breaks)'}, tags:{it:'Tag', en:'Tags'}, color_hex:{it:'Colore dorso (#RRGGBB)', en:'Spine colour (#RRGGBB)'},
  short_code:{it:'Short code qr7 (dm26…)', en:'qr7 short code (dm26…)'}, short_url:{it:'Short URL qr7.it', en:'qr7.it short URL'}, final_destination:{it:'Destinazione finale (URL)', en:'Final destination (URL)'},
  selected_for_print:{it:'Selezionato per la stampa', en:'Selected for printing'}, id:{it:'ID interno', en:'Internal ID'}, created_at:{it:'Data creazione', en:'Created at'}, updated_at:{it:'Data aggiornamento', en:'Updated at'},
  contacts:{it:'Contatti / referenti', en:'Contacts'}, notes:{it:'Note', en:'Notes'},
  // client register
  name:{it:'Ragione sociale', en:'Company name'}, address:{it:'Indirizzo', en:'Address'}, cap:{it:'CAP', en:'Postcode (CAP)'}, city:{it:'Località / Comune', en:'Town'},
  province:{it:'Provincia', en:'Province'}, type:{it:'Tipo', en:'Type'}
};
const IMAP_TECH = ['id','created_at','updated_at','short_url','selected_for_print'];
const IMAP_MULTI = ['contents_items','tags','notes','extra_codes','contacts','address'];      // several columns may feed these
const IMAP_MULTILINE = ['contents_items','notes','contacts'];                               // line breaks are kept
const imapLabel = (k, target) => { const l = (target === 'clients' && k === 'category') ? {it:'Categoria (es. ETS_ENC)', en:'Category (e.g. ETS_ENC)'} : (target === 'clients' && k === 'notes') ? {it:'Note (es. codice comune)', en:'Notes (e.g. town code)'} : IMAP_LABELS[k]; return l ? (l[S.lang] || l.it) : k; };
const imapFields = (target) => Object.keys(target === 'clients' ? CLIENT_ALIASES : HEADER_ALIASES);
const imapAliases = (target) => target === 'clients' ? CLIENT_ALIASES : HEADER_ALIASES;
/* Headers of DocMap's own files (full CSV backup, AI template): these skip the mapping step. */
const imapStandardSet = () => new Set(CSV_COLUMNS.concat(Object.keys(HEADER_ALIASES), csvTemplateHeader().split(';'), ['contents']));
// Generic words that alone never decide a fuzzy match ("Codice fiscale" must not become the speaking code).
const IMAP_GENERIC = new Set(['codice','code','cod','numero','num','nr','n','data','date','nome','name','tipo','type','id','descrizione','note','link','stato','state','anno','year']);

/* ---------------- Automatic mapping ---------------- */
function imapLev(a, b){
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({length:b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){ let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++){ const tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; } }
  return d[b.length];
}
/* Candidate fields for a header name, best first: [{field, score, how}]. Exact alias 100; fuzzy 60–95. */
function imapHeaderCands(header, target){
  const h = normHeader(header); if (!h) return [];
  const A = imapAliases(target), best = {};
  const take = (field, score, how) => { if (!best[field] || score > best[field].score) best[field] = {field, score, how}; };
  Object.keys(A).forEach(field => {
    const list = A[field].concat([field]);
    list.forEach(al => {
      if (h === al){ take(field, 100, 'exact'); return; }
      const hc = h.replace(/_/g, ''), ac = al.replace(/_/g, '');
      if (hc === ac){ take(field, 95, 'fuzzy'); return; }
      const ht = h.split('_'), at = al.split('_');
      // alias appears as whole words inside the header ("ragione_sociale_cliente")
      if ((at.length > 1 || (al.length >= 4 && !IMAP_GENERIC.has(al))) && ('_' + h + '_').indexOf('_' + al + '_') >= 0) take(field, 60 + Math.round(30 * at.length / ht.length), 'fuzzy');
      // typos / plurals ("contenuti" vs "contenuto", "ragionesoc")
      if (ac.length >= 5 && hc.length >= 5 && !IMAP_GENERIC.has(al)){ const d = imapLev(hc, ac); if (d === 1) take(field, 80, 'fuzzy'); else if (d === 2 && ac.length >= 8) take(field, 68, 'fuzzy'); }
      if (ac.length >= 6 && hc.length >= 4 && !IMAP_GENERIC.has(h) && ac.startsWith(hc)) take(field, 62, 'fuzzy');   // abbreviations ("ragione_soc" → ragionesociale)
    });
  });
  return Object.values(best).sort((a, b) => b.score - a.score);
}
const imapHeaderGuess = (header, target) => imapHeaderCands(header, target)[0] || null;
/* Guess from the values when the name says nothing. */
function imapValueGuess(values, target){
  const v = values.filter(x => x !== ''); if (!v.length) return null;
  const share = (re) => v.filter(x => re.test(x)).length / v.length;
  const rules = target === 'clients'
    ? [['cap', /^\d{5}$/], ['province', /^[A-Z]{2}$/], ['notes', /^[A-Z]\d{3}$/]]
    : [['short_code', /^dm26[A-Za-z0-9]{8}$/], ['short_url', /^https?:\/\/(www\.)?qr7\.it\//i], ['color_hex', /^#[0-9A-Fa-f]{6}$/], ['ref_year', /^(19|20)\d{2}$/],
       ['location_code', /^[A-Z]\d{1,2}-[^\s-]{1,4}(-(SX|CX|DX))?$/], ['archive_state', /^(CURRENT|HISTORICAL|CHECKED_OUT|corrente|storico|prelevato|archivio storico|archivio corrente)$/i], ['final_destination', /^https?:\/\//i]];
  for (const [f, re] of rules) if (share(re) >= 0.8) return {field:f, score:50, how:'value'};
  return null;
}
/* Auto-map all columns; each field is used once (except IMAP_MULTI), the best score wins. */
function imapAutoMap(heads, cols, target, noHeader){
  const n = heads.length, fields = new Array(n).fill(''), how = new Array(n).fill('');
  const cand = [];
  for (let i = 0; i < n; i++){
    const g = noHeader ? [] : imapHeaderCands(heads[i], target).filter(c => c.score >= 60);
    g.forEach(c => cand.push(Object.assign({i}, c)));            // every candidate: if the best field is taken, the next one can still apply
    const vg = imapValueGuess(cols[i], target); if (vg) cand.push(Object.assign({i}, vg));
  }
  cand.sort((a, b) => b.score - a.score || a.i - b.i);
  const used = new Set();
  cand.forEach(c => { if (fields[c.i]) return; if (used.has(c.field) && !IMAP_MULTI.includes(c.field)) return; fields[c.i] = c.field; how[c.i] = c.how; used.add(c.field); });
  return {fields, how};
}
function imapDetectTarget(heads, cols){
  if (isClientList(heads)) return 'clients';
  const b = imapAutoMap(heads, cols, 'binders').fields.filter(Boolean).length, c = imapAutoMap(heads, cols, 'clients');
  return c.fields.includes('name') && c.fields.filter(Boolean).length > b ? 'clients' : 'binders';
}
/* Header row = the row (among the first 15 non-empty) that matches most known column names;
   without any known name, the first wide all-text row followed by data; otherwise none (-1). */
function imapDetectHeader(rows){
  const idx = []; for (let i = 0; i < rows.length && idx.length < 15; i++) if (rows[i].some(c => String(c).trim())) idx.push(i);
  if (!idx.length) return -1;
  const width = Math.max.apply(null, idx.map(i => rows[i].filter(c => String(c).trim()).length));
  let best = -1, bestHits = 0;
  idx.forEach(i => {
    const hits = rows[i].filter(c => { const g1 = imapHeaderGuess(c, 'binders'), g2 = imapHeaderGuess(c, 'clients'); return (g1 && g1.score >= 80) || (g2 && g2.score >= 80); }).length;
    if (hits > bestHits){ bestHits = hits; best = i; }
  });
  if (best >= 0) return best;
  const i0 = idx[0], cells = rows[i0].filter(c => String(c).trim());
  const texty = cells.every(c => !/^[\d.,\-\/:%€ ]+$/.test(c) && String(c).length <= 40);
  return (idx.length > 1 && cells.length >= Math.max(2, Math.ceil(width * 0.6)) && texty && new Set(cells.map(normHeader)).size === cells.length) ? i0 : -1;
}

/* ---------------- Source model ---------------- */
const imapColLetter = (i) => { let s = ''; i++; while (i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/* Current sheet → {heads, data, cols} (data = non-empty rows after the header; cols = column values). */
function imapTable(M){
  const rows = (M.sheets[M.sheet] || {rows:[]}).rows;
  const hr = M.headerRow;
  const data = rows.slice(hr + 1).filter(r => r.some(c => String(c).trim()));
  let n = Math.max(hr >= 0 ? rows[hr].length : 0, data.reduce((a, r) => Math.max(a, r.length), 0));
  const headRow = hr >= 0 ? rows[hr] : [];
  while (n > 0 && !String(headRow[n - 1] || '').trim() && !data.some(r => String(r[n - 1] || '').trim())) n--;   // drop trailing empty columns
  const heads = [], cols = [];
  for (let i = 0; i < n; i++){
    const h = hr >= 0 ? String(headRow[i] || '').replace(/^﻿/, '').trim() : '';
    heads.push(h || t('imx_col', {c:imapColLetter(i)}));
    const vals = []; for (let j = 0; j < data.length && vals.length < 200; j++) vals.push(String(data[j][i] == null ? '' : data[j][i]).trim());
    cols.push(vals);
  }
  return {heads, data, cols, n};
}
const imapSig = (M, T) => M.headerRow < 0 ? 'nohdr:' + T.n : T.heads.map(normHeader).join('|');
/* (Re)compute mapping for the current sheet/header/target; use a remembered one when it fits. */
function imapRemap(M, opts){
  opts = opts || {};
  const T = imapTable(M);
  if (opts.detectTarget) M.target = imapDetectTarget(T.heads, T.cols);
  const saved = !opts.ignoreSaved && ((S.settings.importMappings || {})[imapSig(M, T)]);
  if (saved && saved.fields && saved.fields.length === T.n && (opts.detectTarget || saved.target === M.target)){
    M.target = saved.target; M.fields = saved.fields.slice(); M.how = saved.fields.map(f => f ? 'saved' : ''); M.remembered = true;
    M.fields = M.fields.map(f => imapFields(M.target).includes(f) ? f : '');     // a field removed since then is ignored
    return;
  }
  const a = imapAutoMap(T.heads, T.cols, M.target, M.headerRow < 0);
  M.fields = a.fields; M.how = a.how; M.remembered = false;
}
function imapNewSource(o){
  const M = Object.assign({open:true, sheet:0, delim:'', target:'binders', fields:[], how:[], remembered:false}, o);
  const firstFull = M.sheets.findIndex(s => !s.hidden && s.rows.some(r => r.some(c => String(c).trim())));
  M.sheet = firstFull >= 0 ? firstFull : 0;
  M.headerRow = imapDetectHeader(M.sheets[M.sheet].rows); M.autoHeader = M.headerRow;
  imapRemap(M, {detectTarget:true});
  return M;
}

/* ---------------- Cleaning and records ---------------- */
/* Invisible artefacts of Excel/Word copies: BOM, zero-width spaces → removed; non-breaking spaces → normal spaces. */
function imapClean(v, field){
  let s = String(v == null ? '' : v).replace(/[﻿​‌‍⁠]/g, '').replace(/[   ]/g, ' ').replace(/\r\n?/g, '\n');
  if (field === 'tags') s = s.replace(/\s*\n\s*/g, ', ');
  else if (!IMAP_MULTILINE.includes(field)) s = s.replace(/\s*\n\s*/g, ' ');
  return s;
}
/* Mapped rows → records keyed by DocMap field names (the input of mapRecord / mapClient). */
function imapRecords(M){
  const T = imapTable(M);
  const joiner = (f) => f === 'contents_items' || f === 'notes' || f === 'contacts' ? '\n' : f === 'tags' ? ', ' : ' ';
  return T.data.map(r => {
    const o = {};
    M.fields.forEach((f, i) => {
      if (!f) return;
      const v = imapClean(r[i], f); if (!v.trim()) return;
      o[f] = o[f] ? o[f] + joiner(f) + v : v;
    });
    return o;
  });
}
function imapMissing(M){
  return M.target === 'clients' ? !M.fields.includes('name') : !(M.fields.includes('company_name') || M.fields.includes('speaking_code'));
}
/* Confirm: remember, build records, run the existing analysis → preview. */
function imapConfirm(){
  const M = UI.imap; if (!M || imapMissing(M)) return;
  const T = imapTable(M), sig = imapSig(M, T);
  const store = Object.assign({}, S.settings.importMappings || {});
  store[sig] = {target:M.target, fields:M.fields.slice(), at:nowISO()};
  const keys = Object.keys(store).sort((a, b) => String(store[b].at).localeCompare(String(store[a].at)));
  keys.slice(40).forEach(k => delete store[k]);             // keep the 40 most recent layouts
  S.settings.importMappings = store; savePrefs();
  const recs = imapRecords(M);
  const fmt = M.kind === 'xlsx' ? t('imx_fmt_xlsx', {s:M.sheets[M.sheet].name}) : t('imx_fmt_csv');
  if (M.target === 'clients') UI.importParsed = {clients:analyzeClients(recs), format:fmt, delim:M.delim};
  else if (!recs.length) UI.importParsed = {error:t('im_none')};
  else analyzeImportRecords(recs, {format:fmt, delim:M.delim});
  M.open = false;
}

/* ---------------- Routing: text, JSON and files ---------------- */
/* Split pasted/loaded text into a table, or return null for JSON. Same rules as analyzeImport. */
function imapTextTable(text){
  let s = String(text || '').replace(/^﻿/, '').trim();
  const fence = s.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/); if (fence) s = fence[1].trim();
  if (!s || /^[\[{]/.test(s)) return null;
  const sep = s.match(/^sep=(.)\s*\r?\n/i); if (sep) s = s.slice(sep[0].length);
  const delim = sep ? sep[1] : detectDelim(s);
  return {rows:parseCSV(s, delim), delim};
}
/* Entry point for CSV/TSV/JSON text (file or paste). Standard DocMap files go straight to the preview
   (with a link to open the mapping); everything else opens the mapping step. */
function imapRouteText(text, meta){
  meta = meta || {};
  UI.imap = null;
  const tb = imapTextTable(text);
  if (!tb){ analyzeImport(text); imapJsonSource(text, meta); return; }
  const rows = tb.rows.filter(r => r.some(c => String(c).trim()));
  const std = imapStandardSet(), head = rows.length ? rows[0].map(h => normHeader(h)).filter(Boolean) : [];
  const known = head.length && head.every(h => std.has(h));
  const aiRows = rows.length && !head.some(h => ALIAS_LOOKUP[h]) && [16, 17, 20, 21, 22, 23].includes(rows[0].length);   // AI rows pasted without header
  if (rows.length < 2 && !aiRows){ analyzeImport(text); return; }
  if (known || aiRows){
    analyzeImport(text);
    const src = aiRows ? [csvTemplateHeader().split(';').concat(['selected_for_print','id','updated_at']).slice(0, rows[0].length)].concat(rows) : rows;
    UI.imap = imapNewSource({open:false, name:meta.name || '', kind:meta.name ? 'csv' : 'paste', sheets:[{name:'CSV', rows:src}], delim:tb.delim, standard:true});
    return;
  }
  UI.importParsed = null;
  UI.imap = imapNewSource({name:meta.name || '', kind:meta.name ? 'csv' : 'paste', sheets:[{name:'CSV', rows:tb.rows}], delim:tb.delim});
}
/* JSON arrays of flat rows can also be re-mapped (workspace backups cannot: they restore everything). */
function imapJsonSource(text, meta){
  let obj; try { obj = JSON.parse(String(text).replace(/^﻿/, '').trim()); } catch(e){ return; }
  const recs = Array.isArray(obj) ? obj : (obj && !Array.isArray(obj.binders) && (Array.isArray(obj.rows) ? obj.rows : Array.isArray(obj.data) ? obj.data : null));
  if (!recs || !recs.length || !recs.every(r => r && typeof r === 'object' && !Array.isArray(r))) return;
  const heads = []; recs.forEach(r => Object.keys(r).forEach(k => { if (!heads.includes(k)) heads.push(k); }));
  const cell = (v) => v == null ? '' : Array.isArray(v) ? (v.some(x => x && typeof x === 'object') ? contentsToPipe(pipeToContents(v)) : v.join('|')) : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  UI.imap = imapNewSource({open:false, name:meta.name || '', kind:'json', sheets:[{name:'JSON', rows:[heads].concat(recs.map(r => heads.map(h => cell(r[h]))))}], standard:true});
}
function imapAnalyzeText(text){ imapRouteText(text, {}); }
/* Called by handleDroppedFile for every file before the text path. Returns true when handled here. */
async function imapHandleFile(f){
  const name = f.name || '', ext = ((name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
  const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4B && head[2] === 3 && head[3] === 4;
  const isOle = head[0] === 0xD0 && head[1] === 0xCF && head[2] === 0x11 && head[3] === 0xE0;
  const fail = (msg) => { UI.imap = null; UI.importParsed = {error:msg}; UI.importText = ''; S.view = 'import'; renderAll(); toast(msg, 'err', 9000); return true; };
  if (isOle || (ext === 'xls' && !isZip)) return fail(t('imx_xls'));
  if (ext === 'xlsb') return fail(t('imx_xlsb'));
  if (['ods','numbers','fods'].includes(ext)) return fail(t('imx_ods'));
  if (!isZip) return false;
  S.view = 'import'; UI.importParsed = null; UI.imap = null; UI.importText = ''; renderAll();
  const box = $('#im-preview'); if (box) box.innerHTML = '<div class="imap-loading">' + ic('table') + esc(t('imx_reading')) + '</div>';
  let wb;
  const buf = await f.arrayBuffer();
  try { wb = await XLSX_READER.read(buf); }
  catch(err){
    if (err && err.code === 'nods') return fail(t('imx_nods'));
    let names = []; try { names = Object.keys(XLSX_READER.zipIndex(new Uint8Array(buf))); } catch(e){}
    if (names.includes('content.xml') || names.some(n => /^Index\/Document/.test(n))) return fail(t('imx_ods'));   // OpenDocument / Numbers zipped
    return fail(t('imx_bad', {e:String(err && err.message || err)}));
  }
  if (!wb.sheets.some(s => s.rows.some(r => r.some(c => String(c).trim())))) return fail(t('imx_nosheet'));
  UI.imap = imapNewSource({name, kind:'xlsx', sheets:wb.sheets});
  imapRefresh();
  return true;
}
function imapRefresh(focusSel){
  const box = $('#im-preview'); if (!box) return;
  box.innerHTML = importPreviewHTML();
  if (focusSel){ const el = box.querySelector(focusSel); if (el) el.focus(); }
}

/* ---------------- Mapping screen ---------------- */
function imapOptionsHTML(M, cur){
  const fields = imapFields(M.target);
  const opt = (k) => '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(imapLabel(k, M.target)) + '</option>';
  if (M.target === 'clients') return '<option value="">' + esc(t('imx_ignore')) + '</option><optgroup label="' + esc(t('imx_grp_cl')) + '">' + fields.map(opt).join('') + '</optgroup>';
  return '<option value="">' + esc(t('imx_ignore')) + '</option><optgroup label="' + esc(t('imx_grp_main')) + '">' + fields.filter(k => !IMAP_TECH.includes(k)).map(opt).join('') + '</optgroup>' +
    '<optgroup label="' + esc(t('imx_grp_tech')) + '">' + fields.filter(k => IMAP_TECH.includes(k)).map(opt).join('') + '</optgroup>';
}
function imapHTML(){
  const M = UI.imap, T = imapTable(M), rows = M.sheets[M.sheet].rows;
  const mapped = M.fields.filter(Boolean).length, missing = imapMissing(M);
  const dupF = M.fields.filter((f, i) => f && M.fields.indexOf(f) !== i);
  const smp = (vals) => { const v = vals.filter(Boolean).slice(0, 3); return v.length ? v.map(x => '<span class="imap-chip" title="' + esc(x) + '">' + esc(x.length > 42 ? x.slice(0, 40) + '…' : x).replace(/\n/g, '<i class="imap-nl">↵</i>') + '</span>').join('') : '<span class="imap-none">' + esc(t('imx_empty_col')) + '</span>'; };
  // exact/remembered matches get a quiet check; guesses worth a second look ("similar name", "from values") get a visible pill
  const howB = (h) => !h || h === 'user' ? '<span class="imap-how"></span>' : (h === 'exact' || h === 'saved') ? '<span class="imap-how h-' + h + '" title="' + esc(t('imx_how_' + h)) + '">' + ic('check') + '</span>' : '<span class="imap-how h-' + h + '">' + esc(t('imx_how_' + h)) + '</span>';
  const sheetSel = M.sheets.length > 1 ? '<div class="field"><label for="imap-sheet">' + esc(t('imx_sheet')) + '</label><select class="inp" id="imap-sheet" data-imap="sheet">' +
    M.sheets.map((s, i) => { const n = s.rows.filter(r => r.some(c => String(c).trim())).length; return '<option value="' + i + '"' + (i === M.sheet ? ' selected' : '') + '>' + esc(s.name) + ' (' + esc(n ? t('imx_sheet_rows', {n}) : t('imx_sheet_empty')) + ')</option>'; }).join('') + '</select></div>' : '';
  const hdrIdx = []; for (let i = 0; i < rows.length && hdrIdx.length < 12; i++) if (rows[i].some(c => String(c).trim())) hdrIdx.push(i);
  const hdrSel = '<div class="field"><label for="imap-hdr">' + esc(t('imx_hdr')) + '</label><select class="inp" id="imap-hdr" data-imap="hdr"' + (M.headerRow < 0 ? ' disabled' : '') + '>' +
    hdrIdx.map(i => { const p = rows[i].filter(c => String(c).trim()).slice(0, 4).join(', '); return '<option value="' + i + '"' + (i === M.headerRow ? ' selected' : '') + '>' + esc(t('imx_row', {n:i + 1}) + ' — ' + (p.length > 48 ? p.slice(0, 46) + '…' : p)) + '</option>'; }).join('') + '</select></div>';
  const src = [M.name, M.kind === 'xlsx' ? '«' + M.sheets[M.sheet].name + '»' : ''].filter(Boolean).join(' · ');
  return '<div class="card imap" id="imap">' +
    '<div class="imap-h"><div class="imap-ttl"><span class="imap-badge">' + ic(M.kind === 'xlsx' ? 'table' : 'file') + '</span><div><h2>' + esc(t('imx_title')) + helpDot('excel') + '</h2><div class="small muted">' + (src ? '<b>' + esc(src) + '</b> · ' : '') + esc(t('imx_sub', {rows:T.data.length, cols:T.n})) + '</div></div></div>' +
    '<div class="imap-target"><span class="lbl">' + esc(t('imx_target')) + '</span><div class="seg">' + ['binders','clients'].map(k => '<button type="button" data-a="imap-target" data-v="' + k + '" class="' + (M.target === k ? 'on' : '') + '">' + ic(k === 'clients' ? 'users' : 'archive') + esc(t('imx_t_' + k)) + '</button>').join('') + '</div></div></div>' +
    '<div class="imap-opts">' + sheetSel + hdrSel + '<label class="chk small imap-nohdr"><input type="checkbox" data-imap="nohdr"' + (M.headerRow < 0 ? ' checked' : '') + '>' + esc(t('imx_nohdr')) + '</label></div>' +
    '<div class="imap-info ' + (M.remembered ? 'saved' : '') + '">' + ic(M.remembered ? 'check' : 'info') + '<div>' + esc(t(M.remembered ? 'imx_saved_info' : 'imx_auto_info')) + '</div></div>' +
    '<div class="imap-list" role="table"><div class="imap-row imap-th" role="row"><div role="columnheader">' + esc(t('imx_th_src')) + '</div><div role="columnheader">' + esc(t('imx_th_smp')) + '</div><div></div><div role="columnheader">' + esc(t('imx_th_dst')) + '</div></div>' +
    T.heads.map((h, i) => '<div class="imap-row' + (M.fields[i] ? '' : ' off') + '" role="row" data-col="' + i + '"><div class="imap-src"><span class="imap-letter">' + imapColLetter(i) + '</span><span class="imap-name" title="' + esc(h) + '">' + esc(h) + '</span></div>' +
      '<div class="imap-smp">' + smp(T.cols[i]) + '</div><div class="imap-arrow">' + ic('arrowRight') + '</div>' +
      '<div class="imap-dst"><select class="inp" data-imap-col="' + i + '" aria-label="' + esc(t('imx_th_dst') + ': ' + h) + '">' + imapOptionsHTML(M, M.fields[i]) + '</select>' + howB(M.fields[i] ? M.how[i] : '') + '</div></div>').join('') + '</div>' +
    '<div class="imap-f"><div class="imap-sum"><b>' + esc(t('imx_summary', {m:mapped, i:T.n - mapped})) + '</b>' +
      (missing ? '<div class="imap-warn">' + ic('alert') + esc(t(M.target === 'clients' ? 'imx_need_c' : 'imx_need_b')) + '</div>' : dupF.length ? '<div class="hint">' + esc(t('imx_dup')) + '</div>' : '') +
      '<button class="imap-link small" data-a="imap-auto">' + ic('refresh') + esc(t('imx_reset')) + '</button></div>' +
    '<div class="row"><button class="btn" data-a="imap-cancel">' + ic('x') + esc(t('imx_cancel')) + '</button><button class="btn btn-lg btn-primary" data-a="imap-confirm"' + (missing ? ' disabled' : '') + '>' + ic('check') + esc(t('imx_confirm')) + '</button></div></div></div>';
}
/* Slim bar above the preview: where the rows come from + "Edit column mapping". */
function imapBarHTML(){
  const M = UI.imap; if (!M || M.open) return '';
  const src = [M.name, M.kind === 'xlsx' ? '«' + M.sheets[M.sheet].name + '»' : ''].filter(Boolean).join(' · ') || (M.kind === 'paste' ? 'CSV' : M.kind.toUpperCase());
  return '<div class="imap-bar">' + ic(M.kind === 'xlsx' ? 'table' : 'file') + '<span>' + esc(t('imx_bar', {src})) + ' · ' + esc(M.standard ? t('imx_bar_std') : t('imx_bar_map', {m:M.fields.filter(Boolean).length})) + '</span>' +
    '<button class="imap-link" data-a="imap-edit">' + ic('pencil') + esc(t('imx_edit')) + '</button></div>';
}

/* ---------------- Actions and change events ---------------- */
const IMPORT_MAP_ACTIONS = {
  'imap-target': (el) => { const M = UI.imap; if (!M || M.target === el.dataset.v) return; M.target = el.dataset.v; imapRemap(M); imapRefresh(); },
  'imap-confirm': () => { imapConfirm(); imapRefresh(); const b = $('#im-preview'); if (b) b.scrollIntoView({behavior:'smooth', block:'start'}); },
  'imap-cancel': () => { UI.imap = null; UI.importParsed = null; imapRefresh(); },
  'imap-auto': () => { const M = UI.imap; if (!M) return; M.headerRow = M.autoHeader; imapRemap(M, {ignoreSaved:true, detectTarget:true}); imapRefresh(); },
  'imap-edit': () => { const M = UI.imap; if (!M) return; M.open = true; UI.importParsed = null; imapRefresh(); const b = $('#imap'); if (b) b.scrollIntoView({behavior:'smooth', block:'start'}); }
};
document.addEventListener('change', (e) => {
  const el = e.target, M = UI.imap; if (!M || !el.closest || !el.closest('#imap')) return;
  if (el.dataset.imapCol != null){ const i = +el.dataset.imapCol; M.fields[i] = el.value; M.how[i] = el.value ? 'user' : ''; imapRefresh('[data-imap-col="' + i + '"]'); return; }
  const k = el.dataset.imap;
  if (k === 'sheet'){ M.sheet = +el.value; M.headerRow = imapDetectHeader(M.sheets[M.sheet].rows); M.autoHeader = M.headerRow; imapRemap(M, {detectTarget:true}); imapRefresh('#imap-sheet'); }
  else if (k === 'hdr'){ M.headerRow = +el.value; imapRemap(M); imapRefresh('#imap-hdr'); }
  else if (k === 'nohdr'){
    const rows = M.sheets[M.sheet].rows, first = rows.findIndex(r => r.some(c => String(c).trim()));
    M.headerRow = el.checked ? -1 : (M.autoHeader >= 0 ? M.autoHeader : Math.max(0, first)); imapRemap(M); imapRefresh('[data-imap="nohdr"]');
  }
});

/* ---------------- Help topic (07-help.js loads after this file) ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'excel')) return;
  HELP_TOPICS.push({ id:'excel', guide:null, tags:['import'], related:['import','clients'],
    title:{it:'Importare un file Excel (.xlsx) e abbinare le colonne', en:'Import an Excel file (.xlsx) and match the columns'},
    body:{it:'<p>Trascina il file <b>.xlsx</b> in Importa (o in qualsiasi punto della pagina), oppure clicca il riquadro e sceglilo: non serve più esportarlo in CSV. Funziona offline, anche aprendo DocMap con doppio clic.</p><ul><li><b>Foglio</b>: se il file ha più fogli scegli quello giusto; di partenza c\'è il primo con dati.</li><li><b>Importa come</b>: <i>Faldoni</i> oppure <i>Anagrafica clienti</i>. DocMap lo capisce da solo dalle colonne (per esempio <span class="kbd">TIPO;Ditta;Ragione_soc;…</span> è un elenco clienti).</li><li><b>Abbinamento</b>: per ogni colonna del file vedi l\'intestazione, alcuni valori di esempio e il campo DocMap proposto. Correggi i menu se serve; <i>— ignora —</i> scarta la colonna. Le proposte arrivano dai nomi delle colonne (anche simili o con errori) e dai valori (codici dm26…, colori #RRGGBB, anni, CAP, sigle di provincia).</li><li><b>Riga di intestazione</b>: se sopra la tabella ci sono titoli o righe vuote DocMap trova da solo la riga giusta; puoi cambiarla o dire che il file non ha intestazione.</li><li><b>Conferma abbinamento</b> mostra la solita anteprima (NUOVO / AGGIORNA / ERRORE): niente viene salvato finché non confermi l\'importazione.</li><li>L\'abbinamento viene <b>ricordato</b>: reimportando un file con le stesse colonne basta un clic.</li></ul><p>Testo e caratteri speciali restano identici: apostrofi (LESIGNANO DE\' BAGNI), virgolette, punto e virgola, lettere accentate, zeri iniziali (007), a capo dentro la cella. Le date diventano <span class="kbd">AAAA-MM-GG</span>, i numeri restano come in Excel. Nella colonna Contenuti ogni riga (a capo) o ogni <span class="kbd">|</span> diventa una voce. Lo stesso abbinamento vale per i CSV e per il testo copiato da Excel e incollato. I vecchi file <b>.xls</b> vanno prima salvati come .xlsx o CSV.</p>',
          en:'<p>Drop the <b>.xlsx</b> file on Import (or anywhere on the page), or click the box and choose it: no CSV export needed. Works offline, also when DocMap is opened with a double-click.</p><ul><li><b>Sheet</b>: with several sheets pick the right one; the first one with data is preselected.</li><li><b>Import as</b>: <i>Binders</i> or <i>Client register</i>. DocMap detects it from the columns.</li><li><b>Mapping</b>: for each file column you see the header, some sample values and the proposed DocMap field. Fix the menus if needed; <i>— ignore —</i> drops the column. Proposals come from column names (also similar or misspelt) and from values (dm26 codes, #RRGGBB colours, years, postcodes, province codes).</li><li><b>Header row</b>: titles or empty rows above the table are skipped automatically; you can change the row or say the file has no header.</li><li><b>Confirm mapping</b> shows the usual preview (NEW / UPDATE / ERROR): nothing is saved until you confirm the import.</li><li>The mapping is <b>remembered</b>: re-importing a file with the same columns takes one click.</li></ul><p>Text and special characters stay identical: apostrophes, quotes, semicolons, accents, leading zeros (007), line breaks in a cell. Dates become <span class="kbd">YYYY-MM-DD</span>, numbers stay as in Excel. In the Contents column each line or each <span class="kbd">|</span> becomes an item. The same mapping applies to CSV files and to text copied from Excel and pasted. Old <b>.xls</b> files must first be saved as .xlsx or CSV.</p>'} });
  const imp = HELP_TOPICS.find(x => x.id === 'import'); if (imp && !imp.related.includes('excel')) imp.related.unshift('excel');
});
