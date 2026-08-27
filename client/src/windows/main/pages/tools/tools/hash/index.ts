import type { ToolDefinition } from "../types";
import HashTool from "./HashTool.vue";

export const hashTool: ToolDefinition = {
  id: "hash",
  title: "哈希",
  component: HashTool,
  order: 7,
};
