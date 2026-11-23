# Listino Doc Location (bozza da validare con i primi 3-5 clienti)

> **File generato** da `hub/docmap_hub/plans.json` (unica fonte dei prezzi): non modificarlo a mano.
> Cambia i prezzi in `plans.json`, poi: `python -m docmap_hub listino --md ../docs/commerciale/LISTINO.md`.
> Prezzi IVA esclusa. Pagando l'anno anticipato: 10 mesi invece di 12. Aggiornato al 2026-11-23.
> I prezzi concordati con un singolo cliente non vanno qui: sono il suo **preventivo** (`cliente preventivo`).

## Piani

| Piano | Per chi | Incluso | Al mese | All'anno |
|---|---|---|---|---|
| **Prova gratuita** (`trial`) | chi vuole provare con i propri faldoni | 1 archivio, fino a 300 faldoni, 2 utenti, telefoni, etichette | **0 €** | 0 € |
| **Studio** (`studio`) | studio fino a 5 persone | 3 archivi, fino a 5.000 faldoni, 5 utenti, telefoni, etichette, backup | **39 €** | 390 € |
| **Studio Pro** (`studio_pro`) | studio grande o più sedi | 10 archivi, fino a 20.000 faldoni, 15 utenti, sincronizzazione sede ⇄ online, stati e registro, crediti AI | **89 €** | 890 € |
| **Archiviazione conto terzi** (`conto_terzi`) | società di archiviazione per conto terzi | 50 archivi, fino a 100.000 faldoni, 30 utenti, prelievi e consegne, crediti AI | **190 €** | 1.900 € |
| **Appliance (PC dedicato)** (`appliance`) | studio che vuole tutto in sede (mini-PC preconfigurato) | come Studio Pro con 10 utenti, tutto in sede; il mini-PC preconfigurato con backup cifrato si paga a parte + 600 € una tantum | **99 €** | 990 € |
| **Rivenditore (istanza propria)** (`reseller`) | rivenditore con il proprio marchio (white label) | marchio proprio su app, sito, pacchetti e lettere ai clienti; fino a 10 istanze 290 €/mese, fino a 30 istanze 590 €/mese, oltre 19 €/mese per istanza | **290 €** | 2.900 € |

## Moduli aggiuntivi

| Modulo | Al mese | All'anno | Note |
|---|---|---|---|
| Conservazione e scarto (verbale firmato) (`retention`) | 9 € | 90 € |  |
| Consegna e ritiro con firma sul telefono (`handover`) | 9 € | 90 € |  |
| Spazio online gestito (UE) (`hosting`) | 10 € | 100 € | incluso in Studio Pro, Conto terzi e Rivenditore |
| Lettura AI delle coste e compilazione dei campi (`ai`) | — | — | crediti prepagati: costo del fornitore AI × 2,5 |

## Servizi

| Servizio | Prezzo |
|---|---|
| Avvio: installazione, import dell'elenco clienti, prova di stampa, 1 ora di formazione | 300 € – 1.500 € una tantum |
| Giornata di etichettatura in studio | da 450 € (più trasferta) |
| Ora di formazione in più (anche online) | da 60 € |

## Regole

- Rinnovo automatico salvo disdetta 30 giorni prima della scadenza.
- I limiti (faldoni, utenti, archivi) sono scritti nella licenza: superarli non cancella né nasconde nulla, chiede solo di passare al piano superiore.
- Licenza scaduta: i giorni di tolleranza del piano, poi sola lettura (mai blocco dei dati, sempre esportabili).
- Rivenditore: incassa dal cliente finale al prezzo che sceglie; paga il canone del piano Rivenditore più le istanze oltre la soglia.
- Fattura elettronica (SDI). Pagamento con bonifico o link di pagamento.

## Prezzi per cliente (preventivo)

Il preventivo di un cliente contiene solo quello che cambia rispetto al listino: piano, fatturazione
(mensile o annuale), sconto in % **oppure** canone concordato, moduli, avvio, note, validità. Tutto il resto
viene da qui. Comandi: `cliente preventivo <cliente>` (mostra), `cliente preventivo <cliente> --piano studio_pro
--sconto 10 --moduli retention,handover` (imposta), `--azzera` (torna al listino). Guida: docs/MARCHIO.md §5.
