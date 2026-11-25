# Strumenti 0.3.0 — AI con qualsiasi fornitore, profili e le tue workstation

Gli Strumenti ora parlano con **Claude, OpenAI, Google Gemini**, servizi compatibili, **vLLM**, **Ollama** e con le
**tue workstation con la GPU** (attraverso il nuovo gateway, cartella `workstation\`). **Finché non cambi le
impostazioni non cambia niente**: l'AI che avevi scelto diventa il profilo «predefinito» e funziona come prima.
Nessuna migrazione: ricette, lavori, crediti, licenza e registro restano come sono.

## Cosa fare

1. Chiudi gli Strumenti (chiudi la finestra nera).
2. Sostituisci la cartella `strumenti\` con quella dello zip nuovo (la cartella dati `%APPDATA%\DocMapStrumenti\` non
   si tocca). Nessuna libreria nuova.
3. Riavvia con `AVVIA-STRUMENTI.bat`: in basso **0.3.0**.
4. Impostazioni › **AI** › **Prova** sul profilo «predefinito»: deve rispondere come prima.

## Cosa c'è di nuovo

- **Chiavi dei fornitori**: una per Anthropic, OpenAI e Gemini, valgono per tutti i profili.
- **Profili**: «chi legge cosa». Esempio: `ocr` = la tua workstation con Inkling 2 Mini, riserva `predefinito`
  (Claude); se la workstation è spenta o occupata risponde la riserva, il lavoro non si ferma.
- **Alias dei modelli**: nel campo Modello puoi scrivere `best`, `balanced`, `fast`, `ocr`: quando esce un modello
  nuovo si cambia l'alias una volta sola.
- Scheda **Workstation**: le tue macchine con il gateway (indirizzo + gettone) e «Controlla adesso» (modelli, coda, GPU).
- Ricette: il blocco «Analizza con l'AI» ha il campo **Profilo AI**; l'OCR «modello AI» usa il profilo `ocr` se c'è.

## La workstation Kubuntu (facoltativo)

Segui `workstation\README.md` (nello zip anche `guide\WORKSTATION-INSTALLAZIONE.html`): modello con vLLM, gateway,
gettone, avvio automatico. Il gateway si copia sulla workstation, non sul PC dello studio.

## Privacy

Con Claude, OpenAI o Gemini il documento va a quel fornitore (nomina a sub-responsabile, bozze in
`docs/commerciale/`). Con Ollama, vLLM o le tue workstation resta sulle tue macchine.

## Per tornare indietro

Rimetti la cartella `strumenti\` della 0.2.0. Le impostazioni nuove (profili, chiavi per fornitore, workstation)
restano nel file ma vengono ignorate; il profilo «predefinito» è la stessa impostazione di prima.
