import type { ToolDefinition } from "../types";
import CaseTool from "./CaseTool.vue";

export const caseTool: ToolDefinition = {
  id: "case",
  title: "Case Converter",
  component: CaseTool,
  category: "text-data",
  order: 8,
};
