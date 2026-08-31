@echo off
setlocal

where cl.exe >nul 2>nul
if not errorlevel 1 goto compile

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo magichat: MSVC was not found. Install Visual Studio C++ build tools. 1>&2
  exit /b 1
)

set "VS_INSTALLATION="
for /f "usebackq tokens=*" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS_INSTALLATION=%%I"
if not defined VS_INSTALLATION (
  echo magichat: Visual Studio C++ build tools are not installed. 1>&2
  exit /b 1
)

call "%VS_INSTALLATION%\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo magichat: Failed to initialize the MSVC x64 build environment. 1>&2
  exit /b 1
)

where cl.exe >nul 2>nul
if errorlevel 1 (
  echo magichat: cl.exe is unavailable after initializing MSVC. 1>&2
  exit /b 1
)

:compile

set "SOURCE=%~dp0index.cpp"
set "OUTPUT_DIR=%~dp0..\bin"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"
set "OBJECT=%OUTPUT_DIR%\magichat-cli.obj"
set "EXECUTABLE=%OUTPUT_DIR%\magichat-cli.exe"

cl.exe /nologo /std:c++20 /O2 /EHsc /utf-8 /MT /W4 /WX /DUNICODE /D_UNICODE /Fo:"%OBJECT%" /Fe:"%EXECUTABLE%" "%SOURCE%" /link /INCREMENTAL:NO
if errorlevel 1 exit /b 1

del /q "%OBJECT%" 2>nul
echo Built %EXECUTABLE%
exit /b 0
