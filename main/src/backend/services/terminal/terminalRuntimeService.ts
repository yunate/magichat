import fs from "node:fs/promises";
import path from "node:path";
import { BridgeRouter } from "../../../../../common/ipc_bridge/rpc";
import type { ScriptType } from "../../../../../common/tasks/scriptTaskDefinition";
import {
  terminalPtyOptionsSerializer,
  terminalRunRequestSerializer,
  type PtyApi,
  type PtyCallbackApi,
  type TerminalPtyOptions,
  type TerminalRunRequest,
  type TerminalRuntimeServiceApi,
  type TerminalType,
} from "../../../../../common/terminal";
import { ValidateUtils } from "../../../../../common/validator";
import { createScriptExecution } from "../scriptExecution";
import { gUacBrokerService } from "../uacBroker/uacBrokerService";
import { gPtyFactory } from "./ptyFactory";

type TerminalCallback = PtyCallbackApi & {
  dispose(): Promise<void>;
};

type TerminalRuntime = Readonly<{
  rpcPty: PtyApi;
  callback: TerminalCallback;
  terminalType: TerminalType;
  isUAC: boolean;
  temporaryFiles: Set<string>;
}>;

type PreparedRun = Readonly<{
  scriptType: ScriptType;
  scriptPath: string;
  commandPath: string;
}>;

export class TerminalRuntimeService implements TerminalRuntimeServiceApi {
  public onUacBrokerDisconnect(): void {
    for (const runtime of this._runtimes.values()) {
      if (!runtime.isUAC) continue;
      void runtime.callback.onExit({ exitCode: -1 });
    }
  }

  public async disposeAll(): Promise<void> {
    for (const terminalId of [...this._runtimes.keys()]) await this.destroy(terminalId);
  }

  public async destroy(terminalId: string): Promise<void> {
    try {
      ValidateUtils.ensureNonBlankString(terminalId);
      const runtime = this._runtimes.get(terminalId);
      if (runtime === undefined) return;
      this._runtimes.delete(terminalId);
      if (runtime.isUAC) {
        const uacRuntimePromise = gUacBrokerService.getExistingUacTerminalRuntimeService();
        if (uacRuntimePromise !== null) {
          const uacRuntime = await uacRuntimePromise;
          await uacRuntime.destroy(terminalId);
        }
        await BridgeRouter.destroyRemoteObj(runtime.rpcPty);
      } else {
        await runtime.rpcPty.kill();
      }
      await runtime.callback.dispose();
      await Promise.all([...runtime.temporaryFiles].map(
        (filePath) => this._deleteTemporaryFile(runtime.temporaryFiles, filePath),
      ));
      console.log(`[terminal] destroyed terminal ${terminalId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[terminal] failed to destroy terminal ${terminalId}: ${message}`);
    }
  }

  public async clearTemporaryDirectory(): Promise<void> {
    const temporaryDirectory = gPtyFactory.temporaryDirectory;
    try {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[terminal] failed to remove temporary directory: ${message}`);
    }
  }

  public async run(terminalId: string, request: TerminalRunRequest): Promise<void> {
    const runtime = this._requireRuntime(terminalId);
    terminalRunRequestSerializer.validate(request);
    const preparedRun = await this._prepareRun(runtime, request);
    await runtime.rpcPty.write(`${this._createRunInvocation(runtime.terminalType, preparedRun)}\r`);
  }

  public async prepareRun(terminalId: string, request: TerminalRunRequest): Promise<string> {
    const runtime = this._requireRuntime(terminalId);
    terminalRunRequestSerializer.validate(request);
    const preparedRun = await this._prepareRun(runtime, request);
    return `${preparedRun.scriptType}|${preparedRun.scriptPath}|${preparedRun.commandPath}`;
  }

  public async create(
    options: TerminalPtyOptions,
    callback: PtyCallbackApi,
  ): Promise<PtyApi> {
    terminalPtyOptionsSerializer.validate(options);
    const ptyCallback = this._createPtyCallback(callback);
    const rpcPty = await gPtyFactory.create(options, ptyCallback);
    const { terminalId } = await rpcPty.getInfo();
    const temporaryFiles = new Set<string>();
    this._runtimes.set(terminalId, {
      rpcPty,
      callback: ptyCallback,
      terminalType: options.terminalType,
      isUAC: options.isUAC,
      temporaryFiles,
    });
    return BridgeRouter.returnRemoteObj(rpcPty);
  }

  private _createPtyCallback(callback: PtyCallbackApi): TerminalCallback {
    let hasExited = false;
    const handleNotificationError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[terminal] renderer notification failed: ${message}`);
    };
    const ptyCallback: TerminalCallback = {
      onData: (data) => {
        if (hasExited) return;
        void Promise.resolve(callback.onData(data)).catch(handleNotificationError);
      },
      onExit: (event) => {
        if (hasExited) return;
        hasExited = true;
        void Promise.resolve(callback.onExit(event)).catch(handleNotificationError);
        for (const [terminalId, runtime] of this._runtimes) {
          if (runtime.callback !== ptyCallback) continue;
          void this.destroy(terminalId);
          break;
        }
      },
      dispose: async () => {
        await BridgeRouter.destroyRemoteObj(callback);
      },
    };
    return ptyCallback;
  }

  private _requireRuntime(terminalId: string): TerminalRuntime {
    ValidateUtils.ensureNonBlankString(terminalId);
    const runtime = this._runtimes.get(terminalId);
    if (runtime === undefined) {
      throw new Error("Terminal runtime does not exist");
    }
    return runtime;
  }

  private async _prepareRun(runtime: TerminalRuntime, request: TerminalRunRequest): Promise<PreparedRun> {
    const temporaryDirectory = gPtyFactory.temporaryDirectory;
    await fs.mkdir(temporaryDirectory, { recursive: true });
    const basePath = path.join(temporaryDirectory, request.scriptId);
    const execution = createScriptExecution(request.scriptType, request.scriptContent, basePath);
    const scriptPath = `${basePath}${execution.extension}`;
    await this._writeTemporaryFile(runtime.temporaryFiles, scriptPath, execution.content);
    return {
      scriptType: request.scriptType,
      scriptPath,
      commandPath: request.commandPath,
    };
  }

  private _createRunInvocation(terminalType: TerminalType, preparedRun: PreparedRun): string {
    if (terminalType === "cmd") {
      return `call mhrun ${preparedRun.scriptType} ${this._quoteCmdArgument(preparedRun.scriptPath)} ${this._quoteCmdArgument(preparedRun.commandPath)}`;
    }
    return `mhrun ${preparedRun.scriptType} ${this._quotePowerShellArgument(preparedRun.scriptPath)} ${this._quotePowerShellArgument(preparedRun.commandPath)}`;
  }

  private _quoteCmdArgument(value: string): string {
    return `"${value.replace(/%/g, "%%").replace(/"/g, "\"\"")}"`;
  }

  private _quotePowerShellArgument(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async _writeTemporaryFile(temporaryFiles: Set<string>, filePath: string, content: string): Promise<void> {
    let existingContent: string | null = null;
    try {
      existingContent = await fs.readFile(filePath, "utf8");
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (existingContent !== content) await fs.writeFile(filePath, content, "utf8");
    temporaryFiles.add(filePath);
  }

  private async _deleteTemporaryFile(temporaryFiles: Set<string>, filePath: string): Promise<void> {
    try {
      await fs.rm(filePath, { force: true });
      temporaryFiles.delete(filePath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[terminal] failed to remove temporary file: ${message}`);
    }
  }

  private readonly _runtimes = new Map<string, TerminalRuntime>();
}

export const gTerminalRuntimeService = new TerminalRuntimeService();
