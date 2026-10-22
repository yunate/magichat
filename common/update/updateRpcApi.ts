export enum UpdateState {
  NOT_START = "notStart",
  UPDATING = "updating",
  CHECKED = "checked",
  NEED_RESTART = "needRestart",
}

export interface UpdateServerRpcApi {
  getState(): UpdateState;
  startUpdate(): void;
}