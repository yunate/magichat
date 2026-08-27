# Task Center

Top-level page for creating and managing script tasks through shared task and config contracts.

## Structure

- `TaskCenterPage.vue` owns task state, RPC orchestration, configuration, templates, and log caches.
- `components/` contains task creation, lists, rows, template navigation, script details, and full-log views.
- `taskCenter.ts` exposes typed event centers for task updates, appended logs, and deletions.
- `taskEventsClientRpcObject.ts` implements the client-provided Task event RPC object and forwards calls to those event centers.

## Boundaries

- Components call cached Config and Tasks server proxies and never call `BridgeRouter` directly.
- Task details use the optional `TaskInfo.tasksSpectialInfo` payload. Template forms use the optional `TaskTemplate.template` payload.
- Expanded script task details display variables and script content through readonly TextEdit while retaining selectable text and Macro presentation. Its parameter panel starts collapsed.
- Active and Complete task rows display their actual script interpreter. Each list can sort by update time or script type through the shared three-state SortButton; activating one sort replaces the other, and the inactive state preserves the category's default order.
- Task Center configuration uses `TASK_CENTER_CONFIG_KEY` and `taskCenterConfigSerializer` for both serialization and runtime validation.
- User-provided script and log content is rendered through text interpolation only.
- The first applied event that moves a task into `succeeded`, `failed`, or `abandoned` shows one page popup and appends a severity-matched MessageStore entry. Initial snapshots and stale or duplicate updates do not notify.
- Completed events received outside the Complete panel add their task IDs to its red unviewed-count badge and apply the row's hover-style highlight. Clicking a highlighted task marks it viewed; Mark all viewed clears every highlight and the badge. Checkbox selection remains independent and persists between Active and Complete; deleted task IDs are pruned from both states.

## State consistency

- `TaskEventsClientRpcApi.taskUpdated` is authoritative for status and pin changes. Newer `updatedAt` values win, with status progression breaking exact timestamp ties.
- The initial task snapshot merges with pushes received during loading. IDs deleted during initialization are tracked so stale snapshots cannot revive them.
- Task rows display `createdAt`, which remains stable when resumable tasks restart. Active tasks sort pinned rows by `pinnedAt`, while unpinned rows retain creation order. Complete tasks keep pinned rows first and sort each pin group by `createdAt` descending; Sort by time also uses `createdAt`.
- Task-list sort buttons maintain independent three-state directions. Multiple sorts can be active together and are applied from left to right, with Time taking precedence over Script type.
- Inline logs retain the latest 200 lines. Full logs are fetched fresh whenever the dialog opens.
- Active and Complete panels remain mounted with `v-show`, preserving local state and scroll position.
- Each task row exposes a visible Run new button. Double-clicking the task header remains a shortcut, while interactions on header controls do not trigger it.
- Empty max-parallel input persists as `0`, meaning unlimited. Invalid numeric values are rejected before the config RPC.
- Script task forms use TextEdit with one non-switchable parameter group. Macro keys parsed by the shared `MacroParser` are synchronized above manual parameters; generated stale rows are removed as script macros change, while matching manual rows are retained. Shared task serializers validate variable key and value types while rejecting unknown variable references and cycles. `replaceMacrosInText` internally parses parameter value dependencies before replacing text, and text replacement remains single-pass while preserving unknown or invalid candidates.
- Script task creation, Run new, and saved templates preserve variable values through the shared `variables` leaf.
- The task form remains open when its backdrop is clicked; users close it through Close, Cancel, or Escape. Successful template updates and clones keep the form open and show an in-form popup confirmation.
- Saved-template forms expose Clone, which persists the current form values as a new template using the first available `name copy`, `name copy 2`, and subsequent suffix.
- Template deletion uses the application-level typed ConfirmDialog instead of the browser-native confirmation prompt.