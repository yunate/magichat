export interface WindowServerRpcApi {
  rendererReady(): void;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
}