import type { TerminalRunRequest, TerminalType } from "../../../../common/terminal";

export type TerminalExposed = {
  initialize(): Promise<void>;
  createPty(
    terminalType: TerminalType,
    initialPath: string,
    heartbeatIntervalMs?: number,
    runningStatusChangeCallback?: ((isRunning: boolean) => void) | null,
    isUAC?: boolean,
  ): Promise<void>;
  run(request: TerminalRunRequest): Promise<void>;
  stop(): Promise<void>;
  destroyPty(): Promise<void>;
  readonly hasConnectedPty: boolean;
  clear(): Promise<void>;
  write(data: string): Promise<void>;
  getCurrentLine(): string;
  isTerminalRunning(): boolean;
};
