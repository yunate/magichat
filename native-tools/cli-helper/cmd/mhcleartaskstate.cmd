@echo off
setlocal

if not defined MAGICHAT_CLI (
  echo MAGICHAT_CLI is not configured. 1>&2
  exit /b 1
)

"%MAGICHAT_CLI%" clear-task-state %*
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%