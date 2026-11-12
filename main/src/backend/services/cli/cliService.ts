import type { CliEnvironmentVariable } from "../../../../../common/cli";
import type { CliHandler } from "./handlers/cliHandler";
import { gCommandService } from "../command/commandService";
import { gTaskManager } from "../tasks/taskManager";
import { PrepareCliHandler } from "./handlers/prepareCliHandler";
import { SetEnvCliHandler } from "./handlers/setEnvCliHandler";
import { GetEnvCliHandler } from "./handlers/getEnvCliHandler";
import { TaskStateCliHandler } from "./handlers/taskStateCliHandler";
import { TestCliHandler } from "./handlers/testCliHandler";

export class CliService {
  public constructor() {
    this._handlers.push(new PrepareCliHandler(gCommandService));
    this._handlers.push(new SetEnvCliHandler(gCommandService));
    this._handlers.push(new GetEnvCliHandler(gCommandService));
    this._handlers.push(new TaskStateCliHandler(gTaskManager));
    this._handlers.push(new TestCliHandler());
  }

  public async handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): Promise<string> {
    for (const handler of this._handlers) {
      if (handler.tryParse(args)) return await handler.handle(args, environment);
    }
    throw new Error("Unsupported CLI command");
  }

  private readonly _handlers: CliHandler[] = [];
}

export const gCliService = new CliService();