---
name: ipc-bridge-only
description: "Enforce the project's IPC bridge-only boundary. Use when adding, modifying, reviewing, or debugging Electron ipcMain, ipcRenderer, preload, contextBridge, webContents messaging, MessagePort communication, window controls, or any client-to-main/main-to-client API. Forbids new raw IPC channels and requires domain RPC interfaces under common/."
user-invocable: true
---

# IPC Bridge Only

All new renderer-to-main and main-to-renderer capabilities must use the existing object RPC bridge built on `BridgeRouter`, `BridgePeer`, and the per-renderer `MessagePort`.

## Hard Rule

- Do not add new raw `ipcMain.on`, `ipcMain.handle`, `ipcRenderer.send`, `ipcRenderer.invoke`, `ipcRenderer.on`, `webContents.send`, or channel-specific `webContents.postMessage` business APIs.
- Do not expose new business functions from preload through `contextBridge` as an alternative IPC layer.
- Do not add channel constants, request/result envelopes, or handler registries for business behavior outside the existing bridge.
- Do not bypass the bridge for convenience, including one-method window controls or fire-and-forget commands.

## Allowed Transport Boundary

The existing bridge bootstrap channels in `common/ipc_bridge/messagePortProtocol.ts` are the only raw Electron IPC exception:

- `BRIDGE_CONNECT_REQUEST` requests a bridge connection.
- `BRIDGE_CONNECT_ACCEPT` transfers the accepted `MessagePort`.

These channels may be maintained as transport infrastructure, but must not carry new business methods or be generalized into additional channels. `window.postMessage` may remain only where required to transfer the accepted `MessagePort` from preload's isolated world to the renderer main world.

## Required Workflow

1. Define or update a domain-owned RPC interface under `common/<domain>/`.
2. Name APIs as `DomainServerRpcApi` for main-provided objects called by client, or `DomainClientRpcApi` for client-provided objects called by main.
3. Implement the interface in the domain owner. Add a narrowly scoped `*RpcObject` only when the existing owner cannot directly implement it.
4. Register the provider in `bridge/rpc_object_registry/registerRpcObjects.ts`. The register name must exactly equal the interface name.
5. Create the caller proxy in `bridge/remote_rpc_objects/` and cache connection-scoped proxies.
6. Call the semantic remote object from pages or services. Do not call `BridgeRouter` directly outside bridge factories and registries.
7. Bind identity and ownership to the creator's `BridgePeer`. Main-side identity comes from `peer.getConnectId()`, never from renderer parameters.
8. Validate untrusted values at protocol, persistence, or external-input boundaries. Do not duplicate validation for typed RPC results.
9. Run type checks for every affected side. When `common/` changes affect both sides, run both main and client type checks.

## Review Checklist

- No new raw Electron IPC channel or preload business API was introduced.
- Existing bootstrap channels still only establish and transfer the bridge port.
- The RPC interface is domain-owned under `common/`.
- Provider registration and caller proxy use the same exact interface name.
- The remote object is tied to the correct peer and lifecycle.
- UI and business modules call semantic remote objects rather than transport APIs.
- Main and client type checks pass for shared contract changes.

For the detailed object RPC implementation pattern, also use the `add-remote-api` skill.
