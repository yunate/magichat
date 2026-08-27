import { TaskCreateParam } from "../../../../common/tasks/taskCreateParam";
import {
  taskInfoSerializer,
  type TaskInfo,
} from "../../../../common/tasks/taskInfo";
import type { TaskSpectialInfo, TaskStatus } from "../../../../common/tasks/taskType";
import { appendLogLines, readLogLines, readTailLogLines } from "../../infra/logFile";
import { TaskPaths } from "./taskPaths";

export interface TaskCallbacks {
  onUpdated(task: Task): void;
  onLogAppended(task: Task, lines: string[]): void;
  onFinished(task: Task): void;
}

export abstract class Task {
  protected constructor(
    taskInfo: unknown,
    taskCreateParam: unknown,
    callbacks: TaskCallbacks,
  ) {
    taskInfoSerializer.validate(taskInfo);
    TaskCreateParam.validate(taskCreateParam);
    if (taskInfo.type !== taskCreateParam.type) {
      throw new Error("Task info and create param types must match");
    }
    this._taskInfo = taskInfo;
    this._createParam = taskCreateParam;
    this._callbacks = callbacks;
    this._logFile = TaskPaths.getTaskLogFile(taskInfo.id);
  }

  get taskInfo(): TaskInfo {
    return this._taskInfo;
  }

  get createParam(): TaskCreateParam {
    return this._createParam;
  }

  get canResume(): boolean {
    return this._createParam.canResume;
  }

  getTailLogs(limit: number): string[] {
    return readTailLogLines(this._logFile, limit, "tasks");
  }

  getFullLogs(): string[] {
    return readLogLines(this._logFile, "tasks");
  }
  serialize() {
    return { info: this._taskInfo, params: this._createParam };
  }

  seedCreationLog(line: string): void {
    this._writeLogLines([Task._stampLogLine(line)]);
  }

  start(): void {
    console.log(`[tasks] starting task ${this._taskInfo.id}`);
    this._appendLog(["task started"]);
    this._setStatus("running");
    this._start();
  }

  stop(): void {
    if (this._isTerminal()) return;
    this._isStopped = true;
    console.log(`[tasks] stopping task ${this._taskInfo.id}`);
    this._appendLog(["stopped by user"]);
    this._finish("abandoned");
  }

  // Preserve the running status so restart recovery can resume eligible tasks.
  dispose(): void {
    this._isDisposed = true;
    this._releaseResources();
  }

  setPinned(isPinned: boolean): void {
    if (isPinned) {
      this._taskInfo.pinnedAt = Date.now();
    } else {
      delete this._taskInfo.pinnedAt;
    }
    this._taskInfo.updatedAt = Date.now();
    this._callbacks.onUpdated(this);
  }

  recoverAsAbandoned(): void {
    this._taskInfo.status = "abandoned";
    this._taskInfo.updatedAt = Date.now();
    this._taskInfo.finishedAt ??= Date.now();
    this._writeLogLines([Task._stampLogLine("recovered as abandoned after a server restart")]);
  }

  resetForResume(): void {
    this._taskInfo.status = "notStarted";
    this._taskInfo.updatedAt = Date.now();
    this._writeLogLines([Task._stampLogLine("resumed after a server restart")]);
  }

  protected abstract _start(): void;

  protected abstract _releaseResources(): void;

  protected _finish(status: TaskStatus): void {
    // A released child may close during shutdown; recovery must see the prior status.
    if (this._isDisposed) return;
    if (this._isTerminal()) return;
    this._releaseResources();
    console.log(`[tasks] task ${this._taskInfo.id} -> ${status}`);
    this._taskInfo.finishedAt ??= Date.now();
    this._setStatus(status);
    this._callbacks.onFinished(this);
  }

  protected _setStatus(status: TaskStatus): void {
    this._taskInfo.status = status;
    this._taskInfo.updatedAt = Date.now();
    this._callbacks.onUpdated(this);
  }

  // Ignore an in-flight poll result that arrives after termination.
  protected _updateInfo(patch: Partial<TaskSpectialInfo>): void {
    if (this._isStopped || this._isTerminal()) return;
    const tasksSpectialInfo = this._taskInfo.tasksSpectialInfo;
    if (tasksSpectialInfo === undefined) {
      throw new Error("Task special info is required");
    }
    this._taskInfo.tasksSpectialInfo = { ...tasksSpectialInfo, ...patch };
    this._taskInfo.updatedAt = Date.now();
    this._callbacks.onUpdated(this);
  }

  protected _appendLog(lines: string[]): void {
    if (lines.length === 0) return;
    const stamped = lines.map((line) => Task._stampLogLine(line));
    this._writeLogLines(stamped);
    this._callbacks.onLogAppended(this, stamped);
  }

  protected _isTerminal(): boolean {
    return this._taskInfo.status === "succeeded"
      || this._taskInfo.status === "failed"
      || this._taskInfo.status === "abandoned";
  }

  private static _stampLogLine(line: string): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, "0");
    const stamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return `[${stamp}] ${line}`;
  }

  // Synchronous appends preserve line order within a task.
  private _writeLogLines(stamped: string[]): void {
    appendLogLines(this._logFile, stamped, "tasks");
  }

  protected readonly _callbacks: TaskCallbacks;
  protected _isStopped = false;
  protected _isDisposed = false;
  private readonly _logFile: string;
  private readonly _taskInfo: TaskInfo;
  private readonly _createParam: TaskCreateParam;
}
