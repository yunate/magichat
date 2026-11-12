import { app } from "electron";
import path from "node:path";
import { gApplicationPaths } from "./applicationPaths";

if (!app.isPackaged) {
  app.setPath("userData", path.join(app.getPath("appData"), "magichat-development"));
}

const localAppDataDirectory = process.env.LOCALAPPDATA;
if (localAppDataDirectory === undefined) {
  throw new Error("LOCALAPPDATA must contain an absolute path.");
}

gApplicationPaths.init({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  userDataDir: app.getPath("userData"),
  executablePath: process.execPath,
  resourcesPath: process.resourcesPath,
  localAppDataDirectory,
  applicationDataDirectory: app.getPath("appData"),
  desktopDirectory: app.getPath("desktop"),
});