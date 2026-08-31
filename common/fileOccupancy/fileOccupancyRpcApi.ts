import type {
  FileOccupancyQueryResult,
  ProcessIdentity,
  TerminateProcessResult,
} from "./fileOccupancyTypes";

export interface FileOccupancyServerRpcApi {
  init(notifierRegisterName: string): Promise<void>;
  startQuery(target: string): Promise<void>;
  cancelQuery(): Promise<void>;
  terminateProcess(process: ProcessIdentity): Promise<TerminateProcessResult>;
}

export interface FileOccupancyClientRpcApi {
  queryCompleted(result: FileOccupancyQueryResult): void;
  queryFailed(message: string): void;
}

export interface FileOccupancyUacServerRpcApi {
  init(notifierRegisterName: string): Promise<void>;
  startQuery(operationId: string, target: string): void;
  cancelQuery(operationId: string): void;
  terminateProcess(process: ProcessIdentity): Promise<TerminateProcessResult>;
}

export interface FileOccupancyUacClientRpcApi {
  queryCompleted(operationId: string, result: FileOccupancyQueryResult): void;
  queryFailed(operationId: string, message: string): void;
}