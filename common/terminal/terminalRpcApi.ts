import type { TerminalPtyOptions } from "./terminalPtyOptions";
import type { TerminalRunRequest } from "./terminalRunRequest";

export const TERMINAL_TYPES = ["cmd", "powershell"] as const;
export type TerminalType = (typeof TERMINAL_TYPES)[number];

export type TerminalPtyInfo = Readonly<{
  backend: "conpty" | "winpty";
  buildNumber: number;
}>;

export type TerminalPtyState = TerminalPtyInfo & Readonly<{
  terminalId: string;
  initialPath: string;
  pid: number;
  cols: number;
  rows: number;
  process: string;
}>;

export type TerminalPtyExit = Readonly<{
  exitCode: number;
  signal?: number;
}>;

export interface PtyCallbackApi {
  onData(data: string): void | Promise<void>;
  onExit(event: TerminalPtyExit): void | Promise<void>;
}

export interface PtyApi {
  getTerminalId(): string | Promise<string>;
  getInfo(): TerminalPtyState | Promise<TerminalPtyState>;
  resize(columns: number, rows: number): void | Promise<void>;
  clear(): void | Promise<void>;
  write(data: string): void | Promise<void>;
  kill(signal?: string): void | Promise<void>;
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
}

export interface TerminalRuntimeServiceApi {
  create(options: TerminalPtyOptions, callback: TerminalClientRpcApi): Promise<PtyApi>;
  destroy(terminalId: string): Promise<void>;
  run(terminalId: string, request: TerminalRunRequest): Promise<void>;
}

export interface TerminalClientRpcApi {
  output(data: string): void;
  runtimeError(message: string): void;
}

export function isTerminalType(value: unknown): value is TerminalType {
  return value === "cmd" || value === "powershell";
}
