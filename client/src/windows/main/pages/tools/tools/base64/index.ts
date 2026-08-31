import type { ToolDefinition } from "../types";
import Base64Tool from "./Base64Tool.vue";

export const base64Tool: ToolDefinition = {
  id: "base64",
  title: "Base64",
  component: Base64Tool,
  category: "text-data",
  order: 2,
};
