# Main Bridge

Registers main RPC objects and creates connection-scoped renderer event proxies.

## Structure

- `rpc_object_registry/` registers `gConfigManager`, `gThemeManager`, `gTaskManager`, `gUpdateService`, and the Window owned by the caller's bridge peer.
- Terminal registration uses `TerminalRuntimeServiceApi` and directly returns `gTerminalRuntimeService`, which implements that interface. Its `create()` returns `RpcPty` references; individual PTYs have no registered factory, and the Service has no peer binding or connection lifecycle state.
- `remote_rpc_objects/` contains TaskEvents and Window client proxy factories. Each Window holds its proxy Promises; Task broadcasts retain per-window error isolation, while Window close requests return control to the renderer's standard close flow.
- Task service behavior is documented in [`../services/tasks/AI_CONTEXT.md`](../services/tasks/AI_CONTEXT.md).

## Boundaries

- Main generates connection identity when WindowFactory creates the MessageChannel.
- WindowFactory owns peer setup and startup port transfer. WindowManager owns peer-to-Window lookup and disconnect cleanup.
- Renderer readiness is acknowledged through the Window RPC object after client-side proxies are created; it does not use a second raw IPC channel.
- RPC registerName strings equal their interface names.
- Config values cross the RPC boundary as JSON strings and are validated by the shared serializer selected by `config_key`.
- Theme listing exposes validated theme directories plus the bundled `dark` theme. Theme resolution accepts one validated folder name, reads only the fixed theme stylesheet files, and returns bundled `dark` when the configured folder does not exist.
- Validation failures return stable bridge errors without internal stack details.