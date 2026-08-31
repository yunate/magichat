import type { ToolDefinition } from "../types";
import TimestampTool from "./TimestampTool.vue";

export const timestampTool: ToolDefinition = {
  id: "timestamp",
  title: "Timestamp",
  component: TimestampTool,
  category: "developer",
  order: 6,
};
