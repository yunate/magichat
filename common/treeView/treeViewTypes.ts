export const TREE_VIEW_ITEM_FILE_EXTENSION = ".mh";
export const TREE_VIEW_DEFAULT_SIDEBAR_WIDTH = 400;

export type TreeViewFolderProperties = {
  isExpanded: boolean;
  folderOrder: string[];
  itemOrder: string[];
};

export type TreeViewItemProperties = {
  isDraft: boolean;
  iconDescription: string;
};

export type TreeViewStorageRoot = {
  key: string;
  path: string;
};

export type TreeViewWorkspaceRef = {
  rootKey: string;
  workspacePath: string;
  workspaceName: string;
};

export type TreeViewItem = {
  path: string;
  name: string;
  properties: TreeViewItemProperties;
};

export type TreeViewFolder = {
  path: string;
  name: string;
  properties: TreeViewFolderProperties;
  folders: TreeViewFolder[];
  items: TreeViewItem[];
};

export type TreeViewTab = {
  kind: "folder" | "item";
  path: string;
  isPinned: boolean;
};

export type TreeViewWorkspace = {
  isSelected: boolean;
  tabs: TreeViewTab[];
  activeTabPath: string | null;
  previewTabPath: string | null;
  ui: {
    layout: {
      sidebarWidth: number;
    };
  };
};

export type TreeViewEntityKind = "workspace" | "folder" | "item";

export type TreeViewEntityDataParams = {
  kind: TreeViewEntityKind;
  path: string;
};

export type TreeViewEntityData = {
  dataJson: string | null;
  extends: Array<[string, string]>;
};

export type TreeViewMoveParams = {
  kind: Exclude<TreeViewEntityKind, "workspace">;
  sourcePath: string;
  targetPath: string;
  targetOrder: number;
};

export type TreeViewCloneParams = {
  kind: TreeViewEntityKind | "workspace";
  sourcePath: string;
  targetPath: string;
};