import { DEFAULT_COMMAND_TERMINAL_INITIAL_PATH } from "../config/command";
import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";
import { isTerminalType, type TerminalType } from "./terminalRpcApi";

export type TerminalDimensions = Readonly<{
  columns: number;
  rows: number;
}>;

export type TerminalPtyOptions = TerminalDimensions & Readonly<{
  terminalType: TerminalType;
  initialPath: string;
}>;

export class TerminalDimensionsSerializer extends ISerializer<TerminalDimensions> {
  public getDefault(): TerminalDimensions {
    return structuredClone(TerminalDimensionsSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is TerminalDimensions {
    ensureExactRecord(value, Object.keys(TerminalDimensionsSerializer._DEFAULT), "Terminal dimensions");
    ValidateUtils.ensureNumber(value.columns, "Terminal columns are invalid");
    ValidateUtils.ensureNumber(value.rows, "Terminal rows are invalid");
    if (!Number.isSafeInteger(value.columns) || value.columns < 1
      || value.columns > TerminalDimensionsSerializer._MAX_COLUMNS) {
      throw new Error("Terminal columns are invalid");
    }
    if (!Number.isSafeInteger(value.rows) || value.rows < 1
      || value.rows > TerminalDimensionsSerializer._MAX_ROWS) {
      throw new Error("Terminal rows are invalid");
    }
  }

  private static readonly _DEFAULT: TerminalDimensions = { columns: 80, rows: 24 };
  private static readonly _MAX_COLUMNS = 1000;
  private static readonly _MAX_ROWS = 500;
}

export const terminalDimensionsSerializer: ISerializer<TerminalDimensions> = new TerminalDimensionsSerializer();

export class TerminalPtyOptionsSerializer extends ISerializer<TerminalPtyOptions> {
  public getDefault(): TerminalPtyOptions {
    return structuredClone(TerminalPtyOptionsSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is TerminalPtyOptions {
    ensureExactRecord(value, Object.keys(TerminalPtyOptionsSerializer._DEFAULT), "Terminal PTY options");
    if (!isTerminalType(value.terminalType)) throw new Error("Terminal type is invalid");
    ValidateUtils.ensureNumber(value.columns, "Terminal columns are invalid");
    ValidateUtils.ensureNumber(value.rows, "Terminal rows are invalid");
    ValidateUtils.ensureNonBlankString(value.initialPath, "Terminal initial path must not be blank");
  }

  private static readonly _DEFAULT: TerminalPtyOptions = {
    terminalType: "powershell",
    ...terminalDimensionsSerializer.getDefault(),
    initialPath: DEFAULT_COMMAND_TERMINAL_INITIAL_PATH,
  };
}

export const terminalPtyOptionsSerializer: ISerializer<TerminalPtyOptions> = new TerminalPtyOptionsSerializer();

function ensureExactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  description: string,
): asserts value is Record<string, unknown> {
  ValidateUtils.ensureRecord(value);
  const actualKeys = Object.keys(value);
  if (Array.isArray(value) || actualKeys.length !== expectedKeys.length
    || !expectedKeys.every((key) => actualKeys.includes(key))) {
    throw new Error(`${description} has an invalid schema`);
  }
}