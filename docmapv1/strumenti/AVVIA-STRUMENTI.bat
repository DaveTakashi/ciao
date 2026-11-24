@echo off
rem Strumenti - avvio su Windows.
rem   AVVIA-STRUMENTI.bat              apre gli Strumenti nel browser (http://127.0.0.1:8091/)
rem   AVVIA-STRUMENTI.bat <comando>    esegue un comando, es.: AVVIA-STRUMENTI.bat info
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

if not exist "%~dp0docmap_strumenti\__init__.py" (
  echo.
  echo  Prima estrai TUTTO lo zip: tasto destro sullo zip, "Estrai tutto...",
  echo  poi avvia AVVIA-STRUMENTI.bat dalla cartella strumenti estratta.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Prima installazione: creo l'ambiente Python in "%~dp0.venv" ...
  where py >nul 2>nul
  if errorlevel 1 (
    python -m venv .venv
  ) else (
    py -3 -m venv .venv
  )
  if not exist ".venv\Scripts\python.exe" (
    echo ERRORE: Python 3.11 o successivo non trovato. Installalo da https://www.python.org/downloads/
    echo e spunta "Add python.exe to PATH" durante l'installazione.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo ERRORE: installazione delle librerie non riuscita ^(serve internet la prima volta^).
    pause
    exit /b 1
  )
)
rem libraries added by a newer version: install what is missing (fast when nothing changed)
".venv\Scripts\python.exe" -m pip install -q -r requirements.txt >nul 2>nul

if "%~1"=="" (
  ".venv\Scripts\python.exe" -m docmap_strumenti serve --open
) else (
  ".venv\Scripts\python.exe" -m docmap_strumenti %*
)
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%
