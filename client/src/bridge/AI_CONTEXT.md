# Client Bridge

Owns the renderer MessagePort connection and semantic RPC boundaries for configuration and tasks.

## Structure

- `../windows/window.ts` defines `Window`, which receives a renderer window's startup port, initializes its peer and RPC dispatch, acknowledges readiness, and owns connection-scoped proxy promises. Each window application's process-level owner holds its own instance.
- `rpc_object_registry/` registers the Task Center-owned `TaskEventsClientRpcObject` for server-to-client calls; it does not own the business implementation.
- `remote_rpc_objects/` contains Config, Tasks, Window, and temporary per-Terminal server proxy factories. RPC interface return types are consumed directly.

## Boundaries

- RPC interfaces are colocated with their domains under `common/config/` and `common/tasks/`.
- `Server` in an RPC API name means the object is implemented by server and called by client; `Client` means the reverse.
- Vue features obtain cached domain proxies from their window application's `Window` member instead of calling `BridgeRouter` directly.
- Config values cross the bridge as JSON strings. Feature modules provide the concrete `ISerializer<T>` used for local serialization and response validation.
- Inbound Task event methods trust their RPC interface parameters and emit through lifecycle-bound event-center subscriptions.
- Each Terminal initializes a temporary client notifier creator, then owns and explicitly destroys its server proxy on component unmount.
- A document makes one connection attempt. Failure is surfaced to bootstrap without automatic retry or transport fallback.