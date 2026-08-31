@echo off
setlocal

if "%~3"=="" (
  echo Usage: call mhrun ^<script-type^> ^<script-path^> ^<command-path^> 1>&2
  exit /b 1
)

set "MAGICHAT_CLI_COMMAND_PATH=%~3"

if /i "%~1"=="powershell" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~2"
  goto complete
)
if /i "%~1"=="node" (
  node "%~2"
  goto complete
)
if /i "%~1"=="python" (
  python "%~2"
  goto complete
)
if /i "%~1"=="cmd" (
  call "%~2"
  goto complete
)

echo Unsupported script type: %~1 1>&2
exit /b 1

:complete
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%