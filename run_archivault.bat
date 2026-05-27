@echo off
setlocal

set "ROOT=%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CLI=C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
set "ComSpec=C:\Windows\System32\cmd.exe"
set "npm_config_script_shell=C:\Windows\System32\cmd.exe"

if not exist "%ROOT%node_modules\.bin\vite.cmd" (
  start "ArchiVault Setup : npm install" /D "%ROOT%" cmd /k ""%NODE_EXE%" "%NPM_CLI%" install && echo. && echo Dependencies installed. Close this window, then run run_archivault.bat again. && echo."
  exit /b
)

if not exist "%ROOT%.venv\Scripts\activate.bat" (
  start "ArchiVault Setup : Python venv missing" /D "%ROOT%" cmd /k "echo Missing .venv. Create it first, then install python_backend requirements. && echo python -m venv .venv && echo .venv\Scripts\activate && echo pip install -r python_backend\requirements.txt"
  exit /b
)

start "ArchiVault API : FastAPI 8080" /D "%ROOT%" cmd /k "call .venv\Scripts\activate.bat && python -m uvicorn python_backend.main:app --reload --host 127.0.0.1 --port 8080"
start "ArchiVault UI : Vite 3000" /D "%ROOT%" cmd /k ""%NODE_EXE%" "%NPM_CLI%" run dev"

timeout /t 4 /nobreak >nul
start "" "http://localhost:3000"

endlocal
