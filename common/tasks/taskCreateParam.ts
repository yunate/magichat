import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";
import { SCRIPT_TASK_KEY } from "./scriptTaskDefinition";
import {
  getTaskSerializer,
  isTaskType,
  type TaskSepctialCreateParam,
  type TaskSerializerEntry,
  type TaskType,
} from "./taskType";

type TaskCreateParamFields<K extends TaskType> = {
  type: K;
  name: string;
  canResume: boolean;
  params?: TaskSepctialCreateParam<K>;
};

export type TaskCreateParam<K extends TaskType = TaskType> = {
  [Type in K]: TaskCreateParamFields<Type>;
}[K];

export class TaskCreateParamSerializer extends ISerializer<TaskCreateParam> {
  public getDefault(): TaskCreateParam {
    return {
      type: SCRIPT_TASK_KEY,
      name: "Script",
      canResume: false,
      params: getTaskSerializer(SCRIPT_TASK_KEY).createParams.getDefault(),
    };
  }

  public validate(value: unknown): asserts value is TaskCreateParam {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Task create param must be a record");
    if (!isTaskType(value.type)) throw new Error("Task create param type is invalid");
    ValidateUtils.ensureNonBlankString(value.name);
    ValidateUtils.ensureBoolean(value.canResume);
    if (value.params !== undefined) {
      const taskSerializer: TaskSerializerEntry = getTaskSerializer(value.type);
      taskSerializer.createParams.fromValue(value.params);
    }
  }
}

export const taskCreateParamSerializer: ISerializer<TaskCreateParam> =
  new TaskCreateParamSerializer();
export const TaskCreateParam: ISerializer<TaskCreateParam> = taskCreateParamSerializer;