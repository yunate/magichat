import type { ToolDefinition } from "../types";
import MarkdownTool from "./MarkdownTool.vue";

export const markdownTool: ToolDefinition = {
  id: "markdown",
  title: "Markdown",
  component: MarkdownTool,
  category: "text-data",
  order: 1,
};
