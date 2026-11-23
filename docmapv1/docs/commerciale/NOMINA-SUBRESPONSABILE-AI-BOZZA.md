# Allegato alla nomina art. 28 GDPR — inventario di archivi e lettura AI delle foto (bozza)

> **BOZZA PER IL LEGALE, NON USARE COSÌ.** Scritta da un agente software il 2026-11-23 sulla base di come funziona il
> programma (versione 26.12.13). Va rivista da un avvocato o da un consulente privacy prima di farla firmare. Dove c'è
> `[…]` va messo il dato vero; dove c'è **[DA VERIFICARE]** il legale deve controllare la norma o le condizioni del
> fornitore. Il testo non nomina un marchio: vale per il software con qualsiasi nome commerciale (anche in rivendita).

Si aggiunge alla nomina a responsabile del trattamento già firmata ([`NOMINA-RESPONSABILE-ART28.md`](NOMINA-RESPONSABILE-ART28.md))
oppure si usa da sola quando il servizio è soltanto l'inventario di un archivio.

**Titolare del trattamento**: […] (il cliente proprietario dell'archivio), in persona di […].
**Responsabile del trattamento**: […] (chi esegue l'inventario e/o ospita il software), in persona di […].

## 1. Oggetto

Inventario dell'archivio cartaceo del Titolare: etichette con codice QR su scatole, faldoni e, se richiesto, singoli
documenti; scansione con telefono o lettore; **fotografia della costa** del faldone (o della **prima pagina** per i
documenti e per le coste vuote); descrizione dettata a voce; catalogazione e revisione da parte di persone; report di
fine lavoro. Durata: dall'inizio del lavoro alla consegna del report e della copia dei dati, più il periodo di
conservazione del §6.

## 2. Dati trattati

- Testo visibile sulle coste e sulle prime pagine: nomi di ditte e di persone, anni, oggetto dei documenti, a volte
  codici fiscali, indirizzi, numeri di pratica. **Di norma non** categorie particolari (art. 9) né dati giudiziari
  (art. 10); possono esserci in archivi sanitari, del personale, legali o di enti: in quel caso **[DA VERIFICARE]**
  valutazione d'impatto (art. 35) e scelta della lettura **solo locale** (§3, modalità A o B).
- Parole dettate dall'operatore. Nomi degli operatori, orari delle scansioni, dispositivo usato (registro attività).
- I documenti cartacei restano dove sono: il software non li digitalizza per intero.

## 3. Lettura automatica (AI): tre modalità, scelte dal Titolare

Il Titolare sceglie **per ogni progetto** una delle modalità sotto (casella al §9). Il lavoro funziona con tutte e tre:
l'operatore non aspetta mai la lettura e ogni proposta dell'AI è controllata da una persona prima della conferma.

| | Modalità | Dove vanno le foto | Sub-responsabile per l'AI |
|---|---|---|---|
| A | **Nessuna AI** | solo il server del servizio | nessuno |
| B | **AI locale** (modello installato su un computer del Titolare o del Responsabile, es. Ollama, LM Studio) | non escono dalla rete indicata: […] | nessuno |
| C | **AI in cloud** (fornitore esterno) | anche al fornitore indicato sotto, una foto alla volta, cifrata in transito (HTTPS) | sì: il fornitore indicato |

Per la modalità C il Titolare **autorizza in modo specifico** (art. 28 par. 2) il seguente sub-responsabile:

- Fornitore: […] (es. Anthropic, oppure un altro servizio compatibile) — sede: […] — servizio: […] (API, uso
  commerciale) — modello: […].
- Trasferimento fuori dallo Spazio economico europeo: […] **[DA VERIFICARE]**: decisione di adeguatezza
  (EU-US Data Privacy Framework, se il fornitore è certificato) oppure clausole contrattuali tipo (art. 46) e
  valutazione del trasferimento.
- Condizioni del fornitore da verificare e allegare **[DA VERIFICARE]**: contratto di trattamento dati (DPA) del
  fornitore; uso dei dati per addestrare i modelli (deve essere escluso); per quanto tempo il fornitore conserva le
  richieste; dove le tratta; obblighi di riservatezza; notifica delle violazioni.
- Il Responsabile impone al sub-responsabile obblighi equivalenti a quelli della nomina (art. 28 par. 4) e resta
  responsabile verso il Titolare del suo operato.
- Cambio di fornitore AI: il Responsabile lo comunica con [30] giorni di anticipo; il Titolare può opporsi e passare
  alla modalità A o B senza costi.

## 4. Cosa riceve l'AI e cosa ne esce

- Riceve: una foto (costa o prima pagina), le parole dettate (al massimo 500 caratteri), l'elenco dei tag del progetto,
  l'intervallo di anni atteso e il nome del cliente. **Non** riceve l'anagrafica, gli altri faldoni né i nomi degli
  operatori.
- Restituisce: una proposta di ditta, titolo, anni, tipo di documento, tag (solo tra quelli del progetto), note e un
  grado di fiducia. La proposta **riempie solo campi vuoti**, non cancella quello che ha scritto una persona e non
  scrive mai codici interni del Titolare. Nessuna decisione automatica con effetti sulle persone (art. 22 non
  applicabile **[DA VERIFICARE]**).

## 5. Misure di sicurezza (art. 32) specifiche

- Foto cifrate sul server (AES-256-GCM, chiave del singolo sito), limite di dimensione, mai riscritte.
- Connessioni HTTPS; chiave del fornitore AI solo nel file di configurazione del server, mai sul telefono.
- Accesso con codici personali e ruoli (lettura / modifica / amministrazione); registro attività con chi ha scansionato,
  letto o confermato.
- Revisione umana obbligatoria per confermare; le proposte a bassa fiducia restano «da rivedere».
- Modalità B: il servizio AI locale risponde solo nella rete indicata; nessuna chiave verso l'esterno.

## 6. Conservazione e restituzione

- Foto e catalogo: per la durata del servizio; alla fine **restituzione** (esportazione dei dati e delle foto) e
  **cancellazione** dal server del Responsabile entro [30] giorni, salvo diverso accordo scritto. I backup cifrati
  si cancellano alla loro scadenza naturale ([…] giorni).
- Presso il fornitore AI (modalità C): secondo le sue condizioni, **[DA VERIFICARE]** (§3).

## 7. Diritti degli interessati e violazioni

Il Responsabile assiste il Titolare nelle richieste degli interessati (accesso, rettifica, cancellazione: le foto e le
schede si trovano per codice o per nome) e informa il Titolare di ogni violazione entro 48 ore dalla scoperta, anche se
riguarda il sub-responsabile AI.

## 8. Istruzioni per gli operatori

Fotografare solo la costa o la prima pagina richiesta; non fotografare persone, schermi o documenti aperti oltre la
prima pagina; non dettare dati non necessari (codici fiscali, stato di salute, …); segnalare al responsabile del
lavoro documenti con dati particolari.

## 9. Scelta del Titolare per il progetto […]

- [ ] A — Nessuna AI
- [ ] B — AI locale presso: […]
- [ ] C — AI in cloud con il sub-responsabile indicato al §3

Luogo e data […] · Il Titolare […] · Il Responsabile […]
