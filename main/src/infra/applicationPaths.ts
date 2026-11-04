import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ApplicationPathsOptions } from "../../../common/applicationPaths";

export class ApplicationPaths {
  public init(options: ApplicationPathsOptions): void {
    if (this._options !== null) throw new Error("Application paths are already initialized.");
    if (!path.isAbsolute(options.localAppDataDirectory)) {
      throw new Error("LOCALAPPDATA must contain an absolute path.");
    }
    this._options = { ...options };
  }

  public getOptions(): ApplicationPathsOptions {
    return { ...this._requireOptions() };
  }

  public get isPackaged(): boolean {
    return this._requireOptions().isPackaged;
  }

  public get appPath(): string {
    return this._requireOptions().appPath;
  }

  public get userDataDir(): string {
    return this._requireOptions().userDataDir;
  }

  public get appRoot(): string {
    return path.join(this._requireOptions().localAppDataDirectory, "MagicHat");
  }

  public get logDirectoryPath(): string {
    return path.join(this.isPackaged ? this.appRoot : this.appPath, "log");
  }

  public get clientDir(): string {
    return path.join(this.appPath, "client");
  }

  public get clientDistDir(): string {
    return path.join(this.clientDir, "dist");
  }

  public get rendererEntryPath(): string {
    return path.join(this.clientDistDir, "index.html");
  }

  public get rendererEntryUrl(): string {
    return pathToFileURL(this.rendererEntryPath).toString();
  }

  public get preloadEntryPath(): string {
    return path.join(this.appPath, "dist-electron", "preload", "index.js");
  }

  public get nativeToolsDirectoryPath(): string {
    return this.isPackaged
      ? path.join(path.dirname(this._requireOptions().executablePath), "native-tools")
      : path.join(this.appPath, "native-tools");
  }

  public get jsLauncherExecutablePath(): string {
    return path.join(this.nativeToolsDirectoryPath, "js-launcher", "bin", "js-launcher.exe");
  }

  public get cliCommandDirectoryPath(): string {
    return path.join(this.nativeToolsDirectoryPath, "cli-helper", "cmd");
  }

  public get cliPythonDirectoryPath(): string {
    return path.join(this.nativeToolsDirectoryPath, "cli-helper", "python");
  }

  public get cliExecutablePath(): string {
    return path.join(this.nativeToolsDirectoryPath, "cli-helper", "bin", "magichat-cli.exe");
  }

  public get cliNodeHelperPath(): string {
    return path.join(this.nativeToolsDirectoryPath, "cli-helper", "node", "MagicHat.js");
  }

  public get cliPowerShellModulePath(): string {
    return path.join(this.nativeToolsDirectoryPath, "cli-helper", "powershell", "MagicHat.psm1");
  }

  public get uacBrokerEntryPath(): string {
    return this.isPackaged
      ? path.join(this._requireOptions().resourcesPath, "uac-broker", "index.js")
      : path.join(this.appPath, "dist-electron", "uac-broker", "index.js");
  }

  public get appIconPath(): string {
    return path.join(this.appPath, "build", this.isPackaged ? "appIcon.ico" : "debugAppIcon.ico");
  }

  public get themesDir(): string {
    return this.isPackaged
      ? path.join(this.dataDir, "themes")
      : path.join(this.appPath, "client", "src", "windows", "main", "themes");
  }

  public get dataDir(): string {
    return path.join(this.isPackaged ? this.userDataDir : this.appPath, "data");
  }

  public get buildVersionPath(): string {
    return path.join(this.appPath, "VERSION");
  }

  private _requireOptions(): ApplicationPathsOptions {
    if (this._options === null) throw new Error("Application paths are not initialized.");
    return this._options;
  }

  private _options: ApplicationPathsOptions | null = null;
}

export const gApplicationPaths = new ApplicationPaths();