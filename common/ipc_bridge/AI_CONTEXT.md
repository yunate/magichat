# IPC Bridge

Symmetric TypeScript bridge shared by Electron renderer and main. Either peer can send a request and await the response over a dedicated MessagePort.

## Layers

- [`peer.ts`](peer.ts) defines `BridgePeer` and the transport-neutral `BridgeSocket`. It correlates string request and response envelopes by message ID and does not know RPC methods.
- [`messagePortProtocol.ts`](messagePortProtocol.ts) defines the startup port-transfer event, transport envelopes, and boundary validators.
- [`messagePortPeer.ts`](messagePortPeer.ts) adapts DOM `MessagePort` and Electron `MessagePortMain` through structural capability detection.
- [`rpc.ts`](rpc.ts) adds typed routing and connection-scoped remote objects above `BridgePeer`.

## Contracts

- One `send` timeout budget covers both waiting for a connection and waiting for the response. The default is 30 seconds.
- Disconnecting rejects and clears all pending requests. Request timeouts remove only their matching pending entry.
- Main creates `connectId` and transfers a dedicated port after the renderer finishes loading.
- Transport accepts only string message payloads and explicit close envelopes. Invalid envelopes do not enter the RPC router.
- `registerRemoteObj(registerName, creator)` registers one object factory. `createRemoteObj<T>(peer, registerName, ...params)` forwards creation parameters to that factory and creates a recursive, method-only async proxy over nested object members.
- Ordinary results, including arrays, remain JSON values. A provider uses `BridgeRouter.returnRemoteObj(object)` when a returned object must remain callable; the caller receives an independently managed remote proxy.
- Remote object instances are isolated by receiving `BridgePeer` as the factory's first argument. They are released on disconnect, explicit destruction, or best-effort proxy finalization while connected.
- Reserved prototype method names are rejected. Business code trusts RPC interface argument and result types.
- `destroyRemoteObj` accepts a root or nested member proxy and returns whether destruction started. Root and nested member proxies share destruction state; a method-returned remote object has its own object ID and lifecycle.
- `BridgeRouter.getRouter()` is process-global. Handler registration and dispatch setup must not conflict within one process.
