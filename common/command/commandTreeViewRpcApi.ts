import type { TreeViewDataProvider } from "../treeView";

export interface CommandTreeViewDataProvider extends TreeViewDataProvider {
    revealStorage(): void;
    deleteStorage(): void;
}