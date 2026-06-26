@echo off
chcp 65001 >nul
echo ========================================
echo   XHS 数据抓取工具 - 安装向导
echo ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js 已安装

:: Install OpenCLI
echo [安装] 正在安装 OpenCLI...
call npm install -g @jackwener/opencli
if %errorlevel% neq 0 (
    echo [错误] OpenCLI 安装失败
    pause
    exit /b 1
)
echo [OK] OpenCLI 已安装

:: Setup auto-start
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT_DIR=%~dp0
copy "%SCRIPT_DIR%start-agent.vbs" "%STARTUP%\xhs-agent-autostart.vbs" >nul
echo [OK] 已设置开机自启动

:: Start agent now
echo [启动] 正在启动抓取代理...
wscript "%STARTUP%\xhs-agent-autostart.vbs"
echo [OK] 代理已在后台启动 (端口 19527)

echo.
echo ========================================
echo   安装完成！
echo ========================================
echo.
echo 接下来请确保:
echo   1. Chrome 已安装 OpenCLI 扩展
echo   2. Chrome 已登录小红书创作者后台
echo.
echo 之后打开矩阵罗盘平台，点击「数据抓取」即可使用。
echo.
pause
