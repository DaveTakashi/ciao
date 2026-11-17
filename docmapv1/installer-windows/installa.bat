@echo off
rem DocMap - installazione in sede. Doppio clic: avvia installa.ps1 (chiede i permessi di amministratore).
rem Rieseguirlo = aggiornamento (backup prima, dati e configurazione non vengono toccati).
setlocal
cd /d "%~dp0"
if not exist "%~dp0installa.ps1" (
  echo.
  echo  Prima estrai TUTTO lo zip: tasto destro sullo zip, "Estrai tutto...",
  echo  poi fai doppio clic su installa.bat nella cartella estratta.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installa.ps1" %*
if errorlevel 1 pause
endlocal
