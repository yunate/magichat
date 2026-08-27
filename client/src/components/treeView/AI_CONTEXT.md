# TreeView Client

Reusable TreeView state and Vue UI driven by a main-provided `RemoteObject<TreeViewDataProvider>`.

## Structure

- `TreeView.ts` owns the loaded workspace snapshot, ID indexes, controller, and replaceable operations.
- `TreeView.vue` composes the workspace selector, Explorer, tabs, context menus, breadcrumb, content slot, and resizable sidebar. Folder and item menus can reveal their validated backing entries in the system Explorer through the DataProvider.
- `TreeView.vue` owns the create-workspace dialog because Electron does not provide browser `window.prompt()`.
- `TreeViewSaveDraftDialog.vue` owns draft naming and target-folder selection. `treeView.controller.saveDraft()` moves the item while it is still a Draft, then promotes it only after the target path succeeds, preserving its stable item ID.
- `TreeViewNode.vue` recursively renders folders and non-draft items.
- Explorer drag targets expose before, inside, and after feedback. The owner resolves each drop to a target parent and `targetOrder`, including same-folder order-only moves.
- Ctrl/Meta-click adds or removes Explorer folders and items from a transient multi-selection. A multi-selection context menu exposes only Clone and Delete. Dragging any selected node moves the normalized top-level selection together; selected descendants are omitted when an ancestor folder is also selected.
- `TreeViewTabs.vue` renders ID-backed tabs and tab interactions. Tab reordering previews the before/after insertion position with a primary-color edge indicator.
- `treeViewDataNotifierRpcObject.ts` forwards main-side storage notifications directly to `treeView.controller.emitStorageChanged()`.

## Boundaries

- Folder, item, and tab overlay slots are absolute layers above complete default content. They do not replace TreeView-owned structure or behavior.
- Explorer rows, tabs, context menus, workspace creation, and draft saving use the compact visual language established by the reference TreeView without sharing its implementation.
- `isTabMultiline` is a business-owned presentation flag. Single-line tabs scroll horizontally; multiline tabs wrap through three visible rows and then scroll vertically.
- `isFolderTabVisible` and `isItemTabVisible` independently filter tab kinds. When both are false, TreeView hides the entire right workspace and renders a full-width Explorer-only layout.
- An open Tab page mounts on first activation and then stays mounted in the shared persistent stack; closing the Tab or switching workspaces unmounts its page. Inactive pages remain measurable but cannot receive pointer, keyboard, or accessibility interaction. Persistent page keys include the workspace identity so equal entity IDs in different workspaces never reuse a page instance. `treeView.operations.switchTab` is the business override boundary for consumers that need additional cleanup or their own conditional page unloading when switching.
- TreeView and its Vue components never inspect business `data` and never run business serializers.
- UI interactions and business callers use `treeView.controller`; they do not mutate the snapshot directly.
- `treeView.operations` can wrap raw operations for confirmed business checks. Operations currently use a direct Promise queue with no generation or revision mechanism.
- TreeView UI never calls `BridgeRouter`; bridge factories create the DataProvider and initialize the temporary notifier creator.
- A business owner may enable `shouldCreateDefaultWorkspace` and provide `defaultWorkspaceName`. Initialization creates and selects that workspace only when storage has no workspaces; a nonempty storage without one selected workspace remains an error.
- Deleting the selected workspace chooses the first remaining workspace. When none remains and default creation is enabled, the configured default is recreated. The provider installs that final selection before emitting its change notification.