type ElectronFileSystem = Readonly<{
  getPathForFile(file: File): string;
}>;

declare global {
  interface Window {
    readonly electronFileSystem: ElectronFileSystem;
  }
}

export {};