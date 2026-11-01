# DocMap Hub — PROGRESS

## Fatto (v0.1)
- `docmap_hub/licence.py` — formato + verificatore offline standalone (solo `cryptography`): `verify()`, `check_limits()`, `sign_licence()`, `canonical_json()`.
- `keys.py` (Ed25519, PKCS8 cifrato con passphrase, rotazione con `key_id`, export json/base64/pem).
- `registry.py` (SQLite, migrazioni additive `meta.schema_version`, audit log `events`).
- `service.py` (emissione, rinnovo, backup zip), `cli.py` (tutti i comandi, messaggi in italiano), `plans.json`.
- `web.py` (pagina 127.0.0.1, login con passphrase tenuta solo in memoria come hash scrypt, CSRF, controllo Host).
- `README.md` (installazione Windows, emissione, rivenditore, backup, contratto per il server), `run_windows.bat`.
- Test: `tests/test_licence.py`, `tests/test_hub.py`.

## Da fare (prossime versioni)
- Integrazione nel server Python (team server-python): copiare `licence.py`, costante `TRUSTED_LICENCE_KEYS`, endpoint licenza (vedi README §6).
- Facoltativo: revoca (lista di licence_id revocate distribuita con gli aggiornamenti), comando `restore`, export CSV del registro, gestione `plans.json` dalla pagina.

## Prossimo passo esatto
- Consegnare al team server il contratto README §6; prova reale su Windows di `run_windows.bat`.

## Test
`cd docmapv1/hub && python -m unittest discover -s tests -v` — ultimo risultato: 39 test OK (Python 3.13, cryptography 50, Linux).
