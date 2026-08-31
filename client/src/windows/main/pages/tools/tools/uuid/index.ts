import type { ToolDefinition } from "../types";
import UuidTool from "./UuidTool.vue";

export const uuidTool: ToolDefinition = {
  id: "uuid",
  title: "UUID / Random String",
  component: UuidTool,
  category: "developer",
  order: 9,
};
