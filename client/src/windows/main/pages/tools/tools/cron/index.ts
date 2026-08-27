import type { ToolDefinition } from "../types";
import CronTool from "./CronTool.vue";

export const cronTool: ToolDefinition = {
  id: "cron",
  title: "Cron 解释",
  component: CronTool,
  order: 12,
};
