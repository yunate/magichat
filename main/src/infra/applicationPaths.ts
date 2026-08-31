import { app } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class ApplicationPaths {
  public static getInstance(): ApplicationPaths {
    ApplicationPaths._instance ??= new ApplicationPaths();
    return ApplicationPaths._instance;
  }

  private constructor() {
    this.repoRoot = app.getAppPath();
    this.clientDir = path.join(this.repoRoot, "client");
    this.clientDistDir = path.join(this.clientDir, "dist");
    this.rendererEntryPath = path.join(this.clientDistDir, "index.html");
    this.rendererEntryUrl = pathToFileURL(this.rendererEntryPath).toString();
    this.preloadEntryPath = path.join(
      this.repoRoot,
      "dist-electron",
      "preload",
      "index.js",
    );
    const nativeToolsDirectory = app.isPackaged
      ? path.join(path.dirname(process.execPath), "native-tools")
      : path.join(this.repoRoot, "native-tools");
    this.nativeToolsDirectoryPath = nativeToolsDirectory;
    this.jsLauncherExecutablePath = path.join(
      nativeToolsDirectory,
      "js-launcher",
      "bin",
      "js-launcher.exe",
    );
    const cliDirectory = path.join(nativeToolsDirectory, "cli-helper");
    this.cliCommandDirectoryPath = path.join(cliDirectory, "cmd");
    this.cliPythonDirectoryPath = path.join(cliDirectory, "python");
    this.cliExecutablePath = path.join(cliDirectory, "bin", "magichat-cli.exe");
    this.cliNodeHelperPath = path.join(cliDirectory, "node", "MagicHat.js");
    this.cliPowerShellModulePath = path.join(
      cliDirectory,
      "powershell",
      "MagicHat.psm1",
    );
    this.uacBrokerEntryPath = app.isPackaged
      ? path.join(process.resourcesPath, "uac-broker", "index.js")
      : path.join(this.repoRoot, "dist-electron", "uac-broker", "index.js");
    this.appIconPath = path.join(
      this.repoRoot,
      "build",
      app.isPackaged ? "appIcon.ico" : "debugAppIcon.ico",
    );
    this.dataDir = path.join(
      app.isPackaged ? app.getPath("userData") : this.repoRoot,
      "data",
    );
    this.themesDir = app.isPackaged
      ? path.join(this.dataDir, "themes")
      : path.join(this.repoRoot, "client", "src", "windows", "main", "themes");
  }

  public readonly repoRoot: string;
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

  private static _instance: ApplicationPaths | null = null;
}

export const gApplicationPaths = ApplicationPaths.getInstance();