@echo off
setlocal

set "commandPath=%~1"
set commandPath | findstr /b /l /c:"commandPath=(" >nul
if not errorlevel 1 call :unwrapFunctionCall

if not defined commandPath (
  echo Usage: call mhcall ^<path^> 1>&2
  exit /b 1
)

if not defined MAGICHAT_CLI (
  echo MAGICHAT_CLI is not configured. 1>&2
  exit /b 1
)

set "preparationOutput=%TEMP%\magichat-cli-%RANDOM%-%RANDOM%.tmp"
"%MAGICHAT_CLI%" prepare "%commandPath%" > "%preparationOutput%" 2>&1
set "preparationExitCode=%ERRORLEVEL%"
if not "%preparationExitCode%"=="0" (
  for %%F in ("%preparationOutput%") do if %%~zF GTR 0 (
    <nul set /p "=MagicHat command preparation failed: " 1>&2
    type "%preparationOutput%" 1>&2
  ) else (
    echo MagicHat command preparation failed with exit code %preparationExitCode%. 1>&2
  )
  del /q "%preparationOutput%" >nul 2>&1
  exit /b %preparationExitCode%
)

set "scriptType="
set "scriptPath="
set "resolvedCommandPath="
for /f "usebackq tokens=1,2,* delims=|" %%I in ("%preparationOutput%") do if not defined scriptType (
  set "scriptType=%%I"
  set "scriptPath=%%J"
  set "resolvedCommandPath=%%K"
)
del /q "%preparationOutput%" >nul 2>&1
if not defined scriptType (
  echo MagicHat command preparation did not return a run description. 1>&2
  exit /b 1
)
if not defined scriptPath (
  echo MagicHat command preparation did not return a run description. 1>&2
  exit /b 1
)
if not defined resolvedCommandPath (
  echo MagicHat command preparation did not return a run description. 1>&2
  exit /b 1
)

call mhrun "%scriptType%" "%scriptPath%" "%resolvedCommandPath%"
set "exitCode=%ERRORLEVEL%"
endlocal & exit /b %exitCode%

:unwrapFunctionCall
set "commandPath=%commandPath:~2,-2%"
exit /b