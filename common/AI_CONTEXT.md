# Common

Shared TypeScript imported directly by renderer and main. This layer owns cross-process types, runtime validation, serialization, RPC contracts, and the MessagePort bridge.

## Modules

- [`validator.ts`](validator.ts) provides assertion-based runtime narrowing for untrusted values.
- [`serializer.ts`](serializer.ts) defines `ISerializer<T>` and serializer value inference.
- [`macroParser.ts`](macroParser.ts) extracts Macro references and unique keys. Its strict replacement resolves parameter dependencies and rejects invalid parameters, unknown references, and cycles.
- [`config/`](config) owns shared configuration types, the config key-to-serializer registry, and the client-to-server Config RPC interface.
- [`command/`](command/AI_CONTEXT.md) owns Command folder and script item data, strict serializers, and the Command TreeView DataProvider RPC interface.
- [`tasks/`](tasks/AI_CONTEXT.md) owns task entities, task-specific definitions, model serializers, the client-to-server Tasks RPC interface, and the server-to-client TaskEvents RPC interface.
- [`treeView/`](treeView/AI_CONTEXT.md) owns generic TreeView models, strict base serializers, logical path validation, and DataProvider/DataNotifier RPC contracts.
- `terminal/` owns Terminal shell types and the bidirectional Terminal runtime RPC contracts.
- `window/` owns the client-to-main window control RPC interface.
- [`ipc_bridge/`](ipc_bridge/AI_CONTEXT.md) owns MessagePort transport peers and typed RPC routing.

## Boundaries

- RPC API names use `Domain + Provider + RpcApi`; `Server` means client-to-server and `Client` means server-to-client.
- RPC interfaces contain method contracts only. Their runtime registerName equals the interface name and is encapsulated by bridge create/register boundaries.
- Business values are validated where untrusted remote-object arguments or results enter a process.
- Task entity serializers are consumed directly; only configuration serializers use dynamic key lookup.
- The public `Spectial` spelling is retained for compatibility.
