# AI agnostica: fornitori, modelli, profili e workstation (Strumenti 0.3.0)

Per chi sviluppa e per chi configura. Descrive le **fondamenta** per usare qualsiasi modello AI (cloud o sulle tue
macchine) senza cambiare il codice quando cambiano i modelli. Il protocollo delle workstation è in
[`WORKSTATION-API.md`](WORKSTATION-API.md); l'installazione sulla workstation in [`../workstation/README.md`](../workstation/README.md).

## 1. Le tre parole: fornitore, modello, profilo

| Parola | Cos'è | Dove si cambia |
|---|---|---|
| **Fornitore** (adattatore) | Il «modo di parlare» con un servizio: `anthropic`, `openai`, `gemini`, `openai_compatible`, `vllm`, `ollama`, `workstation`, `mock` | codice: `strumenti/docmap_strumenti/ai_registry.py` (`ADAPTERS`) |
| **Modello** | Il nome vero (`claude-opus-5-5`) o un **alias** (`best`, `balanced`, `fast`, `ocr`, `inkling-2-mini`) | file `ai_models.json` (alias di serie) o Impostazioni › AI (`ai.aliases`, vincono) |
| **Profilo** | «Chi legge cosa»: fornitore + modello + opzioni + **riserva** | Impostazioni › AI › Profili (`ai.profiles`) |

- Il vecchio setting unico (`ai.provider`, `ai.model`, `ai.base_url`, `ai.api_key`) è il profilo **`predefinito`**:
  le installazioni 0.1-0.2 funzionano uguali, senza toccare niente.
- **Cambio rapido di modello** (model swapping): quando esce una generazione nuova si cambia una riga di alias
  (`"best": "claude-opus-5-5"` → il nome nuovo) e tutti i profili che dicono `best` usano il modello nuovo.
- Una ricetta sceglie il profilo con il parametro **Profilo AI** del blocco «Analizza con l'AI»; l'OCR con il motore
  «modello AI» usa il profilo `ocr` se esiste (Impostazioni › OCR, `ocr.ai_profile`), altrimenti `predefinito`.
- Un profilo può avere una **riserva** (`fallback`, uno o più profili): se il primo è occupato (429), spento, lento o
  in errore del server (5xx), la stessa richiesta passa al successivo. Un errore «vero» (chiave sbagliata, richiesta
  rifiutata) si ferma subito, così non si spende due volte. Al massimo 4 passaggi, i giri chiusi sono tagliati.

Esempio (`impostazioni.json` degli Strumenti):

```json
"ai": {
  "provider": "anthropic", "model": "fast",
  "keys": {"anthropic": "…", "openai": "…", "gemini": "…"},
  "default_profile": "ocr",
  "profiles": {
    "ocr":     {"provider": "workstation", "model": "inkling-2-mini", "fallback": ["predefinito"]},
    "qualita": {"provider": "anthropic", "model": "best", "effort": "high"},
    "gemini":  {"provider": "gemini", "model": "<nome del modello Gemini>"},
    "locale":  {"provider": "vllm", "model": "inkling-2-mini", "base_url": "http://10.8.0.2:8000/v1"}
  },
  "aliases": {"anthropic": {"best": "claude-opus-5-5"}}
},
"workstations": {"pool": [{"name": "kubuntu-1", "url": "http://10.8.0.2:8095", "token": "dmws_…"}]}
```

Le chiavi si possono dare anche con le variabili d'ambiente `DOCMAP_AI_KEY_ANTHROPIC`, `DOCMAP_AI_KEY_OPENAI`,
`DOCMAP_AI_KEY_GEMINI` (comodo su un server). Le chiavi non escono mai verso il browser (`••••••`).

## 2. I fornitori

| Fornitore | Protocollo | Note |
|---|---|---|
| `anthropic` | Messages API | schema JSON nativo (`output_config.format`), `effort`, alias `best/balanced/fast` |
| `openai` | Chat Completions su api.openai.com | `max_completion_tokens` (i modelli di ragionamento rifiutano `max_tokens`), schema JSON, `reasoning_effort` da `effort` |
| `gemini` | Google `generateContent` (nativo) | risposta JSON con `responseMimeType`; le parti «pensiero» (`thought`) si scartano |
| `openai_compatible` | Chat Completions | Mistral, Azure, OpenRouter, LM Studio… con `base_url` |
| `vllm` | Chat Completions | come sopra, partenza `http://127.0.0.1:8000/v1`; `extra_body` per le opzioni del modello |
| `ollama` | Chat Completions | partenza `http://127.0.0.1:11434/v1` |
| `workstation` | Chat Completions attraverso il **gateway** | più macchine, controllo di salute, scelta della più libera (§3) |
| `mock` | nessuno | per i test |

Per OpenAI e Gemini il catalogo **non** ha alias di serie: si scrive il nome vero del modello nel profilo, così non
c'è mai un nome inventato nel codice. Tutti rispondono nella stessa forma:
`{provider, model, profile, result, usage: {in, out}, ms, attempts}`.

**Modelli di ragionamento sulle tue macchine.** Alcuni server mettono il ragionamento dentro la risposta
(`<think>…</think>`): il registro lo toglie prima di leggere il JSON (`clean_answer`). Con vLLM avviato con
`--reasoning-parser` il ragionamento arriva in un campo a parte (`reasoning_content`) e si ignora.

## 3. Le workstation (le tue macchine con la GPU)

Ogni workstation ha il **gateway** (`docmapv1/workstation/`, solo Python standard) davanti ai suoi server di modelli
(vLLM, Ollama, llama.cpp…). Il gateway pubblica i modelli con nomi stabili (`inkling-2-mini`), controlla il gettone,
mette in coda le richieste e dice quanto è carico (`/dm/v1/health`).

Dal lato di chi chiede (`workstations.py`):

1. sceglie solo le workstation **attive**, che rispondono al controllo e **hanno il modello** richiesto;
2. tra queste prende la **più libera**: `(in corso + in attesa + chiamate partite da qui) / posti / peso`;
3. se una è occupata (429), spenta o lenta la salta per `down_s` secondi (60) e prova la successiva (fino a 3);
4. se nessuna è disponibile passa alla riserva del profilo (per esempio Claude).

Un profilo può fissare le macchine: `"workstations": ["kubuntu-1"]`. Il gateway serve **più progetti** (un gettone
per progetto, con i modelli permessi) e due **macchine gemelle** sempre accese si mettono entrambe nell'elenco:
se una si ferma lavora l'altra (`workstation/README.md` §5-6). Impostazioni › Workstation ha l'elenco
(nome, indirizzo, gettone, peso, attiva) e **Controlla adesso** (stato, modelli, coda, GPU di ognuna).

**Come farle parlare in modo sicuro.** Il gateway ascolta di serie solo su `127.0.0.1`. Per raggiungerlo da un altro
PC: una rete privata (WireGuard o Tailscale: indirizzi tipo `10.8.0.x` / `100.x`) e `allow_ips` nel gateway. Mai
la porta aperta su internet senza HTTPS davanti (Caddy o nginx) e gettone. Dettagli in `workstation/README.md`.

## 4. Il modello «Inkling 2 Mini» e il «loop» (ricerca del 2026-11-25)

Il modello di cui parla Dave è **Inkling 2 Mini** di **Thinking Machines Lab**, uscito il **20 novembre 2026**.
Quello che dicono le fonti (i numeri delle prove sono dichiarati dal produttore, non verificati da noi):

- Licenza **Apache 2.0**, pesi aperti: `thinkingmachines/Inkling-2-Mini` su Hugging Face.
- **MoE da 26,4 miliardi di parametri, circa 3,4 miliardi attivi** per passaggio; un solo file di circa 20 GB in
  NVFP4/MXFP8. Consigliati **32 GB o più di VRAM** (o una DGX Spark, o un Mac con 32 GB+ di memoria unificata).
- **Testo e immagini in ingresso** (lati dell'immagine tra 40 e 4096 pixel), testo in uscita, contesto fino a 1M token.
  Dichiarato **OmniDocBench v1.6 92,8%** (lettura di documenti), ScreenSpot Pro 76,5%, MMMU-Pro 74,9%.
- **«Loop» = looped transformer**: è l'**architettura**, non un protocollo di chiamata. I livelli 6-17 vengono
  ripercorsi **3 volte con gli stessi pesi** (48 passaggi per token invece di 24): il modello «ripensa» senza essere
  più grande. Nel Mini il numero di giri è **fisso a 3**: non c'è un parametro della richiesta per cambiarlo (esiste
  solo in un modello di ricerca, `TML-d24-varloop-research`, da 1 a 5 giri, impostato all'avvio del server).
- Si serve con **vLLM** (supporto dal primo giorno) e risponde con l'API **compatibile OpenAI**:
  `vllm serve thinkingmachines/Inkling-2-Mini --reasoning-parser inkling --tool-call-parser inkling --enable-auto-tool-choice`
  (l'immagine Docker ufficiale è `vllm/vllm-openai:inkling-2-mini`). Ragiona sempre un po' (lo sforzo si può
  abbassare ma non spegnere): con `--reasoning-parser inkling` il ragionamento arriva separato dalla risposta.
- Gira anche con SGLang, llama.cpp (GGUF della comunità), Ollama su Mac, Unsloth; fratello più grande: Inkling 2 Small.

**La workstation di Dave oggi** (RTX 3060 da 12 GB, 32 GB di RAM, Kubuntu, Ollama): il modello pieno non entra
in 12 GB; si prova una versione quantizzata (GGUF) con Ollama o llama.cpp e una parte nella RAM, un lavoro alla volta
sulla GPU (`slot_groups` del gateway) e la riserva cloud quando la coda è piena. Motore e modello non sono ancora
decisi: il gateway li tratta tutti come backend intercambiabili (`workstation/README.md` §0).

**Cosa vuol dire per noi.** Non serve codice «speciale loop»: sulla workstation si avvia vLLM con i comandi sopra, il
gateway lo pubblica come `inkling-2-mini` (è già nell'esempio `workstation.esempio.json`) e gli Strumenti lo usano con
il fornitore `workstation` (o `vllm` diretto). Le cose specifiche del modello stanno nel profilo (`extra_body`,
`temperature`) e nel catalogo `ai_models.json`, non nel codice. Da misurare sul serio: lettura delle coste vere
(banco di prova), tempo per faldone sulla GPU di Dave, uscita JSON stabile (le fonti non dicono se supporta lo schema
JSON vincolato: per ora si usa `response_format: json_object` e il controllo della risposta).

Fonti: [scheda del modello](https://thinkingmachines.ai/model-card/inkling-2-mini/) ·
[blog vLLM](https://vllm.ai/blog/2026-11-20-inkling2-mini) ·
[NVIDIA NeMo AutoModel](https://docs.nvidia.com/nemo/automodel/model-coverage/vision-language-models/thinkingmachines/Inkling-2-Mini) ·
[OrcaRouter](https://www.orcarouter.ai/blog/inkling-2-mini-released-looped-transformer) ·
[dev.to](https://dev.to/aleksei_aleinikov/inkling-2-mini-looped-transformers-architektur-benchmarks-lokal-setup-3jdp).

## 5. Autocritica di quello che c'era (PR #19-#22) e cosa resta da fare

Controllato nel codice il 2026-11-25.

| # | Cosa | Stato |
|---|---|---|
| 1 | Il codice AI è in **tre copie** (sito PHP, server Python di sede, Strumenti) con partenze diverse (Opus sul sito, Haiku negli Strumenti) | gli Strumenti ora hanno il registro; **sito e server di sede ancora no** (prossimo passo A) |
| 2 | Un solo fornitore per installazione, **nessuna riserva** né nuovo tentativo su 429/503 | **fatto** negli Strumenti (profili + riserva + workstation) |
| 3 | Con OpenAI vero si mandava `max_tokens`: i modelli di ragionamento di OpenAI lo rifiutano | **corretto** negli Strumenti (fornitore `openai`); sul sito usare per ora `openai_compatible` solo con modelli che lo accettano |
| 4 | Gemini solo attraverso la via compatibile | **fatto**: adattatore nativo |
| 5 | Modelli di ragionamento locali senza parser: il `<think>` rompeva il JSON | **corretto** negli Strumenti e nel gateway; sul sito vale se vLLM ha `--reasoning-parser` |
| 6 | I crediti contano le chiamate, non i token né il costo | i token ora tornano in ogni risposta (`usage`); **da collegare** al registro crediti |
| 7 | Nessun modo di provare il collegamento AI | **fatto**: Impostazioni › AI › Prova; Impostazioni › Workstation › Controlla adesso |
| 8 | Il sito su SiteGround non può raggiungere una workstation di casa senza esporla | gateway con gettone + `allow_ips`; serve HTTPS davanti (README) |
| 9 | Banco di prova solo dentro l'app, non da riga di comando | da fare (prossimo passo C) |
| 10 | Tutto provato solo con servizi finti | da collaudare: righe S11-S15 di `COLLAUDO-REALE.md` |

**Prossimi passi proposti** (in ordine):

- **A. Stessi profili sul sito e sul server di sede**: `ai_provider` `workstation`, `gemini`, `openai` in `api.php` e
  `api.py` con la stessa parità di oggi (il sito chiama il gateway come servizio compatibile OpenAI già oggi:
  `ai_provider = 'openai_compatible'`, `ai_base_url = https://…/v1`, `ai_api_key` = gettone della workstation).
- **B. Lettura a due livelli**: prima il profilo veloce/locale, poi `qualita` solo per i campi gialli (sotto
  `INV_FIELD_DOUBT`): meno costo, stessa qualità.
- **C. Banco di prova da riga di comando** sul file `docmap-inv-train`: lo stesso set letto da più profili
  (Inkling sulla workstation contro Claude), punteggio per campo, tempo e costo.
- **D. Costi veri**: token × prezzo per profilo nel registro crediti degli Strumenti (i prezzi restano in `plans.json`).
- **E. Gateway 0.2**: priorità (letture dal telefono prima dei lotti della notte), streaming, coda persistente.
- **F. OCR con posizioni**: chiedere al modello anche le caselle delle parole (per evidenziare in verifica e per
  addestrare il rilevatore dei dorsi).
