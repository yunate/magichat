import type { TaskCreateParam } from "./taskCreateParam";
import type { TaskInfo } from "./taskInfo";
import type { TaskTemplate } from "./taskTemplate";
import type { TaskTemplateRootConfig } from "../config/taskCenter";

export interface TasksServerRpcApi {
  listTasks(): TaskInfo[];
  createTask(params: TaskCreateParam): TaskInfo;
  stopTask(id: string): void;
  deleteTasks(ids: string[]): string[];
  setTaskPin(id: string, isPinned: boolean): void;
  getTaskLogs(id: string): string[];
  revealTaskLog(id: string): void;
  getTaskCreateParams(id: string): TaskCreateParam | null;
  resolveTaskTemplateRoots(roots: readonly TaskTemplateRootConfig[]): TaskTemplateRootConfig[];
  listTaskTemplates(): TaskTemplate[];
  saveTaskTemplate(template: TaskTemplate): TaskTemplate;
  deleteTaskTemplate(id: string): boolean;
}

export interface TaskEventsClientRpcApi {
  taskUpdated(task: TaskInfo): void;
  taskLogAppended(taskId: string, lines: string[]): void;
  tasksDeleted(ids: string[]): void;
}