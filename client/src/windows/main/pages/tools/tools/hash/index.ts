import type { ToolDefinition } from "../types";
import HashTool from "./HashTool.vue";

export const hashTool: ToolDefinition = {
  id: "hash",
  title: "Hash",
  component: HashTool,
  category: "developer",
  order: 7,
};
