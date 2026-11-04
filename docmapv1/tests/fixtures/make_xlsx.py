# Builds the .xlsx fixtures used by suite.js (stream C, Excel import). Invented data only.
# Usage: python3 make_xlsx.py <output dir>
import sys, os, datetime, zipfile
import openpyxl

out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)

# 1) Workbook like the studio's client list + a binder sheet (written by openpyxl, deflate entries)
wb = openpyxl.Workbook()
ws = wb.active
ws.title = 'Clienti'
ws.append(['ELENCO CLIENTI STORICI (prova)'])          # title row above the table
ws.append([])
ws.append(['TIPO', 'Ditta', 'Ragione_soc', 'Indirizzo', 'Codice_com', 'Cap', 'Localita', 'Provincia', 'ETS_ENC', 'Data_iscrizione'])
ws.append(['ENC', '007', 'APS L\'ÀNCORA "Blu"; sede àèìòù', 'VIA ROMA 1;\nINT. 2 "B"', 'E547', 43037, "LESIGNANO DE' BAGNI", 'PR', 'APS', datetime.date(2024, 3, 15)])
ws.append(['ENC', 116, 'HAND2HAND XLSX TEST', 'PIAZZALE TEST 18A', 'B293', 43011, 'BUSSETO', 'PR', 'APS', datetime.date(2023, 12, 31)])
ws.append(['ODV', '0042', 'CIRCOLO VERDE ODV', 'VIA PO 3', 'G337', 43121, 'PARMA', 'PR', 'ODV', None])
fb = wb.create_sheet('Faldoni')
fb.append(['Titolo faldone', 'Ragione Sociale Cliente', 'Peso kg', 'Contenuto del faldone', 'Anno', 'Tinta', 'Rif', 'Stanza', 'Armadio', 'Ripiano', 'Cod. Multi'])
fb.append(['Fatture e IVA', 'L\'Officina "Due"; S.r.l. àèìòù', 3.5, '2024: Fatture acquisto\n2024: F24 | Liquidazioni', 2024, '#2563EB', 'dm26Abc234Xy', 'Ufficio 1', 2, 'β', '007'])
fb.append(['Bilancio', 'Rossi Mario', 1.25, 'Bilancio 2023', 2023, '#D97706', 'dm26Bcd345Yz', 'A', 1, 'α', '0815'])
wb.save(os.path.join(out, 'stream_c_clienti_faldoni.xlsx'))

# 2) Hand-written OOXML covering what Excel itself writes: stored + deflated entries, an empty first sheet,
#    inline strings, formula strings (t="str"), errors, booleans, rich text with phonetic runs, _x000D_ escapes,
#    gaps in cell references, custom number formats ("000", dates, %), float artefacts, prefixed namespaces.
NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
files = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook ' + NS + '><workbookPr/><sheets><sheet name="Vuoto" sheetId="1" r:id="rId1"/><sheet name="Dati &amp; prove" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/data2.xml"/><Relationship Id="rId9" Type="x" Target="sharedStrings.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<?xml version="1.0" encoding="UTF-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">'
     '<x:si><x:t>cliente</x:t></x:si>'
     '<x:si><x:r><x:rPr><x:b/></x:rPr><x:t xml:space="preserve">Rich </x:t></x:r><x:r><x:t>Text  Srl</x:t></x:r><x:rPh sb="0" eb="1"><x:t>PHON</x:t></x:rPh></x:si>'
     '<x:si><x:t>riga1_x000D_\nriga2</x:t></x:si>'
     '<x:si><x:t xml:space="preserve">  spazi  </x:t></x:si></x:sst>',
  'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8"?><styleSheet ' + NS + '><numFmts count="3"><numFmt numFmtId="164" formatCode="000"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="[$-410]d mmmm yyyy;@"/></numFmts>'
     '<cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="10" applyNumberFormat="1"/><xf numFmtId="166" applyNumberFormat="1"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet ' + NS + '><sheetData/></worksheet>',
  'xl/worksheets/data2.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet ' + NS + '><sheetData>'
     '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>codice</t></is></c><c r="D1" t="inlineStr"><is><t>note</t></is></c></row>'
     '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="1"><v>7</v></c><c r="C3"><v>43037.000000000007</v></c><c r="D3" t="s"><v>2</v></c></row>'
     '<row r="4"><c r="A4" t="str"><f>A3&amp;"!"</f><v>Formula Srl</v></c><c r="B4" s="2"><v>45366</v></c><c r="C4"><v>0.30000000000000004</v></c><c r="D4" t="e"><v>#N/A</v></c></row>'
     '<row r="5"><c r="A5" t="s"><v>3</v></c><c r="B5" s="3"><v>45291</v></c><c r="C5" s="4"><v>0.125</v></c><c r="D5" t="b"><v>1</v></c><c r="F5" s="5"><v>45366</v></c></row>'
     '<row r="6"><c r="A6" t="inlineStr"><is><r><t>Ü</t></r><r><t>ber; "Q"</t></r></is></c><c r="B6"><v>1.2345678901234567E+20</v></c><c r="C6"><v>-12.5</v></c></row>'
     '</sheetData></worksheet>',
}
with zipfile.ZipFile(os.path.join(out, 'stream_c_raw.xlsx'), 'w') as z:
    for i, (name, data) in enumerate(files.items()):
        z.writestr(zipfile.ZipInfo(name), data.encode('utf-8'), compress_type=zipfile.ZIP_STORED if i % 2 else zipfile.ZIP_DEFLATED)

# 3) A fake old binary .xls (OLE2 signature) for the "save as .xlsx" message
with open(os.path.join(out, 'stream_c_old.xls'), 'wb') as f:
    f.write(bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + b'\0' * 504)
print('ok')
