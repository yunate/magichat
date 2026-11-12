import type { TaskInfo } from "../../../../../common/tasks/taskInfo";
import { gRendererSessions } from "../../rendererSessions";

export class TaskEventsRemoteBroadcaster {
  public static async taskUpdated(task: TaskInfo): Promise<void> {
    await gRendererSessions.forEachSession(async (session) => {
      try {
        await (await session.taskEventsClientRpcObject).taskUpdated(task);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push update to ${session.peer.getConnectId()}: ${reason}`);
      }
    });
  }

  public static async taskLogAppended(taskId: string, lines: string[]): Promise<void> {
    await gRendererSessions.forEachSession(async (session) => {
      try {
        await (await session.taskEventsClientRpcObject).taskLogAppended(taskId, lines);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push logs to ${session.peer.getConnectId()}: ${reason}`);
      }
    });
  }

  public static async tasksDeleted(ids: string[]): Promise<void> {
    await gRendererSessions.forEachSession(async (session) => {
      try {
        await (await session.taskEventsClientRpcObject).tasksDeleted(ids);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[tasks] failed to push deletions to ${session.peer.getConnectId()}: ${reason}`);
      }
    });
  }
}