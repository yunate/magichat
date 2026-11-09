export type TreeViewSelection = {
  kind: "folder" | "item";
  path: string;
};

export type TreeViewDropPosition = "before" | "inside" | "inside-before" | "after";

export type TreeViewActivateParams = TreeViewSelection & {
  openMode?: "preview" | "normal" | "pinned";
};

export type TreeViewCloseTabsParams = {
  tabPaths: readonly string[];
  preferredActivePath?: string;
};

export type TreeViewSetTabPinnedParams = {
  tabPath: string;
  isPinned: boolean;
};

export type TreeViewReorderTabsParams = {
  draggedPath: string;
  targetPath: string;
  position: "before" | "after";
};

export type TreeViewSwitchTabParams = {
  tabPath: string;
};

export type TreeViewSaveDraftParams = {
  sourcePath: string;
  targetFolderPath: string;
  name: string;
};