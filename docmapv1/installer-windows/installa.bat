@echo off
rem DocMap - installazione in sede. Doppio clic: avvia installa.ps1 (chiede i permessi di amministratore).
rem Rieseguirlo = aggiornamento (backup prima, dati e configurazione non vengono toccati).
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installa.ps1" %*
if errorlevel 1 pause
endlocal
