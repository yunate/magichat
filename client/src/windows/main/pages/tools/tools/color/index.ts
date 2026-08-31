import type { ToolDefinition } from "../types";
import ColorTool from "./ColorTool.vue";

export const colorTool: ToolDefinition = {
  id: "color",
  title: "Color Converter",
  component: ColorTool,
  category: "developer",
  order: 11,
};
