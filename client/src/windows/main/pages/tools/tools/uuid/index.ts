import type { ToolDefinition } from "../types";
import UuidTool from "./UuidTool.vue";

export const uuidTool: ToolDefinition = {
  id: "uuid",
  title: "UUID / 随机串",
  component: UuidTool,
  order: 9,
};
