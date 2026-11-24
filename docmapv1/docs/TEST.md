# Test e controlli di DocMap — come sono fatti e come aggiungerne

Per agenti e sviluppatori. Le regole fisse sono in [`../CLAUDE.md`](../CLAUDE.md); qui c'è **cosa controlla cosa**,
quanto dura e come si scrive un test nuovo senza copiare codice.

## 1. I livelli

| Livello | Comando (da `docmapv1/`) | Durata | Cosa prende |
|---|---|---|---|
| Lint JavaScript | `NODE_PATH=$(npm root -g) node tools/lint-js.js` | 3 s | funzione chiamata che non esiste nella pagina, `const`/`let` dichiarato due volte fra file (la pagina smette di caricare quel file), funzione sostituita da un file successivo, file in `assets/js/` non caricato da nessuna pagina, chiavi doppie, codice irraggiungibile, confronti con `NaN`, … |
| Lint Python | `python3 tools/lint-py.py` | 2 s | nomi non definiti, funzioni ridefinite, chiavi doppie, `is` con un letterale (pyflakes; gli import inutilizzati sono solo contati) |
| Test unitari | `cd tests && NODE_PATH=$(npm root -g) node unit.js` | 5 s | le funzioni pure delle funzioni v12.10 (percorso, link del telefono, impronta, faldone smarrito, giorni, previsioni), con casi limite, dati ostili e proprietà su 300 archivi casuali, **in due fusi orari** (Roma, Auckland) |
| Aggiornamento | `cd tests && NODE_PATH=$(npm root -g) node upgrade.js [rif-git …]` | 15 s | regola «nessun dato perso» con i **rilasci veri** presi dalla storia git (26.12.7, 26.12.11, 26.12.12, 26.12.13, 26.12.14, 26.12.15): la versione vecchia crea i dati, quella nuova li apre nello stesso profilo del browser, poi si torna alla vecchia |
| Test delle funzioni | `cd tests && NODE_PATH=$(npm root -g) node v1210.js` (uno) o `node run.js` (tutti) | 40 s tutti insieme | ogni versione ha il suo file (`v126.js` … `v1210e.js`): percorsi reali nell'interfaccia, PC e telefono, server PHP vero dove serve |
| Strumenti | `cd strumenti && python3 -m unittest discover -s tests` | 30 s | 53 test (Tesseract installato anche nella CI): motore, blocchi su file finti (Tesseract vero se installato), coda, verifica, crediti, server, esecuzione remota, licenza dell'hub (`test_licence.py`) |
| Verifica veloce | `bash tools/verifica-veloce.sh` | ~4 min | tutto quanto sopra + sintassi, hub, server Python, parità PHP ⇄ Python, zip completo, installatore |
| Suite completa | `cd tests && NODE_PATH=$(npm root -g) node suite.js` | ~35 min | la specifica eseguibile (1376 controlli): ogni vista, ogni foglio di etichette, decodifica dei QR stampati, import/export, SQLite, server |
| CI su GitHub | `.github/workflows/docmap-ci.yml` (copia di `ci/docmap-ci.yml`) | — | la verifica veloce a ogni push e PR che tocca `docmapv1/`; la suite completa ogni notte o a mano |

Prima di ogni push: verifica veloce. Prima di un rilascio: anche la suite completa (`docs/RILASCIO.md`).

## 2. Scrivere un test nuovo

Un file per versione o funzione (`tests/v1211.js`), con l'aiuto comune `tests/lib/harness.js`:

```js
'use strict';
const H = require('./lib/harness');
H.run('v12.11 nome della funzione', async (t) => {
  const p = await t.page();                                    // index.html da file://, finestra iniziale chiusa
  t.ok(await p.evaluate(() => typeof pkRoute === 'function'), 'il modulo è caricato');
  t.eq(await p.evaluate(() => pkFmtMin(3600)), '1 h 00 min', 'un\'ora');
  const ph = await t.page('scan.html', {viewport: {width: 390, height: 844}, timezoneId: 'Europe/Rome'});
  // …
});   // a fine file: errori della console controllati da soli, riga «OK|✗ titolo: N passed, M failed», codice di uscita
```

- `t.ok(condizione, nome, dettagli)` e `t.eq(valore, atteso, nome)` (confronto JSON, stampa valore e atteso).
- Gli errori della console di ogni pagina aperta con `t.page()` fanno fallire il test; se uno è atteso,
  `t.allowErrors(/testo/)`.
- **Poi aggiungi il file all'elenco `FAST` di `tests/run.js`** (è l'elenco che usano la verifica veloce e la CI).
- Nomi dei controlli in inglese, chiari da soli (come nei file esistenti); il resto della documentazione in italiano.
- Mai dati veri: nomi inventati, `@example.test`, codici `dm26AAAAAAAA`.
- Un server PHP vero: guarda `v128.js` (porta casuale, `php -S` con `tests/php-router.php`).

## 3. Quando un controllo statico protesta

- `no-undef` su un nome che esiste solo in `scan.html` dentro un file condiviso: va bene se il codice controlla prima
  (`typeof X === 'function'`); un file condiviso viene controllato con i nomi di tutte le pagine che lo caricano.
- Un nome letto solo dietro `typeof` e non definito da nessuna parte (punto di estensione): aggiungilo a
  `OPTIONAL_GLOBALS` in `tools/lint-js.js` con il motivo.
- Una funzione ridefinita apposta da un file successivo: aggiungila a `ALLOWED_FUNCTION_OVERRIDES` con il motivo
  (oggi l'elenco è vuoto: preferisci un nome nuovo o un gancio `window.xxxHook`).
- Un file nuovo in `assets/js/` va messo in `index.html` e/o `scan.html`, altrimenti `orphan-file`.

## 4. Il test di aggiornamento

`tests/upgrade.js` estrae con `git archive` i rilasci elencati in `FROM` (oggi 26.12.7, quella installata in studio,
26.12.11, 26.12.12, 26.12.13, 26.12.14 e 26.12.15, il rilascio precedente). A ogni rilascio nuovo: sposta in `FROM` il rilascio appena superato (il commit
di merge della sua PR) e tieni quello installato da Dave. Si può provare qualsiasi versione:
`node upgrade.js 8ea8e57` (26.12.5). In CI serve tutta la storia (`fetch-depth: 0`, già impostato).

## 5. Fusi orari e date

Le date sono il punto dove i difetti si nascondono (cambio dell'ora, fine mese, anni bisestili). I test unitari
girano in Europa/Roma e in Pacifico/Auckland (ora legale in stagioni opposte). Una funzione nuova che lavora con
i giorni va aggiunta lì: è una riga.
