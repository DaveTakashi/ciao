# DocMap Hub — PROGRESS

## Fatto
- licence.py (verificatore standalone), keys.py, registry.py, service.py, cli.py, plans.json — provati a mano.
- web.py (pagina locale 127.0.0.1 con login a passphrase, CSRF), tests/test_licence.py + tests/test_hub.py (39 test OK).

## Da fare
- README.md, run_windows.bat

## Prossimo passo esatto
- Scrivere README.md (italiano) e run_windows.bat

## Test
`cd docmapv1/hub && python -m unittest discover -s tests -v` — ultimo risultato: 39 test OK
