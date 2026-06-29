@echo off
echo ========================================
echo   XHS Auto-Fetch Agent - Setup
echo ========================================
echo.

:: Check Node.js (also check common install paths if PATH not updated yet)
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%PATH%;%ProgramFiles%\nodejs"
        echo [OK] Node.js found at %ProgramFiles%\nodejs
    ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
        set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs"
        echo [OK] Node.js found at %LOCALAPPDATA%\Programs\nodejs
    ) else (
        echo [FAIL] Node.js not found. Please install from https://nodejs.org/
        echo        If just installed, try restarting your computer.
        pause
        exit /b 1
    )
) else (
    echo [OK] Node.js found
)

:: Install OpenCLI (non-fatal)
echo [INSTALL] Installing OpenCLI...
call npm install -g @jackwener/opencli
if %errorlevel% neq 0 (
    echo [WARN] OpenCLI install failed. Agent will start, but fetch needs OpenCLI.
    echo        Run "npm install -g @jackwener/opencli" manually later.
) else (
    echo [OK] OpenCLI installed
)

:: Auto-start setup
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"
copy "%SCRIPT_DIR%start-agent.vbs" "%STARTUP%\xhs-agent-autostart.vbs" >nul
echo [OK] Auto-start configured

:: Start agent now
echo [START] Launching agent...
"%SystemRoot%\System32\wscript.exe" "%STARTUP%\xhs-agent-autostart.vbs"
echo [OK] Agent running on port 19527

echo.
echo ========================================
echo   Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Install OpenCLI extension in Chrome
echo   2. Log in to XHS Creator Backend in Chrome
echo   3. Open the platform - click Auto Fetch
echo.
pause