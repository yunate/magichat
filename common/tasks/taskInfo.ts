import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";
import { SCRIPT_TASK_KEY } from "./scriptTaskDefinition";
import {
  getTaskSerializer,
  isTaskType,
  type TaskSpectialInfo,
  type TaskStatus,
  type TaskSerializerEntry,
  type TaskType,
} from "./taskType";

type TaskInfoFields<K extends TaskType> = {
  type: K;
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  pinnedAt?: number;
  tasksSpectialInfo?: TaskSpectialInfo<K>;
};

export type TaskInfo<K extends TaskType = TaskType> = {
  [Type in K]: TaskInfoFields<Type>;
}[K];

export class TaskInfoSerializer extends ISerializer<TaskInfo> {
  public getDefault(): TaskInfo {
    return {
      id: "default",
      type: SCRIPT_TASK_KEY,
      title: "",
      status: "notStarted",
      createdAt: 0,
      updatedAt: 0,
    };
  }

  public validate(value: unknown): asserts value is TaskInfo {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Task info must be a record");
    ValidateUtils.ensureNonBlankString(value.id);
    if (!isTaskType(value.type)) throw new Error("Task info type is invalid");
    ValidateUtils.ensureString(value.title);
    if (!isTaskStatus(value.status)) throw new Error("Task info status is invalid");
    if (!isNonNegativeFiniteNumber(value.createdAt)) {
      throw new Error("Task createdAt must be a non-negative finite number");
    }
    if (!isNonNegativeFiniteNumber(value.updatedAt)) {
      throw new Error("Task updatedAt must be a non-negative finite number");
    }
    if (value.finishedAt !== undefined && !isNonNegativeFiniteNumber(value.finishedAt)) {
      throw new Error("Task finishedAt must be a non-negative finite number");
    }
    if (value.pinnedAt !== undefined && !isNonNegativeFiniteNumber(value.pinnedAt)) {
      throw new Error("Task pinnedAt must be a non-negative finite number");
    }
    if (value.tasksSpectialInfo !== undefined) {
      const taskSerializer: TaskSerializerEntry = getTaskSerializer(value.type);
      taskSerializer.info.validate(value.tasksSpectialInfo);
    }
  }
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "notStarted"
    || value === "running"
    || value === "succeeded"
    || value === "failed"
    || value === "abandoned";
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export const taskInfoSerializer: ISerializer<TaskInfo> = new TaskInfoSerializer();
