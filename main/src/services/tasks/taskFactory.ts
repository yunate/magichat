import { randomUUID } from "node:crypto";
import { ValidateUtils } from "../../../../common/validator";
import { SCRIPT_TASK_KEY } from "../../../../common/tasks/scriptTaskDefinition";
import type { TaskCreateParam } from "../../../../common/tasks/taskCreateParam";
import type { TaskInfo } from "../../../../common/tasks/taskInfo";
import { TaskTemplate } from "../../../../common/tasks/taskTemplate";
import { readJsonFile, writeJsonFile } from "../../infra/jsonFile";
import { getErrorMessage } from "../../utils/error";
import { ScriptTask } from "./scriptTask";
import { Task, type TaskCallbacks } from "./task";
import { TaskPaths } from "./taskPaths";

export type TaskRestoreResult =
  | { status: "restored"; task: Task }
  | { status: "malformed"; reason: "shape" | "idMismatch" };

export class TaskFactory {
  constructor(callbacks: TaskCallbacks, tmpDir: string) {
    this._callbacks = callbacks;
    this._tmpDir = tmpDir;
    this._templatesFile = TaskPaths.templatesFile;
    this._userTemplates = [];
    this._loadTemplates();
  }

  createFromParams(taskCreateParam: TaskCreateParam): Task {
    const now = Date.now();
    const taskInfo: TaskInfo = {
      id: randomUUID(),
      type: taskCreateParam.type,
      title: taskCreateParam.name,
      createdAt: now,
      updatedAt: now,
      status: "notStarted",
    };
    const task = this._instantiate(taskInfo, taskCreateParam);
    task.seedCreationLog(`task created: ${task.taskInfo.title}`);
    return task;
  }

  restore(entry: unknown, directoryTaskId: string): TaskRestoreResult {
    try {
      ValidateUtils.ensureRecord(entry);
      const task = this._instantiate(entry.info, entry.params);
      if (task.taskInfo.id !== directoryTaskId) {
        return { status: "malformed", reason: "idMismatch" };
      }
      return { status: "restored", task };
    } catch {
      return { status: "malformed", reason: "shape" };
    }
  }

  listTemplates(): TaskTemplate[] {
    return [...TaskFactory._BUILTIN_TEMPLATES, ...this._userTemplates]
      .map((template) => TaskFactory._copyTemplate(template));
  }

  saveTemplate(params: TaskTemplate): TaskTemplate {
    const templatePayload = params.template;
    if (templatePayload === undefined) throw new Error("Task template payload is required");
    const savedPayload = {
      ...templatePayload,
      variables: { ...templatePayload.variables },
    };
    if (params.id !== undefined) {
      const existing = this._userTemplates.find((template) => template.id === params.id);
      if (existing) {
        existing.name = params.name;
        existing.template = savedPayload;
        this._persistTemplates();
        console.log(`[tasks] updated template "${existing.name}" (${existing.id})`);
        return TaskFactory._copyTemplate(existing);
      }
    }
    const template: TaskTemplate = {
      id: randomUUID(),
      type: params.type,
      name: params.name,
      builtin: false,
      template: savedPayload,
    };
    this._userTemplates.push(template);
    this._persistTemplates();
    console.log(`[tasks] saved template "${template.name}" (${template.id})`);
    return TaskFactory._copyTemplate(template);
  }

  deleteTemplate(id: string): boolean {
    const index = this._userTemplates.findIndex((template) => template.id === id);
    if (index < 0) return false;
    const [removed] = this._userTemplates.splice(index, 1);
    this._persistTemplates();
    console.log(`[tasks] deleted template "${removed.name}" (${removed.id})`);
    return true;
  }

  private static _copyTemplate(template: TaskTemplate): TaskTemplate {
    if (template.template === undefined) return { ...template };
    return {
      ...template,
      template: {
        ...template.template,
        variables: { ...template.template.variables },
      },
    };
  }

  private _instantiate(taskInfo: unknown, taskCreateParam: unknown): Task {
    ValidateUtils.ensureRecord(taskInfo);
    if (taskInfo.type === SCRIPT_TASK_KEY) {
      return new ScriptTask(taskInfo, taskCreateParam, this._callbacks, this._tmpDir);
    }
    throw new Error(`Unsupported task type: ${taskInfo.type}`);
  }

  // Load persisted user templates, validating every untrusted entry and skipping
  // malformed ones; built-in entries on disk are ignored.
  private _loadTemplates(): void {
    const raw = readJsonFile(this._templatesFile, "tasks");
    if (raw === null) return;
    try {
      ValidateUtils.ensureRecord(raw);
      ValidateUtils.ensureArray(raw.templates);
      for (const entry of raw.templates) {
        try {
          TaskTemplate.validate(entry);
          if (!entry.builtin) this._userTemplates.push(entry);
        } catch {
          console.warn("[tasks] skipping a malformed persisted template entry");
        }
      }
    } catch (err) {
      const message = getErrorMessage(err);
      console.warn(`[tasks] failed to load task-templates.json: ${message}`);
    }
  }

  private _persistTemplates(): void {
    writeJsonFile(this._templatesFile, { templates: this._userTemplates }, "tasks");
  }

  private static readonly _BUILTIN_TEMPLATES: TaskTemplate[] = [
    {
      type: SCRIPT_TASK_KEY,
      id: "builtin-script",
      name: "Script",
      builtin: true,
      template: {
        scriptType: "powershell",
        scriptContent: "",
        canResume: false,
        variables: {},
      },
    },
  ];

  private readonly _callbacks: TaskCallbacks;
  private readonly _tmpDir: string;
  private readonly _templatesFile: string;
  private readonly _userTemplates: TaskTemplate[];
}
