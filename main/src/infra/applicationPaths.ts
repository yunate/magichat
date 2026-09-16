import { app } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class ApplicationPaths {
  public static getInstance(): ApplicationPaths {
    ApplicationPaths._instance ??= new ApplicationPaths();
    return ApplicationPaths._instance;
  }

  private constructor() {
    this.isPackaged = app.isPackaged;
    const localAppDataDirectory = process.env.LOCALAPPDATA;
    if (localAppDataDirectory === undefined || !path.isAbsolute(localAppDataDirectory)) {
      throw new Error("LOCALAPPDATA must contain an absolute path.");
    }
    // e.g. F:\My\magichat or C:\...\resources\app.asar.
    this.appPath = app.getAppPath();
    // e.g. C:\Users\<user>\AppData\Local\MagicHat.
    this.appRoot = path.join(localAppDataDirectory, "MagicHat");
    this.logDirectoryPath = path.join(this.isPackaged ? this.appRoot : this.appPath, "log");
    this.clientDir = path.join(this.appPath, "client");
    this.clientDistDir = path.join(this.clientDir, "dist");
    this.rendererEntryPath = path.join(this.clientDistDir, "index.html");
    this.rendererEntryUrl = pathToFileURL(this.rendererEntryPath).toString();
    this.preloadEntryPath = path.join(this.appPath, "dist-electron", "preload", "index.js");
    const nativeToolsDirectory = app.isPackaged
      ? path.join(path.dirname(process.execPath), "native-tools")
      : path.join(this.appPath, "native-tools");
    this.nativeToolsDirectoryPath = nativeToolsDirectory;
    this.jsLauncherExecutablePath = path.join(nativeToolsDirectory, "js-launcher", "bin", "js-launcher.exe",);
    const cliDirectory = path.join(nativeToolsDirectory, "cli-helper");
    this.cliCommandDirectoryPath = path.join(cliDirectory, "cmd");
    this.cliPythonDirectoryPath = path.join(cliDirectory, "python");
    this.cliExecutablePath = path.join(cliDirectory, "bin", "magichat-cli.exe");
    this.cliNodeHelperPath = path.join(cliDirectory, "node", "MagicHat.js");
    this.cliPowerShellModulePath = path.join(cliDirectory, "powershell", "MagicHat.psm1",);
    this.uacBrokerEntryPath = app.isPackaged
      ? path.join(process.resourcesPath, "uac-broker", "index.js")
      : path.join(this.appPath, "dist-electron", "uac-broker", "index.js");
    this.appIconPath = path.join(this.appPath, "build", app.isPackaged ? "appIcon.ico" : "debugAppIcon.ico",);
    this.dataDir = path.join(app.isPackaged ? app.getPath("userData") : this.appPath, "data",);
    this.themesDir = app.isPackaged
      ? path.join(this.dataDir, "themes")
      : path.join(this.appPath, "client", "src", "windows", "main", "themes");
    this.buildVersionPath = path.join(this.appPath, "VERSION");
  }

  public readonly isPackaged: boolean;
  public readonly appPath: string;
  public readonly appRoot: string;
  public readonly logDirectoryPath: string;
  public readonly clientDir: string;
  public readonly clientDistDir: string;
  public readonly rendererEntryPath: string;
  public readonly rendererEntryUrl: string;
  public readonly preloadEntryPath: string;
  public readonly nativeToolsDirectoryPath: string;
  public readonly jsLauncherExecutablePath: string;
  public readonly cliCommandDirectoryPath: string;
  public readonly cliPythonDirectoryPath: string;
  public readonly cliExecutablePath: string;
  public readonly cliNodeHelperPath: string;
  public readonly cliPowerShellModulePath: string;
  public readonly uacBrokerEntryPath: string;
  public readonly appIconPath: string;
  public readonly themesDir: string;
  public readonly dataDir: string;
  public readonly buildVersionPath: string;

  private static _instance: ApplicationPaths | null = null;
}

export const gApplicationPaths = ApplicationPaths.getInstance();