@echo off

if "%~3"=="" (
  echo Usage: call mhrun ^<script-type^> ^<script-path^> ^<command-path^> 1>&2
  exit /b 1
)

call :run "%%~1" "%%~2" "%%~3" "%%MAGICHAT_CLI_COMMAND_PATH%%"
exit /b %ERRORLEVEL%

:run
set "MAGICHAT_CLI_COMMAND_PATH=%~3"
call :execute "%%~1" "%%~2"
set "MAGICHAT_CLI_COMMAND_PATH=%~4" & exit /b %ERRORLEVEL%

:execute
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
exit /b %ERRORLEVEL%