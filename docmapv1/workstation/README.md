# Gateway workstation 0.1.0 — installazione su Kubuntu (o un altro Linux)

Il gateway è un piccolo programma (solo Python 3.10+ standard, niente da installare con pip) che si mette sulla
workstation con la GPU, davanti al server del modello (vLLM, Ollama…). Tutti gli altri PC parlano solo con lui:
gettone, coda, nomi dei modelli sempre uguali, stato della GPU. Protocollo: [`../docs/WORKSTATION-API.md`](../docs/WORKSTATION-API.md).
Come si usa dagli Strumenti: [`../docs/AI-FORNITORI.md`](../docs/AI-FORNITORI.md).

## 0. La workstation di oggi e quella di domani

**Oggi** (macchina di prova di Dave, 2026-11-25): NVIDIA RTX 3060 con **12 GB di VRAM**, 32 GB di RAM DDR4, Xeon su
X99 (circa 14 core / 28 thread), SSD da 512 GB, Kubuntu, con Ollama già installato. Niente è ancora deciso: si
provano più motori (Ollama, GGUF con llama.cpp, vLLM…). Il gateway non ne sceglie uno: ognuno è un «backend» nel
file di configurazione, e si cambia senza toccare chi chiama.

Cosa vuol dire con 12 GB di VRAM:

- **Un lavoro alla volta sulla GPU**: nell'esempio i backend stanno nello stesso gruppo `gpu0` con 1 posto
  (`slot_groups`), così Ollama e un altro motore non si contendono la scheda; le altre richieste aspettano in coda
  (oltre `max_waiting` ricevono 429 e chi chiama passa alla riserva, per esempio Claude).
- **Modelli quantizzati (GGUF) con Ollama o llama.cpp**. Secondo il produttore Inkling 2 Mini vuole 32 GB di VRAM
  per il modello pieno; su 12 GB si usa una versione quantizzata con una parte del modello nella RAM normale:
  funziona ma è più lento. È un modello a esperti (pochi miliardi di parametri attivi per parola), il caso in cui
  tenere una parte nella RAM costa meno. Da misurare con le coste vere (righe S11-S14 del collaudo).
- `timeout` alto (600 s nell'esempio) e `max_parallel: 1` per Ollama.
- vLLM con il modello pieno non entra in 12 GB: resta nell'esempio come seconda strada, vuota, per quando ci sarà
  una scheda più grande.

**Domani**: due macchine **gemelle** sempre accese (H24) che servono le chiamate AI di **tutti i progetti di Dave**,
non solo di questo. Il gateway è già fatto per questo (§6).

## 1. Il modello

**Con Ollama** (quello che c'è oggi): `ollama pull <nome del modello>` e prova con
`curl http://127.0.0.1:11434/v1/models`. Nel file `workstation.json`, backend `ollama`, `models` collega il nome
pubblicato al nome che usa Ollama (`{"inkling-2-mini": "<nome in Ollama>"}`). Un GGUF scaricato a parte si importa
in Ollama con un `Modelfile` (`FROM ./file.gguf`, poi `ollama create`).

**Con vLLM** (scheda da 32 GB o più, modello pieno; il produttore indica circa 32 GB di VRAM):

```bash
docker run --gpus all --ipc=host -p 127.0.0.1:8000:8000 \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  vllm/vllm-openai:inkling-2-mini thinkingmachines/Inkling-2-Mini \
  --reasoning-parser inkling --tool-call-parser inkling --enable-auto-tool-choice
```

oppure, con vLLM installato: `vllm serve thinkingmachines/Inkling-2-Mini --reasoning-parser inkling`.
Prova: `curl http://127.0.0.1:8000/v1/models`. (`-p 127.0.0.1:8000:8000` = vLLM visibile solo dalla workstation:
dall'esterno si passa sempre dal gateway.)

## 2. Il gateway

```bash
sudo mkdir -p /opt/docmap-workstation && sudo chown $USER /opt/docmap-workstation
cp -r docmap_workstation workstation.esempio.json docmap-workstation.service /opt/docmap-workstation/
cd /opt/docmap-workstation && cp workstation.esempio.json workstation.json
nano workstation.json          # nome, backends (indirizzo di vLLM / Ollama e nomi dei modelli)
python3 -m docmap_workstation token-nuovo --nome strumenti     # copia il gettone: si vede una volta sola
python3 -m docmap_workstation controlla                        # prova ogni backend + GPU
python3 -m docmap_workstation serve                            # avvio a mano (Ctrl+C per chiudere)
```

Avvio automatico: modifica `User=` nel file `docmap-workstation.service`, poi

```bash
sudo cp docmap-workstation.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now docmap-workstation
journalctl -u docmap-workstation -f
```

In `workstation.json`, per ogni backend: `models` = `{"nome pubblicato": "nome vero nel backend"}`,
`max_parallel` = quante letture insieme (con vLLM 2-8, con Ollama 1), `defaults` = opzioni aggiunte a ogni richiesta.
Più modelli sulla stessa macchina = più backend (o più nomi nello stesso backend).

## 3. Come farla raggiungere da fuori (da decidere: le strade possibili)

Il gateway funziona uguale con tutte; cambia solo l'indirizzo che si scrive in chi chiama. Niente è deciso.

| Strada | Chi la raggiunge | Pro | Contro |
|---|---|---|---|
| **Rete di casa/ufficio** (`http://192.168.x.y:8095`) | solo i PC nella stessa rete | zero configurazione | i siti online non la vedono |
| **Tailscale** (rete privata, gratis per uso personale) | i PC e i server dove installi Tailscale | niente porte aperte sul router, indirizzi fissi `100.x` | i siti su hosting condiviso (SiteGround) non possono installarlo |
| **WireGuard** (rete privata tua) | come Tailscale | tutto in casa tua, nessun servizio terzo | va configurato a mano; serve una porta aperta o un piccolo server VPS come punto d'incontro |
| **Cloudflare Tunnel** | chiunque conosca l'indirizzo HTTPS (con il gettone) | niente porte aperte, HTTPS automatico, i siti su SiteGround la raggiungono | passa da un servizio terzo; aggiungere le regole di accesso di Cloudflare |
| **Porta aperta sul router + HTTPS** (Caddy davanti: `ai.tuodominio.it { reverse_proxy 127.0.0.1:8095 }`) | come sopra | nessun servizio terzo | IP di casa esposto, serve IP fisso o DNS dinamico, più attenzione alla sicurezza |

Regole che valgono sempre: mai la porta 8095 aperta su internet in chiaro (solo dietro HTTPS o dentro una VPN);
un gettone per chi chiama, revocabile togliendo la sua riga da `tokens`; `allow_ips` quando gli indirizzi sono
fissi (`["100."]` Tailscale, `["10.8.0."]` WireGuard); il registro accessi (`log_file`) non contiene mai i documenti.

## 4. Collegarla agli Strumenti

Strumenti › Impostazioni › **Workstation** › «+ Workstation»: nome, `http://<indirizzo>:8095`, gettone → **Controlla
adesso** (deve dire ok, i modelli e la GPU). Poi Impostazioni › AI › Profili: per esempio `ocr` con fornitore «Le mie
workstation», modello `inkling-2-mini`, riserva `predefinito` → **Prova**. Con più workstation si aggiungono righe:
ogni lettura va alla più libera che ha quel modello.

## 5. Più progetti sullo stesso gateway

Il gateway non sa niente dei progetti: pubblica modelli. Per tenerli separati si dà **un gettone per progetto**
(o per servizio), con un'etichetta e, se serve, l'elenco dei modelli che può usare:

```bash
python3 -m docmap_workstation token-nuovo --nome strumenti-studio --progetto archivio --modelli inkling-2-mini
python3 -m docmap_workstation token-nuovo --nome altro-servizio --progetto altro
```

Un gettone con `models` vede e usa solo quei modelli (gli altri danno 403); `project` finisce nel registro accessi,
così si vede quanto lavoro fa ogni progetto. Chi chiama può aggiungere l'intestazione `X-DM-Project` (anche questa
solo nel registro).

## 6. Due macchine gemelle sempre accese (H24)

Il gateway è pensato per l'«attivo-attivo»: due (o più) macchine con **lo stesso `workstation.json`** (stessi
modelli pubblicati, stessi gettoni; cambiano solo `name` e `role`, per esempio `primaria` e `gemella`). Chi chiama
le mette **tutte e due** nel suo elenco (Strumenti › Impostazioni › Workstation): ogni lettura va alla più libera;
se una si spegne, per manutenzione o guasto, la salta per `down_s` secondi e va sull'altra, senza fermarsi. Il
gateway non tiene dati: non c'è niente da sincronizzare tra le due macchine oltre al file di configurazione e ai
modelli. Quello che va specchiato (database, file, l'hub) è un altro lavoro, da progettare a parte.

## 7. Test

```bash
cd docmapv1/workstation && python3 -m unittest discover -s tests
```

Il backend `mock:` (risposta finta) serve per provare il gateway senza GPU.
