import type {
  TreeViewCloneParams,
  TreeViewCreateItemProperties,
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewMoveParams,
  TreeViewWorkspace,
} from "./treeViewTypes";

export interface TreeViewDataNotifierClientRpcApi {
  storageChanged(): void;
}

export interface TreeViewDataProvider {
  init(notifierRegisterName: string): Promise<void>;
  dispose(): Promise<void>;
  getWorkspaces(): Promise<string[]>;
  getWorkspaceProperties(workspaceName: string): Promise<TreeViewWorkspace>;
  updateWorkspaceProperties(workspaceName: string, properties: TreeViewWorkspace): Promise<void>;
  createWorkspace(workspaceName: string, isSelected: boolean): Promise<void>;
  renameWorkspace(currentName: string, newName: string): Promise<void>;
  deleteWorkspace(workspaceName: string, nextWorkspaceName: string | null): Promise<void>;
  getFolder(folderPath: string): Promise<TreeViewFolder>;
  createFolder(folderPath: string): Promise<TreeViewFolder>;
  updateFolderProperties(folderPath: string, properties: TreeViewFolderProperties): Promise<void>;
  deleteFolder(folderPath: string): Promise<void>;
  getItem(itemPath: string): Promise<TreeViewItem>;
  createItem(itemPath: string, properties: TreeViewCreateItemProperties): Promise<TreeViewItem>;
  updateItem(itemPath: string, properties: TreeViewItemProperties): Promise<void>;
  deleteItem(itemPath: string): Promise<void>;
  openInExplorer(kind: "folder" | "item", logicalPath: string): Promise<void>;
  clone(params: TreeViewCloneParams): Promise<void>;
  move(params: TreeViewMoveParams): Promise<void>;
}