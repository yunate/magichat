# TreeView Storage

`LocalTreeViewDataProvider` is the generic filesystem implementation behind business-specific TreeView remote objects.

## Boundaries

- Business owners construct it with a `BridgePeer`, storage root, folder data serializer, and item data serializer.
- `init()` creates and retains the renderer's DataNotifier remote proxy through the same peer.
- Successful mutations notify the associated renderer through `storageChanged()`.
- Every public DataProvider operation runs through one instance-local FIFO Promise queue. A rejected operation does not block later operations.
- Workspaces are directories. `__workspace__.json` stores tabs and layout, every folder owns `__folder__.json`, and items use `<name>.json`.
- Workspace, folder, item, and clone creation use `_runStagedCreate`: all staged content is completed before one rename publishes the formal target.
- Workspace deletion accepts the caller-selected replacement. The same queued operation selects an existing replacement or staged-creates it before notifying the renderer, so observers never receive a nonempty workspace list without one selected workspace.
- Tabs persist entity UUIDs, so rename and move do not rewrite tab identity. Workspace clone remaps every cloned entity and tab ID.
- Move requests include `targetOrder`. A same-path move updates only the parent `folderOrder` or `itemOrder`; a relocated entity is inserted at the requested position in its target parent.
- Item updates keep the parent `itemOrder` synchronized with `isDraft`: Drafts are excluded, while regular items are present. Re-saving also repairs a missing regular-item order entry.
- All logical paths are resolved beneath the injected storage root. Links, invalid entry kinds, duplicate names, and realpath escapes are rejected.
- Folder and item business data is validated only through the serializers injected by the business owner.