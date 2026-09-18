import { ValidateUtils } from "../validator";
import { ISerializer } from "../serializer";

export const TASK_CENTER_CONFIG_KEY = "taskCenter";
export const DEFAULT_TASK_TEMPLATE_ROOT_PATH = "${MAGICHAT_DATA}/tasks";

export type TaskTemplateRootConfig = {
  key: string;
  path: string;
};

export type TaskCenterConfig = {
  maxParallel: number;
  templateRoots: TaskTemplateRootConfig[];
  activeTemplateRootKey: string;
};

export class TaskCenterSerializer extends ISerializer<TaskCenterConfig> {
  public getDefault(): TaskCenterConfig {
    return structuredClone(TaskCenterSerializer._DEFAULT);
  }

  public override validate(value: unknown): asserts value is TaskCenterConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Task center config must be a record");
    const expectedKeys = Object.keys(TaskCenterSerializer._DEFAULT);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== expectedKeys.length
      || !expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Task center config contains unexpected properties");
    }
    const maxParallel = value.maxParallel;
    if (
      typeof maxParallel !== "number"
      || !Number.isFinite(maxParallel)
      || !Number.isInteger(maxParallel)
      || maxParallel < 0
    ) {
      throw new Error("Task center maxParallel must be a finite, nonnegative integer");
    }
    ValidateUtils.ensureArray(value.templateRoots, "Task template roots must be an array");
    if (value.templateRoots.length === 0) throw new Error("Task template roots must not be empty");
    const rootKeys = new Set<string>();
    const roots: TaskTemplateRootConfig[] = [];
    for (const [index, root] of value.templateRoots.entries()) {
      TaskCenterSerializer._validateTemplateRoot(root);
      const normalizedKey = root.key.toLocaleLowerCase("en-US");
      if (rootKeys.has(normalizedKey)) throw new Error("Task template root keys must be unique");
      rootKeys.add(normalizedKey);
      if (index === 0
        && (root.key !== "default" || root.path !== DEFAULT_TASK_TEMPLATE_ROOT_PATH)) {
        throw new Error("Default Task template root must be first");
      }
      roots.push(root);
    }
    ValidateUtils.ensureNonBlankString(
      value.activeTemplateRootKey,
      "Task activeTemplateRootKey must not be blank",
    );
    const activeRoot = roots.find((root) => root.key === value.activeTemplateRootKey);
    if (activeRoot === undefined) throw new Error("Task active template root does not exist");
    if (activeRoot.path.trim().length === 0) {
      throw new Error("Task active template root path must not be blank");
    }
  }

  public override fromValue(value: unknown): TaskCenterConfig {
    const normalized = TaskCenterSerializer._addTemplateRootsDefault(value);
    this.validate(normalized);
    return normalized;
  }

  private static _validateTemplateRoot(value: unknown): asserts value is TaskTemplateRootConfig {
    ValidateUtils.ensureRecord(value);
    const expectedKeys = Object.keys(TaskCenterSerializer._DEFAULT_TEMPLATE_ROOT);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== expectedKeys.length
      || !expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error("Task template root contains unexpected properties");
    }
    ValidateUtils.ensureNonBlankString(value.key, "Task template root key must not be blank");
    ValidateUtils.ensureString(value.path, "Task template root path must be a string");
  }

  private static _addTemplateRootsDefault(value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    ValidateUtils.ensureRecord(value);
    const actualKeys = Object.keys(value);
    if (actualKeys.length !== 1 || !Object.prototype.hasOwnProperty.call(value, "maxParallel")) {
      return value;
    }
    return {
      ...value,
      templateRoots: structuredClone(TaskCenterSerializer._DEFAULT.templateRoots),
      activeTemplateRootKey: TaskCenterSerializer._DEFAULT.activeTemplateRootKey,
    };
  }

  private static readonly _DEFAULT_TEMPLATE_ROOT: TaskTemplateRootConfig = {
    key: "default",
    path: DEFAULT_TASK_TEMPLATE_ROOT_PATH,
  };

  private static readonly _DEFAULT: TaskCenterConfig = {
    maxParallel: 0,
    templateRoots: [TaskCenterSerializer._DEFAULT_TEMPLATE_ROOT],
    activeTemplateRootKey: "default",
  };
}

export const taskCenterConfigSerializer = new TaskCenterSerializer();
