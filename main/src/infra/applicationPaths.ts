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
    this.appIconPath = path.join(this.repoRoot, "build", "appIcon.ico");
    this.dataDir = path.join(
      app.isPackaged ? app.getPath("userData") : this.repoRoot,
      "data",
    );
  }

  public readonly repoRoot: string;
  public readonly clientDir: string;
  public readonly clientDistDir: string;
  public readonly rendererEntryPath: string;
  public readonly rendererEntryUrl: string;
  public readonly preloadEntryPath: string;
  public readonly appIconPath: string;
  public readonly dataDir: string;

  private static _instance: ApplicationPaths | null = null;
}

export const gApplicationPaths = ApplicationPaths.getInstance();