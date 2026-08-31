import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";

export const COMMAND_CONFIG_KEY = "command";
export const DEFAULT_COMMAND_ROOT_PATH = "${MAGICHAT_DATA}/command";
export const DEFAULT_COMMAND_TERMINAL_INITIAL_PATH = "${MAGICHAT_DATA}/tmp/terminal";
export const TERMINAL_PLACEMENTS = ["left", "right", "top", "bottom"] as const;

export type TerminalPlacement = typeof TERMINAL_PLACEMENTS[number];

export type CommandRootConfig = {
  key: string;
  path: string;
};

export type CommandConfig = {
  terminalPlacement: TerminalPlacement;
  terminalInitialPath: string;
  roots: CommandRootConfig[];
  activeRootKey: string;
};

export class CommandConfigSerializer extends ISerializer<CommandConfig> {
  public getDefault(): CommandConfig {
    return structuredClone(CommandConfigSerializer._DEFAULT);
  }

  public override fromValue(value: unknown): CommandConfig {
    const normalized = CommandConfigSerializer._addTerminalInitialPathDefault(value);
    this.validate(normalized);
    return normalized;
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
    ValidateUtils.ensureNonBlankString(
      value.terminalInitialPath,
      "Command terminalInitialPath must not be blank",
    );
    ValidateUtils.ensureArray(value.roots, "Command roots must be an array");
    if (value.roots.length === 0) throw new Error("Command roots must not be empty");
    const rootKeys = new Set<string>();
    const roots: CommandRootConfig[] = [];
    for (const [index, root] of value.roots.entries()) {
      CommandConfigSerializer._validateRoot(root);
      const normalizedKey = root.key.toLocaleLowerCase("en-US");
      if (rootKeys.has(normalizedKey)) throw new Error("Command root keys must be unique");
      rootKeys.add(normalizedKey);
      if (index === 0
        && (root.key !== "default" || root.path !== DEFAULT_COMMAND_ROOT_PATH)) {
        throw new Error("Default Command root must be first");
      }
      roots.push(root);
    }
    ValidateUtils.ensureNonBlankString(
      value.activeRootKey,
      "Command activeRootKey must not be blank",
    );
    const activeRoot = roots.find((root) => root.key === value.activeRootKey);
    if (activeRoot === undefined) throw new Error("Command active root does not exist");
    if (activeRoot.path.trim().length === 0) {
      throw new Error("Command active root path must not be blank");
    }
  }

  private static _validateRoot(value: unknown): asserts value is CommandRootConfig {
    ValidateUtils.ensureRecord(value);
    const expectedKeys = Object.keys(CommandConfigSerializer._DEFAULT_ROOT);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== expectedKeys.length
      || !expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Command root contains unexpected properties");
    }
    ValidateUtils.ensureNonBlankString(value.key, "Command root key must not be blank");
    ValidateUtils.ensureString(value.path, "Command root path must be a string");
  }

  private static _addTerminalInitialPathDefault(value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    ValidateUtils.ensureRecord(value);
    const record = value;
    const expectedKeys = Object.keys(CommandConfigSerializer._DEFAULT);
    const actualKeys = Object.keys(record);
    if (actualKeys.length !== expectedKeys.length - 1
      || Object.prototype.hasOwnProperty.call(record, "terminalInitialPath")
      || !expectedKeys.every((key) => key === "terminalInitialPath"
        || Object.prototype.hasOwnProperty.call(record, key))) return value;
    return {
      ...record,
      terminalInitialPath: CommandConfigSerializer._DEFAULT.terminalInitialPath,
    };
  }

  private static readonly _DEFAULT_ROOT: CommandRootConfig = {
    key: "default",
    path: DEFAULT_COMMAND_ROOT_PATH,
  };

  private static readonly _DEFAULT: CommandConfig = {
    terminalPlacement: "right",
    terminalInitialPath: DEFAULT_COMMAND_TERMINAL_INITIAL_PATH,
    roots: [CommandConfigSerializer._DEFAULT_ROOT],
    activeRootKey: "default",
  };
}

export function isTerminalPlacement(value: unknown): value is TerminalPlacement {
  return typeof value === "string"
    && TERMINAL_PLACEMENTS.some((placement) => placement === value);
}

export const commandConfigSerializer: CommandConfigSerializer = new CommandConfigSerializer();
