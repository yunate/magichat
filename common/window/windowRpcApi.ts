export interface WindowServerRpcApi {
  rendererReady(): void;
  minimize(): void;
  hide(): void;
  show(): void;
  toggleMaximize(): void;
  close(): void;
}

export interface WindowClientRpcApi {
  requestClose(): void;
}