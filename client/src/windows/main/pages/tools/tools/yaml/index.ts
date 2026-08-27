import type { ToolDefinition } from "../types";
import YamlTool from "./YamlTool.vue";

export const yamlTool: ToolDefinition = {
  id: "yaml",
  title: "YAML",
  component: YamlTool,
  order: 14,
};
