import type { TerminalClientRpcApi } from "../../../../common/terminal";

export class TerminalClientRpcObject implements TerminalClientRpcApi {
  public constructor(
    onOutput: (data: string) => void,
    onRuntimeError: (message: string) => void,
  ) {
    this._onOutput = onOutput;
    this._onRuntimeError = onRuntimeError;
  }

  public output(data: string): void {
    this._onOutput(data);
  }

  public runtimeError(message: string): void {
    this._onRuntimeError(message);
  }

  private readonly _onOutput: (data: string) => void;
  private readonly _onRuntimeError: (message: string) => void;
}
