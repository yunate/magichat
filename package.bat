@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

call "%ROOT%scripts\ensure-node.bat" || exit /b 1

cd /d "%ROOT%"
set "ELECTRON_BUILDER_OFFLINE=true"
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
set "MAGICHAT_PACKAGE_CERTIFICATE_PATH="
set "MAGICHAT_PACKAGE_CERTIFICATE_PASSWORD="

if not "%~3"=="" (
    echo Usage: package.bat [certificate.pfx^|certificate.p12] [certificate-password]
    endlocal & exit /b 2
)
if not "%~1"=="" (
    if not exist "%~f1" (
        echo Signing certificate does not exist: %~1
        endlocal & exit /b 2
    )
    for %%I in ("%~f1") do (
        if /i not "%%~xI"==".pfx" if /i not "%%~xI"==".p12" (
            echo Signing certificate must be a .pfx or .p12 file: %~1
            endlocal & exit /b 2
        )
    )
    set "MAGICHAT_PACKAGE_CERTIFICATE_PATH=%~f1"
    set "MAGICHAT_PACKAGE_CERTIFICATE_PASSWORD=%~2"
)

call npm run package
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
