import type { ToolDefinition } from "../types";
import UrlTool from "./UrlTool.vue";

export const urlTool: ToolDefinition = {
  id: "url",
  title: "URL",
  component: UrlTool,
  order: 5,
};
