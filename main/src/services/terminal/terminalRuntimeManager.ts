import fs from "node:fs/promises";
import path from "node:path";
import { gApplicationPaths } from "../../infra/applicationPaths";
import type { TerminalRuntimeService } from "./terminalRuntimeService";

export class TerminalRuntimeManager {
  public static getInstance(): TerminalRuntimeManager {
    TerminalRuntimeManager._instance ??= new TerminalRuntimeManager();
    return TerminalRuntimeManager._instance;
  }

  public add(service: TerminalRuntimeService): void {
    if (this._services.has(service)) throw new Error("Terminal runtime is already registered");
    this._services.add(service);
  }

  public remove(service: TerminalRuntimeService): void {
    this._services.delete(service);
  }

  public get(terminalId: string): TerminalRuntimeService | null {
    for (const service of this._services) {
      if (service.getTerminalId() === terminalId) return service;
    }
    return null;
  }

  public async disposeAll(): Promise<void> {
    const services = [...this._services.values()];
    for (const service of services) await service.dispose();
  }

  public async clearTemporaryDirectory(): Promise<void> {
    try {
      await fs.rm(this.temporaryDirectory, { recursive: true, force: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[terminal] failed to remove temporary directory: ${message}`);
    }
  }

  public readonly temporaryDirectory = path.join(gApplicationPaths.dataDir, "tmp", "terminal");

  private static _instance: TerminalRuntimeManager | null = null;
  private readonly _services = new Set<TerminalRuntimeService>();
}

export const gTerminalRuntimeManager = TerminalRuntimeManager.getInstance();
