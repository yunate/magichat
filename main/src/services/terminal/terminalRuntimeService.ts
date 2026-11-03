import fs from "node:fs/promises";
import path from "node:path";
import { BridgeRouter, type RemoteObject } from "../../../../common/ipc_bridge/rpc";
import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import {
  terminalPtyOptionsSerializer,
  terminalRunRequestSerializer,
  type TerminalClientRpcApi,
  type TerminalPtyOptions,
  type TerminalRunRequest,
  type TerminalRuntimeServiceApi,
  type TerminalType,
} from "../../../../common/terminal";
import { ValidateUtils } from "../../../../common/validator";
import { createScriptExecution } from "../scriptExecution";
import { gPtyFactory, TERMINAL_TEMPORARY_DIRECTORY } from "./ptyFactory";
import type { RpcPty } from "./rpcPty";

type TerminalRuntime = Readonly<{
  rpcPty: RpcPty;
  callback: RemoteObject<TerminalClientRpcApi>;
  terminalType: TerminalType;
  temporaryFiles: Set<string>;
}>;

type PreparedRun = Readonly<{
  scriptType: ScriptType;
  scriptPath: string;
  commandPath: string;
}>;

export class TerminalRuntimeService implements TerminalRuntimeServiceApi {
  public async disposeAll(): Promise<void> {
    for (const terminalId of [...this._runtimes.keys()]) await this.destroy(terminalId);
  }

  public async destroy(terminalId: string): Promise<void> {
    ValidateUtils.ensureNonBlankString(terminalId);
    const runtime = this._runtimes.get(terminalId);
    if (runtime === undefined) return;
    await runtime.rpcPty.kill();
    await BridgeRouter.destroyRemoteObj(runtime.callback);
    await Promise.all([...runtime.temporaryFiles].map(
      (filePath) => this._deleteTemporaryFile(runtime.temporaryFiles, filePath),
    ));
    this._runtimes.delete(terminalId);
  }

  public async clearTemporaryDirectory(): Promise<void> {
    try {
      await fs.rm(TERMINAL_TEMPORARY_DIRECTORY, { recursive: true, force: true });
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
    callback: RemoteObject<TerminalClientRpcApi>,
  ): Promise<RpcPty> {
    terminalPtyOptionsSerializer.validate(options);
    const rpcPty = await gPtyFactory.create(options.terminalType, options, callback);
    const terminalId = await rpcPty.getTerminalId();
    const temporaryFiles = new Set<string>();
    this._runtimes.set(terminalId, {
      rpcPty,
      callback,
      terminalType: options.terminalType,
      temporaryFiles,
    });
    return BridgeRouter.returnRemoteObj(rpcPty);
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
    await fs.mkdir(TERMINAL_TEMPORARY_DIRECTORY, { recursive: true });
    const basePath = path.join(TERMINAL_TEMPORARY_DIRECTORY, request.scriptId);
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
