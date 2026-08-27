@echo off
setlocal

where npm >nul 2>&1
if not errorlevel 1 (
  endlocal & exit /b 0
)

echo npm was not found. Attempting to install Node.js LTS with winget...
where winget >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Install Node.js from https://nodejs.org/ and retry.
  endlocal & exit /b 1
)

winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo [ERROR] Node.js installation failed.
  endlocal & exit /b 1
)

echo Node.js was installed. Open a new terminal and run the command again.
endlocal & exit /b 1