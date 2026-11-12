export const BRIDGE_CONNECT_ACCEPT = "bridge:connect-accept";

export type BridgeConnectAccept = {
  readonly type: typeof BRIDGE_CONNECT_ACCEPT;
  readonly connectId: string;
};

export type BackendBridgeConnectAccept = BridgeConnectAccept & {
  readonly source: "main" | "renderer";
};

export type BridgeTransportMessage =
  | { readonly kind: "message"; readonly data: string }
  | { readonly kind: "close" };

export function parseBridgeConnectAccept(value: unknown): BridgeConnectAccept {
  if (value === null
    || typeof value !== "object"
    || !("type" in value)
    || value.type !== BRIDGE_CONNECT_ACCEPT
    || !("connectId" in value)
    || typeof value.connectId !== "string"
    || value.connectId.length === 0) {
    throw new Error("Invalid bridge connect accept");
  }
  return {
    type: value.type,
    connectId: value.connectId,
  };
}

export function parseBackendBridgeConnectAccept(value: unknown): BackendBridgeConnectAccept {
  const accept = parseBridgeConnectAccept(value);
  if (value === null || typeof value !== "object" || !("source" in value)
    || (value.source !== "main" && value.source !== "renderer")) {
    throw new Error("Invalid backend bridge connection source");
  }
  return { ...accept, source: value.source };
}

export function parseBridgeTransportMessage(value: unknown): BridgeTransportMessage {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    throw new Error("Invalid bridge transport message");
  }
  if (value.kind === "close") return { kind: "close" };
  if (value.kind !== "message"
    || !("data" in value)
    || typeof value.data !== "string") {
    throw new Error("Invalid bridge transport message");
  }
  return { kind: "message", data: value.data };
}