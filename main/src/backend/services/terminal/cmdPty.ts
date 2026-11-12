import type { IPty } from "node-pty";
import { spawn } from "node-pty";
import { Pty, type PtyOptions } from "./pty";

export class CmdPty extends Pty {
  protected async _create(options: PtyOptions): Promise<IPty> {
    return spawn("cmd.exe", ["/Q", "/K"], {
      cols: options.columns,
      rows: options.rows,
      cwd: options.initialPath,
      env: {
        ...options.createEnvironment(this.terminalId),
        PROMPT: "CMD $P$G",
      },
      useConpty: options.useConpty,
      useConptyDll: false,
    });
  }
}