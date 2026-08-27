import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";

export const COMMAND_CONFIG_KEY = "command";
export const TERMINAL_PLACEMENTS = ["left", "right", "top", "bottom"] as const;

export type TerminalPlacement = typeof TERMINAL_PLACEMENTS[number];

export type CommandConfig = {
  terminalPlacement: TerminalPlacement;
};

export class CommandConfigSerializer extends ISerializer<CommandConfig> {
  public getDefault(): CommandConfig {
    return { ...CommandConfigSerializer._DEFAULT };
  }

  public override validate(value: unknown): asserts value is CommandConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Command config must be a record");

    const expectedKeys = Object.keys(CommandConfigSerializer._DEFAULT);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== expectedKeys.length
      || !expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Command config contains unexpected properties");
    }
    if (!isTerminalPlacement(value.terminalPlacement)) {
      throw new Error("Command terminalPlacement is invalid");
    }
  }

  private static readonly _DEFAULT: CommandConfig = {
    terminalPlacement: "right",
  };
}

export function isTerminalPlacement(value: unknown): value is TerminalPlacement {
  return typeof value === "string"
    && TERMINAL_PLACEMENTS.some((placement) => placement === value);
}

export const commandConfigSerializer = new CommandConfigSerializer();
