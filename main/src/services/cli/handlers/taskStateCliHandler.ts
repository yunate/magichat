import {
  CLI_PAGE_ENVIRONMENT_KEY,
  CLI_PAGE_TASK_CENTER,
  CLI_TASK_ID_ENVIRONMENT_KEY,
  type CliEnvironmentVariable,
} from "../../../../../common/cli";
import type { TaskManager } from "../../tasks/taskManager";
import type { CliHandler } from "./cliHandler";

const SET_TASK_STATE_COMMAND = "set-task-state";
const CLEAR_TASK_STATE_COMMAND = "clear-task-state";

export class TaskStateCliHandler implements CliHandler {
  public constructor(taskManager: TaskManager) {
    this._taskManager = taskManager;
  }

  public tryParse(args: readonly string[]): boolean {
    return args[0] === SET_TASK_STATE_COMMAND || args[0] === CLEAR_TASK_STATE_COMMAND;
  }

  public handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): string {
    const command = args[0];
    const taskId = this._getTaskId(environment, command);
    if (command === CLEAR_TASK_STATE_COMMAND) {
      if (args.length !== 1) throw new Error("Usage: clear-task-state");
      this._taskManager.clearTaskDisplayState(taskId);
      return "Task state cleared.";
    }
    const displayState = args[1];
    if (args.length !== 2 || displayState === undefined || displayState.trim().length === 0) {
      throw new Error("Usage: set-task-state <text>");
    }
    this._taskManager.setTaskDisplayState(taskId, displayState);
    return "Task state updated.";
  }

  private _getTaskId(
    environment: readonly CliEnvironmentVariable[],
    command: string | undefined,
  ): string {
    const page = this._getEnvironmentValue(environment, CLI_PAGE_ENVIRONMENT_KEY);
    if (page !== CLI_PAGE_TASK_CENTER) {
      throw new Error(`${command ?? "Task state command"} must run from a Task Center task`);
    }
    const taskId = this._getEnvironmentValue(environment, CLI_TASK_ID_ENVIRONMENT_KEY);
    if (taskId === undefined || taskId.trim().length === 0) {
      throw new Error("Task Center task ID is unavailable");
    }
    return taskId;
  }

  private _getEnvironmentValue(
    environment: readonly CliEnvironmentVariable[],
    key: string,
  ): string | undefined {
    return environment.find((variable) => variable.key.toUpperCase() === key)?.value;
  }

  private readonly _taskManager: TaskManager;
}