import type { IPty } from "node-pty";
import { spawn } from "node-pty";
import { gApplicationPaths } from "../../../infra/applicationPaths";
import { Pty, type PtyOptions } from "./pty";

export class PowerShellPty extends Pty {
  protected async _create(options: PtyOptions): Promise<IPty> {
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-NoExit",
      "-Command",
      `Set-PSReadLineOption -HistorySaveStyle SaveAtExit; Import-Module -Name '${gApplicationPaths.cliPowerShellModulePath.replace(/'/g, "''")}'`,
    ];
    return spawn("powershell.exe", args, {
      cols: options.columns,
      rows: options.rows,
      cwd: options.initialPath,
      env: options.createEnvironment(this.terminalId),
      useConpty: options.useConpty,
      useConptyDll: false,
    });
  }

}