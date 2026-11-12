import type { ApplicationPathsOptions } from "../applicationPaths";

export interface BackendServerRpcApi {
  getProcessId(): number;
}

export interface BackendLifecycleServerRpcApi extends BackendServerRpcApi {
  init(options: ApplicationPathsOptions): Promise<void>;
  getRestartExecutablePath(): Promise<string>;
  shutdown(): Promise<void>;
}