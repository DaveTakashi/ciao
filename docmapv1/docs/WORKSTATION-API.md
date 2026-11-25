# Protocollo del gateway workstation (`docmap-workstation/1`)

Il gateway (`docmapv1/workstation/`, versione 0.1.0) gira su ogni workstation con la GPU e mette davanti ai server
dei modelli (vLLM, Ollama, llama.cpp, SGLang… tutto quello che parla il dialetto OpenAI Chat Completions) una porta
sola, protetta e uguale per tutte le macchine. Chi lo usa: il fornitore `workstation` degli Strumenti
(`workstations.py`); domani anche il sito e il server di sede (`docs/AI-FORNITORI.md` §5 A). Codice e commenti in
inglese, messaggi di errore in italiano.

## Autenticazione e rete

- Ogni richiesta (tranne `/dm/v1/ping`) porta `Authorization: Bearer <gettone>`. Nel file di configurazione del gateway
  c'è solo l'**impronta SHA-256** del gettone (`tokens[].sha256`), mai il gettone: si crea con
  `python3 -m docmap_workstation token-nuovo --nome hub` (lo mostra una volta sola). Un gettone per chi chiama
  (hub, ogni server degli Strumenti…): si revoca togliendo la sua riga.
- `allow_ips`: elenco di indirizzi o prefissi (`"10.8.0."`) ammessi; vuoto = tutti quelli che raggiungono la porta.
- Di serie ascolta su `127.0.0.1:8095`. In rete: VPN (WireGuard/Tailscale) oppure HTTPS davanti (Caddy/nginx).
- Il registro accessi (`log_file`, JSON Lines) contiene chi, quando, modello, esito, durata, dimensione: **mai** il
  contenuto dei documenti (GDPR).

## Endpoint

| Metodo e percorso | Gettone | Cosa fa |
|---|---|---|
| `GET /dm/v1/ping` | no | `{"ok": true, "api": "docmap-workstation/1"}`: per i monitor |
| `GET /dm/v1/health` | sì | stato completo (sotto) |
| `GET /v1/models` | sì | `{"object": "list", "data": [{"id": "inkling-2-mini", …}]}` (nomi pubblicati) |
| `POST /v1/chat/completions` | sì | come OpenAI; `model` = nome pubblicato; `stream` deve essere falso |
| `POST /dm/v1/read` | sì | lettura semplice: `ocr` → testo, `json` → oggetto |

### `GET /dm/v1/health`

```json
{"ok": true, "api": "docmap-workstation/1", "version": "0.1.0", "name": "kubuntu-1", "uptime_s": 3600,
 "models": ["inkling-2-mini"],
 "queue": {"running": 1, "waiting": 0, "max_parallel": 4, "max_waiting": 16},
 "gpus": [{"name": "…", "mem_used_mb": 21000, "mem_total_mb": 32768, "util": 64, "temp_c": 61}],
 "backends": [{"name": "vllm-inkling", "models": ["inkling-2-mini"], "running": 1, "waiting": 0, "max_parallel": 4, "done": 120, "errors": 0}]}
```

`gpus` viene da `nvidia-smi` (vuoto se non c'è). Chi sceglie la macchina usa `models` e `queue`.

### `POST /v1/chat/completions`

Corpo e risposta come OpenAI Chat Completions. Il gateway:

1. trova il backend che pubblica `model` (accetta anche il nome vero del backend); `model` vuoto con un solo modello
   pubblicato = quello;
2. unisce i `defaults` del backend (es. `temperature`) sotto la richiesta, mette il nome vero, `stream: false`;
3. aspetta un posto libero (`max_parallel` per backend); con più di `max_waiting` richieste in attesa risponde subito
   **429** con `Retry-After`;
4. risponde con `model` = nome pubblicato (chi chiama non vede i percorsi interni) e le intestazioni
   `X-DM-Workstation`, `X-DM-Backend`.

Il ragionamento dei modelli che lo separano resta in `choices[0].message.reasoning_content`; chi legge usa solo `content`.

### `POST /dm/v1/read`

```json
{"task": "ocr", "model": "inkling-2-mini", "image": {"mime": "image/jpeg", "data": "<base64>"}}
→ {"text": "…", "confidence": 0.9, "model": "inkling-2-mini", "ms": 2300, "usage": {…}}

{"task": "json", "model": "inkling-2-mini", "prompt": "Leggi la costa…", "schema": {"properties": {"title": {}}}, "image": {…}}
→ {"result": {…}, "model": "…", "ms": 2100, "usage": {…}}
```

Il testo `<think>…</think>` eventualmente rimasto nella risposta si toglie prima di leggere il JSON.

## Errori

Sempre JSON `{"error": {"message": "…", "type": "…"}}`: 400 `invalid`, 401 `unauthorized`, 403 `forbidden`
(indirizzo), 404 `unknown_model` (con l'elenco `models`), 413 `too_large`, 429 `busy` (con `Retry-After`),
502 `backend_down` / `backend_error`, 504 `timeout`. Chi chiama tratta 408/429/5xx come «prova un'altra macchina o la
riserva», il resto come errore vero.

## Compatibilità futura

Campi nuovi solo in aggiunta. Una versione incompatibile cambierà `api` (`docmap-workstation/2`) e i percorsi
(`/dm/v2/…`), lasciando attivi i vecchi per almeno un rilascio.
