export type TreeViewSelection = {
  kind: "folder" | "item";
  id: string;
};

export type TreeViewDropPosition = "before" | "inside" | "inside-before" | "after";

export type TreeViewActivateParams = TreeViewSelection & {
  openMode?: "preview" | "normal" | "pinned";
};

export type TreeViewCloseTabsParams = {
  tabIds: readonly string[];
  preferredActiveId?: string;
};

export type TreeViewSetTabPinnedParams = {
  tabId: string;
  isPinned: boolean;
};

export type TreeViewReorderTabsParams = {
  draggedId: string;
  targetId: string;
  position: "before" | "after";
};

export type TreeViewSwitchTabParams = {
  tabId: string;
};

export type TreeViewSaveDraftParams = {
  itemId: string;
  sourcePath: string;
  targetFolderPath: string;
  name: string;
};