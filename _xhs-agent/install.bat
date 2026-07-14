@echo off
echo ========================================
echo   XHS Auto-Fetch Agent - Setup
echo ========================================
echo.

:: Check Node.js (also check common install paths if PATH not updated yet)
set "NODE_EXE="
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where node') do if not defined NODE_EXE set "NODE_EXE=%%i"
    echo [OK] Node.js found
)
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
    echo [OK] Node.js found at %ProgramFiles%\nodejs
)
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs"
    echo [OK] Node.js found at %LOCALAPPDATA%\Programs\nodejs
)
if not defined NODE_EXE (
    echo [FAIL] Node.js not found. Please install from https://nodejs.org/
    echo        If just installed, try restarting your computer.
    pause
    exit /b 1
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

:: Auto-start setup (generate VBS with absolute paths to node and agent.js)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"
>"%STARTUP%\xhs-agent-autostart.vbs" echo Set WshShell = CreateObject("WScript.Shell")
>>"%STARTUP%\xhs-agent-autostart.vbs" echo WshShell.Run """%NODE_EXE%"" ""%SCRIPT_DIR%agent.js""", 0, False
echo [OK] Auto-start configured

:: Start agent now (use full node.exe path, no VBS/PATH dependency)
echo [START] Launching agent...
start "XHS Agent" /min "%NODE_EXE%" "%SCRIPT_DIR%agent.js"
echo [OK] Agent running on port 19527

echo.
echo ========================================
echo   Setup complete!
echo ========================================
echo.
echo Next steps:
echo   1. Install OpenCLI extension in Chrome
echo   2. Log in to XHS Creator Backend in Chrome
echo   3. Open the platform - upload XHS post links
echo.
pause
