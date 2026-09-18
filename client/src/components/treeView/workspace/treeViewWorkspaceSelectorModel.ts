import { computed, shallowRef, type ComputedRef } from "vue";
import { basename, dirname } from "pathe";
import type { RemoteObject } from "../../../../../common/ipc_bridge/rpc";
import type {
  TreeViewDataProvider,
  TreeViewStorageRoot,
  TreeViewWorkspaceRef,
} from "../../../../../common/treeView";
import { TreeViewPath } from "../../../../../common/treeView";

export type TreeViewWorkspaceSelectorDataProvider = Pick<
  RemoteObject<TreeViewDataProvider>,
  "getWorkspaces"
>;

export class TreeViewWorkspaceSelectorModel {
  public constructor(storageRoots: readonly TreeViewStorageRoot[]) {
    this._storageRoots = this._validateStorageRoots(storageRoots);
    this.workspaceRefs = computed(() => this._workspaceRefs.value);
  }

  public get storageRoots(): readonly TreeViewStorageRoot[] {
    return this._storageRoots;
  }

  public async initialize(dataProvider: TreeViewWorkspaceSelectorDataProvider): Promise<void> {
    this._dataProvider = dataProvider;
  }

  public async reload(): Promise<void> {
    const workspaceRefs: TreeViewWorkspaceRef[] = [];
    for (const root of this.storageRoots) {
      const workspacePaths = await this._getDataProvider().getWorkspaces(root.path);
      for (const workspacePath of workspacePaths) {
        workspaceRefs.push({
          rootKey: root.key,
          workspacePath,
          workspaceName: basename(workspacePath),
        });
      }
    }
    this._workspaceRefs.value = this._sortWorkspaceRefs(workspaceRefs);
  }

  public setStorageRoots(storageRoots: readonly TreeViewStorageRoot[]): void {
    this._storageRoots = this._validateStorageRoots(storageRoots);
  }

  public installWorkspaceRefs(workspaceRefs: readonly TreeViewWorkspaceRef[]): void {
    this._workspaceRefs.value = this._sortWorkspaceRefs(workspaceRefs);
  }

  public findStorageRoot(workspacePath: string): TreeViewStorageRoot | null {
    const rootPath = dirname(workspacePath);
    return this.storageRoots.find((root) => root.path === rootPath) ?? null;
  }

  private _getDataProvider(): TreeViewWorkspaceSelectorDataProvider {
    const dataProvider = this._dataProvider;
    if (dataProvider === null) throw new Error("TreeView Workspace Selector DataProvider is not initialized");
    return dataProvider;
  }

  private _sortWorkspaceRefs(
    workspaceRefs: readonly TreeViewWorkspaceRef[],
  ): TreeViewWorkspaceRef[] {
    return [...workspaceRefs].sort((left, right) => {
      const rootOrder = this.storageRoots.findIndex((root) => root.key === left.rootKey)
        - this.storageRoots.findIndex((root) => root.key === right.rootKey);
      return rootOrder !== 0
        ? rootOrder
        : left.workspaceName.localeCompare(right.workspaceName, "en-US");
    });
  }

  private _validateStorageRoots(
    roots: readonly TreeViewStorageRoot[],
  ): readonly TreeViewStorageRoot[] {
    const keys = new Set<string>();
    const paths = new Set<string>();
    return roots.map((root) => {
      const key = root.key.trim();
      if (key.length === 0) throw new Error("TreeView storage root key is required");
      const normalizedKey = key.toLocaleLowerCase("en-US");
      if (keys.has(normalizedKey)) throw new Error("TreeView storage root keys must be unique");
      keys.add(normalizedKey);
      const storagePath = TreeViewPath.normalize(root.path, "TreeView storage root path");
      const normalizedPath = storagePath.toLocaleLowerCase("en-US");
      if (paths.has(normalizedPath)) throw new Error("TreeView storage root paths must be unique");
      paths.add(normalizedPath);
      return { key, path: storagePath };
    });
  }

  public readonly workspaceRefs: ComputedRef<readonly TreeViewWorkspaceRef[]>;

  private _dataProvider: TreeViewWorkspaceSelectorDataProvider | null = null;
  private _storageRoots: readonly TreeViewStorageRoot[];
  private readonly _workspaceRefs = shallowRef<readonly TreeViewWorkspaceRef[]>([]);
}