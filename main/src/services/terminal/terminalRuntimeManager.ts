import fs from "node:fs/promises";
import path from "node:path";
import { gApplicationPaths } from "../../infra/applicationPaths";
import type { TerminalRuntimeService } from "./terminalRuntimeService";

export class TerminalRuntimeManager {
  public static getInstance(): TerminalRuntimeManager {
    TerminalRuntimeManager._instance ??= new TerminalRuntimeManager();
    return TerminalRuntimeManager._instance;
  }

  public add(id: string, service: TerminalRuntimeService): void {
    if (this._services.has(id)) throw new Error("Terminal runtime ID already exists");
    this._services.set(id, service);
  }

  public remove(id: string, service: TerminalRuntimeService): void {
    if (this._services.get(id) === service) this._services.delete(id);
  }

  public get(id: string): TerminalRuntimeService | null {
    return this._services.get(id) ?? null;
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
  private readonly _services = new Map<string, TerminalRuntimeService>();
}

export const gTerminalRuntimeManager = TerminalRuntimeManager.getInstance();
