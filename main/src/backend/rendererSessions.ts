import type { BridgePeer } from "../../../common/ipc_bridge/peer";
import type { RemoteObject } from "../../../common/ipc_bridge/rpc";
import type { TaskEventsClientRpcApi } from "../../../common/tasks/tasksRpcApi";
import { createTaskEventsClientRpcObject } from "./bridge/remote_rpc_objects/taskEvents";

type RendererSession = Readonly<{
  peer: BridgePeer;
  taskEventsClientRpcObject: Promise<RemoteObject<TaskEventsClientRpcApi>>;
}>;

class RendererSessions {
  public add(peer: BridgePeer): void {
    const session: RendererSession = { peer, taskEventsClientRpcObject: createTaskEventsClientRpcObject(peer) };
    this._sessions.set(peer, session);
    peer.onDisconnect(() => this._sessions.delete(peer));
  }

  public async forEachSession(handler: (session: RendererSession) => Promise<void>): Promise<void> {
    for (const session of [...this._sessions.values()]) await handler(session);
  }

  private readonly _sessions = new Map<BridgePeer, RendererSession>();
}

export const gRendererSessions = new RendererSessions();