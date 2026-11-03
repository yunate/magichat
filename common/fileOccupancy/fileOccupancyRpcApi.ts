import type {
  FileOccupancyQueryResult,
  ProcessIdentity,
  TerminateProcessTreeResult,
} from "./fileOccupancyTypes";

export interface FileOccupancyServerRpcApi {
  init(notifier: FileOccupancyClientRpcApi): Promise<void>;
  startQuery(target: string): Promise<void>;
  cancelQuery(): Promise<void>;
  getExistingProcessIds(processIds: readonly number[]): Promise<readonly number[]>;
  terminateProcessTree(process: ProcessIdentity): Promise<TerminateProcessTreeResult>;
}

export interface FileOccupancyClientRpcApi {
  queryCompleted(result: FileOccupancyQueryResult): void;
  queryFailed(message: string): void;
}

export interface FileOccupancyUacServerRpcApi {
  init(notifier: FileOccupancyUacClientRpcApi): Promise<void>;
  startQuery(operationId: string, target: string): void;
  cancelQuery(operationId: string): void;
  getExistingProcessIds(processIds: readonly number[]): readonly number[];
  terminateProcessTree(process: ProcessIdentity): Promise<TerminateProcessTreeResult>;
}

export interface FileOccupancyUacClientRpcApi {
  queryCompleted(operationId: string, result: FileOccupancyQueryResult): void;
  queryFailed(operationId: string, message: string): void;
}