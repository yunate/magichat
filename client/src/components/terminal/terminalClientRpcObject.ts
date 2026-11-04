import type { PtyCallbackApi, TerminalPtyExit } from "../../../../common/terminal";

export class TerminalClientRpcObject implements PtyCallbackApi {
  public constructor(
    onData: (data: string) => void,
    onExit: (event: TerminalPtyExit) => void,
  ) {
    this._onData = onData;
    this._onExit = onExit;
  }

  public onData(data: string): void {
    this._onData(data);
  }

  public onExit(event: TerminalPtyExit): void {
    this._onExit(event);
  }

  private readonly _onData: (data: string) => void;
  private readonly _onExit: (event: TerminalPtyExit) => void;
}
