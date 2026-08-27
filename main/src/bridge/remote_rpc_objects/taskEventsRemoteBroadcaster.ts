import type { TaskInfo } from "../../../../common/tasks/taskInfo";
import { WindowManager } from "../../window/windowManager";

export class TaskEventsRemoteBroadcaster {
  public static async taskUpdated(task: TaskInfo): Promise<void> {
    await WindowManager.getInstance().forEachWindow(async (window) => {
      try {
        await (await window.taskEventsClientRpcObject).taskUpdated(task);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push update to ${window.peer.getConnectId()}: ${reason}`);
      }
    });
  }

  public static async taskLogAppended(taskId: string, lines: string[]): Promise<void> {
    await WindowManager.getInstance().forEachWindow(async (window) => {
      try {
        await (await window.taskEventsClientRpcObject).taskLogAppended(taskId, lines);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push logs to ${window.peer.getConnectId()}: ${reason}`);
      }
    });
  }

  public static async tasksDeleted(ids: string[]): Promise<void> {
    await WindowManager.getInstance().forEachWindow(async (window) => {
      try {
        await (await window.taskEventsClientRpcObject).tasksDeleted(ids);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push deletions to ${window.peer.getConnectId()}: ${reason}`);
      }
    });
  }
}