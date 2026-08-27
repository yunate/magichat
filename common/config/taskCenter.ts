import { ValidateUtils } from "../validator";
import { ISerializer } from "../serializer";

export const TASK_CENTER_CONFIG_KEY = "taskCenter";

export type TaskCenterConfig = {
  maxParallel: number;
};

export class TaskCenterSerializer extends ISerializer<TaskCenterConfig> {
  public getDefault(): TaskCenterConfig {
    return { maxParallel: 0 };
  }

  public override validate(value: unknown): asserts value is TaskCenterConfig {
    ValidateUtils.ensureRecord(value);
    const maxParallel = value.maxParallel;
    if (
      typeof maxParallel !== "number"
      || !Number.isFinite(maxParallel)
      || !Number.isInteger(maxParallel)
      || maxParallel < 0
    ) {
      throw new Error("Task center maxParallel must be a finite, nonnegative integer");
    }
  }

  public override fromValue(value: unknown): TaskCenterConfig {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) {
      throw new Error("Task center config must be a record");
    }
    const config = { ...this.getDefault(), ...value };
    this.validate(config);
    return config;
  }
}

export const taskCenterConfigSerializer = new TaskCenterSerializer();
