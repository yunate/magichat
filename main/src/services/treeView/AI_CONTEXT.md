# TreeView Storage

`LocalTreeViewDataProvider` is the generic filesystem implementation registered directly as `TreeViewDataProvider`.

## Boundaries

- The RPC registry constructs it with a `BridgePeer`. The service stores no business root; callers pass an absolute path for each operation.
- `init()` creates and retains the renderer's DataNotifier remote proxy through the same peer.
- The DataNotifier connection remains owned by the provider, while current mutations do not emit `storageChanged()`.
- Every public DataProvider operation runs through one instance-local FIFO Promise queue. A rejected operation does not block later operations.
- Workspaces are directories. `__workspace__.mh` stores tabs, the temporary preview Tab ID, layout, and opaque consumer-owned `data`; every TreeView folder owns `__folder__.mh`, and items use `<name>.mh`. `.mh` content remains strict JSON. Workspace structural reads exclude `data`, and property updates preserve it.
- Workspace, Folder, and Item creation writes `data: null`; creation RPCs do not accept business JSON. A later entity-data update replaces that explicit uninitialized value.
- Workspace discovery skips Workspaces whose Workspace or root Folder metadata cannot be loaded and reports a warning containing the full affected path through the renderer DataNotifier. It also deletes readable root Draft item files whose IDs are no longer referenced by persisted Tabs; an unreadable Item is left untouched for normal tree loading to skip and report.
- Workspace rename accepts only a new name and derives the target beside the source directory, so the renderer cannot choose a different parent.
- Workspace, folder, item, and clone creation use `_runStagedCreate`: a stale stage is removed before creation, then all staged content is completed before one rename publishes the formal target. An existing formal target is never replaced.
- Workspace deletion only deletes the requested directory. The renderer selects or creates a replacement after the deletion succeeds.
- Tabs persist entity UUIDs, so rename and move do not rewrite tab identity. Workspace clone remaps every cloned entity and tab ID.
- The renderer may request a duplicate entity ID repair while indexing a loaded tree. The provider rewrites only that entity's ID and reports a storage warning through the notifier if persistence fails.
- Move requests include `targetOrder`. A same-path move updates only the parent `folderOrder` or `itemOrder`; a relocated entity is inserted at the requested position in its target parent.
- Folder and Item create, clone, move, and delete workflows maintain the owning Folder's order metadata. Move validates source and target order metadata before changing the source.
- Reading a folder reconciles `folderOrder` and `itemOrder` with its current children, removes missing entries, appends unordered children, and writes changed metadata. Draft items remain excluded from `itemOrder`.
- Reading Folder properties is a lightweight metadata operation and does not traverse descendants or reconcile externally changed children.
- Folder property updates preserve Server-owned order arrays after reconciling them with current children, so stale Client properties cannot overwrite structural ordering.
- Item updates keep the parent `itemOrder` synchronized with `isDraft`: Drafts are excluded, while regular items are present.
- Operations that require Workspace semantics discover the boundary from the absolute target path. Tree loading recognizes only child directories containing `__folder__.mh` and Item files ending in `.mh`. Missing markers, non-`.mh` files, links, and other unsupported entries are silently ignored so user resources can coexist with TreeView data. A recognized Folder or Item whose standard `.mh` metadata cannot be read or validated is skipped with a full-path warning through the renderer DataNotifier; the requested root Folder itself remains strict. Duplicate names within each child kind remain invalid, while a folder and an item may share the same name.
- Tree loads validate and return only TreeView-owned metadata. Workspace, Folder, and Item business data remains in the persisted record and is read or replaced as an unvalidated JSON string through the entity-data API.