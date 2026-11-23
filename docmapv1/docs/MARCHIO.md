# Marchio (white label), lingue e listino

> Dal 2026-11-23 (app 26.12.12, hub 0.13.0). Il prodotto si chiama **Doc Location**, ma il nome **non è scritto nel
> codice**: sta in un solo file, `brand.js`. Cambiarlo, o rivendere un'istanza con un altro nome, è un comando.

## 1. Dove sta il marchio: un solo file

`docmapv1/brand.js` è l'**unica fonte** di: nome del prodotto, nome breve, sigla, logo, colore, chi lo vende
(ragione sociale, P.IVA, indirizzo), sito, contatti dell'assistenza, privacy e condizioni, copyright, nome dell'hub,
inizio dei nomi dei file scaricati, lingue offerte.

| Campo | A cosa serve | Esempio |
|---|---|---|
| `product_name` | il nome ovunque (titolo, barra in alto, accesso, telefono, PDF, aiuto, lettere, pacchetti) | `Doc Location` |
| `short_name` | il nome sotto l'icona dell'app installata (max 24) | `Doc Location` |
| `mark` | la sigla nel riquadro in alto a sinistra (max 4) | `DL` |
| `logo_url` | un'immagine al posto della sigla (percorso nel programma, `https://` o `data:image/…`) | `assets/icons/logo.svg` |
| `primary_color` | colore principale `#RRGGBB`; vuoto = colori standard (chiaro e scuro si calcolano da soli) | `#0A5C8A` |
| `vendor_name`, `vendor_legal`, `vendor_vat`, `vendor_address` | chi vende e assiste (in «Informazioni su …») | |
| `website`, `support_email`, `support_phone` | contatti mostrati in «Informazioni su …» | `https://doclocation.it` |
| `privacy_url`, `terms_url`, `copyright` | testi legali (`{year}` e `{vendor}` si riempiono da soli) | `© {year} {vendor}` |
| `hub_name` | nome dell'hub dopo il nome del prodotto | `Hub` |
| `file_prefix` | inizio dei file scaricati (backup, CSV, PDF) | `DocLocation` → `DocLocation_workspace.json` |
| `languages`, `default_language` | lingue offerte e lingua di partenza (vedi §6) | `["it","en"]`, `it` |

**L'indirizzo dei QR non è nel marchio, apposta.** I QR restano `https://qr7.it/{short_code}` di default e si
cambiano per installazione (Impostazioni › Indirizzo dei QR, `docmap.config.js`). Il controllo rifiuta un marchio che
prova a fissare un dominio dei QR (decisione D18: Doc Location è solo il marchio).

## 2. Cambiare nome (un comando)

```bash
python3 tools/brand.py imposta --nome "Nuovo Nome" --sigla NN --colore "#0A5C8A" --sito https://nuovonome.it
python3 tools/brand.py controlla        # anche dentro la verifica veloce e la CI
python3 tools/crea-zip.py --out DIR     # zip nuovo con il nome nuovo
```

`imposta` riscrive `brand.js` e i file che ne derivano (i due manifest dell'app installabile). Poi dall'hub
«Siti da aggiornare» porta il nome ai siti online; i pacchetti nuovi (sede, postazioni, autoinstall) lo hanno già.
Altre opzioni: `python3 tools/brand.py imposta --help` (anche `--da file.json` con i campi da cambiare).

## 3. Rivendere un'istanza con un altro marchio

Tre livelli, ognuno sovrascrive il precedente solo nei campi che riempie:

1. **Prodotto**: `brand.js` (Doc Location).
2. **Rivenditore**: `python -m docmap_hub marchio imposta --rivenditore "Rivendo" --nome "Archivi Rivendo" --sigla AR
   --colore "#0A5C8A" --email-assistenza assistenza@rivendo.it` (o dall'hub: Rivenditori).
3. **Cliente**: `python -m docmap_hub marchio imposta --cliente "Studio Rossi" --nome "Archivio Rossi"`, oppure
   nell'hub la scheda del cliente › **Marchio e prezzo** › Modifica.

Quando il nome cambia (rivenditore o cliente), **nulla dell'identità del venditore originale passa**: sito, email,
telefono, logo, colore, ragione sociale vengono solo dal livello nuovo (`IDENTITY_KEYS` in `tools/brand.py`). Così il
cliente di un rivenditore non vede mai doclocation.it.

L'hub scrive il marchio giusto in **ogni** sito (`build_deploy.py --brand`) e pacchetto (sede: `docmap_tools.py
pacchetto --marchio`; postazioni: campo `prodotto` di `postazione.json`, nome dei collegamenti sul desktop;
autoinstall web: LEGGIMI). `marchio mostra --cliente X` dice che nome vede quel cliente e da dove viene.
La licenza del rivenditore continua a portare il suo `branding` (campo già esistente dalla 0.7).

## 4. Cosa resta col nome tecnico `docmap` (e perché)

Il marchio è ciò che **vede** chi usa il programma. I nomi **tecnici** restano `docmap`/`DocMap` perché sono
collegati ai dati e agli impianti già installati: cambiarli farebbe perdere dati o lascerebbe doppioni.

- chiavi di memoria del browser (`docmap_v26_*`), database IndexedDB, formati dei file (`DocMap26`, `docmap-sync`,
  `docmap_workspace`), intestazioni HTTP (`X-DocMap-Token`), `short_code` `dm26…` stampati sui QR;
- cartelle e file: `C:\DocMap` (sede), `%APPDATA%\DocMapHub`, `%LOCALAPPDATA%\DocMap`, `DocMap-copie`,
  `AGGIORNA-DOCMAP.bat`, `docmap.config.js`, `docmap-data/`, attività di Windows «DocMap Sync Web-Locale»,
  `DocMap-hub-<versione>.zip` (l'hub cerca le cartelle con questo nome);
- pacchetti Python `docmap_hub`, `docmap_server`, cartella del repository `docmapv1/`.

Rinominarli richiede una migrazione dedicata: si farà solo se un rivenditore lo chiede per contratto.

## 5. Regola per chi scrive codice (persone e agenti)

**Mai un nome di prodotto dentro una stringa.** Si usa il lettore del marchio:

| Dove | Come |
|---|---|
| App (JS) | `brandName()`, `brandTagline()`, `brandFile('backup', 'json')`, `brandMarkHtml('cls')`, `BRAND.campo` (`assets/js/00-brand.js`) |
| PHP | `dm_brand_name()`, `dm_brand()` (`server-php/brand.php`) |
| Hub | `from .branding import brand_name as _bn` (e `brand_for_customer`, `override_for_env`) |
| Server Python | `from .branding import brand_name as _bn` |
| Installatore | `_bn()` in `docmap_tools.py` |
| Strumenti | `import brand as BR` (`tools/brand.py`) |

Controlli automatici (verifica veloce e CI): `tools/lint-js.js` regola `brand-literal`, `tools/lint-py.py` (stessa
regola per Python), `tools/brand.py controlla`, test `tests/marchio.js` (l'app con un altro marchio non mostra mai
«Doc Location» né «DocMap») e `hub/tests/test_v13_marchio.py`. Dopo un'unione che ha reintrodotto il nome:
`node tools/brand-sweep.js` (JS) e `python3 tools/brand_sweep_py.py FILE.py` (Python) lo correggono da soli.
Una stringa che è un identificatore (es. il nome di un'attività di Windows) si marca con il commento `# brand: keep`.

## 6. Lingue

- L'app ha **italiano e inglese completi** (dizionari, aiuto, guide, telefono). Il marchio sceglie quali offrire
  (`languages`) e da quale partire (`default_language`). Con una sola lingua il selettore IT/EN sparisce.
- Documenti per l'utente, hub e lettere: italiano (primo mercato). L'inglese dell'hub verrà con il primo rivenditore estero.
- Aggiungere una lingua (es. tedesco per l'Alto Adige): dizionario `I18N.de` in `assets/js/02-core.js` e nei file
  con dizionari propri, poi `de` in `SUPPORTED` (`00-brand.js`) e `SUPPORTED_LANGUAGES` (`tools/brand.py`). I testi
  mancanti cadono sull'italiano.

## 7. Listino e preventivi

- **Listino**: un solo file, `hub/docmap_hub/plans.json` (piani con limiti, funzioni **e prezzi**, moduli, servizi,
  regole). `docs/commerciale/LISTINO.md` è generato da lì (`python -m docmap_hub listino --md
  ../docs/commerciale/LISTINO.md`) e un test controlla che sia allineato. Una copia in `<cartella dati
  dell'hub>/plans.json` può cambiare i prezzi sul PC di Dave senza toccare il programma.
- **Preventivo del cliente**: contiene solo ciò che cambia (piano, mensile/annuale, sconto % **oppure** canone
  concordato, moduli, avvio, note, validità). Sta nella scheda del cliente (`extra.preventivo`), si gestisce da
  **Marchio e prezzo** o con `python -m docmap_hub cliente preventivo "Studio Rossi" --piano studio_pro --sconto 10`.
  Se il listino cambia, i clienti senza preventivo seguono il listino; quelli con canone concordato no.
- Prezzi proposti (bozza 2026-11-23, IVA esclusa, da validare con i primi clienti): Prova 0 €, Studio 39 €/mese,
  Studio Pro 89 €/mese, Conto terzi 190 €/mese, Appliance 99 €/mese + 600 € una tantum, Rivenditore 290 €/mese (fino
  a 10 istanze; 590 € fino a 30). Annuale = 10 mensilità. Moduli: scarto 9 €/mese, consegna firmata 9 €/mese, spazio
  online 10 €/mese (incluso da Studio Pro in su), AI a crediti. Dettaglio: [`commerciale/LISTINO.md`](commerciale/LISTINO.md).
