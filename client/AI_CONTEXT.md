# Client

Vue 3, Vite, and TypeScript Electron renderer. Electron loads the production build from `dist/` with `BrowserWindow.loadFile()`.

## Structure

- `src/windows/window.ts` defines the renderer-window MessagePort bridge and connection-scoped RPC proxy owner.
- `src/windows/main/main.ts` exports the process-level `gMainApplication`, which owns its `Window`, initializes the bridge, and then mounts the main-window Vue application.
- `src/windows/main/MainApp.vue` owns only the main-window shell, persistent page host, and application-level dialog and message hosts.
- `src/windows/main/components/MainTitleBar.vue` owns navigation, window controls, and the current-page settings trigger. `PageSettingsPopover.vue` covers the full page content area and hosts the optional settings component registered beside each page component.
- `src/windows/main/mainTheme.css` owns shared main-window design tokens and global base styles.
- `src/components/PersistentStack.vue` lazily mounts each keyed view on first activation, then keeps it measurable and mounted while excluding inactive views from interaction and accessibility.
- `src/components/ConfirmDialog.vue` is the single application-level confirmation-dialog host. Callers use the typed `confirmDialog(options)` Promise API instead of mounting dialog instances or maintaining resolver state.
- `src/components/OperationProgressDialog.vue` is the application-level blocking progress-dialog host mounted by `MainApp`. Callers wrap asynchronous work with `runWithOperationProgress()`; the host owns the 300ms delayed reveal, focus isolation and progress presentation.
- `src/components/SortButton.vue` provides a reusable descending, ascending, and inactive sort cycle for list filters.
- `src/components/PopupSelect.vue` is the shared application dropdown. Feature views use it instead of native selects or local listbox implementations.
- `src/windows/main/pages/` uses registries for top-level pages and tools. Views enter the shared persistent stack on first activation and then preserve local state, layout measurements, and scroll position.
- [`src/windows/main/pages/command/`](src/windows/main/pages/command/AI_CONTEXT.md) owns Command TreeView composition, editor drafts, Macro scope caching, persistence, and dirty-leave confirmation.
- [`src/windows/main/pages/taskCenter/`](src/windows/main/pages/taskCenter/AI_CONTEXT.md) owns the top-level Task Center page.
- [`src/messages/`](src/messages/AI_CONTEXT.md) owns browser-local notifications.
- [`src/components/treeView/`](src/components/treeView/AI_CONTEXT.md) owns the reusable TreeView state model, controller, operations, overlay slots, Explorer, tabs, and layout.
- [`src/components/textEdit/`](src/components/textEdit/AI_CONTEXT.md) owns the reusable Macro parameter and optional multiline text editor.
- [`src/components/terminal/`](src/components/terminal/AI_CONTEXT.md) owns the lazy xterm.js surface and its per-instance Terminal runtime proxy.
- [`src/bridge/`](src/bridge/AI_CONTEXT.md) owns the renderer connection and semantic RPC boundaries.

## Boundaries

- Vue features use cached domain `RemoteObject` proxies; only bridge factories call `BridgeRouter.createRemoteObj`.
- RPC interfaces and task models come from their owning domains under `common/`.
- User-controlled content is rendered as text or sanitized before HTML rendering.
- Global listeners are removed during close or unmount.
- Router history uses hashes because renderer navigation runs under the `file:` protocol.

## Validation

- `npm --prefix client run typecheck` runs `vue-tsc --noEmit`.
- `npm --prefix client run build` type-checks and builds `client/dist/`.
