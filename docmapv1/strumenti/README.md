# Strumenti (`docmap_strumenti`) — manuale per sviluppatori

Ricette di blocchi per lavorare su cartelle di documenti: segmentazione, conversione, OCR, campi, AI, servizi esterni,
verifica a mano veloce, coda di lavori locale o remota, crediti. Guida per chi lo usa e progetto completo:
[`../docs/STRUMENTI.md`](../docs/STRUMENTI.md). Versione in `docmap_strumenti/__init__.py` (`__version__`, `RECIPE_FORMAT`).

## Avvio

```bash
python3 -m pip install -r requirements.txt
python3 -m docmap_strumenti serve --open            # http://127.0.0.1:8091/#k=<chiave locale>
python3 -m unittest discover -s tests               # 53 test, ~30 s (il test Tesseract si salta se manca)
```

Su Windows `AVVIA-STRUMENTI.bat` crea `.venv`, installa i requisiti e apre il browser.

## Moduli

| File | Cosa fa |
|---|---|
| `items.py` | `Item` (il documento in lavorazione), `render()` dei modelli `{campo|filtro}`, `safe_part()` |
| `registry.py` | `@block`, `P` (parametri tipizzati), catalogo per l'interfaccia, validazione dei parametri |
| `recipe.py` | `validate()`, condizioni `when` (`matches()`), `Store` versionato, `templates()` |
| `engine.py` | `Engine` (passi, stato su disco, ripresa dopo la verifica, file in parallelo), `Context`, `preview()` |
| `blocks/*.py` | i 20 blocchi |
| `media.py` | PDF, TIFF, immagini, tabelle (lettura e scrittura) |
| `providers.py` | OCR (Tesseract, AI, servizio), AI (anthropic, openai_compatible, ollama, mock), servizi HTTP |
| `validators.py` | date, importi, P.IVA, codice fiscale, IBAN |
| `jobs.py` | `Store` (SQLite: jobs, ledger, tokens, audit), `Queue`, `review_apply()` |
| `remote.py` | esecuzione su un altro server (`run_remote`) |
| `licensing.py` | licenza dell'hub: verifica, installazione, `entitlements()` (lavori, modalità, crediti) |
| `licence_verify.py` | copia **identica** di `hub/docmap_hub/licence.py`: non modificarla qui, ricopiala |
| `server.py` | API HTTP + pagina `ui/` |
| `cli.py` | riga di comando |

## Aggiungere un blocco

```python
from ..registry import P, block

@block("stamp", "Timbra", "conversione",
       help="Spiegazione in italiano semplice: cosa fa, quando usarlo.",
       params=[P("text", "template", "{numero}", "Testo del timbro", "puoi usare le variabili")],
       meters=["page"])
def stamp(it, p, ctx):              # kind="map": una chiamata per documento; kind="batch": (items, p, ctx) -> items
    out = ctx.step_dir() / it.id / it.p.name   # i file nuovi vanno nella cartella del passo, mai sopra l'originale
    ...
    it.path = str(out)
    return it                        # oppure una lista (divisione) o [] (scartato)
```

1. Importa il modulo in `blocks/__init__.py`. Se il blocco è lento (rete, OCR, immagini) aggiungilo a `HEAVY` in `engine.py`.
2. Usa `ctx.meter("…")` prima di ogni azione che costa crediti; `it.flag("motivo")` per mandare in verifica;
   `it.set_field(nome, valore, affidabilità, by)` (non tocca i campi certificati).
3. Testo per l'utente in italiano, codice in inglese, **nessun nome di prodotto** (usa `branding.brand_name()`).
4. Un test in `tests/test_blocks.py` con i file finti di `tests/fixtures.py`; poi `bash ../tools/verifica-veloce.sh`.

## Regole

- Licenza: `settings.effective()` applica i diritti della licenza (modalità, tetto dei crediti) sopra
  `impostazioni.json`; `server.need_licence()` ferma solo prove, lavori nuovi e caricamenti, mai verifiche e risultati.
  Chiavi di fiducia solo in `trusted_keys.json` accanto al codice (`settings.licence.public_keys` solo per i test).

- Una ricetta salvata non si modifica: si salva una versione nuova. Le ricette pronte (`templates/*.json`) devono passare
  `recipe.validate` (test `test_templates_all_valid`).
- I segreti stanno solo in `impostazioni.json` (o nelle variabili `DOCMAP_AI_API_KEY`, `DOCMAP_REMOTE_TOKEN`); l'API li
  restituisce mascherati.
- Un errore in un documento non ferma gli altri; un passo non scrive mai fuori dalla cartella del lavoro o di arrivo.
- I gettoni dei clienti si salvano solo come impronta sha256; un cliente remoto vede solo i propri lavori.
