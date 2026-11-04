# IPC Bridge

Symmetric TypeScript bridge shared by Electron renderer, main, and local Node child processes. Either peer can send a request and await the response over a supported transport.

## Layers

- [`peer.ts`](peer.ts) defines `BridgePeer` and the transport-neutral `BridgeSocket`. It correlates string request and response envelopes by message ID and does not know RPC methods.
- [`messagePortProtocol.ts`](messagePortProtocol.ts) defines the startup port-transfer event, transport envelopes, and boundary validators.
- [`messagePortPeer.ts`](messagePortPeer.ts) adapts DOM `MessagePort` and Electron `MessagePortMain` through structural capability detection.
- [`pipeBridgeSocket.ts`](pipeBridgeSocket.ts) adapts a connected Node socket with bounded length-prefixed UTF-8 string messages for local named-pipe RPC.
- [`rpc.ts`](rpc.ts) adds typed routing and connection-scoped remote objects above `BridgePeer`.

## Contracts

- One `send` timeout budget covers both waiting for a connection and waiting for the response. The default is 30 seconds.
- Disconnecting rejects and clears all pending requests. Request timeouts remove only their matching pending entry.
- `onConnect` and `onDisconnect` return idempotent unsubscribe functions scoped to each registration, including repeated registration of the same callback. Registration does not immediately notify the current state and unsubscription does not affect wait listeners.
- Main creates `connectId` and transfers a dedicated port after the renderer finishes loading.
- Transport accepts only string message payloads and explicit close envelopes. Invalid envelopes do not enter the RPC router.
- `registerRemoteObj(registerName, creator)` registers one object factory. `createRemoteObj<T>(peer, registerName, ...params)` forwards creation parameters to that factory and creates a recursive, method-only async proxy over nested object members.
- Ordinary results, including arrays, remain JSON values. A provider uses `BridgeRouter.returnRemoteObj(object)` when a local returned object must remain callable; the caller receives an independently managed remote proxy. Known remote proxies returned by a method are forwarded automatically through a new receiving-connection handle.
- Top-level remote-object method arguments can also use `returnRemoteObj(localObject)`. The sender exports the local implementation for that peer; the receiver creates a reverse proxy without another factory registration. Both peers must enable dispatch for callbacks.
- Each method argument uses a validated `value` or `remoteObject` descriptor. Ordinary values retain JSON array semantics, including null for undefined, functions and symbols, and array-index keys for `toJSON`. Both ends must use this call format.
- Argument references have independent handles that the receiver can retain and explicitly destroy. Parent destruction does not revoke them or call business disposal. Only encoding or serialization failures before `peer.send` remove that attempt's exports; timeouts and business errors after sending do not prove non-delivery and do not revoke references.
- Local objects marked with `returnRemoteObj()` and known root/member proxies can be passed as top-level arguments or returned by methods. A forwarded proxy receives a new handle for the current connection; its calls, callback arguments and returned remote objects continue through the upstream proxy. `returnRemoteObj(proxy)` preserves the proxy without trying to attach a marker to its target. Nested argument objects, direct local function references, ordinary `send` arguments and factory creation parameters do not gain reference semantics. Callable-shape guards must read methods rather than use `in` on proxies.
- Remote object instances are isolated by receiving `BridgePeer` as the factory's first argument. They are released on disconnect, explicit destruction, or best-effort proxy finalization while connected.
- Method-path lookup uses `Reflect.get()`, supporting proxy traps, getters and ordinary inherited properties. Getters can execute during lookup; this is not descriptor-only access. Every path segment still rejects `constructor`, `__proto__` and `prototype`. Nested forwarding can traverse callable member proxies. Business code trusts RPC interface argument and result types.
- `destroyRemoteObj` accepts a root or nested member proxy and returns whether destruction started. Root and nested member proxies share destruction state; a method-returned remote object has its own object ID and lifecycle.
- Destroying or disconnecting a forwarding hop removes that hop's exported handles, not an explicit upstream destroy or business disposal call. The upstream proxy retains its ordinary reference/finalization lifecycle. Business owners remain responsible for operations such as PTY `kill()` and runtime `destroy()`.
- `BridgeRouter.getRouter()` is process-global and registration names must be unique. Two peers in one process can share the router; bidirectional calls require dispatch on each peer.
