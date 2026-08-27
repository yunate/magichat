import type { ISerializer, SerializerValue } from "../serializer";
import {
  SCRIPT_TASK_KEY,
  scriptTaskInfoSerializer,
  tasksCreateParamsSerializer,
  scriptTemplateSerializer,
} from "./scriptTaskDefinition";

export type TaskStatus = "notStarted" | "running" | "succeeded" | "failed" | "abandoned";

const _TASK_TYPE_REGISTRY = {
  [SCRIPT_TASK_KEY]: {
    info: scriptTaskInfoSerializer,
    createParams: tasksCreateParamsSerializer,
    template: scriptTemplateSerializer,
  },
} as const;

export type TaskType = keyof typeof _TASK_TYPE_REGISTRY;
export type TaskSepctialCreateParam<K extends TaskType = TaskType> =
  SerializerValue<(typeof _TASK_TYPE_REGISTRY)[K]["createParams"]>;
export type TaskSpectialInfo<K extends TaskType = TaskType> =
  SerializerValue<(typeof _TASK_TYPE_REGISTRY)[K]["info"]>;
export type TaskSpectialTemplate<K extends TaskType = TaskType> =
  SerializerValue<(typeof _TASK_TYPE_REGISTRY)[K]["template"]>;

export type TaskSerializerEntry = Readonly<{
  info: ISerializer<unknown>;
  createParams: ISerializer<unknown>;
  template: ISerializer<unknown>;
}>;

export function getTaskSerializer<K extends TaskType>(
  taskType: K,
): (typeof _TASK_TYPE_REGISTRY)[K];
export function getTaskSerializer(taskType: string): TaskSerializerEntry;
export function getTaskSerializer(taskType: string): TaskSerializerEntry {
  if (!isTaskType(taskType)) throw new Error(`Unknown task type: ${taskType}`);
  return _TASK_TYPE_REGISTRY[taskType];
}

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(_TASK_TYPE_REGISTRY, value);
}
