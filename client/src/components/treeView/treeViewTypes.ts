export type TreeViewSelection = {
  kind: "folder" | "item";
  id: string;
};

export type TreeViewActivateParams = TreeViewSelection & {
  openMode?: "normal" | "pinned";
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