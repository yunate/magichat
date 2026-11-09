import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";
import { dirname } from "pathe";
import type {
  TreeViewFolder,
  TreeViewFolderProperties,
  TreeViewItem,
  TreeViewItemProperties,
  TreeViewTab,
  TreeViewWorkspace,
} from "./treeViewTypes";
import {
  TREE_VIEW_DEFAULT_SIDEBAR_WIDTH,
  TREE_VIEW_ITEM_FILE_EXTENSION,
} from "./treeViewTypes";
import { TreeViewPath } from "./treeViewPath";

function ensureRequiredRecord(
  value: unknown,
  keys: readonly string[],
  description: string,
): asserts value is Record<string, unknown> {
  ValidateUtils.ensureRecord(value);
  const actualKeys = Object.keys(value);
  if (!keys.every((key) => actualKeys.includes(key))) {
    throw new Error(`${description} has an invalid schema`);
  }
}

function ensureStringArray(value: unknown, description: string): asserts value is string[] {
  ValidateUtils.ensureArray(value, `${description} must be an array`);
  const normalized = new Set<string>();
  for (const entry of value) {
    ValidateUtils.ensureNonBlankString(entry, `${description} entries must be nonblank strings`);
    const key = entry.toLocaleLowerCase("en-US");
    if (normalized.has(key)) throw new Error(`${description} entries must be unique`);
    normalized.add(key);
  }
}

export class TreeViewFolderPropertiesSerializer extends ISerializer<TreeViewFolderProperties> {
  public getDefault(): TreeViewFolderProperties {
    return structuredClone(TreeViewFolderPropertiesSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is TreeViewFolderProperties {
    ensureRequiredRecord(value, Object.keys(TreeViewFolderPropertiesSerializer._DEFAULT), "TreeView folder properties");
    ValidateUtils.ensureBoolean(value.isExpanded, "TreeView folder isExpanded must be a boolean");
    ensureStringArray(value.folderOrder, "TreeView folder folderOrder");
    ensureStringArray(value.itemOrder, "TreeView folder itemOrder");
  }

  public fromStoredValue(value: unknown): TreeViewFolderProperties {
    ValidateUtils.ensureRecord(value);
    const properties = {
      ...value,
      folderOrder: this._readStoredOrder(value.folderOrder),
      itemOrder: this._readStoredOrder(value.itemOrder),
    };
    this.validate(properties);
    return properties;
  }

  private _readStoredOrder(value: unknown): string[] {
    try {
      ensureStringArray(value, "TreeView folder order");
      return value;
    } catch {
      return [];
    }
  }

  private static readonly _DEFAULT: TreeViewFolderProperties = {
    isExpanded: true,
    folderOrder: [],
    itemOrder: [],
  };
}

export class TreeViewItemPropertiesSerializer extends ISerializer<TreeViewItemProperties> {
  public getDefault(): TreeViewItemProperties {
    return structuredClone(TreeViewItemPropertiesSerializer._DEFAULT);
  }

  public validate(value: unknown): asserts value is TreeViewItemProperties {
    ensureRequiredRecord(value, Object.keys(TreeViewItemPropertiesSerializer._DEFAULT), "TreeView item properties");
    ValidateUtils.ensureBoolean(value.isDraft, "TreeView item isDraft must be a boolean");
    ValidateUtils.ensureString(value.iconDescription, "TreeView item iconDescription must be a string");
  }

  private static readonly _DEFAULT: TreeViewItemProperties = {
    isDraft: false,
    iconDescription: "",
  };
}

export class TreeViewItemSerializer extends ISerializer<TreeViewItem> {
  public constructor(propertiesSerializer: TreeViewItemPropertiesSerializer) {
    super();
    this._propertiesSerializer = propertiesSerializer;
  }

  public getDefault(): TreeViewItem {
    return {
      path: "C:/workspace/item.mh",
      name: "item",
      properties: this._propertiesSerializer.getDefault(),
    };
  }

  public validate(value: unknown): asserts value is TreeViewItem {
    ensureRequiredRecord(value, Object.keys(this.getDefault()), "TreeView item");
    const itemPath = TreeViewPath.normalize(value.path, "TreeView item path");
    ValidateUtils.ensureNonBlankString(value.name, "TreeView item name must be nonblank");
    const fileName = itemPath.slice(itemPath.lastIndexOf("/") + 1);
    if (!fileName.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)
      || value.name !== fileName.slice(0, -TREE_VIEW_ITEM_FILE_EXTENSION.length)) {
      throw new Error("TreeView item path must be an MH file matching its name");
    }
    this._propertiesSerializer.validate(value.properties);
  }

  private readonly _propertiesSerializer: TreeViewItemPropertiesSerializer;
}

export class TreeViewFolderSerializer extends ISerializer<TreeViewFolder> {
  public constructor(
    propertiesSerializer: TreeViewFolderPropertiesSerializer,
    itemSerializer: TreeViewItemSerializer,
  ) {
    super();
    this._propertiesSerializer = propertiesSerializer;
    this._itemSerializer = itemSerializer;
  }

  public getDefault(): TreeViewFolder {
    return {
      path: "C:/workspace",
      name: "workspace",
      properties: this._propertiesSerializer.getDefault(),
      folders: [],
      items: [],
    };
  }

  public validate(value: unknown): asserts value is TreeViewFolder {
    this._validateFolder(value);
  }

  private _validateFolder(value: unknown): asserts value is TreeViewFolder {
    ensureRequiredRecord(value, Object.keys(this.getDefault()), "TreeView folder");
    const folderPath = TreeViewPath.normalize(value.path, "TreeView folder path");
    ValidateUtils.ensureNonBlankString(value.name, "TreeView folder name must be nonblank");
    if (value.name !== folderPath.slice(folderPath.lastIndexOf("/") + 1)) {
      throw new Error("TreeView folder path must match its name");
    }
    this._propertiesSerializer.validate(value.properties);
    ValidateUtils.ensureArray(value.folders, "TreeView folders must be an array");
    for (const folder of value.folders) {
      this._validateFolder(folder);
      if (dirname(folder.path) !== folderPath) {
        throw new Error("TreeView child folder path must include its workspace and parent folder");
      }
    }
    ValidateUtils.ensureArray(value.items, "TreeView items must be an array");
    for (const item of value.items) {
      this._itemSerializer.validate(item);
      if (dirname(item.path) !== folderPath) {
        throw new Error("TreeView item path must include its workspace and parent folder");
      }
    }
  }

  private readonly _propertiesSerializer: TreeViewFolderPropertiesSerializer;
  private readonly _itemSerializer: TreeViewItemSerializer;
}

class TreeViewTabSerializer extends ISerializer<TreeViewTab> {
  public getDefault(): TreeViewTab {
    return {
      kind: "item",
      path: "item.mh",
      isPinned: false,
    };
  }

  public validate(value: unknown): asserts value is TreeViewTab {
    ensureRequiredRecord(value, Object.keys(this.getDefault()), "TreeView tab");
    if (value.kind !== "folder" && value.kind !== "item") {
      throw new Error("TreeView tab kind is invalid");
    }
    ValidateUtils.ensureNonBlankString(value.path, "TreeView tab path must be nonblank");
    if (value.path !== "." && (value.path.includes("\\") || value.path.startsWith("/")
      || value.path.includes(":") || value.path.split("/").some((part) => part === "" || part === "." || part === ".."))) {
      throw new Error("TreeView tab path must be normalized and Workspace-relative");
    }
    ValidateUtils.ensureBoolean(value.isPinned, "TreeView tab isPinned must be a boolean");
  }
}

export class TreeViewWorkspaceSerializer extends ISerializer<TreeViewWorkspace> {
  public getDefault(): TreeViewWorkspace {
    return structuredClone(TreeViewWorkspaceSerializer._DEFAULT);
  }

  public fromStoredValue(value: unknown): { properties: TreeViewWorkspace; hasValidTabs: boolean } {
    ValidateUtils.ensureRecord(value);
    let tabs: TreeViewTab[] = [];
    let hasValidTabs = true;
    try {
      this._validateTabs(value.tabs);
      tabs = value.tabs;
    } catch {
      hasValidTabs = false;
    }
    const properties = {
      ...value,
      tabs,
      activeTabPath: typeof value.activeTabPath === "string"
        && tabs.some((tab) => tab.path === value.activeTabPath) ? value.activeTabPath : tabs[0]?.path ?? null,
      previewTabPath: typeof value.previewTabPath === "string"
        && tabs.some((tab) => tab.path === value.previewTabPath && !tab.isPinned) ? value.previewTabPath : null,
    };
    this.validate(properties);
    return { properties, hasValidTabs };
  }

  public validate(value: unknown): asserts value is TreeViewWorkspace {
    ensureRequiredRecord(value, Object.keys(TreeViewWorkspaceSerializer._DEFAULT), "TreeView workspace");
    ValidateUtils.ensureBoolean(value.isSelected, "TreeView workspace isSelected must be a boolean");
    this._validateTabs(value.tabs);
    const tabPaths = new Set(value.tabs.map((tab) => tab.path));
    const pinnedTabPaths = new Set(value.tabs.filter((tab) => tab.isPinned).map((tab) => tab.path));
    if (value.activeTabPath !== null) {
      ValidateUtils.ensureNonBlankString(value.activeTabPath, "TreeView active tab path must be nonblank");
      if (!tabPaths.has(value.activeTabPath)) throw new Error("TreeView active tab path must reference a tab");
    } else if (tabPaths.size > 0) {
      throw new Error("TreeView active tab path is required when tabs exist");
    }
    if (value.previewTabPath !== null) {
      ValidateUtils.ensureNonBlankString(value.previewTabPath, "TreeView preview tab path must be nonblank");
      if (!tabPaths.has(value.previewTabPath)) {
        throw new Error("TreeView preview tab path must reference a tab");
      }
      if (pinnedTabPaths.has(value.previewTabPath)) {
        throw new Error("TreeView preview tab must not be pinned");
      }
    }
    ensureRequiredRecord(value.ui, Object.keys(TreeViewWorkspaceSerializer._DEFAULT.ui), "TreeView workspace ui");
    ensureRequiredRecord(
      value.ui.layout,
      Object.keys(TreeViewWorkspaceSerializer._DEFAULT.ui.layout),
      "TreeView workspace layout",
    );
    ValidateUtils.ensureNumber(value.ui.layout.sidebarWidth, "TreeView sidebar width must be a number");
    if (value.ui.layout.sidebarWidth < 200 || value.ui.layout.sidebarWidth > 480) {
      throw new Error("TreeView sidebar width is out of range");
    }
  }

  private _validateTabs(value: unknown): asserts value is TreeViewTab[] {
    ValidateUtils.ensureArray(value, "TreeView workspace tabs must be an array");
    const tabPaths = new Set<string>();
    let hasUnpinnedTab = false;
    for (const tab of value) {
      TreeViewWorkspaceSerializer._TAB_SERIALIZER.validate(tab);
      if (tabPaths.has(tab.path)) throw new Error("TreeView tab paths must be unique");
      tabPaths.add(tab.path);
      if (!tab.isPinned) hasUnpinnedTab = true;
      else if (hasUnpinnedTab) throw new Error("Pinned TreeView tabs must precede unpinned tabs");
    }
  }

  private static readonly _TAB_SERIALIZER: TreeViewTabSerializer = new TreeViewTabSerializer();
  private static readonly _DEFAULT: TreeViewWorkspace = {
    isSelected: false,
    tabs: [],
    activeTabPath: null,
    previewTabPath: null,
    ui: { layout: { sidebarWidth: TREE_VIEW_DEFAULT_SIDEBAR_WIDTH } },
  };
}

export const treeViewWorkspaceSerializer: TreeViewWorkspaceSerializer =
  new TreeViewWorkspaceSerializer();