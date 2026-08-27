import { ISerializer } from "../serializer";
import { ValidateUtils } from "../validator";
import { SCRIPT_TASK_KEY } from "./scriptTaskDefinition";
import {
  getTaskSerializer,
  isTaskType,
  type TaskSpectialTemplate,
  type TaskSerializerEntry,
  type TaskType,
} from "./taskType";

type TaskTemplateFields<K extends TaskType> = {
  type: K;
  id: string;
  name: string;
  builtin: boolean;
  template?: TaskSpectialTemplate<K>;
};

export type TaskTemplate<K extends TaskType = TaskType> = {
  [Type in K]: TaskTemplateFields<Type>;
}[K];

export class TaskTemplateSerializer extends ISerializer<TaskTemplate> {
  public getDefault(): TaskTemplate {
    return {
      id: "default",
      type: SCRIPT_TASK_KEY,
      name: "",
      builtin: false,
    };
  }

  public validate(value: unknown): asserts value is TaskTemplate {
    ValidateUtils.ensureRecord(value);
    if (Array.isArray(value)) throw new Error("Task template must be a record");
    ValidateUtils.ensureNonBlankString(value.id);
    if (!isTaskType(value.type)) throw new Error("Task template type is invalid");
    ValidateUtils.ensureString(value.name);
    ValidateUtils.ensureBoolean(value.builtin);
    if (value.template !== undefined) {
      const taskSerializer: TaskSerializerEntry = getTaskSerializer(value.type);
      taskSerializer.template.validate(value.template);
    }
  }
}

export const taskTemplateSerializer: ISerializer<TaskTemplate> = new TaskTemplateSerializer();
export const TaskTemplate: ISerializer<TaskTemplate> = taskTemplateSerializer;