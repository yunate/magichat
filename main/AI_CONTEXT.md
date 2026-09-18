# Main

Electron main process and TypeScript local backend. Renderer files are loaded directly and RPC uses per-renderer MessageChannels without HTTP or listening ports.

## Structure

- `src/index.ts` registers process-global RPC objects, creates windows, and coordinates shutdown.
- `src/index.ts` starts the process-wide logger before business services, records the complete authoritative `VERSION` in the first application-started entry, and drains its write queue after shutdown cleanup. Existing `console` output is mirrored into the application log through the logger bridge.
- `src/index.ts` owns the process-wide system tray. Its Open command restores the primary Window, while its Close command asks the renderer to run the standard Page close flow.
- `src/index.ts` disables Chromium renderer backgrounding, timer throttling, and Windows occluded-window backgrounding before Electron becomes ready, keeping an idle or covered MagicHat responsive without preventing normal system sleep.
- `src/index.ts` also owns process-instance coordination. Development launches use a dedicated `magichat-development` Electron profile and packaged launches retain the packaged profile, so each mode is single-instance while one development and one packaged process can coexist. A duplicate launch restores, raises, and focuses the existing window in its own mode.
- `src/window/` owns BrowserWindow construction, persisted restore bounds and configured-theme startup background read from the shared `global` config, startup maximization, per-window bridge peers, RPC behavior, and active window registration.
- `WindowFactory.createWindow()` resolves after the renderer acknowledges bridge initialization through `WindowServerRpcApi.rendererReady()`.
- `src/preload/index.ts` forwards the startup MessagePort from Electron's isolated world to the renderer and exposes Electron's `webUtils.getPathForFile()` as the narrow `electronFileSystem.getPathForFile(File)` adapter used by Terminal file drops. It does not send file paths through IPC.
- [`src/bridge/`](src/bridge/AI_CONTEXT.md) owns bridge connections, RPC handlers, and server pushes.
- [`src/infra/`](src/infra/AI_CONTEXT.md) owns paths and local persistence primitives.
- `src/services/uacBroker/` owns only the lazy process-level UAC Broker connection, broker identity verification, lifecycle remote object, and shutdown coordination. It uses the native JavaScript launcher to elevate the current Electron or packaged MagicHat executable in `ELECTRON_RUN_AS_NODE` mode and exposes the active Bridge peer to Main-side capability services.
- `src/services/fileOccupancy/` owns the File Occupancy capability proxy, pending operations, Broker notifier validation, and each renderer connection's RPC object. The first query obtains a Broker connection and returns immediately; completion is delivered later to the originating renderer. Process termination only uses an existing Broker and never starts elevation by itself.
- `src/uacBroker/` owns the pure Node broker entry and separately registered lifecycle and File Occupancy RPC objects bundled outside ASAR. It adapts the single named-pipe connection through `PipeBridgeSocket`, directly invokes the fixed `native-tools/ddwhouses/bin/ddwhouses.exe` with the inspected path, and parses its complete process records. Before terminating a process tree with the fixed Windows `taskkill.exe /T /F` command, it queries the original occupied target again and validates PID, start time, and executable path. The broker exits after remote shutdown, disconnect, or Main process exit.
- [`src/services/`](src/services/AI_CONTEXT.md) owns process-level business behavior, including task execution and the per-instance [`Terminal runtime`](src/services/terminal/AI_CONTEXT.md).
- `src/services/cli/` separates the external named-pipe bridge from CLI command handling. The native Windows CLI executable under `native-tools/cli-helper/bin/` forwards UTF-8 arguments without interpreting commands and is compiled with MSVC before packaging. MagicHat environments prepend `cmd/` to `PATH`, import the module under `powershell/`, preload the CommonJS helper under `node/`, and prepend `python/` to `PYTHONPATH`. These helpers synchronously invoke prepared Command runs, update Command environment, or report a running Task's display state.
- Shutdown closes the CLI named pipe, hides windows, disposes Terminal and Task processes, removes the Terminal helper directory, closes window bridge connections, and then drains the application log queue.

## Boundaries

- Renderer and main communicate through domain-owned RPC interfaces under `common/config/`, `common/theme/`, `common/tasks/`, and `common/terminal/`.
- Window controls use the `common/window/` RPC contract and target the Window bound to the caller's bridge peer. The same owner exposes and opens only its authoritative application and log directories plus fixed GitHub release, issue, discussion, and Ko-fi pages. Task presentation links may additionally request an external URL; Main accepts only bounded HTTPS URLs without embedded credentials before delegating to the system browser.
- CLI Helper communication uses a local named pipe scoped by the same `userData` identity that separates development and packaged single instances. Main injects the resolved pipe path directly into spawned Terminal and Task environments through `MAGICHAT_CLI_PIPE`.
- Main injects `MAGICHAT_CLI_PAGE=command` into Command Terminals and `MAGICHAT_CLI_PAGE=task-center` plus the current `MAGICHAT_CLI_TASK_ID` into Task scripts. Page and Task values are routing context, not a security token.
- Native BrowserWindow close requests and the renderer title-bar close button hide the Window to the system tray. Only the tray Close command asks the renderer to restore and focus the Window, then run its standard Page callback flow; after acceptance, the renderer calls the server close RPC and main performs shutdown cleanup.
- Request identity comes from the bridge peer, not request payloads.
- `ApplicationPaths` provides application-wide roots. Config and Task owners derive and validate their business paths locally.

## Validation

- `npm --prefix main run typecheck` runs `tsc --noEmit -p tsconfig.json`.
- Runtime startup uses bundled CommonJS output under `dist-electron/`; type checking remains a separate required step.
- Unpackaged Main reads themes directly from `client/src/windows/main/themes/`. Packaged config and external themes use Electron user data, with themes under `data/themes/`; the installer replaces packaged non-default theme files during reinstall or upgrade.
