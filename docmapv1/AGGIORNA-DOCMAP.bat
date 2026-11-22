@echo off
rem DocMap - aggiorna il programma sul PC senza toccare i dati. Doppio clic, oppure trascina lo zip nuovo qui sopra.
rem Tornare alla versione di prima: AGGIORNA-DOCMAP.bat ripristina
setlocal
if /I "%~1"=="ripristina" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\aggiorna-app.ps1" -Ripristina
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\aggiorna-app.ps1" -Pacchetto "%~1"
)
endlocal
