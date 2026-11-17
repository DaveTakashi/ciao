@echo off
rem DocMap Hub - raccoglie le informazioni per l'assistenza in un file sul Desktop (niente password, niente codici).
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
set "OUT=%USERPROFILE%\Desktop\DocMap-info-per-assistenza.txt"
(
  echo DocMap Hub - informazioni per l'assistenza
  echo Data: %DATE% %TIME%
  echo Cartella del programma: %~dp0
  echo.
  echo == Windows
  ver
  echo.
  echo == Python
  where python 2>nul
  where py 2>nul
  python --version 2>&1
  if exist ".venv\Scripts\python.exe" ".venv\Scripts\python.exe" --version
  echo.
  echo == Cartelle accanto a hub
  dir /b ".."
  echo.
  echo == Hub
  if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m docmap_hub info
    ".venv\Scripts\python.exe" -m docmap_hub log --limit 30
  ) else (
    echo Ambiente Python non ancora creato: avvia prima run_windows.bat
  )
) > "%OUT%" 2>&1
echo.
echo  Fatto: %OUT%
echo  Mandalo all'assistenza (o incollalo nella chat). Non contiene password ne codici di accesso.
echo.
start "" notepad "%OUT%"
pause
endlocal
