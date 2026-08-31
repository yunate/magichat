import type { CliEnvironmentVariable } from "../../../../../common/cli";
import type { CliHandler } from "./cliHandler";

export class TestCliHandler implements CliHandler {
  public tryParse(args: readonly string[]): boolean {
    return args[0] === "test";
  }

  public handle(args: readonly string[], _environment: readonly CliEnvironmentVariable[]): string {
    const response = args.join(" ").trimEnd();
    console.log(`[cli] ${response}`);
    return response;
  }
}