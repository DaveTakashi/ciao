# DocMap 2026 — Tag NFC oggi, varchi RFID domani (nota di progetto)

> Stato: **NFC implementato in v12** (`assets/js/11e-nfc.js`), **RFID solo progettato** (nessun codice, nessuna rotta).
> Per chi sviluppa il server o il sistema Python. Parole: [`GLOSSARIO.md`](GLOSSARIO.md) · dati:
> [`MODELLO-DATI.md`](MODELLO-DATI.md) §15.7 · API di oggi: [`API-CONTRACT.md`](API-CONTRACT.md).

## 1. Un'identità sola: `short_code`

Faldoni e ubicazioni hanno già un codice univoco e stabile, quello del QR: `dm26` + 8 caratteri (faldone) o
`dm26L` + 8 (ubicazione), con URL `https://qr7.it/<short_code>`. **Un tag NFC o RFID è solo un altro supporto dello
stesso codice**: non serve nessun id nuovo, nessuna tabella di abbinamento, nessun campo `tags_physical`.

| Supporto | Cosa contiene | Chi lo legge |
|---|---|---|
| QR stampato | l'URL `https://qr7.it/<short_code>` | fotocamera del telefono, webcam, lettore USB |
| Tag NFC (NTAG213/215/216) | **un record NDEF di tipo URL** con lo stesso URL | Android (Chrome, Web NFC) e iPhone (lettura nativa) |
| Tag RFID UHF (futuro) | l'EPC con il `short_code` codificato (§4) | varchi / antenne fissi, lettori a pistola |

## 2. NFC in v12

- **Scrivere** (scan.html, Chrome su Android, utente che può modificare): sulla scheda del faldone e sulla pagina
  dell'ubicazione **Scrivi su tag NFC** → `new NDEFReader().write({records:[{recordType:'url', data:short_url}]})`.
  Un record solo, l'URL del QR: il tag funziona anche senza DocMap (qualsiasi telefono apre l'indirizzo).
- **Leggere**: **Leggi tag NFC** avvia `NDEFReader.scan()` in modo continuo; ogni lettura va a
  `onTagScanned(testo, 'nfc')`. Lo stesso tag letto di nuovo entro 1,5 s viene ignorato; un tag vuoto o di un altro
  sistema mostra un messaggio.
- **iPhone**: Safari non ha Web NFC. iOS però legge da solo i tag NDEF con un URL e propone di aprirlo: si apre la
  stessa pagina del QR (scheda, modalità associazione attiva compresa). Scrivere i tag si fa da Android (o con
  un'app qualsiasi che scriva un record URL).
- Dove Web NFC non c'è (PC, iPhone, Firefox) i pulsanti **non compaiono**.

### 2.1 Un'unica pipeline per ogni scansione

```js
onTagScanned(text, via)   // via = 'qr' (fotocamera) · 'nfc' · 'keyboard' (lettore USB o digitato)
```

Gestori in ordine (`TAG_SCAN_HANDLERS`, vince il primo con `active()` vero):

| Pagina | id | Quando | Cosa fa |
|---|---|---|---|
| PC | `assoc` | Modalità associazione accesa | `locAssocInput(text, via)` (via di registro `camera` · `nfc` · `scanner`) |
| telefono | `assoc` | vista **Scansiona in sequenza** | `SA_API.saHandle(text, via)` (via di registro `phone-camera` · `phone-nfc` · `phone-typed`) |
| telefono | `open` | altrove | apre la pagina del faldone / dell'ubicazione letta |

Un'altra modalità (es. una "modalità stato" che registra *Preso* / *Reinserito* a ogni scansione) si aggiunge in testa:

```js
TAG_SCAN_HANDLERS.unshift({ id:'status', active:() => STATUS_MODE_ON, handle:(text, via) => applyStatus(text, via) });
```

## 3. Comportamenti dei tag (idea, non implementata)

Il tag resta un identificatore; il **comportamento** dipende dalla modalità attiva sul dispositivo che legge (come
oggi per il QR): aprire la scheda, associare a una scatola, registrare uno stato. Un "tag checkpoint" fisso (es.
sulla porta dell'archivio) si può già fare oggi con un'ubicazione dedicata (`Uscita archivio`) e la modalità
associazione: ogni faldone letto lì viene "messo" in quell'ubicazione e il registro attività tiene chi, quando e da
dove (`binder.locate` con `from`/`to`).

## 4. RFID: varchi tra stanze e uscite (progetto)

### 4.1 Codifica

Tag UHF EPC Gen2 (96 bit): i 12–13 caratteri del `short_code` stanno nell'EPC in ASCII a 6 bit, oppure il varco
tiene una tabella `EPC → short_code` scritta al momento dell'etichettatura (stampante RFID che stampa anche il QR). In
entrambi i casi DocMap riceve sempre il `short_code`, mai l'EPC grezzo.

### 4.2 Evento `checkpoint`

Il lettore (o un piccolo gateway sulla rete dello studio) invia gli eventi al server. Rotta proposta, **non presente**
in `api.php` né in `openapi.yaml`:

```
POST <apiBase>?r=checkpoint        ruolo: editor (un token dedicato per ogni gateway, revocabile)
{
  "reader":    "gate-archivio-1",            // id stabile del lettore / varco
  "antenna":   2,                            // facoltativo
  "events": [
    { "id": "<uuid generato dal gateway>",   // idempotenza: lo stesso id due volte = una volta
      "at": "2026-11-02T09:41:07.120Z",      // ora del lettore (UTC)
      "code": "dm26AbCdEfGh",                // short_code letto (faldone o ubicazione: lo dice il formato)
      "direction": "in" | "out" | "pass",    // verso del passaggio, se il varco ha due antenne
      "rssi": -54 }                          // facoltativo, per filtrare letture deboli
  ]
}
→ 200 {"accepted": n, "duplicates": n, "unknown": ["dm26…"], "seq": n}
```

Regole proposte:

- **Solo append**: gli eventi non modificano il faldone (niente LWW, nessun conflitto); diventano righe del registro
  attività `binder.checkpoint` `{reader, direction, at}` con `source:'rfid'`, cifrate come le altre.
- **Configurazione dei varchi** come record generico (tipo `reader`: `{id, name, from_location_id, to_location_id}`):
  così `direction:'in'` sul varco "Archivio → Corridoio" può proporre (non imporre) lo spostamento del faldone
  nell'ubicazione di destinazione, oppure uno stato "Fuori archivio".
- **Rumore**: il gateway accorpa le letture dello stesso tag entro una finestra (es. 3 s) e manda un solo evento.
- **Riservatezza**: il varco conosce solo codici; nomi e contenuti restano nel database cifrato.
- Il PC e il telefono li vedono al pull successivo (registro attività, "ultimo passaggio" nella scheda).

### 4.3 Cosa serve per farlo davvero

1. Rotta `checkpoint` in `api.php` (+ `openapi.yaml`, `API-CONTRACT.md`, test), nessuna migrazione: usa la tabella
   del registro attività.
2. Tipo di record `reader` in `DM_TYPES` e una piccola schermata di configurazione dei varchi.
3. Un gateway (script Python sul PC dello studio o firmware del lettore) che parla con l'antenna e chiama la rotta.
