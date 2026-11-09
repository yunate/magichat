import type {
  TreeViewCloneParams,
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
  storageChanged(): void;
  storageWarning(message: string): void;
}

export interface TreeViewDataProvider {
  init(notifier: TreeViewDataNotifierClientRpcApi): Promise<void>;
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
  deleteWorkspace(workspacePath: string): Promise<void>;
  getFolder(folderPath: string, depth?: number): Promise<TreeViewFolder>;
  getFolderProperties(folderPath: string): Promise<TreeViewFolderProperties>;
  createFolder(folderPath: string): Promise<TreeViewFolder>;
  updateFolderProperties(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  deleteFolder(folderPath: string): Promise<void>;
  checkEntitiesIntegrity(entities: TreeViewEntityDataParams[]): Promise<boolean[]>;
  getItem(itemPath: string): Promise<TreeViewItem>;
  getAvailableItemPath(itemPath: string): Promise<string>;
  createItem(
    itemPath: string,
    properties: TreeViewItemProperties,
  ): Promise<TreeViewItem>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  deleteItem(itemPath: string): Promise<void>;
  getEntityData(params: TreeViewEntityDataParams): Promise<TreeViewEntityData>;
  updateEntityData(params: TreeViewEntityDataParams, data: TreeViewEntityData): Promise<void>;
  openInExplorer(kind: "folder" | "item", targetPath: string): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<void>;
  move(params: TreeViewMoveParams): Promise<void>;
}