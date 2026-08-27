import fs from "node:fs";
import { TASK_CENTER_CONFIG_KEY } from "../../../../common/config/taskCenter";
import type { TaskCreateParam } from "../../../../common/tasks/taskCreateParam";
import type { TaskInfo } from "../../../../common/tasks/taskInfo";
import type { TaskTemplate } from "../../../../common/tasks/taskTemplate";
import type { TaskStatus } from "../../../../common/tasks/taskType";
import type { TasksServerRpcApi } from "../../../../common/tasks/tasksRpcApi";
import { gConfigManager } from "../../infra/configManager";
import { readJsonFileResult, writeJsonFile } from "../../infra/jsonFile";
import { getErrorMessage } from "../../utils/error";
import { TaskEventsRemoteBroadcaster } from "../../bridge/remote_rpc_objects/taskEventsRemoteBroadcaster";
import type { Task, TaskCallbacks } from "./task";
import { TaskFactory } from "./taskFactory";
import { TaskPaths } from "./taskPaths";

const LOG_TAIL_LIMIT = 200;

export class TaskManager implements TasksServerRpcApi {
  static getInstance(): TaskManager {
    TaskManager._instance ??= new TaskManager();
    return TaskManager._instance;
  }

  createTask(params: TaskCreateParam): TaskInfo {
    const task = this._factory.createFromParams(params);
    const taskInfo = task.taskInfo;
    this._tasks.set(taskInfo.id, task);
    console.log(`[tasks] created ${taskInfo.type} task ${taskInfo.id} (${taskInfo.title})`);
    this._persistTask(task);
    void TaskEventsRemoteBroadcaster.taskUpdated(taskInfo);
    const seededLogs = task.getFullLogs();
    if (seededLogs.length > 0) {
      void TaskEventsRemoteBroadcaster.taskLogAppended(taskInfo.id, seededLogs);
    }
    this._processQueue();
    return taskInfo;
  }

  listTasks(): TaskInfo[] {
    return [...this._tasks.values()].map((task) => task.taskInfo);
  }

  stopTask(id: string): void {
    const task = this._tasks.get(id);
    if (!task) return;
    task.stop();
  }

  getTaskLogs(id: string): string[] {
    const task = this._tasks.get(id);
    return task ? task.getTailLogs(LOG_TAIL_LIMIT) : [];
  }

  getTaskFullLogs(id: string): string[] {
    const task = this._tasks.get(id);
    return task ? task.getFullLogs() : [];
  }

  getTaskCreateParams(id: string): TaskCreateParam | null {
    const task = this._tasks.get(id);
    return task ? task.createParam : null;
  }

  setTaskPin(id: string, isPinned: boolean): void {
    const task = this._tasks.get(id);
    if (!task) return;
    task.setPinned(isPinned);
  }

  // Live tasks retain runtime resources and must be stopped before deletion.
  deleteTasks(ids: string[]): string[] {
    const deletedIds: string[] = [];
    for (const id of ids) {
      const task = this._tasks.get(id);
      if (!task || !this._isTerminalStatus(task.taskInfo.status)) continue;
      task.dispose();
      this._tasks.delete(id);
      this._removeTaskDir(id);
      deletedIds.push(id);
    }
    if (deletedIds.length === 0) return deletedIds;
    console.log(`[tasks] deleted ${deletedIds.length} task(s)`);
    void TaskEventsRemoteBroadcaster.tasksDeleted(deletedIds);
    return deletedIds;
  }

  listTaskTemplates(): TaskTemplate[] {
    return this._factory.listTemplates();
  }

  saveTaskTemplate(params: TaskTemplate): TaskTemplate {
    return this._factory.saveTemplate(params);
  }

  deleteTaskTemplate(id: string): boolean {
    return this._factory.deleteTemplate(id);
  }

  disposeAll(): void {
    for (const task of this._tasks.values()) task.dispose();
  }

  private constructor() {
    fs.mkdirSync(TaskPaths.tasksDirectory, { recursive: true });
    this._tmpDir = TaskPaths.temporaryDirectory;
    fs.rmSync(this._tmpDir, { recursive: true, force: true });
    fs.mkdirSync(this._tmpDir, { recursive: true });
    this._tasks = new Map();
    this._factory = new TaskFactory(this._buildCallbacks(), this._tmpDir);
    this._loadTasks();
    this._processQueue();
  }

  private _buildCallbacks(): TaskCallbacks {
    return {
      onUpdated: (task: Task) => {
        this._persistTask(task);
        void TaskEventsRemoteBroadcaster.taskUpdated(task.taskInfo);
      },
      onLogAppended: (task: Task, lines: string[]) => {
        const taskInfo = task.taskInfo;
        void TaskEventsRemoteBroadcaster.taskLogAppended(taskInfo.id, lines);
      },
      onFinished: () => {
        this._processQueue();
      },
    };
  }

  private _processQueue(): void {
    const max = this._readMaxParallel();
    let running = this._countByStatus("running");
    const pending = [...this._tasks.values()]
      .filter((task) => task.taskInfo.status === "notStarted")
      .sort((a, b) => a.taskInfo.createdAt - b.taskInfo.createdAt);
    for (const task of pending) {
      if (running >= max) break;
      task.start();
      running += 1;
    }
  }

  private _loadTasks(): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(TaskPaths.tasksDirectory, { withFileTypes: true });
    } catch (err) {
      const message = getErrorMessage(err);
      console.warn(`[tasks] failed to read tasks dir: ${message}`);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "tmp") continue;
      const taskLocation = this._formatTaskDirectoryName(entry.name);
      try {
        this._loadTaskDirectory(entry.name, taskLocation);
      } catch {
        console.warn(`[tasks] failed to restore persisted task in ${taskLocation}`);
      }
    }
  }

  private _loadTaskDirectory(directoryTaskId: string, taskLocation: string): void {
    let configFile: string;
    try {
      configFile = TaskPaths.getTaskConfigFile(directoryTaskId);
    } catch {
      console.warn(`[tasks] skipping malformed task directory ${taskLocation}`);
      return;
    }
    const readResult = readJsonFileResult(configFile);
    if (readResult.status === "missing") return;
    if (readResult.status === "error") {
      if (readResult.reason === "parse") {
        console.warn(`[tasks] skipping malformed task config in ${taskLocation}: invalid JSON`);
      } else {
        console.warn(`[tasks] failed to read task config in ${taskLocation}`);
      }
      return;
    }
    const restoreResult = this._factory.restore(readResult.value, directoryTaskId);
    if (restoreResult.status === "malformed") {
      const reason = restoreResult.reason === "idMismatch" ? "task ID does not match directory" : "invalid shape";
      console.warn(`[tasks] skipping malformed task config in ${taskLocation}: ${reason}`);
      return;
    }
    const task = restoreResult.task;
    const taskInfo = task.taskInfo;
    if (this._tasks.has(taskInfo.id)) {
      console.warn(`[tasks] skipping duplicate persisted task ID in ${taskLocation}`);
      return;
    }
    const status = task.taskInfo.status;
    if (status === "notStarted" || status === "running") {
      if (task.canResume) {
        task.resetForResume();
        console.log(`[tasks] resuming task ${taskInfo.id} (${taskInfo.type}) after restart`);
      } else {
        task.recoverAsAbandoned();
        console.log(`[tasks] recovered task ${taskInfo.id} as abandoned`);
      }
      this._persistTask(task);
    }
    this._tasks.set(taskInfo.id, task);
  }

  private _persistTask(task: Task): void {
    const persistedTask = task.serialize();
    const taskId = persistedTask.info.id;
    const dir = TaskPaths.getTaskDirectory(taskId);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[tasks] failed to create task dir ${dir}: ${message}`);
      return;
    }
    writeJsonFile(TaskPaths.getTaskConfigFile(taskId), persistedTask, "tasks");
  }

  private _removeTaskDir(id: string): void {
    const dir = TaskPaths.getTaskDirectory(id);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      const message = getErrorMessage(err);
      console.error(`[tasks] failed to remove task dir ${dir}: ${message}`);
    }
  }

  private _readMaxParallel(): number {
    const config = gConfigManager.get(TASK_CENTER_CONFIG_KEY);
    return config.maxParallel > 0 ? config.maxParallel : Number.POSITIVE_INFINITY;
  }

  private _countByStatus(status: TaskStatus): number {
    let count = 0;
    for (const task of this._tasks.values()) if (task.taskInfo.status === status) count += 1;
    return count;
  }

  private _isTerminalStatus(status: TaskStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "abandoned";
  }

  private _formatTaskDirectoryName(name: string): string {
    const sanitizedName = name.replace(/[^A-Za-z0-9._-]/g, "?");
    return sanitizedName.length <= 80 ? sanitizedName : `${sanitizedName.slice(0, 77)}...`;
  }

  private static _instance: TaskManager | null = null;
  private readonly _tasks: Map<string, Task>;
  private readonly _factory: TaskFactory;
  private readonly _tmpDir: string;
}

export const gTaskManager = TaskManager.getInstance();