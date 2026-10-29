import { Pty, type PtyOptions } from "./pty";

export class CmdPty extends Pty {
  public constructor(options: PtyOptions) {
    super("cmd.exe", ["/Q", "/K"], {
      ...options,
      createEnvironment: (terminalId) => ({
        ...options.createEnvironment(terminalId),
        PROMPT: "CMD $P$G",
      }),
    });
  }
}