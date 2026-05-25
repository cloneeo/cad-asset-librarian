@echo off
setlocal

set "ROOT=%~dp0"

start "ArchiVault API : FastAPI 8080" /D "%ROOT%" cmd /k "call .venv\Scripts\activate.bat && python -m uvicorn python_backend.main:app --reload --port 8080"
start "ArchiVault UI : Vite 3000" /D "%ROOT%" cmd /k "node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 3000"

endlocal
