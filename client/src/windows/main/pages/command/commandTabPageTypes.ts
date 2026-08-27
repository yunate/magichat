import type { CommandFolderData } from "../../../../../../common/command";

export type CommandTabPageState = Readonly<{
  id: string;
  isDirty: boolean;
  isRunning: boolean;
}>;

export type CommandTabPageApi = Readonly<{
  id: string;
  isDirty(): boolean;
  isRunning(): boolean;
  save(): Promise<void>;
  stopRunning(): Promise<void>;
  getFolderData(): CommandFolderData | null;
}>;
