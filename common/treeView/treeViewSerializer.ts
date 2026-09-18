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

function ensureExactRecord(
  value: unknown,
  keys: readonly string[],
  description: string,
): asserts value is Record<string, unknown> {
  ValidateUtils.ensureRecord(value);
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== keys.length || !keys.every((key) => actualKeys.includes(key))) {
    throw new Error(`${description} has an invalid schema`);
  }
}

function ensureIdentifier(value: unknown, description: string): asserts value is string {
  ValidateUtils.ensureNonBlankString(value, `${description} must be a nonblank string`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${description} must be a UUID v4`);
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
    ensureExactRecord(value, Object.keys(TreeViewFolderPropertiesSerializer._DEFAULT), "TreeView folder properties");
    ensureIdentifier(value.id, "TreeView folder id");
    ValidateUtils.ensureBoolean(value.isExpanded, "TreeView folder isExpanded must be a boolean");
    ensureStringArray(value.folderOrder, "TreeView folder folderOrder");
    ensureStringArray(value.itemOrder, "TreeView folder itemOrder");
  }

  private static readonly _DEFAULT: TreeViewFolderProperties = {
    id: "00000000-0000-4000-8000-000000000000",
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
    ensureExactRecord(value, Object.keys(TreeViewItemPropertiesSerializer._DEFAULT), "TreeView item properties");
    ensureIdentifier(value.id, "TreeView item id");
    ValidateUtils.ensureBoolean(value.isDraft, "TreeView item isDraft must be a boolean");
  }

  private static readonly _DEFAULT: TreeViewItemProperties = {
    id: "00000000-0000-4000-8000-000000000000",
    isDraft: false,
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
    ensureExactRecord(value, Object.keys(this.getDefault()), "TreeView item");
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
    ensureExactRecord(value, Object.keys(this.getDefault()), "TreeView folder");
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
      id: "00000000-0000-4000-8000-000000000000",
      path: "item.mh",
      isPinned: false,
    };
  }

  public validate(value: unknown): asserts value is TreeViewTab {
    ensureExactRecord(value, Object.keys(this.getDefault()), "TreeView tab");
    if (value.kind !== "folder" && value.kind !== "item") {
      throw new Error("TreeView tab kind is invalid");
    }
    ensureIdentifier(value.id, "TreeView tab id");
    ValidateUtils.ensureNonBlankString(value.path, "TreeView tab path must be nonblank");
    ValidateUtils.ensureBoolean(value.isPinned, "TreeView tab isPinned must be a boolean");
  }
}

export class TreeViewWorkspaceSerializer extends ISerializer<TreeViewWorkspace> {
  public getDefault(): TreeViewWorkspace {
    return structuredClone(TreeViewWorkspaceSerializer._DEFAULT);
  }

  public override fromValue(value: unknown): TreeViewWorkspace {
    return super.fromValue(this._migrateLegacyValue(value));
  }

  public validate(value: unknown): asserts value is TreeViewWorkspace {
    ensureExactRecord(value, Object.keys(TreeViewWorkspaceSerializer._DEFAULT), "TreeView workspace");
    ValidateUtils.ensureBoolean(value.isSelected, "TreeView workspace isSelected must be a boolean");
    ValidateUtils.ensureArray(value.tabs, "TreeView workspace tabs must be an array");
    const tabIds = new Set<string>();
    const pinnedTabIds = new Set<string>();
    let foundUnpinned = false;
    for (const tab of value.tabs) {
      TreeViewWorkspaceSerializer._TAB_SERIALIZER.validate(tab);
      if (tabIds.has(tab.id)) throw new Error("TreeView tab ids must be unique");
      tabIds.add(tab.id);
      if (tab.isPinned) pinnedTabIds.add(tab.id);
      if (!tab.isPinned) foundUnpinned = true;
      else if (foundUnpinned) throw new Error("Pinned TreeView tabs must precede unpinned tabs");
    }
    if (value.activeTabId !== null) {
      ensureIdentifier(value.activeTabId, "TreeView active tab id");
      if (!tabIds.has(value.activeTabId)) throw new Error("TreeView active tab id must reference a tab");
    } else if (tabIds.size > 0) {
      throw new Error("TreeView active tab id is required when tabs exist");
    }
    if (value.previewTabId !== null) {
      ensureIdentifier(value.previewTabId, "TreeView preview tab id");
      if (!tabIds.has(value.previewTabId)) {
        throw new Error("TreeView preview tab id must reference a tab");
      }
      if (pinnedTabIds.has(value.previewTabId)) {
        throw new Error("TreeView preview tab must not be pinned");
      }
    }
    ensureExactRecord(value.ui, Object.keys(TreeViewWorkspaceSerializer._DEFAULT.ui), "TreeView workspace ui");
    ensureExactRecord(
      value.ui.layout,
      Object.keys(TreeViewWorkspaceSerializer._DEFAULT.ui.layout),
      "TreeView workspace layout",
    );
    ValidateUtils.ensureNumber(value.ui.layout.sidebarWidth, "TreeView sidebar width must be a number");
    if (value.ui.layout.sidebarWidth < 200 || value.ui.layout.sidebarWidth > 480) {
      throw new Error("TreeView sidebar width is out of range");
    }
  }

  private _migrateLegacyValue(value: unknown): unknown {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== TreeViewWorkspaceSerializer._LEGACY_KEYS.length
      || !TreeViewWorkspaceSerializer._LEGACY_KEYS.every((key) => actualKeys.includes(key))) {
      return value;
    }
    return { ...value, previewTabId: null };
  }

  private static readonly _TAB_SERIALIZER: TreeViewTabSerializer = new TreeViewTabSerializer();
  private static readonly _DEFAULT: TreeViewWorkspace = {
    isSelected: false,
    tabs: [],
    activeTabId: null,
    previewTabId: null,
    ui: { layout: { sidebarWidth: TREE_VIEW_DEFAULT_SIDEBAR_WIDTH } },
  };
  private static readonly _LEGACY_KEYS = Object.keys(TreeViewWorkspaceSerializer._DEFAULT)
    .filter((key) => key !== "previewTabId");
}

export const treeViewWorkspaceSerializer: ISerializer<TreeViewWorkspace> =
  new TreeViewWorkspaceSerializer();