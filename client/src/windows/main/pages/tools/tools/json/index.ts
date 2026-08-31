import type { ToolDefinition } from "../types";
import JsonTool from "./JsonTool.vue";

export const jsonTool: ToolDefinition = {
  id: "json",
  title: "JSON",
  component: JsonTool,
  category: "text-data",
  order: 4,
};
