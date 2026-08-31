import type {
  TreeViewCloneParams,
  TreeViewCreateItemProperties,
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
  deleteWorkspace(workspacePath: string): Promise<void>;
  getFolder(folderPath: string): Promise<TreeViewFolder>;
  getFolderProperties(folderPath: string): Promise<TreeViewFolderProperties>;
  createFolder(folderPath: string): Promise<string>;
  updateFolderProperties(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  deleteFolder(folderPath: string): Promise<void>;
  getItem(itemPath: string): Promise<TreeViewItem>;
  createItem(
    itemPath: string,
    properties: TreeViewCreateItemProperties,
  ): Promise<TreeViewItem>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  repairEntityId(params: TreeViewEntityDataParams, id: string): Promise<void>;
  deleteItem(itemPath: string): Promise<void>;
  getEntityData(params: TreeViewEntityDataParams): Promise<string | null>;
  updateEntityData(params: TreeViewEntityDataParams, dataJson: string): Promise<void>;
  openInExplorer(kind: "folder" | "item", targetPath: string): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<void>;
  move(params: TreeViewMoveParams): Promise<void>;
}