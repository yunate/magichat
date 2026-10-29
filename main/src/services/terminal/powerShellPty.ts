import { gApplicationPaths } from "../../infra/applicationPaths";
import { Pty, type PtyOptions } from "./pty";

export class PowerShellPty extends Pty {
  public constructor(options: PtyOptions) {
    const modulePath = `'${gApplicationPaths.cliPowerShellModulePath.replace(/'/g, "''")}'`;
    const args = [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-NoExit",
      "-Command",
      `Set-PSReadLineOption -HistorySaveStyle SaveAtExit; Import-Module -Name ${modulePath}`,
    ];
    super("powershell.exe", args, options);
  }
}