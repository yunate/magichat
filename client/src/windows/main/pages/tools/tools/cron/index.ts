import type { ToolDefinition } from "../types";
import CronTool from "./CronTool.vue";

export const cronTool: ToolDefinition = {
  id: "cron",
  title: "Cron Interpreter",
  component: CronTool,
  category: "developer",
  order: 12,
};
