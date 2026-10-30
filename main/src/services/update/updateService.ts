import { app, net, shell } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import originalFs from "node:original-fs";
import path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import StreamZip from "node-stream-zip";
import {
  MAX_UPDATE_CHECK_DELAY_SECONDS,
  MIN_UPDATE_CHECK_DELAY_SECONDS,
  RANDOM_UPDATE_CHECK_DELAY,
  UPDATE_CONFIG_KEY,
  type UpdateCheckDelaySeconds,
} from "../../../../common/config/update";
import { UpdateState, type UpdateServerRpcApi } from "../../../../common/update/updateRpcApi";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { gConfigManager } from "../../infra/configManager";
import { ScopeLogger } from "../../infra/logger";
import { PathUtil } from "../../utils/pathUtil";
import { ApplicationVersion } from "./applicationVersion";

if (!("setFs" in StreamZip) || typeof StreamZip.setFs !== "function") {
  throw new Error("node-stream-zip does not support filesystem injection.");
}
StreamZip.setFs(originalFs);

const RELEASE_API_URL = "https://api.github.com/repos/ddmagichat/magichat-release/releases/tags/latest";
const RELEASE_DOWNLOAD_URL_PREFIX = "https://github.com/ddmagichat/magichat-release/releases/download/latest/";
const ASSET_NAME_PATTERN = /MagicHat-(\d+\.\d+\.\d+\.\d+)-win-x64\.zip/;
const APPLICATION_EXECUTABLE_NAME = "MagicHat.exe";
const SHORTCUT_FILE_NAME = "MagicHat.lnk";

function resolveUpdateCheckDelayMs(checkDelaySeconds: UpdateCheckDelaySeconds): number {
  const seconds = checkDelaySeconds === RANDOM_UPDATE_CHECK_DELAY
    ? Math.floor(Math.random()
      * (MAX_UPDATE_CHECK_DELAY_SECONDS - MIN_UPDATE_CHECK_DELAY_SECONDS + 1))
      + MIN_UPDATE_CHECK_DELAY_SECONDS
    : checkDelaySeconds;
  return seconds * 1000;
}

type UpdatePlan = {
  downloadUrl: string;
  name: string;
  version: ApplicationVersion;
  downloadPath: string;
  draftDirectory: string;
  formalDirectory: string;
};

export class UpdateService implements UpdateServerRpcApi {
  public constructor() {
    const updateConfig = gConfigManager.get(UPDATE_CONFIG_KEY);
    if (updateConfig.isAutoUpdateEnabled) {
      setTimeout(() => {
        void this.start();
      }, resolveUpdateCheckDelayMs(updateConfig.checkDelaySeconds));
    }
  }

  public get state(): UpdateState {
    return this._state;
  }

  public getState(): UpdateState {
    return this._state;
  }

  public startUpdate(): void {
    void this.start();
  }

  public async getRestartExecutablePath(): Promise<string> {
    if (this._state !== UpdateState.NEED_RESTART) {
      throw new Error("No prepared update is available for restart.");
    }
    try {
      const version = await this._readVersionFile(this._activeVersionPath);
      const executablePath = path.join(this._versionsDirectoryPath, version.toString(), APPLICATION_EXECUTABLE_NAME);
      if (!PathUtil.isFile(executablePath)) throw new Error("Updated executable is missing.");
      return executablePath;
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error(`[update] Restart preparation failed: ${message}`);
      throw new Error("The updated application could not be prepared for restart.");
    }
  }

  public async start(): Promise<void> {
    if (
      this._state !== UpdateState.NOT_START && this._state !== UpdateState.CHECKED
    ) return;

    this._state = UpdateState.UPDATING;
    await this._run();
  }

  private async _run(): Promise<void> {
    let nextState = UpdateState.CHECKED;
    try {
      await this._cleanVersions();
      const plan = await this._checkUpdate();
      if (plan === null) {
        return;
      }

      await this._download(plan);
      await this._unzip(plan);
      await this._verify(plan);
      await this._promote(plan);
      nextState = UpdateState.NEED_RESTART;
    } catch (error: unknown) {
      const message = error instanceof Error
        ? `${error.name}: ${error.message}`
        : `Unknown exception: ${String(error)}`;
      console.error(`[update] ${message}`);
    } finally {
      await this._clean();
      this._state = nextState;
    }
  }

  private async _checkUpdate(): Promise<UpdatePlan | null> {
    using scopeLogger = new ScopeLogger("[update] checkUpdate");
    const currentVersion = await this._readVersionFile(gApplicationPaths.buildVersionPath);
    const releaseText = await this._fetchRelease();
    const match = ASSET_NAME_PATTERN.exec(releaseText);
    if (match === null) {
      console.log("[update] No update is available, the latest release does not match the expected asset pattern.");
      return null;
    }
    const name = match[0];
    const version = ApplicationVersion.parse(match[1]);
    if (version.compare(currentVersion) <= 0) {
      console.log("[update] No update is available, the current version is up-to-date.");
      return null;
    }

    const versionText = version.toString();
    return {
      downloadUrl: `${RELEASE_DOWNLOAD_URL_PREFIX}${name}`,
      name,
      version,
      downloadPath: path.join(
        this._downloadsDirectoryPath,
        `${name}.part`,
      ),
      draftDirectory: path.join(this._draftDirectoryPath, versionText),
      formalDirectory: path.join(this._versionsDirectoryPath, versionText),
    };
  }

  private async _download(plan: UpdatePlan): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] download");
    await fs.mkdir(this._downloadsDirectoryPath, { recursive: true });
    await originalFs.promises.rm(plan.downloadPath, { force: true });
    const response = await net.fetch(plan.downloadUrl, {
      headers: { "User-Agent": "MagicHat-Updater" },
      redirect: "follow",
    });
    if (response.status !== 200) {
      throw new Error(`Update download failed with status ${response.status}.`);
    }
    if (response.body === null) throw new Error("Update download has no response body.");
    await response.body.pipeTo(Writable.toWeb(
      originalFs.createWriteStream(plan.downloadPath, { flags: "wx" }),
    ));
  }

  private async _unzip(plan: UpdatePlan): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] unzip");
    await originalFs.promises.rm(plan.draftDirectory, { force: true, recursive: true });
    await fs.mkdir(this._draftDirectoryPath, { recursive: true });
    await fs.mkdir(plan.draftDirectory);
    const archive = new StreamZip.async({ file: plan.downloadPath });
    try {
      const entries = await archive.entries();
      for (const entry of Object.values(entries)) {
        const outputPath = path.join(plan.draftDirectory, entry.name);
        if (entry.isDirectory) {
          await originalFs.promises.mkdir(outputPath, { recursive: true });
          continue;
        }
        await originalFs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await pipeline(
          await archive.stream(entry),
          originalFs.createWriteStream(outputPath, { flags: "wx" }),
        );
      }
    } finally {
      await archive.close();
    }
  }

  private async _verify(plan: UpdatePlan): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] verify");
    const requiredFiles = [
      APPLICATION_EXECUTABLE_NAME,
      path.join("resources", "app.asar"),
      path.join("resources", "uac-broker", "index.js"),
      path.join("native-tools", "cli-helper", "bin", "magichat-cli.exe"),
      path.join("native-tools", "ddwhouses", "bin", "ddwhouses.exe"),
      path.join("native-tools", "js-launcher", "bin", "js-launcher.exe"),
    ];
    for (const relativePath of requiredFiles) {
      if (!PathUtil.isFile(path.join(plan.draftDirectory, relativePath))) {
        throw new Error(`Extracted update is missing ${relativePath}.`);
      }
    }

    const nodeModulesDirectory = path.join(plan.draftDirectory, "resources", "app.asar.unpacked", "node_modules");
    if (!PathUtil.isDirectory(nodeModulesDirectory)) {
      throw new Error("Extracted update is missing unpacked native modules.");
    }
  }

  private async _promote(plan: UpdatePlan): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] promote");
    await fs.mkdir(this._versionsDirectoryPath, { recursive: true });
    await originalFs.promises.rm(plan.formalDirectory, { force: true, recursive: true });
    await fs.rename(plan.draftDirectory, plan.formalDirectory);
    await this._writeVersionFileAtomic(this._activeVersionPath, plan.version);
    this._updateShortcutIcons(
      path.join(plan.formalDirectory, APPLICATION_EXECUTABLE_NAME),
    );
  }

  private _getShortcutPaths(): string[] {
    const shortcutPaths = [
      path.join(app.getPath("desktop"), SHORTCUT_FILE_NAME),
      path.join(
        app.getPath("appData"),
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        SHORTCUT_FILE_NAME,
      ),
    ];
    const publicDirectory = process.env.PUBLIC;
    if (publicDirectory !== undefined && path.isAbsolute(publicDirectory)) {
      shortcutPaths.push(path.join(publicDirectory, "Desktop", SHORTCUT_FILE_NAME));
    }
    const programDataDirectory = process.env.ProgramData;
    if (programDataDirectory !== undefined && path.isAbsolute(programDataDirectory)) {
      shortcutPaths.push(path.join(
        programDataDirectory,
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        SHORTCUT_FILE_NAME,
      ));
    }
    shortcutPaths.push(path.join(
      app.getPath("appData"),
      "Microsoft",
      "Internet Explorer",
      "Quick Launch",
      "User Pinned",
      "TaskBar",
      SHORTCUT_FILE_NAME,
    ));
    return [...new Set(shortcutPaths)];
  }

  private _updateShortcutIcons(iconPath: string): void {
    for (const shortcutPath of this._getShortcutPaths()) {
      if (!PathUtil.isFile(shortcutPath)) continue;
      try {
        const shortcut = shell.readShortcutLink(shortcutPath);
        const isUpdated = shell.writeShortcutLink(shortcutPath, "update", {
          target: shortcut.target,
          icon: iconPath,
          iconIndex: 0,
        });
        if (!isUpdated) throw new Error("Shortcut write returned false");
        console.log(`[update] Updated shortcut icon: ${shortcutPath}.`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[update] Skipped shortcut icon update: ${shortcutPath}. Reason: ${message}`);
      }
    }
  }

  private async _clean(): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] clean");
    try {
      await originalFs.promises.rm(
        this._temporaryDirectoryPath,
        { force: true, recursive: true },
      );
    } catch (error: unknown) {
      const message = error instanceof Error
        ? `${error.name}: ${error.message}`
        : `Unknown exception: ${String(error)}`;
      console.error(`[update] ${message}`);
    }
  }

  private async _cleanVersions(): Promise<void> {
    using scopeLogger = new ScopeLogger("[update] cleanVersions");
    try {
      const runningVersionDirectory = path.resolve(path.dirname(process.execPath)).toLowerCase();
      const versionDirectories = await fs.readdir(this._versionsDirectoryPath);
      await Promise.all(versionDirectories
        .filter((name) => path.resolve(this._versionsDirectoryPath, name)
          .toLowerCase() !== runningVersionDirectory)
        .map((name) => originalFs.promises.rm(
          path.join(this._versionsDirectoryPath, name),
          { force: true, recursive: true },
        )));
    } catch (error: unknown) {
      const message = error instanceof Error
        ? `${error.name}: ${error.message}`
        : `Unknown exception: ${String(error)}`;
      console.warn(`[update] Failed to clean old versions: ${message}`);
      return;
    }
  }

  private async _fetchRelease(): Promise<string> {
    const response = await net.fetch(RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "MagicHat-Updater",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
    });
    if (response.status !== 200) {
      throw new Error(`GitHub Release request failed with status ${response.status}.`);
    }
    return response.text();
  }

  private async _readVersionFile(filePath: string): Promise<ApplicationVersion> {
    const content = await fs.readFile(filePath, "utf8");
    const normalized = content.endsWith("\r\n")
      ? content.slice(0, -2)
      : content.endsWith("\n") ? content.slice(0, -1) : content;
    if (normalized.length === 0 || normalized.includes("\r") || normalized.includes("\n")) {
      throw new Error("Version file must contain exactly one version line.");
    }
    return ApplicationVersion.parse(normalized);
  }

  private async _writeVersionFileAtomic(
    filePath: string,
    version: ApplicationVersion,
  ): Promise<void> {
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const file = await fs.open(temporaryPath, "wx");
    try {
      await file.writeFile(version.toString(), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporaryPath, filePath);
  }

  private _state = UpdateState.NOT_START;
  private readonly _activeVersionPath = path.join(gApplicationPaths.appRoot, "active-version");
  private readonly _versionsDirectoryPath = path.join(gApplicationPaths.appRoot, "version");
  private readonly _temporaryDirectoryPath = path.join(gApplicationPaths.appRoot, "tmp", "update");
  private readonly _downloadsDirectoryPath = path.join(this._temporaryDirectoryPath, "downloads");
  private readonly _draftDirectoryPath = path.join(this._temporaryDirectoryPath, "draft");
}

export const gUpdateService = new UpdateService();
