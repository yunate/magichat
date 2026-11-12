# Main Bridge

Registers the Electron host's platform/window RPC objects and connection-scoped control proxies.

## Structure

- `rpc_object_registry/` registers only the Window owned by the caller's Main peer and the Platform owner restricted to the Backend control peer.
- `remote_rpc_objects/backend.ts` creates Backend lifecycle, Config, and Theme proxies cached by `BackendProcess`. Config/Theme calls support actual window startup and bounds persistence; there is no business forwarding API.
- Window close requests use the cached Window Client proxy and the renderer's standard close flow.
- All business registrations, Task event proxies, and broadcasts belong to [`../backend/`](../backend/AI_CONTEXT.md).

## Boundaries

- Main generates connection identity when WindowFactory creates the MessageChannel.
- WindowFactory owns peer setup and startup port transfer. WindowManager owns peer-to-Window lookup and disconnect cleanup.
- Renderer readiness is acknowledged through the Window RPC object after client-side proxies are created; it does not use a second raw IPC channel.
- RPC registerName strings equal their interface names.
- Main's control peer is distinct from every Renderer peer. Renderer requests cannot obtain the Platform RPC object or Backend lifecycle owner.
- Validation failures return stable bridge errors without internal stack details.