@echo off
rem DocMap Hub - avvio su Windows.
rem   run_windows.bat              apre la pagina locale (http://127.0.0.1:8765/)
rem   run_windows.bat <comando>    esegue un comando, es.: run_windows.bat licence list
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

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
    echo ERRORE: installazione della libreria "cryptography" non riuscita.
    pause
    exit /b 1
  )
)

if "%~1"=="" (
  ".venv\Scripts\python.exe" -m docmap_hub web
) else (
  ".venv\Scripts\python.exe" -m docmap_hub %*
)
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%
