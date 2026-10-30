import * as inspector from "node:inspector";
import os from "node:os";
import {
  CLI_PAGE_COMMAND,
  CLI_TERMINAL_ID_ENVIRONMENT_KEY,
} from "../../../../common/cli";
import type { TerminalPtyInfo, TerminalType } from "../../../../common/terminal";
import { createCliEnvironment } from "../cli/cliEnvironment";
import { CmdPty } from "./cmdPty";
import { PowerShellPty } from "./powerShellPty";
import type { Pty, PtyOptions } from "./pty";
import { PtyPool } from "./ptyPool";
import { resolveTerminalInitialPath } from "./terminalInitialPath";

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
    const resolvedPath = resolveTerminalInitialPath(initialPath);
    for (const pool of this._pools.values()) pool.setInitialPath(resolvedPath);
  }

  public async create(
    terminalType: TerminalType,
    options: PtyCreateOptions,
  ): Promise<Readonly<{ pty: Pty; info: TerminalPtyInfo }>> {
    if (this._isDisposed) throw new Error("PTY factory is disposed");
    const pool = this._pools.get(terminalType);
    const creation = pool?.take(resolveTerminalInitialPath(options.initialPath)) ?? 0;
    if (creation === 0) return this._create(terminalType, options);
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

    // ConPTY can deadlock during its native spawn handshake while the inspector is attached.
    const backend = inspector.url() === undefined ? "conpty" : "winpty";
    const buildNumber = this._getWindowsBuildNumber();

    const ptyOptions: PtyOptions = {
      columns: options.columns,
      rows: options.rows,
      initialPath: options.initialPath,
      createEnvironment: (terminalId) => createCliEnvironment({
        ...process.env,
        TERM: "xterm-256color",
        [CLI_TERMINAL_ID_ENVIRONMENT_KEY]: terminalId,
      }, { page: CLI_PAGE_COMMAND }),
      useConpty: backend === "conpty",
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
    return { pty, info: { backend, buildNumber } };
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