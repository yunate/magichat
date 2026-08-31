import type { ScriptType } from "../tasks/scriptTaskDefinition";

export const TERMINAL_TYPES = ["cmd", "powershell"] as const;
export type TerminalType = (typeof TERMINAL_TYPES)[number];

export type TerminalPtyInfo = Readonly<{
  backend: "conpty" | "winpty";
  buildNumber: number;
}>;

export type TerminalRunRequest = Readonly<{
  scriptId: string;
  commandPath: string;
  scriptType: ScriptType;
  scriptContent: string;
}>;

export interface TerminalServerRpcApi {
  init(notifierRegisterName: string): Promise<void>;
  createPty(
    terminalType: TerminalType,
    columns: number,
    rows: number,
    initialPath: string,
  ): Promise<TerminalPtyInfo>;
  run(request: TerminalRunRequest): Promise<void>;
  stop(): Promise<void>;
  destroyPty(): Promise<void>;
  isActive(): Promise<boolean>;
  clear(): Promise<void>;
  write(data: string): Promise<void>;
  resize(columns: number, rows: number): Promise<void>;
  dispose(): Promise<void>;
}

export interface TerminalClientRpcApi {
  output(data: string): void;
  runtimeError(message: string): void;
}

export function isTerminalType(value: unknown): value is TerminalType {
  return value === "cmd" || value === "powershell";
}
