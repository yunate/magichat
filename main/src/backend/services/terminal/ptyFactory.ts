import fs from "node:fs/promises";
import * as inspector from "node:inspector";
import os from "node:os";
import path from "node:path";
import { BridgeRouter } from "../../../../../common/ipc_bridge/rpc";
import {
  CLI_PAGE_COMMAND,
  CLI_TERMINAL_ID_ENVIRONMENT_KEY,
} from "../../../../../common/cli";
import type { PtyApi, PtyCallbackApi, TerminalPtyOptions, TerminalType } from "../../../../../common/terminal";
import { DEFAULT_COMMAND_TERMINAL_INITIAL_PATH } from "../../../../../common/config/command";
import { ValidateUtils } from "../../../../../common/validator";
import { gApplicationPaths } from "../../../infra/applicationPaths";
import { PathUtil } from "../../../utils/pathUtil";
import { gCliEnvironment } from "../cli/cliEnvironment";
import { gUacBrokerService } from "../uacBroker/uacBrokerService";
import { CmdPty } from "./cmdPty";
import { PowerShellPty } from "./powerShellPty";
import type { Pty, PtyOptions } from "./pty";
import { PtyPool } from "./ptyPool";
import { RpcPty } from "./rpcPty";

const PTY_INITIALIZATION_TOKEN = Symbol("pty initialization");
export type PtyInitializationToken = typeof PTY_INITIALIZATION_TOKEN;

class PtyFactory {
  public constructor() {
    this._pools.set("powershell", new PtyPool("powershell", (initialPath) => this._create({
      terminalType: "powershell",
      columns: 80,
      rows: 24,
      initialPath,
      isUAC: false,
    })));
  }

  public setInitialPath(initialPath: string): void {
    const resolvedPath = this.resolveInitialPath(initialPath);
    for (const pool of this._pools.values()) pool.setInitialPath(resolvedPath);
  }

  public get temporaryDirectory(): string {
    return path.join(gApplicationPaths.dataDir, "tmp", "terminal");
  }

  public resolveInitialPath(value: unknown): string {
    ValidateUtils.ensureNonBlankString(value, "Terminal initial path must not be blank");
    if (value === DEFAULT_COMMAND_TERMINAL_INITIAL_PATH) return this.temporaryDirectory;
    if (!path.isAbsolute(value)) throw new Error("Terminal initial path must be absolute");
    return path.resolve(value);
  }

  public async create(
    options: TerminalPtyOptions,
    callback: PtyCallbackApi,
  ): Promise<PtyApi> {
    if (this._isDisposed) throw new Error("PTY factory is disposed");

    if (options.isUAC) {
      return this._createUAC(options, callback);
    }

    let pty: Pty | null = null;
    try {
      const initialPath = this.resolveInitialPath(options.initialPath);
      pty = this._pools.get(options.terminalType)?.take(initialPath) || null;
      if (pty) {
        pty.resize(options.columns, options.rows);
      } else {
        pty = await this._create({ ...options, initialPath });
      }
    } catch (error: unknown) {
      pty?.kill();
      throw error;
    }

    return new RpcPty(pty, callback);
  }

  private async _createUAC(
    options: TerminalPtyOptions,
    callback: PtyCallbackApi,
  ): Promise<PtyApi> {
    const runtime = await gUacBrokerService.getUacTerminalRuntimeService();
    return runtime.create({ ...options, isUAC: false }, BridgeRouter.returnRemoteObj(callback));
  }

  public async dispose(): Promise<void> {
    this._isDisposed = true;
    await Promise.all([...this._pools.values()].map((pool) => pool.dispose()));
  }

  private async _create(options: TerminalPtyOptions): Promise<Pty> {
    if (process.platform !== "win32") throw new Error("Terminal is only supported on Windows");

    const initialPath = options.initialPath;
    try {
      await fs.mkdir(initialPath, { recursive: true });
      PathUtil.ensureFolderExist(initialPath);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        `Terminal initial folder could not be created. Path: ${JSON.stringify(initialPath)}. Reason: ${message}`,
      );
    }

    // ConPTY can deadlock during its native spawn handshake while the inspector is attached.
    const backend = inspector.url() === undefined ? "conpty" : "winpty";
    const buildNumber = this._getWindowsBuildNumber();
    const info: PtyOptions["info"] = { backend, buildNumber };

    const ptyOptions: PtyOptions = {
      columns: options.columns,
      rows: options.rows,
      initialPath,
      createEnvironment: (terminalId) => gCliEnvironment.create({
        ...process.env,
        TERM: "xterm-256color",
        [CLI_TERMINAL_ID_ENVIRONMENT_KEY]: terminalId,
      }, { page: CLI_PAGE_COMMAND }),
      useConpty: backend === "conpty",
      info,
    };

    let pty: Pty;
    if (options.terminalType === "cmd") {
      pty = new CmdPty();
    } else if (options.terminalType === "powershell") {
      pty = new PowerShellPty();
    } else {
      throw new Error("Terminal type is invalid");
    }
    await pty.init(PTY_INITIALIZATION_TOKEN, ptyOptions);
    return pty;
  }

  private _getWindowsBuildNumber(): number {
    const buildNumber = Number.parseInt(os.release().split(".")[2] ?? "", 10);
    if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
      throw new Error("Windows build number is unavailable");
    }
    return buildNumber;
  }

  private readonly _pools = new Map<TerminalType, PtyPool>();
  private _isDisposed = false;
}

export const gPtyFactory = new PtyFactory();