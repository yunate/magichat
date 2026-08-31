import type { ToolDefinition } from "../types";
import TokenTool from "./TokenTool.vue";

export const tokenTool: ToolDefinition = {
  id: "token",
  title: "Token",
  component: TokenTool,
  category: "developer",
  order: 3,
};
