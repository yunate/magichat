@echo off
chcp 65001 >nul
setlocal

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-all-natives.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
