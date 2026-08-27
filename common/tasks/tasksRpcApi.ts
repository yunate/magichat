import type { TaskCreateParam } from "./taskCreateParam";
import type { TaskInfo } from "./taskInfo";
import type { TaskTemplate } from "./taskTemplate";

export interface TasksServerRpcApi {
  listTasks(): TaskInfo[];
  createTask(params: TaskCreateParam): TaskInfo;
  stopTask(id: string): void;
  deleteTasks(ids: string[]): string[];
  setTaskPin(id: string, isPinned: boolean): void;
  getTaskLogs(id: string): string[];
  getTaskFullLogs(id: string): string[];
  getTaskCreateParams(id: string): TaskCreateParam | null;
  listTaskTemplates(): TaskTemplate[];
  saveTaskTemplate(template: TaskTemplate): TaskTemplate;
  deleteTaskTemplate(id: string): boolean;
}

export interface TaskEventsClientRpcApi {
  taskUpdated(task: TaskInfo): void;
  taskLogAppended(taskId: string, lines: string[]): void;
  tasksDeleted(ids: string[]): void;
}