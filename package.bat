@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "ENV_DEBUG=false"

call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
set "ELECTRON_BUILDER_OFFLINE=true"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
set "MAGICHAT_PACKAGE_CERTIFICATE_PATH=%ROOT%build\cert\MagicHat-Development.pfx"
set "MAGICHAT_PACKAGE_CERTIFICATE_PASSWORD=q1w2e3r4t5y6"

if not "%~1"=="" (
    echo Usage: package.bat
    endlocal & exit /b 2
)

if not exist "%MAGICHAT_PACKAGE_CERTIFICATE_PATH%" (
    echo Development signing certificate not found. Creating it...
    pwsh.exe -NoProfile -File "%ROOT%build\cert\create-development-certificate.ps1" || (
        endlocal & exit /b 1
    )
)
if not exist "%MAGICHAT_PACKAGE_CERTIFICATE_PATH%" (
    echo Development signing certificate was not created: %MAGICHAT_PACKAGE_CERTIFICATE_PATH%
    endlocal & exit /b 1
)

call npm run package
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
