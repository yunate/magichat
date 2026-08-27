# Command Page

The Command feature combines a workspace-level TreeView with one persistent `CommandTabPage` component instance per open Tab.

## Structure

- `CommandPage.vue` owns TreeView provider initialization, dirty-draft leave guards, Tab status overlays, and active-Tab Ctrl+S routing.
- Initialization errors expose storage recovery actions: reveal the Command data directory, or explicitly confirm permanent deletion and recreate a clean default workspace.
- `CommandScriptIcon.vue` maps validated Command item script types to the compact labels shared by Explorer rows and item Tabs.
- `CommandTabPage.vue` owns one entity's editor draft, TextEdit or Terminal component, save state, errors, dialogs, and splitter state.
- `CommandSettingsPanel.vue` owns the page settings UI, while `commandSettings.ts` loads and saves the shared `command` config through Config RPC and exposes page-scoped reactive settings to all open Command Tabs.
- `commandTabPageTypes.ts` defines the narrow registration contract used by the workspace to coordinate open Tab pages.
- TreeView creates each `CommandTabPage` through its persistent `tabPage` slot on first activation. Switching keeps initialized pages mounted and measurable; closing the Tab unmounts only that page instance.

## State

- Each `CommandTabPage` owns one editor draft with an immutable saved baseline for dirty checks.
- Item titles are edited in the Command toolbar and committed as TreeView move operations on blur or Enter; Command business data remains title-free.
- Folder and item saves replace only their typed business `data` through TreeView update operations. Save failures keep the draft dirty and prevent the pending close or workspace switch.
- Saving an item Draft from the editor toolbar first persists its current business data, then opens the TreeView folder picker to publish it as a regular Command.
- The workspace-level Command page handles Ctrl+S and Meta+S at the window boundary and delegates saving to the active Tab page.
- Tab close and workspace switch operations are wrapped at the TreeView operations boundary. Dirty drafts are resolved first, then running helper invocations are stopped or the operation is cancelled. Tab close additionally permits an explicit Skip that excludes running Tabs from the current close operation. Closing a Tab disposes its Terminal runtime and PTY.
- Dirty tabs render a dot through the TreeView tab overlay slot. Running Command items replace their Explorer and Tab script icons with an event-driven indicator.

## Macro scopes

- Folder tabs edit named local parameter groups without a TextArea. Item tabs edit named local parameter groups and script content. The selected group is persisted with each entity and supplies its active local Macro scope.
- Parameter-group and interpreter selection use the shared PopupSelect rather than platform-native select popups.
- Each item page receives ancestor folder scopes from root to nearest parent for Macro resolution.
- Later ancestor scopes override earlier ancestors, and the active entity's local parameters have highest priority.

## Terminal

- Each persistent `CommandTabPage` directly owns its lazy Terminal component. Opening a Tab does not create a PTY. Run and Open create the selected shell only when no PTY is active. Restart remains available during a helper run; after confirmation it stops the pending run, destroys the active PTY, and creates a new one.
- Command settings are validated by `common/config/command.ts` and persisted as `data/config/command.json`. They place the Terminal on the left, right, top, or bottom of the editor, with right as the default. A selection changes the live layout only after persistence succeeds. The splitter follows the selected axis and supports pointer and keyboard resizing.
- Development builds expose a Terminal toolbar diagnostic that appends the current logical line to MessageStore with JSON escaping so whitespace and control characters remain observable.
- Every script type, including PowerShell, uses a main-generated helper file and a fixed interpreter invocation.
- Terminal state separately tracks whether the PTY process is active and whether the current helper invocation is awaiting its deterministic completion file. This helper running state is emitted to the workspace for indicators and leave guards. Before Run writes a helper invocation to an existing PTY, the page treats a current logical line matching `PS/CMD + drive path + >` as idle; otherwise it requires explicit confirmation to interrupt the current input or process, clear the shell, and continue.
- `CommandTabPage` owns Run, Clear, Open, Restart, script-type confirmation, and PTY lifecycle composition. Terminal failures are reported once through the application MessageBar instead of rendering error rows inside the editor or Terminal. Foreground commands are interrupted through Terminal input, including Ctrl+C; there is no separate Stop button. Changing to a different shell type while a PTY is active requires confirmation, then sends Ctrl+C, destroys the PTY, and recreates it. The reusable Terminal owns only xterm.js and the primitive RPC operations.
- Terminal lifecycle operations call the application-level `runWithOperationProgress()` API directly. Its controller owns operation exclusivity, and its host presents operations exceeding 300ms; faster operations complete without visual interruption. Helper execution remains interactive and uses the separate Command running state.
- The shared application-level `ConfirmDialog` host owns confirmation markup and focus behavior. The workspace and each Tab page await the typed `confirmDialog(options)` API without maintaining dialog visibility or resolver state.

## Current boundaries

- Command storage accepts only the current strict data schema and does not migrate empty legacy data. Invalid storage remains untouched until the user explicitly chooses the destructive recovery action.
