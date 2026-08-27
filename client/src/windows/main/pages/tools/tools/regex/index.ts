import type { ToolDefinition } from "../types";
import RegexTool from "./RegexTool.vue";

export const regexTool: ToolDefinition = {
  id: "regex",
  title: "正则测试",
  component: RegexTool,
  order: 10,
};
