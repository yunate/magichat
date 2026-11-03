# Client Bridge

Owns the renderer MessagePort connection and semantic RPC boundaries for application domains.

## Structure

- `../windows/window.ts` defines `Window`, which receives a renderer window's startup port, initializes its peer and RPC dispatch, acknowledges readiness, and owns connection-scoped proxy promises. Each window application's process-level owner holds its own instance.
- `rpc_object_registry/` registers process-lifetime Client RPC objects; it does not own feature business implementations.
- `remote_rpc_objects/` contains Config, Theme, Tasks, Update, Window, TreeView, Command storage, File Occupancy, and Terminal Service proxy factories. Terminal creation passes a local notifier by reference to Service `create()` and receives a `PtyApi` proxy over the same connection. TreeView and File Occupancy initialize their proxies with local notifiers marked by `BridgeRouter.returnRemoteObj()`. The Command Page marks its Client object at storage `init()`. RPC interface return types are consumed directly.

## Boundaries

- RPC interfaces are colocated with their domains, including `common/config/`, `common/tasks/`, and `common/update/`.
- `Server` in an RPC API name means the object is implemented by server and called by client; `Client` means the reverse.
- Vue features obtain cached domain proxies from their window application's `Window` member. Proxy creation and registration names remain in bridge factories; feature owners may mark callback references and release their owned temporary proxies through `BridgeRouter`.
- Config values cross the bridge as JSON strings. Feature modules provide the concrete `ISerializer<T>` used for local serialization and response validation.
- Inbound Task event methods trust their RPC interface parameters and emit through lifecycle-bound event-center subscriptions.
- `Window.getTerminalRuntimeService()` lazily caches the `TerminalRuntimeServiceApi` proxy obtained through `getTerminalRuntimeService(peer)` in `remote_rpc_objects/remoteServerRpcObjects.ts`. Terminal calls Service `create()` directly with its notifier marked by reference. Close, recreation, and unmount read the owned PTY's stable ID, call Service `destroy(terminalId)`, then explicitly destroy the PTY proxy. There are no separate PTY create/destroy bridge wrappers. Components never call PTY `kill()` directly or destroy the shared Service proxy.
- A TreeView without a supplied DataProvider creates and owns the generic provider proxy and passes its notifier by reference. Provider disposal explicitly releases that notifier. Command storage reveal, root resolution, and deletion use a separate Command proxy.
- `Window` caches the connection's single Command storage proxy so the Command Page and settings share the same Main object. Command Page initialization passes its `CommandClientRpcApi` object to storage `init()`; Page disposal calls storage `dispose()` to release the Client reference without destroying the Window-owned proxy.
- A document makes one connection attempt. Failure is surfaced to bootstrap without automatic retry or transport fallback.