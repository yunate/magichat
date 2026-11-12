import path from "node:path";
import { shell } from "electron";
import type { PlatformServerRpcApi } from "../../../common/platform/platformRpcApi";
import { ValidateUtils } from "../../../common/validator";

export class PlatformRpcObject implements PlatformServerRpcApi {
  public showItemInFolder(filePath: string): void {
    this._ensureAbsolutePath(filePath);
    shell.showItemInFolder(filePath);
  }

  public updateShortcutIcon(shortcutPath: string, iconPath: string): void {
    this._ensureAbsolutePath(shortcutPath);
    this._ensureAbsolutePath(iconPath);
    const shortcut = shell.readShortcutLink(shortcutPath);
    const isUpdated = shell.writeShortcutLink(shortcutPath, "update", {
      target: shortcut.target,
      icon: iconPath,
      iconIndex: 0,
    });
    if (!isUpdated) throw new Error("Shortcut write returned false");
  }

  private _ensureAbsolutePath(filePath: string): void {
    ValidateUtils.ensureNonEmptyString(filePath, "Platform file path must be a nonempty string");
    if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
      throw new Error("Platform file path must be absolute");
    }
  }
}