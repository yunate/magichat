import fs from "node:fs/promises";
import * as inspector from "node:inspector";
import os from "node:os";
import path from "node:path";
import type { RemoteObject } from "../../../../common/ipc_bridge/rpc";
import {
  CLI_PAGE_COMMAND,
  CLI_TERMINAL_ID_ENVIRONMENT_KEY,
} from "../../../../common/cli";
import type { TerminalClientRpcApi, TerminalPtyInfo, TerminalType } from "../../../../common/terminal";
import { DEFAULT_COMMAND_TERMINAL_INITIAL_PATH } from "../../../../common/config/command";
import { ValidateUtils } from "../../../../common/validator";
import { gApplicationPaths } from "../../infra/applicationPaths";
import { PathUtil } from "../../utils/pathUtil";
import { createCliEnvironment } from "../cli/cliEnvironment";
import { CmdPty } from "./cmdPty";
import { PowerShellPty } from "./powerShellPty";
import type { Pty, PtyOptions } from "./pty";
import { PtyPool } from "./ptyPool";
import { RpcPty } from "./rpcPty";

export const TERMINAL_TEMPORARY_DIRECTORY = path.join(gApplicationPaths.dataDir, "tmp", "terminal");

const PTY_INITIALIZATION_TOKEN = Symbol("pty initialization");
export type PtyInitializationToken = typeof PTY_INITIALIZATION_TOKEN;

type PtyCreateOptions = Readonly<{
  columns: number;
  rows: number;
  initialPath: string;
}>;

class PtyFactory {
  public constructor() {
    this._pools.set("powershell", new PtyPool("powershell", (initialPath) => this._create("powershell", {
      columns: 80,
      rows: 24,
      initialPath,
    })));
  }

  public setInitialPath(initialPath: string): void {
    const resolvedPath = this.resolveInitialPath(initialPath);
    for (const pool of this._pools.values()) pool.setInitialPath(resolvedPath);
  }

  public resolveInitialPath(value: unknown): string {
    ValidateUtils.ensureNonBlankString(value, "Terminal initial path must not be blank");
    if (value === DEFAULT_COMMAND_TERMINAL_INITIAL_PATH) return TERMINAL_TEMPORARY_DIRECTORY;
    if (!path.isAbsolute(value)) throw new Error("Terminal initial path must be absolute");
    return path.resolve(value);
  }

  public async create(
    terminalType: TerminalType,
    options: PtyCreateOptions,
    callback: RemoteObject<TerminalClientRpcApi>,
  ): Promise<RpcPty> {
    const { pty } = await this._createPty(terminalType, options);
    let isNotifierEnabled = true;
    const handleNotificationError = (error: unknown): void => {
      if (!isNotifierEnabled) return;
      isNotifierEnabled = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[terminal] renderer notification failed: ${message}`);
    };
    return new RpcPty(pty, {
      onData: (data) => {
        if (!isNotifierEnabled) return;
        void callback.output(data).catch(handleNotificationError);
      },
      onExit: () => {
        if (!isNotifierEnabled) return;
        void callback.runtimeError("Terminal process exited unexpectedly").catch(handleNotificationError);
      },
    });
  }

  private async _createPty(
    terminalType: TerminalType,
    options: PtyCreateOptions,
  ): Promise<Readonly<{ pty: Pty; info: TerminalPtyInfo }>> {
    if (this._isDisposed) throw new Error("PTY factory is disposed");
    const initialPath = this.resolveInitialPath(options.initialPath);
    const pool = this._pools.get(terminalType);
    const creation = pool?.take(initialPath) ?? 0;
    if (creation === 0) return this._create(terminalType, { ...options, initialPath });
    try {
      creation.pty.resize(options.columns, options.rows);
    } catch (error: unknown) {
      creation.pty.kill();
      throw error;
    }
    return creation;
  }

  public async dispose(): Promise<void> {
    this._isDisposed = true;
    await Promise.all([...this._pools.values()].map((pool) => pool.dispose()));
  }

  private async _create(
    terminalType: TerminalType,
    options: PtyCreateOptions,
  ): Promise<Readonly<{ pty: Pty; info: TerminalPtyInfo }>> {
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
    const info: TerminalPtyInfo = { backend, buildNumber };

    const ptyOptions: PtyOptions = {
      columns: options.columns,
      rows: options.rows,
      initialPath,
      createEnvironment: (terminalId) => createCliEnvironment({
        ...process.env,
        TERM: "xterm-256color",
        [CLI_TERMINAL_ID_ENVIRONMENT_KEY]: terminalId,
      }, { page: CLI_PAGE_COMMAND }),
      useConpty: backend === "conpty",
      info,
    };

    let pty: Pty;
    if (terminalType === "cmd") {
      pty = new CmdPty();
    } else if (terminalType === "powershell") {
      pty = new PowerShellPty();
    } else {
      throw new Error("Terminal type is invalid");
    }
    await pty.init(PTY_INITIALIZATION_TOKEN, ptyOptions);
    return { pty, info };
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