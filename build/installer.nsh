!include "${PROJECT_DIR}\build\generated-version.nsh"

!macro stopPackagedMagicHat
  Push $R9
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& { $$root = [IO.Path]::Combine($$env:LOCALAPPDATA, 'MagicHat\version\'); $$processes = @(Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$root, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($$_.ExecutablePath) -ieq 'MagicHat.exe' }); if ($$processes.Count -gt 0) { Stop-Process -Id $$processes.ProcessId -Force -ErrorAction SilentlyContinue; Wait-Process -Id $$processes.ProcessId -Timeout 10 -ErrorAction SilentlyContinue } }"`
  Pop $R9
  Pop $R9
!macroend

!macro customInstall
  SetShellVarContext current
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${If} ${FileExists} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    Abort "Failed to remove the unused installer cache."
  ${EndIf}
  RMDir "$LOCALAPPDATA\magichat-updater"

  StrCpy $R0 "$LOCALAPPDATA\MagicHat"
  StrCpy $R1 "$R0\tmp\draft\${MAGICHAT_VERSION}"
  StrCpy $R2 "$R0\version\${MAGICHAT_VERSION}"

  DetailPrint "Stopping MagicHat."
  !insertmacro stopPackagedMagicHat
  RMDir /r "$R1"
  RMDir /r "$R2"
  IfFileExists "$R1\." 0 +2
    Abort "Failed to remove the previous MagicHat ${MAGICHAT_VERSION} draft."
  IfFileExists "$R2\." 0 +2
    Abort "Failed to remove the previous MagicHat ${MAGICHAT_VERSION} installation."

  RMDir /r "$APPDATA\magichat\data\themes\white"
  SetOutPath "$APPDATA\magichat\data\themes"
  File /r /x "dark" /x "mainTheme.css" /x "theme.ts" "${PROJECT_DIR}\client\src\windows\main\themes\*.*"

  File /oname=$PLUGINSDIR\launcher.exe "${PROJECT_DIR}\native-tools\launcher\bin\launcher.exe"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\${UNINSTALL_FILENAME}" "$PLUGINSDIR\${UNINSTALL_FILENAME}"
  ${If} ${Errors}
    Abort "Failed to preserve the MagicHat uninstaller."
  ${EndIf}
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  Delete "$INSTDIR\uninstallerIcon.ico"
  ${If} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    Abort "Failed to separate the MagicHat uninstaller from the application files."
  ${EndIf}

  CreateDirectory "$R0\version"
  SetOutPath "$TEMP"
  ClearErrors
  Rename "$INSTDIR" "$R2"
  ${If} ${Errors}
    Abort "Failed to move MagicHat ${MAGICHAT_VERSION} into its version directory."
  ${EndIf}
  nsExec::ExecToLog `"$SYSDIR\icacls.exe" "$R2" /reset /T /Q`
  Pop $R3
  ${If} $R3 != 0
    Abort "Failed to reset MagicHat ${MAGICHAT_VERSION} file permissions."
  ${EndIf}
  ${IfNot} ${FileExists} "$R2\MagicHat.exe"
    Abort "MagicHat ${MAGICHAT_VERSION} has no application executable."
  ${EndIf}

  DetailPrint "Activating MagicHat ${MAGICHAT_VERSION}."
  ClearErrors
  FileOpen $R3 "$R0\active-version.tmp" w
  ${If} ${Errors}
    Abort "Failed to open the MagicHat active-version temporary file."
  ${EndIf}
  FileWrite $R3 "${MAGICHAT_VERSION}"
  ${If} ${Errors}
    FileClose $R3
    Abort "Failed to write the MagicHat active-version temporary file."
  ${EndIf}
  System::Call "kernel32::FlushFileBuffers(p R3) i .R4"
  FileClose $R3
  ${If} $R4 == 0
    Abort "Failed to flush the MagicHat active-version temporary file."
  ${EndIf}
  System::Call 'kernel32::MoveFileExW(w "$R0\active-version.tmp", w "$R0\active-version", i 9) i .R4'
  ${If} $R4 == 0
    Abort "Failed to replace the MagicHat active-version file."
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\*.*"
    Abort "Failed to clear the MagicHat launcher directory."
  ${EndIf}
  CreateDirectory "$INSTDIR"
  CopyFiles /SILENT "$PLUGINSDIR\launcher.exe" "$INSTDIR\launcher.exe"
  CopyFiles /SILENT "$PLUGINSDIR\${UNINSTALL_FILENAME}" "$INSTDIR\${UNINSTALL_FILENAME}"
  ${IfNot} ${FileExists} "$INSTDIR\launcher.exe"
    Abort "Failed to install the MagicHat launcher."
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    Abort "Failed to install the MagicHat uninstaller."
  ${EndIf}

  StrCpy $appExe "$INSTDIR\launcher.exe"
  StrCpy $launchLink "$appExe"
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    Delete "$newStartMenuLink"
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    StrCpy $launchLink "$newStartMenuLink"
  !endif
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${IfNot} ${isNoDesktopShortcut}
      Delete "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  !endif
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    SetShellVarContext current
    DetailPrint "Stopping MagicHat."
    !insertmacro stopPackagedMagicHat
    RMDir /r /REBOOTOK "$LOCALAPPDATA\MagicHat\tmp"
    RMDir /r /REBOOTOK "$LOCALAPPDATA\MagicHat\version"
    Delete /REBOOTOK "$LOCALAPPDATA\MagicHat\active-version"
    RMDir /REBOOTOK "$LOCALAPPDATA\MagicHat"
    # Keep delayed deletions, but do not ask the user to restart immediately.
    SetRebootFlag false
  ${EndIf}
!macroend