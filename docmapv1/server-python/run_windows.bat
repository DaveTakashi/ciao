@echo off
rem DocMap server (Python) - avvio su Windows. Uso: run_windows.bat [--config C:\percorso\config.php] [--port 8080] [--root C:\deploy]
rem Altri comandi: run_windows.bat setup --data-dir C:\DocMapData --user "davide,admin" --user "mario,editor"
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creo l'ambiente Python in .venv ...
  py -3 -m venv .venv 2>nul || python -m venv .venv
  if errorlevel 1 ( echo Python 3.11 o piu' recente non trovato: installalo da https://www.python.org/ & pause & exit /b 1 )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 ( echo Installazione dei pacchetti non riuscita. & pause & exit /b 1 )
)
".venv\Scripts\python.exe" -m docmap_server %*
endlocal
