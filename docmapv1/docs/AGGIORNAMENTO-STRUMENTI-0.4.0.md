# Strumenti 0.4.0 — più modelli insieme, OCR senza AI a moduli, plugin

La base AI e OCR degli Strumenti è stata rifatta a **moduli**: un modulo per fornitore (Anthropic, OpenAI, Gemini,
Mistral, OpenRouter, servizi compatibili, vLLM, Ollama, LM Studio, llama.cpp, le tue workstation) e un modulo per
motore OCR (testo del file, Tesseract, PaddleOCR, il tuo servizio, l'AI). **Finché non cambi le impostazioni non
cambia niente**: profili, chiavi e workstation della 0.3.0 funzionano uguali. Nessuna migrazione: ricette, lavori,
crediti, licenza e registro restano come sono.

## Cosa fare

1. Chiudi gli Strumenti (chiudi la finestra nera).
2. Sostituisci la cartella `strumenti\` con quella dello zip nuovo (la cartella dati `%APPDATA%\DocMapStrumenti\` non
   si tocca). Nessuna libreria nuova obbligatoria (PaddleOCR è facoltativo: `pip install paddleocr paddlepaddle`).
3. Riavvia con `AVVIA-STRUMENTI.bat`: in basso **0.4.0**.
4. Impostazioni › **AI** › **Prova** sul profilo che usi: deve rispondere come prima.

## Cosa c'è di nuovo

- **Profili di tre tipi** (Impostazioni › AI › Profili, colonna «Tipo»):
  - **un modello** con le riserve, come prima;
  - **cascata**: prova i profili in ordine e si ferma appena la lettura è sicura (es. prima la workstation, Claude
    solo per le pagine difficili);
  - **confronto**: due o tre modelli leggono insieme, vale il valore su cui sono d'accordo; se non lo sono il campo
    diventa giallo in verifica.
- **Compiti**: quale profilo fa la lettura OCR, l'estrazione dei campi, la classificazione, l'analisi libera.
- **Fornitori nuovi**: Mistral, OpenRouter, LM Studio, llama.cpp (oltre a quelli di prima); chiavi per Mistral e
  OpenRouter nella stessa scheda.
- **OCR** (Impostazioni › OCR): tabella dei motori con lo stato, **ordine** dell'automatico, **soglia** sotto cui si
  passa al motore successivo (es. 0,8: Tesseract prima, l'AI solo dove serve), profilo AI dell'OCR, PaddleOCR.
  Il «Motore predefinito» ora vale davvero per le ricette con motore «auto».
- Ricette: i blocchi OCR, Estrai e Classifica hanno il campo **Profilo AI** (come «Analizza con l'AI»).
- **Plugin**: un fornitore o un motore OCR in più si aggiunge con un file `.py` nella cartella
  `%APPDATA%\DocMapStrumenti\plugins` (esempi in `strumenti\esempi-plugin\`, guida `docs/AI-FORNITORI.md` §8).
- **Riga di comando**: `python -m docmap_strumenti ai fornitori | profili | prova | confronta` — `confronta` legge
  una cartella di campioni con più lettori e dice chi legge meglio (anche contro un testo vero `<nome>.vero.txt`).

## Privacy

Con Claude, OpenAI, Gemini, Mistral o OpenRouter il documento va a quel fornitore (nomina a sub-responsabile, bozze
in `docs/commerciale/`). Con un **confronto** il documento va a **tutti** i membri. Con Ollama, vLLM, LM Studio,
llama.cpp o le tue workstation resta sulle tue macchine.

## Per tornare indietro

Rimetti la cartella `strumenti\` della 0.3.0. I profili «cascata» e «confronto», i compiti e le impostazioni OCR
nuove restano nel file ma vengono ignorati; i profili «un modello» funzionano come prima.
