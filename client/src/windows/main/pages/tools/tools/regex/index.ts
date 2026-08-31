import type { ToolDefinition } from "../types";
import RegexTool from "./RegexTool.vue";

export const regexTool: ToolDefinition = {
  id: "regex",
  title: "Regex Tester",
  component: RegexTool,
  category: "text-data",
  order: 10,
};
