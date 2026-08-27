import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import type { TerminalType } from "../../../../common/terminal";

export type TerminalExposed = {
  initialize(): Promise<void>;
  createPty(terminalType: TerminalType): Promise<void>;
  run(request: Readonly<{ scriptType: ScriptType; scriptContent: string }>): Promise<void>;
  stop(): Promise<void>;
  destroyPty(): Promise<void>;
  isActive(): Promise<boolean>;
  clear(): Promise<void>;
  write(data: string): Promise<void>;
  getCurrentLine(): string;
};
