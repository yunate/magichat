@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "HTTPS_PROXY=http://127.0.0.1:7890"
set "HTTP_PROXY=http://127.0.0.1:7890"

call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
call gh auth login --web --git-protocol https || exit /b 1
call npm run publish:github
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%