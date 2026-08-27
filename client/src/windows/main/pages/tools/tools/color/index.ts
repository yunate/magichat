import type { ToolDefinition } from "../types";
import ColorTool from "./ColorTool.vue";

export const colorTool: ToolDefinition = {
  id: "color",
  title: "颜色转换",
  component: ColorTool,
  order: 11,
};
