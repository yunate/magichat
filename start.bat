@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "DEBUG=false"
set "REBUILD=false"
:parse_arguments
if "%~1"=="" goto arguments_parsed
if /I "%~1"=="debug" set "DEBUG=true"
if /I "%~1"=="rebuild" set "REBUILD=true"
shift
goto parse_arguments

:arguments_parsed
set "ENV_DEBUG=true"
set "MAGICHAT_START_REBUILD=%REBUILD%"

:: Ensure Node.js is installed
call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
call npm install --prefer-offline --no-audit --no-fund || exit /b 1
call npm run build:start || exit /b 1

set "NODE_OPTIONS=--enable-source-maps"
if "%DEBUG%"=="true" (
    call :ensure_port_available 9229 "debug" || exit /b 1
    call "%ROOT%node_modules\.bin\electron.cmd" --inspect=127.0.0.1:9229 .
) else (
    call "%ROOT%node_modules\.bin\electron.cmd" .
)

endlocal & exit /b %ERRORLEVEL%

:ensure_port_available
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
if not errorlevel 1 (
    echo [ERROR] %~2 port %~1 is already in use by another process.
    exit /b 1
)
exit /b 0
