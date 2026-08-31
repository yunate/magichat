import type { Component } from "vue";
import type { ToolCategory } from "../../../../../../../common/config/tools";

export { TOOL_CATEGORIES } from "../../../../../../../common/config/tools";
export type {
  ToolCategory,
  ToolsConfig,
  ToolsGroupId,
} from "../../../../../../../common/config/tools";

export interface ToolDefinition {
  id: string;
  title: string;
  component: Component;
  category: ToolCategory;
  order?: number;
}
