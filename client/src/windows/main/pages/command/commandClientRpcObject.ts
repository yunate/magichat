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
    getEnv: (key: string, target: CommandEnvTarget | null) => Promise<string>,
  ) {
    this._setEnv = setEnv;
    this._call = call;
    this._getEnv = getEnv;
  }

  public setEnv(updates: readonly CommandEnvUpdate[], target: CommandEnvTarget | null): Promise<void> {
    return this._setEnv(updates, target);
  }

  public call(path: string, sourceCommandPath: string | null): Promise<TerminalRunRequest> {
    return this._call(path, sourceCommandPath);
  }

  public getEnv(key: string, target: CommandEnvTarget | null): Promise<string> {
    return this._getEnv(key, target);
  }

  private readonly _setEnv: (
    updates: readonly CommandEnvUpdate[],
    target: CommandEnvTarget | null,
  ) => Promise<void>;
  private readonly _call: (
    path: string,
    sourceCommandPath: string | null,
  ) => Promise<TerminalRunRequest>;
  private readonly _getEnv: (key: string, target: CommandEnvTarget | null) => Promise<string>;
}