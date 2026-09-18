import type { CommandRootConfig } from "../config/command";
import type { TerminalRunRequest } from "../terminal";
import type { TreeViewStorageRoot } from "../treeView";

export type CommandEnvUpdate = Readonly<{
  key: string;
  value: string;
}>;

export type CommandEnvTarget = Readonly<{
  path: string;
  sourceCommandPath: string | null;
}>;

export interface CommandClientRpcApi {
  setEnv(updates: readonly CommandEnvUpdate[], target: CommandEnvTarget | null): void;
  getEnv(key: string, target: CommandEnvTarget | null): Promise<string>;
  call(path: string, sourceCommandPath: string | null): Promise<TerminalRunRequest>;
}

export interface CommandStorageServerRpcApi {
  init(notifierRegisterName: string): Promise<void>;
  dispose(): Promise<void>;
  resolveRoots(roots: readonly CommandRootConfig[]): TreeViewStorageRoot[];
  resolveTerminalInitialPath(initialPath: string): string;
  revealStorage(rootPath: string): void;
  deleteStorage(rootPath: string): void;
}