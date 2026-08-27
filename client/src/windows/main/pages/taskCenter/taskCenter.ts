// Task Center event buses: task pushes emit here, TaskCenterPage subscribes (decoupling bridge from view).
// Separate buses because payloads differ (full TaskInfo vs incremental log lines vs deleted ids); keys are
// per-instance so each starts at 1.
import type { TaskInfo } from "../../../../../../common/tasks/taskInfo";
import { EventCenter } from "../../../../events/eventCenter";

export interface TaskLogAppendedEventPayload {
  id: string;
  lines: string[];
}

export interface TasksDeletedEventPayload {
  ids: string[];
}

export const TASK_UPDATED_EVENT = 1;
export const TASK_LOG_APPENDED_EVENT = 1;
export const TASK_DELETED_EVENT = 1;

export const gTaskUpdatedCenter = new EventCenter<TaskInfo>();
export const gTaskLogAppendedCenter = new EventCenter<TaskLogAppendedEventPayload>();
export const gTaskDeletedCenter = new EventCenter<TasksDeletedEventPayload>();
