@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
call npm run package -- %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
