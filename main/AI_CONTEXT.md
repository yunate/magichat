# Main

Electron main process and TypeScript local backend. Renderer files are loaded directly and RPC uses per-renderer MessageChannels without HTTP or listening ports.

## Structure

- `src/index.ts` registers process-global RPC objects, creates windows, and coordinates shutdown.
- `src/index.ts` also owns process-instance coordination. Development launches use a dedicated `magichat-development` Electron profile and packaged launches retain the packaged profile, so each mode is single-instance while one development and one packaged process can coexist. A duplicate launch restores, raises, and focuses the existing window in its own mode.
- `src/window/` owns BrowserWindow construction, per-window bridge peers, RPC behavior, and active window registration.
- `WindowFactory.createWindow()` resolves after the renderer acknowledges bridge initialization through `WindowServerRpcApi.rendererReady()`.
- `src/preload/index.ts` forwards the startup MessagePort from Electron's isolated world to the renderer.
- [`src/bridge/`](src/bridge/AI_CONTEXT.md) owns bridge connections, RPC handlers, and server pushes.
- [`src/infra/`](src/infra/AI_CONTEXT.md) owns paths and local persistence primitives.
- [`src/services/`](src/services/AI_CONTEXT.md) owns process-level business behavior, including task execution and the per-instance [`Terminal runtime`](src/services/terminal/AI_CONTEXT.md).
- Shutdown first hides windows, disposes Terminal and Task processes, removes the Terminal helper directory, and then closes window bridge connections.

## Boundaries

- Renderer and main communicate through domain-owned RPC interfaces under `common/config/`, `common/tasks/`, and `common/terminal/`.
- Window controls use the `common/window/` RPC contract and target the Window bound to the caller's bridge peer.
- Request identity comes from the bridge peer, not request payloads.
- `ApplicationPaths` provides application-wide roots. Config and Task owners derive and validate their business paths locally.

## Validation

- `npm --prefix main run typecheck` runs `tsc --noEmit -p tsconfig.json`.
- Runtime startup uses bundled CommonJS output under `dist-electron/`; type checking remains a separate required step.
- Development data uses the repository `data/` directory. Packaged data uses `data/` beside the application executable.
