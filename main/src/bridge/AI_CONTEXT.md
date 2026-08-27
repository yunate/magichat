# Main Bridge

Registers main RPC objects and creates connection-scoped renderer event proxies.

## Structure

- `rpc_object_registry/` registers `gConfigManager`, `gTaskManager`, and the Window owned by the caller's bridge peer.
- `remote_rpc_objects/` contains the TaskEvents client proxy factory and broadcaster. Each Window holds its proxy Promise; broadcasts retain per-window error isolation.
- Task service behavior is documented in [`../services/tasks/AI_CONTEXT.md`](../services/tasks/AI_CONTEXT.md).

## Boundaries

- Main generates connection identity when WindowFactory creates the MessageChannel.
- WindowFactory owns peer setup and startup port transfer. WindowManager owns peer-to-Window lookup and disconnect cleanup.
- Renderer readiness is acknowledged through the Window RPC object after client-side proxies are created; it does not use a second raw IPC channel.
- RPC registerName strings equal their interface names.
- Config values cross the RPC boundary as JSON strings and are validated by the shared serializer selected by `config_key`.
- Validation failures return stable bridge errors without internal stack details.