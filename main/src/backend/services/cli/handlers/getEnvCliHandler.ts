import {
  CLI_COMMAND_PATH_ENVIRONMENT_KEY,
  type CliEnvironmentVariable,
} from "../../../../../../common/cli";
import type { CommandService } from "../../command/commandService";
import type { CliHandler } from "./cliHandler";

export class GetEnvCliHandler implements CliHandler {
  public constructor(commandService: CommandService) {
    this._commandService = commandService;
  }

  public tryParse(args: readonly string[]): boolean {
    return args[0] === "get-env";
  }

  public async handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): Promise<string> {
    const pathPrefix = args[1]?.startsWith("--path==") === true ? "--path==" : "--path=";
    const targetPath = args[1]?.startsWith(pathPrefix) === true
      ? args[1].slice(pathPrefix.length)
      : null;
    const keyIndex = targetPath === null ? 1 : 2;
    const key = args[keyIndex];
    const isJson = args[keyIndex + 1] === "--json";
    if (
      (targetPath !== null && targetPath.trim().length === 0)
      || key === undefined
      || args.length !== keyIndex + (isJson ? 2 : 1)
    ) {
      throw new Error("Usage: get-env [--path=<path>] <key> [--json]");
    }
    const sourceCommandPath = environment.find(
      (variable) => variable.key.toUpperCase() === CLI_COMMAND_PATH_ENVIRONMENT_KEY,
    )?.value ?? null;
    try {
      const value = await this._commandService.getEnv(key, targetPath, sourceCommandPath);
      return isJson ? JSON.stringify(value) : value;
    } catch (reason: unknown) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      throw new Error(`Failed to read Macro key ${JSON.stringify(key)}: ${detail}`);
    }
  }

  private readonly _commandService: CommandService;
}