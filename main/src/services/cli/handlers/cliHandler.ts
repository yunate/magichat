import type { CliEnvironmentVariable } from "../../../../../common/cli";

export interface CliHandler {
  tryParse(args: readonly string[]): boolean;
  handle(args: readonly string[], environment: readonly CliEnvironmentVariable[]): string | Promise<string>;
}