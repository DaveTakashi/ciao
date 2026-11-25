# Gateway workstation 0.1.0 — installazione su Kubuntu (o un altro Linux)

Il gateway è un piccolo programma (solo Python 3.10+ standard, niente da installare con pip) che si mette sulla
workstation con la GPU, davanti al server del modello (vLLM, Ollama…). Tutti gli altri PC parlano solo con lui:
gettone, coda, nomi dei modelli sempre uguali, stato della GPU. Protocollo: [`../docs/WORKSTATION-API.md`](../docs/WORKSTATION-API.md).
Come si usa dagli Strumenti: [`../docs/AI-FORNITORI.md`](../docs/AI-FORNITORI.md).

## 1. Il modello (esempio: Inkling 2 Mini con vLLM)

Con Docker e il driver NVIDIA (servono circa 32 GB di VRAM o più secondo il produttore):

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

## 3. Sicurezza: come farla raggiungere dagli altri PC

1. **Consigliato: rete privata.** Tailscale o WireGuard su workstation e PC/server degli Strumenti. Nel gateway
   `"host": "0.0.0.0"` (o l'indirizzo della VPN) e `"allow_ips": ["100."]` (Tailscale) o `["10.8.0."]` (WireGuard).
2. **Da internet (es. il sito su SiteGround):** solo con HTTPS davanti (Caddy: `ai.tuodominio.it { reverse_proxy 127.0.0.1:8095 }`),
   gettone dedicato e, se possibile, `allow_ips` con l'indirizzo del server che chiama. Mai la porta 8095 aperta in chiaro.
3. Un gettone per chi chiama; per revocarlo togli la sua riga da `tokens` e riavvia.
4. Il registro accessi (`log_file`) non contiene i documenti, solo chi/quando/quanto.

## 4. Collegarla agli Strumenti

Strumenti › Impostazioni › **Workstation** › «+ Workstation»: nome, `http://<indirizzo>:8095`, gettone → **Controlla
adesso** (deve dire ok, i modelli e la GPU). Poi Impostazioni › AI › Profili: per esempio `ocr` con fornitore «Le mie
workstation», modello `inkling-2-mini`, riserva `predefinito` → **Prova**. Con più workstation si aggiungono righe:
ogni lettura va alla più libera che ha quel modello.

## 5. Test

```bash
cd docmapv1/workstation && python3 -m unittest discover -s tests
```

Il backend `mock:` (risposta finta) serve per provare il gateway senza GPU.
