import sys

if sys.version_info < (3, 11):  # 0.11.1: a clear message instead of a traceback on an old Python
    sys.stderr.write("Errore: l'hub richiede Python 3.11 o successivo (consigliato 3.13); questo è Python "
                     f"{sys.version.split()[0]}. Installa Python da https://www.python.org/downloads/, poi cancella "
                     "la cartella .venv accanto a run_windows.bat e rilancialo.\n")
    sys.exit(1)

from .cli import main  # noqa: E402

sys.exit(main())
