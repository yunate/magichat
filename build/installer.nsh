!macro customInstall
  SetShellVarContext current
  RMDir /r "$APPDATA\magichat\data\themes\white"
  SetOutPath "$APPDATA\magichat\data\themes"
  File /r /x "dark" /x "mainTheme.css" /x "theme.ts" "${PROJECT_DIR}\client\src\windows\main\themes\*.*"
!macroend