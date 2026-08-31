import type { ToolDefinition } from "../types";
import FileOccupancyTool from "./FileOccupancyTool.vue";

export const fileOccupancyTool: ToolDefinition = {
  id: "file-occupancy",
  title: "File Occupancy",
  component: FileOccupancyTool,
  category: "system",
  order: 17,
};