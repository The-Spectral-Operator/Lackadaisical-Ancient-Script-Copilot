@echo off
setlocal EnableDelayedExpansion

:: Ancient Script Decipherment Copilot — Start Server (Windows)
:: Checks for existing instance, verifies Node.js, auto-creates .env, launches minimized

echo ============================================
echo  Ancient Script Decipherment Copilot
echo  Starting server on port 7340...
echo ============================================

:: Check if already running on port 7340
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":7340.*LISTENING"') do (
    echo [!] Server already running on port 7340 (PID: %%a)
    echo [!] Use stop-copilot.bat to stop it first.
    exit /b 1
)

:: Verify Node.js is available
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 22+ from https://nodejs.org
    exit /b 1
)

:: Check Node version
for /f "tokens=1 delims=v" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js found: v%NODE_VER%

:: Change to server directory
cd /d "%~dp0decipher-copilot\server"

:: Auto-create .env from example if not present
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] Created .env from .env.example
    ) else (
        echo DECIPHER_MODEL=gemma4:e4b> .env
        echo DECIPHER_VISION_MODEL=aurora-elwing-v2:latest>> .env
        echo OLLAMA_HOST=http://127.0.0.1:11434>> .env
        echo [OK] Created default .env
    )
)

:: Ensure logs directory exists
if not exist "%~dp0decipher-copilot\logs" mkdir "%~dp0decipher-copilot\logs"

:: Launch server minimized with output piped to log
echo [OK] Launching server (minimized)...
start /min "Decipher-Copilot" cmd /c "node --env-file=.env src/index.js > "%~dp0decipher-copilot\logs\server.log" 2>&1"

:: Wait and verify
timeout /t 3 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":7340.*LISTENING"') do (
    echo [OK] Server started successfully (PID: %%a)
    echo [OK] Dashboard: http://127.0.0.1:7340
    echo [OK] Logs: decipher-copilot\logs\server.log
    exit /b 0
)

echo [WARN] Server may still be starting. Check logs at decipher-copilot\logs\server.log
exit /b 0
