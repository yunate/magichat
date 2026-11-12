export interface PlatformServerRpcApi {
  showItemInFolder(filePath: string): void;
  updateShortcutIcon(shortcutPath: string, iconPath: string): void;
}