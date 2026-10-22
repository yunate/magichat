# Client Bridge

Owns the renderer MessagePort connection and semantic RPC boundaries for application domains.

## Structure

- `../windows/window.ts` defines `Window`, which receives a renderer window's startup port, initializes its peer and RPC dispatch, acknowledges readiness, and owns connection-scoped proxy promises. Each window application's process-level owner holds its own instance.
- `rpc_object_registry/` registers process-lifetime Client RPC objects; it does not own feature business implementations.
- `remote_rpc_objects/` contains Config, Theme, Tasks, Update, Window, TreeView, Command storage, and temporary per-Terminal server proxy factories. `commandStorage.ts` owns Command proxy creation and temporarily registers the page-owned Client object while Main creates its proxy. RPC interface return types are consumed directly.

## Boundaries

- RPC interfaces are colocated with their domains, including `common/config/`, `common/tasks/`, and `common/update/`.
- `Server` in an RPC API name means the object is implemented by server and called by client; `Client` means the reverse.
- Vue features obtain cached domain proxies from their window application's `Window` member instead of calling `BridgeRouter` directly.
- Config values cross the bridge as JSON strings. Feature modules provide the concrete `ISerializer<T>` used for local serialization and response validation.
- Inbound Task event methods trust their RPC interface parameters and emit through lifecycle-bound event-center subscriptions.
- Each Terminal initializes a temporary client notifier creator, then owns and explicitly destroys its server proxy on component unmount.
- A TreeView without a supplied DataProvider creates and owns the generic provider proxy and its notifier registration. Command storage reveal, root resolution, and deletion use a separate Command proxy.
- `Window` caches the connection's single Command storage proxy so the Command Page and settings share the same Main object. Command Page initialization registers one temporary `CommandClientRpcApi` creator and calls storage `init()`; Page disposal calls storage `dispose()` without destroying the Window-owned proxy.
- A document makes one connection attempt. Failure is surfaced to bootstrap without automatic retry or transport fallback.