import { basename, dirname } from "pathe";
import { TREE_VIEW_ITEM_FILE_EXTENSION } from "./treeViewTypes";
import type { TreeViewFolder, TreeViewItem } from "./treeViewTypes";

export class TreeViewFolderUtils {
  public static GetFolder(rootFolder: TreeViewFolder, path: string): TreeViewFolder | null {
    if (path === rootFolder.path) return rootFolder;
    const rootPrefix = rootFolder.path.endsWith("/")
      ? rootFolder.path
      : `${rootFolder.path}/`;
    if (!path.startsWith(rootPrefix)) return null;
    let folder = rootFolder;
    for (const name of path.slice(rootPrefix.length).split("/")) {
      const child = folder.folders.find((candidate) => candidate.name === name);
      if (child === undefined) return null;
      folder = child;
    }
    return folder;
  }

  public static DeleteFolder(rootFolder: TreeViewFolder, path: string): boolean {
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(path));
    if (parent === null) return false;
    const name = basename(path);
    const index = parent.folders.findIndex((folder) => folder.name === name);
    if (index < 0) return false;
    parent.folders.splice(index, 1);
    parent.properties.folderOrder = parent.properties.folderOrder.filter((entry) => entry !== name);
    return true;
  }

  public static AddFolder(rootFolder: TreeViewFolder, folder: TreeViewFolder): boolean {
    if (folder.path === rootFolder.path || folder.name !== basename(folder.path)) return false;
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(folder.path));
    if (parent === null || parent.folders.some((entry) => entry.name === folder.name)) return false;
    parent.folders.push(folder);
    if (!parent.properties.folderOrder.includes(folder.name)) {
      parent.properties.folderOrder.push(folder.name);
    }
    return true;
  }

  public static UpdateFolder(rootFolder: TreeViewFolder, folder: TreeViewFolder): boolean {
    if (folder.name !== basename(folder.path)) return false;
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(folder.path));
    if (parent === null) return false;
    const index = parent.folders.findIndex((entry) => entry.name === folder.name);
    if (index < 0) return false;
    parent.folders[index] = folder;
    return true;
  }

  public static GetItem(rootFolder: TreeViewFolder, path: string): TreeViewItem | null {
    if (!path.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)) return null;
    const folder = TreeViewFolderUtils.GetFolder(rootFolder, dirname(path));
    if (folder === null) return null;
    const name = basename(path, TREE_VIEW_ITEM_FILE_EXTENSION);
    return folder.items.find((item) => item.name === name) ?? null;
  }

  public static DeleteItem(rootFolder: TreeViewFolder, path: string): boolean {
    if (!path.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)) return false;
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(path));
    if (parent === null) return false;
    const name = basename(path, TREE_VIEW_ITEM_FILE_EXTENSION);
    const index = parent.items.findIndex((item) => item.name === name);
    if (index < 0) return false;
    parent.items.splice(index, 1);
    parent.properties.itemOrder = parent.properties.itemOrder.filter((entry) => entry !== name);
    return true;
  }

  public static AddItem(rootFolder: TreeViewFolder, item: TreeViewItem): boolean {
    if (!item.path.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)
      || item.name !== basename(item.path, TREE_VIEW_ITEM_FILE_EXTENSION)) return false;
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(item.path));
    if (parent === null || parent.items.some((entry) => entry.name === item.name)) return false;
    parent.items.push(item);
    TreeViewFolderUtils._updateItemOrder(parent, item);
    return true;
  }

  public static UpdateItem(rootFolder: TreeViewFolder, item: TreeViewItem): boolean {
    if (!item.path.endsWith(TREE_VIEW_ITEM_FILE_EXTENSION)
      || item.name !== basename(item.path, TREE_VIEW_ITEM_FILE_EXTENSION)) return false;
    const parent = TreeViewFolderUtils.GetFolder(rootFolder, dirname(item.path));
    if (parent === null) return false;
    const index = parent.items.findIndex((entry) => entry.name === item.name);
    if (index < 0) return false;
    parent.items[index] = item;
    TreeViewFolderUtils._updateItemOrder(parent, item);
    return true;
  }

  private static _updateItemOrder(parent: TreeViewFolder, item: TreeViewItem): void {
    if (item.properties.isDraft) {
      parent.properties.itemOrder = parent.properties.itemOrder.filter((entry) => entry !== item.name);
    } else if (!parent.properties.itemOrder.includes(item.name)) {
      parent.properties.itemOrder.push(item.name);
    }
  }

  private constructor() {}
}