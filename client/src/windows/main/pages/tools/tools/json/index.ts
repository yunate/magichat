import type { ToolDefinition } from "../types";
import JsonTool from "./JsonTool.vue";

export const jsonTool: ToolDefinition = {
  id: "json",
  title: "JSON",
  component: JsonTool,
  order: 4,
};
