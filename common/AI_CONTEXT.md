# Common

Shared TypeScript imported directly by renderer and main. This layer owns cross-process types, runtime validation, serialization, RPC contracts, and the MessagePort bridge.

## Modules

- [`validator.ts`](validator.ts) provides assertion-based runtime narrowing for untrusted values.
- [`serializer.ts`](serializer.ts) defines `ISerializer<T>` and serializer value inference.
- [`macroParser.ts`](macroParser.ts) owns the `mh{key}` syntax, extracts references and unique keys, and formats references. It trims whitespace inside braces; keys start with a letter or underscore and may contain non-empty dot- or dash-separated letter, number, and underscore segments. Its strict replacement resolves parameter dependencies and rejects invalid parameters, unknown references, and cycles.
- [`funnelTask.ts`](funnelTask.ts) schedules at most one callback per fixed delay window. Callers may cancel the pending callback or execute it immediately; later schedule requests do not extend an active window.
- [`config/`](config) owns shared configuration types. Main-window dimensions, the selected application theme, and the active top-level Page form one strict `global` config. Tools config stores the active Tool, favorites, and collapsed groups. Their serializers accept the immediately preceding schema without the active selection field and supply a migration value; Client resolves unavailable selections against its current registries and persists the result. Command config stores Terminal placement, its initial path, and storage Roots; the immediately preceding schema without the Terminal initial path receives the current default during strict read. Task Center config stores queue concurrency plus template storage Roots and accepts the immediately preceding max-parallel-only schema. Update config controls automatic startup checks and a `random` or `1–3600` second delay, defaulting to enabled with a random delay. The module also owns the config key-to-serializer registry and client-to-server Config RPC interface.
- [`command/`](command/AI_CONTEXT.md) owns Command folder and script item data, strict serializers, and the Command TreeView DataProvider RPC interface.
- [`tasks/`](tasks/AI_CONTEXT.md) owns task entities, task-specific definitions, model serializers, the client-to-server Tasks RPC interface, and the server-to-client TaskEvents RPC interface.
- [`treeView/`](treeView/AI_CONTEXT.md) owns generic TreeView models, strict base serializers, absolute storage-path validation, and DataProvider/DataNotifier RPC contracts.
- `terminal/` owns Terminal shell types and the bidirectional Terminal runtime RPC contracts.
- `theme/` owns safe theme-folder naming, the built-in default name, resolved theme data, and the client-to-server Theme RPC interface for listing and resolving themes.
- `update/` owns the four-state `UpdateState` enum and `UpdateServerRpcApi`. `CHECKED` means a completed check found no available update and allows another check. `startUpdate()` triggers the update without waiting for completion; `getState()` supplies the authoritative state for renderer polling.
- `window/` owns client-to-main window controls, including hide-to-tray, prepared-update restart, fixed application- and log-directory reveal, fixed release, issue, discussion, and Ko-fi page links, and validated external HTTPS link opening, plus the main-to-client close-request event contract. Restart accepts no executable path from the renderer.
- [`ipc_bridge/`](ipc_bridge/AI_CONTEXT.md) owns MessagePort and local named-pipe transport adapters, peers, and typed RPC routing.
- `uac/` owns only the Main-to-UAC-Broker lifecycle RPC interface.
- `fileOccupancy/` owns process details, query and termination results, the renderer-to-Main API, and the separate bidirectional Main-to-UAC-Broker capability API. Queries start immediately and deliver completion through client notifier interfaces, so long-running native inspection does not depend on Bridge RPC timeouts.
- `cli/` owns the length-prefixed binary request and response codec used between CLI Helper and the Main process named-pipe bridge. An `MHC3` request carries every inherited environment variable whose key starts with `MAGICHAT_CLI`, followed by the CLI arguments, as length-prefixed UTF-8 strings under a shared 64 KiB byte limit. Main injects the complete instance-specific pipe path through `MAGICHAT_CLI_PIPE`; each MagicHat PTY also receives its own `MAGICHAT_CLI_TERMINAL_ID`, while Command runners scope `MAGICHAT_CLI_COMMAND_PATH` to the executing logical Item. The native CLI does not derive or discover these values.

## Boundaries

- RPC API names use `Domain + Provider + RpcApi`; `Server` means client-to-server and `Client` means server-to-client.
- RPC interfaces contain method contracts only. Their runtime registerName equals the interface name and is encapsulated by bridge create/register boundaries.
- Business values are validated where untrusted remote-object arguments or results enter a process.
- Task entity serializers are consumed directly; only configuration serializers use dynamic key lookup.
- The public `Spectial` spelling is retained for compatibility.
