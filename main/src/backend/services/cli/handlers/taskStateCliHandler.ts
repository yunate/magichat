import {
  CLI_PAGE_ENVIRONMENT_KEY,
  CLI_PAGE_TASK_CENTER,
  CLI_TASK_ID_ENVIRONMENT_KEY,
  type CliEnvironmentVariable,
} from "../../../../../../common/cli";
import type { TaskManager } from "../../tasks/taskManager";
import type { CliHandler } from "./cliHandler";

const SET_TASK_STATE_COMMAND = "set-task-state";
const SET_TASK_DETAIL_COMMAND = "set-task-detail";
const SET_TASK_TITLE_COMMAND = "set-task-title";

export class TaskStateCliHandler implements CliHandler {
  public constructor(taskManager: TaskManager) {
    this._taskManager = taskManager;
  }

  public tryParse(args: readonly string[]): boolean {
    return args[0] === SET_TASK_STATE_COMMAND
      || args[0] === SET_TASK_DETAIL_COMMAND
      || args[0] === SET_TASK_TITLE_COMMAND;
  }

  public handle(
    args: readonly string[],
    environment: readonly CliEnvironmentVariable[],
  ): string {
    const command = args[0];
    const taskId = this._getTaskId(environment, command);
    if (command === SET_TASK_TITLE_COMMAND) {
      const title = args[1];
      if (args.length > 2) throw new Error("Usage: set-task-title [<text>]");
      if (title === undefined || title.trim().length === 0) {
        this._taskManager.clearTaskTitle(taskId);
        return "Task title cleared.";
      }
      this._taskManager.setTaskTitle(taskId, title);
      return "Task title updated.";
    }
    if (command === SET_TASK_DETAIL_COMMAND) {
      const displayDetails = args.slice(1);
      if (displayDetails.some((detail) => detail.trim().length === 0)) {
        throw new Error("Usage: set-task-detail [<line> ...]");
      }
      this._taskManager.setTaskDisplayDetails(taskId, displayDetails);
      return "Task details updated.";
    }
    const displayState = args[1];
    if (args.length > 2) throw new Error("Usage: set-task-state [<text>]");
    if (displayState === undefined || displayState.trim().length === 0) {
      this._taskManager.clearTaskDisplayState(taskId);
      return "Task state cleared.";
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