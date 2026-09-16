export interface WindowServerRpcApi {
  rendererReady(): void;
  getApplicationDirectoryPath(): string;
  openApplicationDirectory(): Promise<void>;
  getLogDirectoryPath(): string;
  openLogDirectory(): Promise<void>;
  openLatestReleasePage(): Promise<void>;
  openIssuesPage(): Promise<void>;
  openDiscussionsPage(): Promise<void>;
  minimize(): void;
  hide(): void;
  show(): void;
  toggleMaximize(): void;
  close(): void;
}

export interface WindowClientRpcApi {
  requestClose(): void;
}