# Backend Process

Independent Electron UtilityProcess and authoritative owner of application backend services. Main hosts Electron platform capabilities, not business services.

## Structure

- `index.ts` accepts transferred ports only through `process.parentPort` and validates the existing bridge bootstrap envelope plus its Main-provided `source`.
- `backend.ts` owns the Main control peer and the independent Renderer peers. Connections reuse the shared MessagePort adapter and RPC router.
- `backend.ts` initializes validated process-local paths, logging, and the Main platform proxy before dynamically importing `application.ts`. Eager configuration and Task module initialization must not run before paths are initialized.
- `application.ts` owns business registration, CLI startup, Terminal prewarming/config reactions, queued Tasks, and ordered business shutdown.
- [`services/`](services/AI_CONTEXT.md) owns Command, CLI, File Occupancy, language services, Tasks, Terminal/PTY, Theme, TreeView, UAC Broker connection management, and updates.
- `infra/` owns the stateful Config service. Generic JSON, MH file, log, path and error helpers are shared under `../infra/` and `../utils/`, rather than duplicated or owned by Backend.
- `rendererSessions.ts` owns Backend Renderer sessions and their Task event proxies. Task broadcasts never traverse Main or `WindowManager`.
- `bridge/rpc_object_registry/` separates bootstrap registration from business registration loaded after path initialization. `platform.ts` owns the cached Main platform proxy.
- Main's `../backendProcess.ts` owns `utilityProcess.fork()`, identity checks, the control proxy, Renderer port creation, and normal shutdown.

## Boundaries

- Main connects first, verifies Backend's PID, and awaits complete Backend initialization before creating application windows.
- Each Renderer receives a direct Backend port alongside its existing Main port. Main does not forward Backend RPC messages.
- `BackendServerRpcApi` exposes only the PID handshake. Its implementation is a restricted object, not the complete Backend owner.
- `BackendLifecycleServerRpcApi` is available only through Main's control peer. It initializes Backend, supplies the prepared update executable for Main's relaunch, and shuts down the process. Normal shutdown stops prewarming and CLI, destroys Terminal/Task/Broker resources, clears Terminal temporary files, disposes TreeView, closes Renderer peers, drains logs, and exits. Calls still awaiting replies can reject on disconnect; completed work is not replayed.
- TreeView storage is a process singleton with one active notifier. Different RPC handles reference the same object. Repeated `init()` rejects until the active client has explicitly disposed; Command recreations dispose the old TreeView before initializing the new one. Multiple Renderer connections remain supported, but simultaneous active default TreeViews are not.
- All Renderer business proxies use Backend. Only Window/platform interactions use Main. Command owns root authorization and executes `deleteStorage()` locally; there is no intermediate TreeView storage RPC or `_storage` forwarding proxy.
- Main's Config/Theme proxies serve actual window startup and bounds persistence. `ConfigManager.setMainWindowBounds()` reads and writes the authoritative global config synchronously in Backend, preserving concurrently changed page/theme fields.
- Electron `shell` calls stay in Main. The Platform RPC permits absolute-path reveals and shortcut icon updates only, and rejects Renderer peers. Domain validation and per-shortcut error handling remain in Backend.
- Main supplies authoritative application, profile, desktop, AppData and executable paths. Update version cleanup uses that executable path, not UtilityProcess's executable identity. Broker connections use the existing named-pipe bridge and monitor the owning Backend PID.
- Paths, logging and generic file infrastructure reuse the shared code under `../infra/`; stateless path/error tools live under `../utils/`. Business code invokes these helpers in Backend, so Main does not perform business I/O merely because it shares their source directory. The pure `TaskQueue` is shared under `common/`. Backend logs use `mh-backend-...`; each process cleans only its own log family.
- There is no automatic process restart, RPC retry, or alternate transport.
- The bundle is built to `dist-electron/backend/index.js`; packaging installs it outside ASAR under `resources/backend/index.js`, with its physical `node-pty` dependency under `resources/backend/node_modules/`. Broker keeps its own physical native dependency.

## Validation

- `npm run typecheck` checks the shared contract and both endpoints.
- `npm run build:electron` builds the Backend entry with Main, preload, and UAC Broker.
- `npm --prefix client run build` validates the Renderer startup integration.