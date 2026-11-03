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
- Ordinary results, including arrays, remain JSON values. A provider uses `BridgeRouter.returnRemoteObj(object)` when a returned object must remain callable; the caller receives an independently managed remote proxy.
- Top-level remote-object method arguments can also use `returnRemoteObj(localObject)`. The sender exports the local implementation for that peer; the receiver creates a reverse proxy without another factory registration. Both peers must enable dispatch for callbacks.
- Each method argument uses a validated `value` or `remoteObject` descriptor. Ordinary values retain JSON array semantics, including null for undefined, functions and symbols, and array-index keys for `toJSON`. Both ends must use this call format.
- Argument references have independent handles that the receiver can retain and explicitly destroy. Parent destruction does not revoke them or call business disposal. Only encoding or serialization failures before `peer.send` remove that attempt's exports; timeouts and business errors after sending do not prove non-delivery and do not revoke references.
- Only actual local implementation objects can be exported. Known root and member proxies cannot be marked or forwarded. Nested argument objects, direct function references, ordinary `send` arguments and factory creation parameters do not gain reference semantics. Callback contracts can use `LocalInterface | RemoteObject<LocalInterface>`; callable-shape guards must read methods rather than use `in` on proxies.
- Remote object instances are isolated by receiving `BridgePeer` as the factory's first argument. They are released on disconnect, explicit destruction, or best-effort proxy finalization while connected.
- Reserved prototype method names are rejected. Business code trusts RPC interface argument and result types.
- `destroyRemoteObj` accepts a root or nested member proxy and returns whether destruction started. Root and nested member proxies share destruction state; a method-returned remote object has its own object ID and lifecycle.
- `BridgeRouter.getRouter()` is process-global and registration names must be unique. Two peers in one process can share the router; bidirectional calls require dispatch on each peer.
