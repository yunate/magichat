# Main

Lightweight Electron host. Application backend services run in the independent UtilityProcess under `src/backend/`; Renderer business traffic does not traverse Main.

## Structure

- `src/index.ts` first initializes authoritative application paths, registers Window/Platform RPC, starts Backend, then creates windows and the tray. It imports no business services.
- `src/index.ts` starts the process-wide logger before business services, records the complete authoritative `VERSION` in the first application-started entry, and drains its write queue after shutdown cleanup. Existing `console` output is mirrored into the application log through the logger bridge.
- `src/index.ts` owns the process-wide system tray. Its Open command restores the primary Window, while its Close command asks the renderer to run the standard Page close flow.
- `src/index.ts` disables Chromium renderer backgrounding, timer throttling, and Windows occluded-window backgrounding before Electron becomes ready, keeping an idle or covered MagicHat responsive without preventing normal system sleep.
- `src/index.ts` also owns process-instance coordination. Its path initializer selects the dedicated `magichat-development` Electron profile for development; packaged launches retain the packaged profile, so each mode is single-instance while one development and one packaged process can coexist. A duplicate launch restores, raises, and focuses the existing window in its own mode.
- `src/window/` owns BrowserWindow construction, maximization, per-window Main peers, Window RPC and active window registration. WindowFactory reads Config and Theme over the Backend control peer before creating a window. Bounds persistence calls Config's atomic `setMainWindowBounds()` method after the existing 250ms debounce.
- [`src/backend/`](src/backend/AI_CONTEXT.md) owns all backend business services. `src/backendProcess.ts` owns `utilityProcess.fork()`, identity checks, control proxies and Renderer port transfer. Config/Theme proxies support native window startup, and the lifecycle proxy supplies the prepared update executable for relaunch.
- `src/platform/platformRpcObject.ts` owns Electron resource reveals and shortcut icon writes requested by Backend. Only the Backend control peer can create this object; it accepts absolute paths, not arbitrary commands.
- `WindowFactory.createWindow()` resolves after the renderer acknowledges bridge initialization through `WindowServerRpcApi.rendererReady()`.
- `src/preload/index.ts` forwards the two startup MessagePorts, ordered Main then Backend, from Electron's isolated world to the renderer and exposes Electron's `webUtils.getPathForFile()` as the narrow `electronFileSystem.getPathForFile(File)` adapter used by Terminal file drops. It does not send file paths through IPC.
- [`src/bridge/`](src/bridge/AI_CONTEXT.md) owns bridge connections, RPC handlers, and server pushes.
- [`src/infra/`](src/infra/AI_CONTEXT.md) and `src/utils/` contain shared Node infrastructure, file serializers, logs, path checks and error helpers used by Main, Backend and Broker. Stateful Config and domain services belong to Backend; the pure TaskQueue lives in `common/`.
- `src/uacBroker/` owns the pure Node broker entry and separately registered lifecycle and File Occupancy RPC objects bundled outside ASAR. It adapts the single named-pipe connection through `PipeBridgeSocket`, directly invokes the fixed `native-tools/ddwhouses/bin/ddwhouses.exe` with the inspected path, and parses its complete process records. Before terminating a process tree with the fixed Windows `taskkill.exe /T /F` command, it queries the original occupied target again and validates PID, start time, and executable path. The broker exits after remote shutdown, disconnect, or Main process exit.
- [`src/backend/services/`](src/backend/services/AI_CONTEXT.md) owns CLI, Command, Tasks, Terminal, updates, Theme, File Occupancy and Broker connection management. Main provides no temporary storage forwarding interfaces.
- Shutdown destroys the tray, hides windows, awaits Backend's ordered business shutdown, closes Main window peers, and drains Main's log queue.

## Boundaries

- Renderer uses its Main peer for Window RPC and its Backend peer for every business domain. Main's Backend control peer is separate and cannot be obtained by a Renderer.
- Window controls use the `common/window/` RPC contract and target the Window bound to the caller's bridge peer. Restart obtains the prepared executable from `UpdateService`, schedules Electron relaunch without inherited command-line arguments, then uses normal application shutdown. The same owner exposes and opens only its authoritative application and log directories plus fixed GitHub release, issue, discussion, and Ko-fi pages. Task presentation links may additionally request an external URL; Main accepts only bounded HTTPS URLs without embedded credentials before delegating to the system browser.
- Backend owns the CLI named pipe scoped by the same authoritative `userData` identity. Backend injects Terminal/Task CLI routing context; these environment values are not security tokens.
- Native BrowserWindow close requests and the renderer title-bar close button hide the Window to the system tray. The tray Close command asks the renderer to restore and focus the Window, then run its standard Page callback flow. About's Restart action shares that callback flow; after acceptance, the renderer calls the server close or restart RPC and main performs shutdown cleanup.
- Request identity comes from the bridge peer, not request payloads.
- `ApplicationPaths` provides application-wide roots. Config and Task owners derive and validate their business paths locally.

## Validation

- `npm --prefix main run typecheck` runs `tsc --noEmit -p tsconfig.json`.
- Runtime startup uses bundled CommonJS output under `dist-electron/`; type checking remains a separate required step.
- Backend reads unpackaged themes from `client/src/windows/main/themes/`. Packaged config and external themes use Electron user data, with themes under `data/themes/`; the installer replaces packaged non-default theme files during reinstall or upgrade.
