import type {
  CommandClientRpcApi,
  CommandEnvTarget,
  CommandEnvUpdate,
} from "../../../../../../common/command";
import type { TerminalRunRequest } from "../../../../../../common/terminal";

export class CommandClientRpcObject implements CommandClientRpcApi {
  public constructor(
    setEnv: (updates: readonly CommandEnvUpdate[], target: CommandEnvTarget | null) => Promise<void>,
    call: (path: string, sourceCommandPath: string | null) => Promise<TerminalRunRequest>,
  ) {
    this._setEnv = setEnv;
    this._call = call;
  }

  public setEnv(updates: readonly CommandEnvUpdate[], target: CommandEnvTarget | null): Promise<void> {
    return this._setEnv(updates, target);
  }

  public call(path: string, sourceCommandPath: string | null): Promise<TerminalRunRequest> {
    return this._call(path, sourceCommandPath);
  }

  private readonly _setEnv: (
    updates: readonly CommandEnvUpdate[],
    target: CommandEnvTarget | null,
  ) => Promise<void>;
  private readonly _call: (
    path: string,
    sourceCommandPath: string | null,
  ) => Promise<TerminalRunRequest>;
}