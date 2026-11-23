@echo off
rem DocMap Hub - rimette un backup dell'hub (chiudi prima la pagina dell'hub).
rem I dati di adesso non si cancellano: vanno in %APPDATA%\DocMapHub\backups\prima-del-ripristino-<ora>\
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
if not exist ".venv\Scripts\python.exe" (
  echo Avvia prima run_windows.bat una volta: crea l'ambiente Python.
  pause
  exit /b 1
)
echo.
echo  Prima controllo l'hub, poi ti mostro i backup da scegliere.
echo.
".venv\Scripts\python.exe" -m docmap_hub controllo
echo.
".venv\Scripts\python.exe" -m docmap_hub ripristina-backup %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
