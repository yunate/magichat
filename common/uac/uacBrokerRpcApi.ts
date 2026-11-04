import type { ApplicationPathsOptions } from "../applicationPaths";
import type { TerminalRuntimeServiceApi } from "../terminal";

export type UacBrokerReadyInfo = Readonly<{
  processId: number;
  token: string;
}>;

export interface UacBrokerServerRpcApi {
  getReadyInfo(): UacBrokerReadyInfo;
  init(options: ApplicationPathsOptions): void;
  setTerminalInitialPath(initialPath: string): void;
  getUacTerminalRuntimeService(): TerminalRuntimeServiceApi;
  shutdown(): Promise<void>;
}