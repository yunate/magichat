import type { ToolDefinition } from "../types";
import CaseTool from "./CaseTool.vue";

export const caseTool: ToolDefinition = {
  id: "case",
  title: "命名转换",
  component: CaseTool,
  order: 8,
};
