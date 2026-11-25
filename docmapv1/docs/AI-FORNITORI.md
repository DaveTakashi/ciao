# AI e OCR agnostici: fornitori, modelli, profili, strategie, motori OCR (Strumenti 0.4.0)

Per chi sviluppa e per chi configura. Descrive la **base** con cui gli Strumenti leggono i documenti con qualsiasi
modello AI (cloud o sulle tue macchine) e con qualsiasi OCR senza AI, e come **più modelli lavorano insieme** a
seconda della situazione, senza cambiare il codice quando cambiano i modelli. Protocollo delle workstation:
[`WORKSTATION-API.md`](WORKSTATION-API.md); installazione sulla workstation: [`../workstation/README.md`](../workstation/README.md).

## 1. Le parole

| Parola | Cos'è | Dove si cambia |
|---|---|---|
| **Fornitore** (modulo) | Il «modo di parlare» con un servizio AI: un modulo Python per famiglia (§2) | codice `strumenti/docmap_strumenti/ai/providers/`, o un plugin (§8) |
| **Modello** | Il nome vero (`claude-opus-5-5`) o un **alias** (`best`, `balanced`, `fast`, `ocr`, `inkling-2-mini`) | `ai_models.json` (alias di serie) o `ai.aliases` nelle impostazioni (vincono) |
| **Profilo** | «Chi legge cosa»: un modello, oppure una **cascata** o un **confronto** tra profili (§4) | Impostazioni › AI › Profili (`ai.profiles`) |
| **Compito** | Per cosa serve la chiamata: `ocr`, `extract`, `classify`, `analyze` | Impostazioni › AI › Compiti (`ai.tasks`) |
| **Motore OCR** | Un lettore di testo senza AI (o con, attraverso un profilo): un modulo per motore (§6) | codice `strumenti/docmap_strumenti/ocr_engines.py`, o un plugin |

Il vecchio setting unico (`ai.provider`, `ai.model`, `ai.base_url`, `ai.api_key`) è il profilo **`predefinito`**:
le installazioni 0.1-0.3 funzionano uguali senza toccare niente.

## 2. I moduli dei fornitori (e i loro sottomoduli)

Ogni famiglia è un modulo; le varianti di una famiglia (stesso protocollo, indirizzo e chiave diversi) sono
**sottomoduli** di poche righe.

| Modulo | Fornitore (`provider`) | Protocollo | Dove gira | Note |
|---|---|---|---|---|
| `anthropic.py` | `anthropic` | Messages API | cloud | schema JSON nativo (`output_config.format`), `effort`, alias `best/balanced/fast` |
| `gemini.py` | `gemini` | Google `generateContent` (nativo) | cloud | `responseMimeType` JSON, `generation_config`, istruzione di sistema; le parti «pensiero» si scartano |
| `openai_chat.py` | `openai` | Chat Completions | cloud | `max_completion_tokens`, schema JSON stretto, `reasoning_effort` da `effort` |
| ″ | `mistral` | Chat Completions | cloud | partenza `https://api.mistral.ai/v1` |
| ″ | `openrouter` | Chat Completions | cloud | partenza `https://openrouter.ai/api/v1`: centinaia di modelli con una chiave |
| ″ | `openai_compatible` | Chat Completions | dove dici tu | qualsiasi servizio compatibile (Azure, Groq, Together, DeepInfra…) con `base_url` |
| ″ | `vllm` | Chat Completions | tue macchine | partenza `http://127.0.0.1:8000/v1`; `extra_body` per le opzioni del modello |
| ″ | `ollama` | Chat Completions | tue macchine | partenza `http://127.0.0.1:11434/v1` |
| ″ | `lmstudio` | Chat Completions | tue macchine | partenza `http://127.0.0.1:1234/v1` |
| ″ | `llamacpp` | Chat Completions | tue macchine | `llama-server` (GGUF), partenza `http://127.0.0.1:8080/v1` |
| `local.py` | `workstation` | Chat Completions attraverso il **gateway** | tue macchine | più macchine, salute, la più libera, salto di quelle spente (§5) |
| ″ | `mock` | nessuno | — | per i test |

Tutti rispondono nella stessa forma: `{provider, model, profile, result, usage: {in, out}, ms, attempts}`
(+ `steps` per una cascata, `members` e `result._consensus` per un confronto, `workstation` per le workstation).

Opzioni che un profilo può avere (le usa chi le capisce, le altre si ignorano): `model`, `base_url`, `api_key`,
`timeout`, `max_tokens`, `effort` (`low`/`medium`/`high`), `temperature`, `top_p`, `seed`, `system`,
`extra_body` (campi aggiunti così come sono), `headers` (intestazioni in più), `json_mode: false` (per i server
che non accettano `response_format`), `generation_config` (Gemini), `workstations` (nomi delle macchine fissate).

**Chiavi.** Per fornitore in Impostazioni › AI › Chiavi (`ai.keys.<fornitore>`), per profilo (`api_key`), o con le
variabili d'ambiente `DOCMAP_AI_KEY_<FORNITORE>` (`DOCMAP_AI_KEY_ANTHROPIC`, `…_OPENAI`, `…_GEMINI`, `…_MISTRAL`,
`…_OPENROUTER`, anche quelle dei plugin). Le chiavi non escono mai verso il browser (`••••••`).

**Modelli e capacità.** Il catalogo (`ai_models.json` + `ai.models`) dice per ogni modello `vision`, `json_schema`,
`effort`, `reasoning`. Se un modello è segnato `"vision": false`, un profilo che riceve un'immagine passa subito
alla riserva invece di sbagliare. Per OpenAI, Gemini, Mistral e OpenRouter il catalogo **non** ha alias di serie: si
scrive il nome vero del modello nel profilo, così non c'è mai un nome inventato nel codice.

**Cambio rapido di modello.** Quando esce una generazione nuova si cambia una riga di alias
(`"best": "claude-opus-5-5"` → il nome nuovo) e tutti i profili che dicono `best` usano il modello nuovo.

**Modelli di ragionamento sulle tue macchine.** Alcuni server mettono il ragionamento dentro la risposta
(`<think>…</think>`): viene tolto prima di leggere il JSON (`clean_answer`). Con vLLM avviato con
`--reasoning-parser` il ragionamento arriva in un campo a parte (`reasoning_content`) e si ignora.

## 3. Quale profilo risponde

Per ogni chiamata, nell'ordine:

1. il profilo scelto nel passo della ricetta (parametro **Profilo AI** dei blocchi OCR, Estrai, Classifica, AI);
2. il profilo del **compito** in `ai.tasks` (`"ocr": "cascata"`, `"extract": "qualita"`…);
3. un profilo con **lo stesso nome del compito** (un profilo chiamato `ocr` serve tutte le letture OCR);
4. `ai.default_profile`;
5. `predefinito`.

Per il motore OCR «AI» c'è anche `ocr.ai_profile` (Impostazioni › OCR), che vale prima dei compiti.

## 4. Più modelli insieme: le tre strategie

```json
"ai": {
  "keys": {"anthropic": "…", "gemini": "…"},
  "profiles": {
    "locale":   {"provider": "workstation", "model": "inkling-2-mini", "fallback": ["veloce"]},
    "veloce":   {"provider": "anthropic", "model": "fast"},
    "qualita":  {"provider": "anthropic", "model": "best", "effort": "high"},
    "gemini":   {"provider": "gemini", "model": "<nome del modello Gemini>"},
    "cascata":  {"strategy": "cascade", "steps": ["locale", "qualita"], "min_conf": 0.8},
    "confronto": {"strategy": "consensus", "members": ["locale", "qualita", "gemini"], "min_agree": 2}
  },
  "tasks": {"ocr": "cascata", "extract": "confronto", "classify": "locale"}
}
```

| Strategia | Cosa fa | Quando conviene |
|---|---|---|
| **un modello** (`single`, di serie) | un fornitore e un modello; se è occupato (429), spento, lento, in errore del server (5xx) o non vede le immagini, la stessa richiesta passa ai profili di **riserva** (`fallback`). Un errore «vero» (chiave sbagliata, richiesta rifiutata) si ferma subito, così non si spende due volte. Al massimo 4 passaggi, i giri chiusi sono tagliati | sempre: la riserva cloud quando la workstation è piena |
| **cascata** (`cascade`) | i profili di `steps` leggono uno dopo l'altro; ci si ferma al primo con affidabilità ≥ `min_conf` (0,8); se nessuno ci arriva vince la lettura più sicura. Un passo che non risponde si salta | prima il modello locale (gratis, documenti in casa), il modello migliore solo per le pagine difficili |
| **confronto** (`consensus`) | i profili di `members` leggono la stessa cosa **in parallelo**; per ogni campo vince il valore su cui sono d'accordo in almeno `min_agree` (2); se sono in disaccordo l'affidabilità del campo scende sotto la soglia del giallo e la verifica lo mostra. Maiuscole, spazi e accenti non contano; testi lunghi «uguali» al 90%. Se risponde un solo membro la lettura non è mai «sicura» (≤ 0,49) | campi importanti (codice, ragione sociale, anni): due modelli diversi d'accordo valgono più di uno sicuro di sé |

Le strategie si annidano (un membro del confronto può essere una cascata, fino a 3 livelli). Il risultato del
confronto porta `_consensus` (per campo: quanti d'accordo su quanti, e i valori diversi) e `field_conf`: il blocco
«Analizza con l'AI» lo salva in `meta.ai_consensus`.

## 5. Le workstation (le tue macchine con la GPU)

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
PC: una rete privata (WireGuard o Tailscale) e `allow_ips` nel gateway. Mai la porta aperta su internet senza HTTPS
davanti (Caddy o nginx) e gettone. Dettagli in `workstation/README.md` §3.

## 6. OCR senza AI (e con): i motori

| Motore | Cosa | Dove gira | Affidabilità |
|---|---|---|---|
| `text` | il testo già dentro il file (PDF digitali, Word, Excel, TXT): nessun OCR | questo PC | 1 |
| `tesseract` | Tesseract, gratuito, molte lingue, posizione delle parole | questo PC | media delle parole |
| `paddleocr` | PaddleOCR (`pip install paddleocr paddlepaddle`), forte sulle scansioni, GPU facoltativa; lingua `ocr.paddle_lang` | questo PC | media delle righe, con le caselle |
| `remote` | un tuo servizio OCR via HTTP (`ocr.remote_endpoint`, contratto in `STRUMENTI.md` §2.5): per esempio sulla workstation | il tuo server | quella del servizio |
| `ai` | un profilo AI (anche cascata o confronto): `ocr.ai_profile`, poi il compito `ocr` | secondo il profilo | quella del modello |

**Automatico.** Il blocco OCR con motore `auto` usa il motore scelto in Impostazioni › OCR; se anche lì è
«automatico» prova `ocr.auto_order` (di serie `text → tesseract → paddleocr → remote → ai`) e tiene il primo motore
**pronto**. Con `ocr.escalate_below` (per esempio 0,8) diventa una **cascata OCR**: se l'affidabilità resta sotto la
soglia legge di nuovo con il motore successivo e tiene la lettura migliore (Tesseract prima, l'AI solo per le pagine
difficili). Un motore che si rompe si salta; i tentativi finiscono in `tried`.

Impostazioni › OCR mostra i motori con lo stato (pronto / non disponibile), l'ordine, la soglia e il profilo AI.

## 7. Misurare chi legge meglio: `ai confronta`

```bash
python -m docmap_strumenti ai fornitori                       # fornitori, alias, modelli noti, motori OCR
python -m docmap_strumenti ai profili                         # profili, strategie, compiti, plugin
python -m docmap_strumenti ai prova cascata --file costa.jpg  # una lettura con un profilo
python -m docmap_strumenti ai confronta --cartella CAMPIONI \
       --con ocr:tesseract,ocr:paddleocr,ai:locale,ai:qualita --out risultati.csv --max 50
```

`confronta` legge la prima pagina di ogni immagine/PDF della cartella con ogni lettore e scrive una riga per file e
lettore (testo, affidabilità, millisecondi, errore). La **verità** è facoltativa: un file `<nome>.vero.txt` accanto al
documento. Alla fine, per lettore: file letti, affidabilità media, tempo mediano, **somiglianza media al vero**; e per
ogni coppia di lettori quante volte sono d'accordo. È il modo per decidere con i numeri (Inkling sulla workstation
contro Claude contro Tesseract) prima di scegliere la cascata.

## 8. Aggiungere un fornitore o un motore OCR (plugin)

Senza toccare il programma: un file `.py` nella **cartella dei plugin** (`ai.plugins_dir`, di serie
`<cartella dei dati>/plugins`, cioè `%APPDATA%\DocMapStrumenti\plugins`). Si carica all'avvio e quando cambia; un
plugin rotto non ferma niente: l'errore compare in Impostazioni › AI e in `ai profili`. Solo l'amministratore del PC
può mettere file lì: è codice di cui ti fidi.

Esempi pronti in `strumenti/esempi-plugin/` (provati dai test):

- `esempio_fornitore.py`: un servizio compatibile OpenAI con indirizzo e chiave propri (3 righe, sottoclasse di
  `ChatVariant`) e un servizio con protocollo proprio (sottoclasse di `Provider` con `call`);
- `esempio_easyocr.py`: un motore OCR in più (EasyOCR) con le caselle delle parole.

Il contratto, in breve:

```python
from docmap_strumenti.ai import Provider, Request, AIError, register_provider, http, parse, json_hint, b64, timeout

@register_provider
class MioFornitore(Provider):
    id, label, family, cloud, needs_key = "mio", "Il mio fornitore", "cloud", True, True
    caps = {"vision": True, "json_schema": False, "effort": False, "reasoning": False}
    def call(self, p: dict, settings: dict, req: Request) -> dict:
        # p = il profilo; req.prompt, req.image (bytes, mime), req.schema, req.task
        # → {"model": "...", "result": {...}, "usage": {"in": 0, "out": 0}}
        # errore passeggero → raise AIError("...", retry=True): risponde la riserva

from docmap_strumenti.ocr_engines import OcrEngine, register_ocr, page_image

@register_ocr
class MioOCR(OcrEngine):
    id, label = "mio_ocr", "Il mio OCR"
    def available(self, settings) -> bool: ...
    def read(self, path, page, settings, opts) -> dict:
        # → {"text": "...", "conf": 0..1, "by": "mio_ocr", "words"?: [{t, c, x, y, w, h}], "size"?: [w, h]}
```

Un fornitore nuovo si usa scrivendo il suo `id` in un profilo; un motore nuovo compare nel blocco OCR e si può
mettere in `ocr.auto_order`. Per un fornitore che entra **nel programma** (non plugin): un modulo in
`ai/providers/`, importato in `ai/providers/__init__.py`, una riga in `ai_models.json`, un test in
`strumenti/tests/test_ai_v040.py`, questa tabella aggiornata.

**Dove sta il codice** (`strumenti/docmap_strumenti/`):

| File | Cosa |
|---|---|
| `ai/base.py` | `Provider`, `Request`, `AIError`, registro `PROVIDERS`, aiuti comuni (`http`, `parse`, `clean_answer`) |
| `ai/providers/*.py` | un modulo per famiglia di fornitori (§2) |
| `ai/catalogue.py` | alias e capacità dei modelli (`ai_models.json` + impostazioni) |
| `ai/router.py` | profili, compiti, riserva, cascata, confronto, `call()` |
| `ai/plugins.py` | caricamento dei plugin |
| `ocr_engines.py` | registro dei motori OCR |
| `providers.py` | punto d'ingresso dei blocchi (`ai_json`, `ocr_ai`, Tesseract, servizi HTTP) |
| `workstations.py` | elenco delle workstation, salute, scelta della più libera |
| `ai_cli.py` | `python -m docmap_strumenti ai …` |
| `ai_registry.py` | nome di prima (0.3.0), rimanda a `ai/` |

## 9. Il modello «Inkling 2 Mini» e il «loop» (ricerca del 2026-11-25)

Il modello di cui parla Dave è **Inkling 2 Mini** di **Thinking Machines Lab**, uscito il **20 novembre 2026**.
Quello che dicono le fonti (i numeri delle prove sono dichiarati dal produttore, non verificati da noi):

- Licenza **Apache 2.0**, pesi aperti: `thinkingmachines/Inkling-2-Mini` su Hugging Face.
- **MoE da 26,4 miliardi di parametri, circa 3,4 miliardi attivi** per passaggio: per questo è veloce anche su una
  scheda piccola.
- **Testo e immagini in ingresso** (lati dell'immagine tra 40 e 4096 pixel), testo in uscita, contesto fino a 1M token.
  Dichiarato **OmniDocBench v1.6 92,8%** (lettura di documenti), ScreenSpot Pro 76,5%, MMMU-Pro 74,9%.
- **«Loop» = looped transformer**: è l'**architettura**, non un protocollo di chiamata. I livelli 6-17 vengono
  ripercorsi **3 volte con gli stessi pesi** (48 passaggi per token invece di 24): il modello «ripensa» senza essere
  più grande. Nel Mini il numero di giri è **fisso a 3**: non c'è un parametro della richiesta per cambiarlo.
- Si serve con **vLLM** e risponde con l'API **compatibile OpenAI**:
  `vllm serve thinkingmachines/Inkling-2-Mini --reasoning-parser inkling --tool-call-parser inkling --enable-auto-tool-choice`.
  Gira anche con SGLang, llama.cpp (GGUF), Ollama, LM Studio; fratello più grande: Inkling 2 Small.

**Sulla workstation di Dave** (RTX 3060 da 12 GB, Kubuntu): Dave l'ha provato il 2026-11-25 e **gira bene e veloce
con 12 GB di VRAM**. Motore (Ollama, GGUF con llama.cpp, vLLM) e formato non sono ancora decisi: il gateway li tratta
tutti come backend intercambiabili (`workstation/README.md` §0), e qui sopra c'è un fornitore per ognuno.

**Cosa vuol dire per noi.** Non serve codice «speciale loop»: il gateway pubblica il modello come `inkling-2-mini`
(è già nell'esempio `workstation.esempio.json`) e gli Strumenti lo usano con il fornitore `workstation` (o `ollama`,
`llamacpp`, `vllm` diretti). Le cose specifiche del modello stanno nel profilo (`extra_body`, `temperature`) e nel
catalogo `ai_models.json`, non nel codice. Da misurare con `ai confronta` (§7): lettura delle coste vere, tempo per
faldone, uscita JSON stabile (per ora `response_format: json_object` e il controllo della risposta).

Fonti: [scheda del modello](https://thinkingmachines.ai/model-card/inkling-2-mini/) ·
[blog vLLM](https://vllm.ai/blog/2026-11-20-inkling2-mini) ·
[NVIDIA NeMo AutoModel](https://docs.nvidia.com/nemo/automodel/model-coverage/vision-language-models/thinkingmachines/Inkling-2-Mini) ·
[OrcaRouter](https://www.orcarouter.ai/blog/inkling-2-mini-released-looped-transformer).

## 10. Stato e cosa resta da fare (verificato nel codice il 2026-11-25)

| # | Cosa | Stato |
|---|---|---|
| 1 | Fornitori come moduli con sottomoduli (Anthropic, OpenAI, Gemini, Mistral, OpenRouter, compatibili, vLLM, Ollama, LM Studio, llama.cpp, workstation) | **fatto** (0.4.0) |
| 2 | Più modelli insieme: compiti, riserva, cascata, confronto in parallelo | **fatto** (0.4.0) |
| 3 | OCR senza AI come registro di motori (testo, Tesseract, PaddleOCR, servizio tuo) con ordine e cascata | **fatto** (0.4.0) |
| 4 | Plugin per fornitori e motori nuovi senza toccare il programma | **fatto** (0.4.0), esempi provati dai test |
| 5 | Misura dei lettori da riga di comando (`ai confronta`) | **fatto** (0.4.0) |
| 6 | Workstation con gateway: gettoni per progetto, coda, gemelle attivo-attivo | **fatto** (gateway 0.1.0) |
| 7 | **Sito PHP e server di sede** hanno ancora il loro codice AI (un fornitore per installazione) | da fare: passo A |
| 8 | I crediti contano le chiamate, non i token né il costo | i token tornano in ogni risposta (`usage`); **da collegare** (passo D) |
| 9 | Tutto provato solo con servizi finti | da collaudare: righe S11-S18 di `COLLAUDO-REALE.md` |

**Prossimi passi proposti:**

- **A. Stessi profili sul sito e sul server di sede** (`api.php`, `api.py`), con la stessa parità di oggi. Intanto il
  sito chiama il gateway come servizio compatibile OpenAI (`ai_provider = 'openai_compatible'`,
  `ai_base_url = https://…/v1`, `ai_api_key` = gettone della workstation).
- **D. Costi veri**: token × prezzo per profilo nel registro crediti (i prezzi restano in `plans.json`).
- **E. Gateway 0.2**: priorità (letture dal telefono prima dei lotti della notte), streaming, coda persistente.
- **F. OCR con posizioni dal modello**: le caselle delle parole anche dall'AI (oggi le danno Tesseract e PaddleOCR).
