import path from "node:path";
import { gApplicationPaths } from "../../infra/applicationPaths";

export class TaskPaths {
  public static getTaskDirectory(taskId: string): string {
    TaskPaths._ensureSafeTaskId(taskId);
    return path.join(TaskPaths.tasksDirectory, taskId);
  }

  public static getTaskConfigFile(taskId: string): string {
    return path.join(TaskPaths.getTaskDirectory(taskId), "config.json");
  }

  public static getTaskLogFile(taskId: string): string {
    return path.join(TaskPaths.getTaskDirectory(taskId), "log.txt");
  }

  public static getTaskArchivedLogFile(taskId: string): string {
    return path.join(TaskPaths.getTaskDirectory(taskId), "log.1");
  }

  private static _ensureSafeTaskId(taskId: string): void {
    if (taskId.length === 0 || taskId.includes("/") || taskId.includes("\\") || taskId.includes("..")) {
      throw new Error(`invalid task id segment: ${taskId}`);
    }
  }

  public static readonly tasksDirectory = path.join(gApplicationPaths.dataDir, "tasks");
  public static readonly templatesFile = path.join(TaskPaths.tasksDirectory, "task-templates.json");
  public static readonly temporaryDirectory = path.join(TaskPaths.tasksDirectory, "tmp");
}