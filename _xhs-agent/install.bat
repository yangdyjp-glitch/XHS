@echo off
echo ========================================
echo   XHS Auto-Fetch Agent - Setup
echo ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] Node.js not found. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

:: Install OpenCLI (non-fatal: agent itself does not need it to start)
echo [INSTALL] Installing OpenCLI...
call npm install -g @jackwener/opencli
if %errorlevel% neq 0 (
    echo [WARN] OpenCLI install failed. Agent will start, but fetch will not work.
    echo        Please run "npm install -g @jackwener/opencli" manually later.
) else (
    echo [OK] OpenCLI installed
)

:: Setup auto-start
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"
copy "%SCRIPT_DIR%start-agent.vbs" "%STARTUP%\xhs-agent-autostart.vbs" >nul
echo [OK] Auto-start configured

:: Start agent now
echo [START] Launching agent in background...
wscript "%STARTUP%\xhs-agent-autostart.vbs"
echo [OK] Agent running on port 19527

echo.
echo ========================================
echo   Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Install OpenCLI extension in Chrome
echo   2. Log in to XHS Creator Backend in Chrome
echo   3. Open the platform and click "Auto Fetch"
echo.
pause
