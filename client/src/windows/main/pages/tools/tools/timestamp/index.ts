import type { ToolDefinition } from "../types";
import TimestampTool from "./TimestampTool.vue";

export const timestampTool: ToolDefinition = {
  id: "timestamp",
  title: "时间戳",
  component: TimestampTool,
  order: 6,
};
