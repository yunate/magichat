import type {
  CommandEnvUpdate,
  CommandFolderData,
  CommandItemData,
} from "../../../../../../common/command";
import type { ScriptType } from "../../../../../../common/tasks/scriptTaskDefinition";

export type CommandTabPageState = Readonly<{
  id: string;
  isDirty: boolean;
  isRunning: boolean;
  scriptType: ScriptType | null;
}>;

export type CommandTabPageApi = Readonly<{
  id: string;
  isDirty(): boolean;
  isDraft(): boolean;
  isRunning(): boolean;
  save(): Promise<boolean>;
  discardDraft(): Promise<void>;
  stopRunning(): Promise<void>;
  getFolderData(): CommandFolderData | null;
  applyPersistedParams(
    data: CommandFolderData | CommandItemData,
    updates: readonly CommandEnvUpdate[],
  ): void;
  applyAncestorFolderData(folderId: string, data: CommandFolderData): void;
}>;
