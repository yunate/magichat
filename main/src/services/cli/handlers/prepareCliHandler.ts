import {
  CLI_COMMAND_PATH_ENVIRONMENT_KEY,
  CLI_TERMINAL_ID_ENVIRONMENT_KEY,
  type CliEnvironmentVariable,
} from "../../../../../common/cli";
import type { CommandService } from "../../command/commandService";
import type { CliHandler } from "./cliHandler";

export class PrepareCliHandler implements CliHandler {
  public constructor(commandService: CommandService) {
    this._commandService = commandService;
  }

  public tryParse(args: readonly string[]): boolean {
    return args[0] === "prepare";
  }

  public async handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): Promise<string> {
    if (args.length !== 2 || args[1] === undefined || args[1].trim().length === 0) {
      throw new Error("Usage: prepare <path>");
    }
    const terminalId = environment.find(
      (variable) => variable.key.toUpperCase() === CLI_TERMINAL_ID_ENVIRONMENT_KEY,
    )?.value;
    if (terminalId === undefined || terminalId.length === 0) {
      throw new Error("prepare must run from a MagicHat Terminal");
    }
    const sourceCommandPath = environment.find(
      (variable) => variable.key.toUpperCase() === CLI_COMMAND_PATH_ENVIRONMENT_KEY,
    )?.value ?? null;
    return this._commandService.prepare(terminalId, args[1], sourceCommandPath);
  }

  private readonly _commandService: CommandService;
}