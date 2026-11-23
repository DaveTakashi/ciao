# Listino DocMap 2026 (bozza)

> Prezzi IVA esclusa, canone annuale anticipato. Da validare con i primi 3-5 clienti (fase F6 della roadmap).

## Piani

| Piano | Per chi | Incluso | Prezzo |
|---|---|---|---|
| **Studio** | studio fino a 5 persone | 1 archivio, fino a 3.000 faldoni, 5 utenti, telefoni, etichette, backup | **390 €/anno** |
| **Pro** | studio grande o più sedi | archivi illimitati, fino a 20.000 faldoni, 20 utenti, sincronizzazione sede ⇄ online, registro accessi | **890 €/anno** |
| **Conto terzi** | società di archiviazione | più clienti finali, giacenze e prelievi (modulo dedicato), utenti illimitati | **da 2.500 €/anno** |

I limiti (faldoni, utenti, archivi) sono scritti nella licenza: superarli non cancella né nasconde nulla, chiede solo
di passare al piano superiore.

## Installazione e servizi

| Voce | Prezzo |
|---|---|
| Avvio (installazione, import dell'elenco clienti, prova di stampa, formazione di 1 ora) | **300 – 1.500 €** una tantum, secondo la dimensione |
| Appliance in sede (mini-PC preconfigurato con backup cifrato) | **+600 €** una tantum |
| Spazio online gestito da QR7 (UE) | incluso nel piano Pro; per Studio **+120 €/anno** |
| Giornata di etichettatura in studio | […] €/giornata + trasferta |

## Servizio di inventario (lavoro a misura)

I prezzi a faldone, a scatola, a documento, la quota fissa e l'IVA **non si scrivono qui**: stanno in un posto solo,
**Impostazioni › Inventario** dell'app (valori di partenza nel codice: `INV_PRICE_DEFAULT` in
`assets/js/02f-inventory.js`, oggi di esempio). Il **preventivo** di un cliente si scrive nel suo progetto (un campo
vuoto usa il prezzo generale) e il report di fine lavoro calcola il totale da lì. Le condizioni privacy del lavoro:
`NOMINA-SUBRESPONSABILE-AI-BOZZA.md` e `INFORMATIVA-INVENTARIO-AI-BOZZA.md`.

## Moduli aggiuntivi (si accendono dalla licenza)

| Modulo | Stato | Prezzo indicativo |
|---|---|---|
| Conservazione e scarto (date di scarto, verbale PDF) | fatto (app 26.12.11), da provare con un consulente | +90 €/anno |
| Consegna e ritiro documenti con firma sul telefono | fatto (app 26.12.10) | +90 €/anno |
| Lettura AI (foto → campi compilati; fornitore a scelta, anche locale) | fatto (app 26.12.8, fornitori 26.12.12), mai provato con una chiave vera | crediti prepagati, ricarico 2-3× sul costo |
| White-label per rivenditori | in licenza (campo `reseller`, `branding`) | 30–40% al rivenditore sul canone |

## Regole

- Rinnovo automatico salvo disdetta 30 giorni prima della scadenza.
- Licenza scaduta: 30 giorni di tolleranza, poi **sola lettura** (mai blocco dei dati, sempre esportabili).
- Fattura elettronica (SDI). Pagamento con bonifico o link di pagamento.
