import type { CommandEnvUpdate } from "../../../../../../common/command";
import {
  CLI_COMMAND_PATH_ENVIRONMENT_KEY,
  type CliEnvironmentVariable,
} from "../../../../../../common/cli";
import type { CommandService } from "../../command/commandService";
import type { CliHandler } from "./cliHandler";

export class SetEnvCliHandler implements CliHandler {
  public constructor(commandService: CommandService) {
    this._commandService = commandService;
  }

  public tryParse(args: readonly string[]): boolean {
    return args[0] === "set-env";
  }

  public async handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): Promise<string> {
    const targetPath = args[1]?.startsWith("--path=") === true
      ? args[1].slice("--path=".length)
      : null;
    const updateStartIndex = targetPath === null ? 1 : 2;
    if (targetPath !== null && targetPath.trim().length === 0) throw this._usageError();
    if (args.length === updateStartIndex || (args.length - updateStartIndex) % 2 !== 0) {
      throw this._usageError();
    }
    const updates: CommandEnvUpdate[] = [];
    for (let index = updateStartIndex; index < args.length; index += 2) {
      const key = args[index];
      const value = args[index + 1];
      if (key === undefined || value === undefined) throw this._usageError();
      updates.push({ key, value });
    }
    const sourceCommandPath = environment.find(
      (variable) => variable.key.toUpperCase() === CLI_COMMAND_PATH_ENVIRONMENT_KEY,
    )?.value ?? null;
    await this._commandService.setEnv(updates, targetPath, sourceCommandPath);
    return `${updates.length} environment variable${updates.length === 1 ? "" : "s"} updated.`;
  }

  private _usageError(): Error {
    return new Error("Usage: set-env [--path=<path>] <key> <value> [<key> <value> ...]");
  }

  private readonly _commandService: CommandService;
}