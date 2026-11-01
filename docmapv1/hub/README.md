# DocMap Hub — licenze

Il **hub** è il piccolo programma con cui Dave emette e rinnova le licenze DocMap.
Gira sul PC di Dave (Windows), anche se spesso è spento: le installazioni dei clienti
**verificano la licenza da sole, senza collegarsi al hub** (decisione D4 della ROADMAP).

Cosa fa:

- custodisce la **chiave di firma** Ed25519 (cifrata con una passphrase che conosce solo Dave);
- tiene il **registro** (SQLite) di rivenditori, clienti, installazioni, licenze emesse e il
  registro delle operazioni (chi ha fatto cosa e quando);
- **emette** file di licenza firmati (`*.docmap-licence`) e li **rinnova**;
- offre una **pagina locale** (`http://127.0.0.1:8765/`) per fare tutto dal browser.

Regola d'oro (D5): una licenza **non blocca mai i dati**. Scaduta → 30 giorni di tolleranza
→ poi **sola lettura**: lo studio continua a consultare, stampare ed esportare l'archivio.

---

## 1. Installazione sul PC di Dave (Windows 10/11)

1. Installa **Python 3.11 o successivo** da <https://www.python.org/downloads/>.
   Durante l'installazione spunta **"Add python.exe to PATH"**.
2. Copia la cartella `docmapv1\hub` dove preferisci (es. `C:\DocMapHub\`), oppure usa
   direttamente quella del repository.
3. Apri la cartella e fai doppio clic su **`run_windows.bat`** una prima volta: crea
   l'ambiente Python (`.venv`) e installa l'unica libreria necessaria (`cryptography`).
   Si chiuderà dicendo che manca la chiave: è normale.
4. Apri il **Prompt dei comandi** nella cartella (nella barra dell'indirizzo di Esplora file
   scrivi `cmd` e premi Invio) ed esegui:

   ```bat
   run_windows.bat init
   run_windows.bat keygen
   ```

   `keygen` chiede una **passphrase** (almeno 10 caratteri, meglio una frase lunga).
   **Scrivila su carta e conservala in un luogo sicuro.** Non viene salvata da nessuna parte.
5. Esporta la chiave pubblica da consegnare al team del server (vedi §6):

   ```bat
   run_windows.bat export-public-key --out chiavi-pubbliche.json
   ```

6. Fai subito il **primo backup** (§5).

Da qui in poi: doppio clic su `run_windows.bat` → chiede la passphrase → si apre il browser
sulla pagina del hub. La pagina risponde **solo da quel PC** (127.0.0.1). Chiudendo la finestra
nera il hub si spegne.

**Dove sono i dati:** `%APPDATA%\DocMapHub` (es. `C:\Users\Dave\AppData\Roaming\DocMapHub`).
Per usare un'altra cartella: variabile d'ambiente `DOCMAP_HUB_DIR` oppure opzione `--dir`.

```
DocMapHub\
  registry.sqlite3          registro (clienti, installazioni, licenze, operazioni)
  keys\keys.json            elenco chiavi (attiva e ritirate) con le chiavi pubbliche
  keys\<id>.key.pem         chiave PRIVATA, cifrata con la passphrase
  keys\<id>.pub.pem         chiave pubblica
  issued\*.docmap-licence   copia di ogni licenza emessa
  backups\*.zip             backup creati con il comando backup
  plans.json                (facoltativo) piani personalizzati: se c'è, vince su quello di serie
```

Su Linux/macOS: `cd docmapv1/hub && pip install cryptography && python3 -m docmap_hub ...`
(dati in `~/.docmap-hub`).

---

## 2. Concetti

| Termine | Cos'è |
|---|---|
| **Cliente** | lo studio che usa DocMap (nome, P.IVA, email) |
| **Installazione** | un server DocMap di un cliente (un PC in studio oggi, il cloud domani). Ha un `instance_id` unico. Ogni cliente ha la sua installazione (single-tenant) |
| **Rivenditore** | un cliente che rivende DocMap ai propri clienti, eventualmente con il **proprio marchio** |
| **Piano** | pacchetto predefinito di limiti e funzioni (`run_windows.bat plans`) |
| **Licenza** | file firmato legato a **una** installazione: piano, scadenza, tolleranza, limiti, funzioni, rivenditore, marchio |

Piani di serie (`docmap_hub/plans.json`, valori modificabili al momento dell'emissione):

| piano | utenti | faldoni | archivi | funzioni |
|---|---|---|---|---|
| `trial` (1 mese, 7 gg tolleranza) | 2 | 300 | 1 | mobile_scan |
| `studio` | 5 | 5.000 | 3 | mobile_scan |
| `studio_pro` | 15 | 20.000 | 10 | mobile_scan, sync_server, status_events, ai_credits |
| `conto_terzi` | 30 | 100.000 | 50 | come studio_pro |
| `appliance` | 10 | 20.000 | 5 | mobile_scan, sync_server, status_events |
| `reseller` | 50 | illimitati | illimitati | tutte + white_label |

Durata predefinita 12 mesi, tolleranza 30 giorni.

---

## 3. Emettere una licenza per un nuovo studio

Dalla pagina: *Nuovo cliente* → *Nuova installazione* → *Emetti licenza* → *Scarica il file*.

Dalla riga di comando:

```bat
run_windows.bat customer add --name "Studio Rossi" --vat IT01234567890 --email info@studiorossi.it
run_windows.bat instance add --customer "Studio Rossi" --label "PC archivio"
run_windows.bat licence issue --instance "PC archivio" --plan studio_pro --out C:\Temp\studio-rossi.docmap-licence
```

- Se il server del cliente ha già generato il suo `instance_id`, registralo con
  `instance add ... --id <instance_id>`; altrimenti il hub ne crea uno e va scritto nella
  configurazione del server (vedi §6).
- Variazioni rispetto al piano: `--users 8`, `--binders -1` (illimitato), `--months 24`,
  `--expires 2027-12-31`, `--grace-days 60`, `--feature ai_credits`, `--no-feature mobile_scan`.
- Invia il file al cliente (email, chiavetta): va caricato dalle impostazioni del server o
  copiato nella sua cartella dati come `licence.docmap-licence`.

Controllare un file: `run_windows.bat licence show C:\percorso\file.docmap-licence`.

### Rinnovo

```bat
run_windows.bat licence renew "PC archivio"            :: o l'id della licenza
run_windows.bat licence renew "PC archivio" --months 24 --plan conto_terzi
```

Il rinnovo crea un **nuovo file**, valido subito, che **prolunga dalla vecchia scadenza** se non è
ancora arrivata (nessun giorno perso), altrimenti da oggi. Limiti e funzioni restano quelli della
licenza precedente, a meno di cambiare piano. Dalla pagina: pulsante *rinnova* sulla riga.

---

## 4. Licenza per il cliente di un rivenditore (white-label)

```bat
run_windows.bat reseller add --name "Rete Studi Srl" --vat IT09876543210 ^
    --product-name "ArchivioFacile" --primary-color "#0a5c8a" --support-email assistenza@retestudi.it
run_windows.bat customer add --name "Studio Bianchi" --reseller "Rete Studi Srl"
run_windows.bat instance add --customer "Studio Bianchi" --label "PC Bianchi"
run_windows.bat licence issue --instance "PC Bianchi" --plan studio
```

La licenza di Studio Bianchi conterrà `reseller: {id, name}` e il blocco `branding`
(`product_name`, colore, email assistenza, logo) e la funzione `white_label`: il server mostrerà
il marchio del rivenditore. Per l'installazione propria del rivenditore usa il piano `reseller`.
Senza `--product-name` il rivenditore viene solo registrato (nessun marchio personalizzato).

---

## 5. Backup — IMPORTANTISSIMO

**Se perdi la chiave privata o la passphrase non potrai più rinnovare nessuna licenza**:
dovresti creare una chiave nuova e far aggiornare tutti i server dei clienti.

```bat
run_windows.bat backup
run_windows.bat backup --out E:\backup-hub\docmap-hub.zip
```

Il backup contiene registro, chiavi (la privata resta **cifrata**), licenze emesse e piani.
Regole:

1. fai un backup dopo `keygen` e dopo ogni giornata in cui emetti licenze;
2. tieni **due copie in due luoghi diversi** (chiavetta USB in cassaforte + cloud personale);
3. la **passphrase** va conservata separatamente dal backup (carta, gestore di password);
4. ripristino: copia il contenuto dello zip nella cartella dati (`%APPDATA%\DocMapHub`).

**Cambio chiave** (sospetto di furto, o per prudenza ogni qualche anno):
`run_windows.bat keygen --rotate`. La vecchia chiave resta nel registro come *ritirata*:
le licenze già emesse continuano a valere finché il server ne conosce la chiave pubblica.
Esporta di nuovo `export-public-key` e consegnalo al team del server per il prossimo
aggiornamento.

Il registro delle operazioni: `run_windows.bat log`.

---

## 6. Contratto di integrazione per il server (`server-python/`)

### Il file di licenza

```json
{
  "format": 1,
  "key_id": "dmk20261101-8b60",
  "licence": {
    "licence_id": "uuid", "format": 1,
    "customer": {"name": "Studio Rossi", "vat_id": "IT…", "email": "…"},
    "instance_id": "uuid dell'installazione",
    "plan": "studio_pro",
    "issued_at": "2026-11-01T10:00:00Z", "valid_from": "…Z", "expires_at": "2027-11-01T10:00:00Z",
    "grace_days": 30,
    "limits": {"users": 15, "binders": 20000, "archives": 10},
    "features": ["ai_credits", "mobile_scan", "status_events", "sync_server"],
    "reseller": null, "branding": null,
    "key_id": "dmk20261101-8b60"
  },
  "signature": "base64 della firma Ed25519 di canonical_json(licence)"
}
```

`canonical_json` = JSON con chiavi ordinate, separatori `,` e `:` senza spazi, UTF-8 senza
escape ASCII, niente numeri decimali. Un limite `null` significa illimitato.

### Dove stanno i file sull'installazione

| Cosa | Dove | Note |
|---|---|---|
| verificatore | copia di `hub/docmap_hub/licence.py` nel server (es. `server-python/app/licence.py`) | dipende solo da `cryptography`; non modificarlo nel server, si aggiorna ricopiandolo |
| chiavi pubbliche fidate | **costante nel codice del server** (`TRUSTED_LICENCE_KEYS = {"dmk…": "base64…"}`), presa da `export-public-key` | non leggerle da un file nella cartella dati: chi può scrivere lì potrebbe sostituire la chiave. Un file `public-keys.json` va bene solo per sviluppo/test (`L.load_public_keys_json`) |
| licenza installata | `<cartella dati del server>/licence/licence.docmap-licence` | la precedente si conserva come `licence.prev.docmap-licence` |
| identità dell'installazione | `<cartella dati del server>/instance.json` → `{"instance_id": "…"}` | se manca, il server adotta l'`instance_id` della prima licenza valida installata e lo scrive |

### Come usare `verify()`

```python
import licence as L
st = L.verify(path.read_bytes() if path.exists() else None,
              TRUSTED_LICENCE_KEYS, instance_id=instance_id)   # non solleva mai eccezioni
```

Da chiamare all'avvio, quando si carica una nuova licenza e almeno una volta al giorno
(il risultato cambia con il passare del tempo, non solo con il file).

| `st.mode` | Comportamento dell'app |
|---|---|
| `full` | tutto normale. Se `st.expiring_soon` (≤ 30 giorni) → avviso discreto con `st.message_it` |
| `grace` | **tutto funziona**, banner arancione permanente con `st.message_it` (giorni di tolleranza rimasti: `st.grace_days_left`) |
| `read_only` | banner rosso; **lettura, ricerca, stampa etichette, esportazioni e backup sempre consentiti**; le scritture rispondono `403 {"error":"licence_read_only"}`; la sync può ricevere ma non inviare modifiche |
| `invalid` | **come `read_only`** (mai blocco dei dati); motivo in `st.reasons` (`missing`, `bad_signature`, `unknown_key`, `instance_mismatch`, …) |

- Usare `st.writable` (True in `full`/`grace`) come unico interruttore per le scritture.
- **Limiti:** prima di creare un utente/faldone/archivio,
  `L.check_limits(st, {"users": n_utenti, "binders": n_faldoni, "archives": n_archivi}).can_add("users")`;
  se False → `403 {"error":"licence_limit"}`. Nulla viene mai cancellato o nascosto se si supera
  un limite (es. dopo un passaggio a un piano inferiore): si blocca solo l'aggiunta.
- **Funzioni:** `st.has_feature("sync_server")`, `"mobile_scan"`, `"status_events"`, `"ai_credits"`,
  `"white_label"` abilitano le parti corrispondenti. Con `white_label` usare `st.branding`
  (`product_name`, `primary_color`, `logo_url`, `support_email`) per nome e colori dell'interfaccia.
- **API:** `GET /v1/me` (o `/v1/licence`) restituisce un estratto di `st.to_dict()`:
  `mode`, `writable`, `message_it`, `days_left`, `grace_days_left`, `features`, `limits`, `branding`,
  `licence.customer.name`, `licence.plan`, `licence.expires_at`. Il front-end mostra il banner da qui.
- **Caricare una nuova licenza** (`POST /v1/admin/licence`, solo amministratore): accettarla solo
  se `st.signature_ok` e l'`instance_id` coincide; conservare la precedente come `.prev`.
- Una licenza con `valid_from` nel futuro (oltre 24 ore di tolleranza sull'orologio) dà
  `read_only` con motivo `not_yet_valid`: il server dovrebbe tenere quella attuale finché la nuova
  non è attiva.

---

## 7. Sviluppo

```bash
cd docmapv1/hub
python -m unittest discover -s tests -v
```

| File | Ruolo |
|---|---|
| `docmap_hub/licence.py` | formato e **verificatore offline standalone** (da copiare nel server) |
| `docmap_hub/keys.py` | chiavi Ed25519, cifratura con passphrase, rotazione, esportazione |
| `docmap_hub/registry.py` | registro SQLite con migrazioni additive (`meta.schema_version`) |
| `docmap_hub/service.py` | emissione, rinnovo, backup (usato da CLI e pagina) |
| `docmap_hub/cli.py` | comandi `python -m docmap_hub …` |
| `docmap_hub/web.py` | pagina locale (solo 127.0.0.1, accesso con la passphrase, token CSRF) |
| `docmap_hub/plans.json` | piani predefiniti |

Codici di uscita di `licence verify`: 0 valida, 1 in tolleranza, 2 sola lettura, 3 non valida.
Per automazioni la passphrase può arrivare da `DOCMAP_HUB_PASSPHRASE` o `--passphrase-file`
(da non usare sul PC di tutti i giorni). Mai committare chiavi private o passphrase.
