import type {
  TreeViewCloneParams,
  TreeViewCreateItemProperties,
  TreeViewEntityData,
  TreeViewEntityDataParams,
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewMoveParams,
  TreeViewWorkspace,
} from "./treeViewTypes";

export interface TreeViewDataNotifierClientRpcApi {
  operationCompleted(operationId: string, errorMessage: string | null): void;
  storageChanged(): void;
  storageWarning(message: string): void;
}

export interface TreeViewDataProvider {
  init(notifierRegisterName: string): Promise<void>;
  dispose(): Promise<void>;
  getWorkspaces(rootPath: string): Promise<string[]>;
  getWorkspaceProperties(workspacePath: string): Promise<TreeViewWorkspace>;
  updateWorkspaceProperties(workspacePath: string, properties: TreeViewWorkspace): Promise<void>;
  createWorkspace(
    rootPath: string,
    workspaceName: string,
    isSelected: boolean,
  ): Promise<string>;
  renameWorkspace(workspacePath: string, newName: string): Promise<string>;
  deleteWorkspace(operationId: string, workspacePath: string): void;
  getFolder(folderPath: string, depth?: number): Promise<TreeViewFolder>;
  getFolderProperties(folderPath: string): Promise<TreeViewFolderProperties>;
  createFolder(folderPath: string): Promise<string>;
  updateFolderProperties(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  deleteFolder(operationId: string, folderPath: string): void;
  checkEntitiesIntegrity(entities: TreeViewEntityDataParams[]): Promise<boolean[]>;
  getItem(itemPath: string): Promise<TreeViewItem>;
  createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  repairEntityId(params: TreeViewEntityDataParams, id: string): Promise<void>;
  deleteItem(operationId: string, itemPath: string): void;
  getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData>;
  updateEntityData(params: TreeViewEntityDataParams, data: TreeViewEntityData): Promise<void>;
  openInExplorer(kind: "folder" | "item", targetPath: string): Promise<void>;
  clone(operationId: string, params: TreeViewCloneParams): void;
  move(params: TreeViewMoveParams): Promise<void>;
}