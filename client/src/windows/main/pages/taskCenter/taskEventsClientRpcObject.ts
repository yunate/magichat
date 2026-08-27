import type { TaskEventsClientRpcApi } from "../../../../../../common/tasks/tasksRpcApi";
import type { TaskInfo } from "../../../../../../common/tasks/taskInfo";
import {
  TASK_DELETED_EVENT,
  TASK_LOG_APPENDED_EVENT,
  TASK_UPDATED_EVENT,
  gTaskDeletedCenter,
  gTaskLogAppendedCenter,
  gTaskUpdatedCenter,
} from "./taskCenter";

export class TaskEventsClientRpcObject implements TaskEventsClientRpcApi {
  public taskUpdated(task: TaskInfo): void {
    gTaskUpdatedCenter.emitEvent({ key: TASK_UPDATED_EVENT, payload: task });
  }

  public taskLogAppended(taskId: string, lines: string[]): void {
    gTaskLogAppendedCenter.emitEvent({
      key: TASK_LOG_APPENDED_EVENT,
      payload: { id: taskId, lines },
    });
  }

  public tasksDeleted(ids: string[]): void {
    gTaskDeletedCenter.emitEvent({ key: TASK_DELETED_EVENT, payload: { ids } });
  }
}