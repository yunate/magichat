export type TreeViewFolderProperties = {
  id: string;
  isExpanded: boolean;
  folderOrder: string[];
  itemOrder: string[];
  data: unknown;
};

export type TreeViewItemProperties = {
  id: string;
  isDraft: boolean;
  data: unknown;
};

export type TreeViewCreateItemProperties = Omit<TreeViewItemProperties, "id">;

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
  id: string;
  isPinned: boolean;
};

export type TreeViewWorkspace = {
  isSelected: boolean;
  tabs: TreeViewTab[];
  activeTabId: string | null;
  ui: {
    layout: {
      sidebarWidth: number;
    };
  };
};

export type TreeViewEntityKind = "folder" | "item";

export type TreeViewMoveParams = {
  kind: TreeViewEntityKind;
  sourcePath: string;
  targetPath: string;
  targetOrder: number;
};

export type TreeViewCloneParams = {
  kind: TreeViewEntityKind | "workspace";
  sourcePath: string;
  targetPath: string;
};