import path from "node:path";
import {
  DEFAULT_TASK_TEMPLATE_ROOT_PATH,
  type TaskTemplateRootConfig,
} from "../../../../common/config/taskCenter";
import { TreeViewPath } from "../../../../common/treeView";
import { gApplicationPaths } from "../../infra/applicationPaths";

export class TaskPaths {
  public static resolveTemplateRoots(
    roots: readonly TaskTemplateRootConfig[],
  ): TaskTemplateRootConfig[] {
    return roots.map((root) => ({
      key: root.key,
      path: root.path === DEFAULT_TASK_TEMPLATE_ROOT_PATH
        ? TaskPaths.tasksDirectory
        : TreeViewPath.normalize(root.path, "Task template root"),
    }));
  }

  public static getTemplatesFile(rootPath: string): string {
    return path.join(rootPath, "task-templates.json");
  }

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
  public static readonly temporaryDirectory = path.join(TaskPaths.tasksDirectory, "tmp");
}