@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
:: set "HTTPS_PROXY=http://127.0.0.1:7890"
:: set "HTTP_PROXY=http://127.0.0.1:7890"

call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
if /i "%~1" == "login" goto github_login
call gh auth status >nul 2>&1
if errorlevel 1 goto github_login
goto publish

:github_login
call gh auth login --hostname github.com --web --git-protocol https || exit /b 1

:publish
call npm run publish:github
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%