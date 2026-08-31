import type { ToolDefinition } from "./types";
import { TOOL_CATEGORIES } from "./types";

class ToolsRegistry {
  registerTool(definition: ToolDefinition): void {
    if (this._tools.some((tool) => tool.id === definition.id)) {
      console.warn(`[tools] duplicate tool id ignored: ${definition.id}`);
      return;
    }
    this._tools.push(definition);
  }

  getTools(): readonly ToolDefinition[] {
    return [...this._tools].sort((left, right) => {
      const categoryOrder = TOOL_CATEGORIES.indexOf(left.category)
        - TOOL_CATEGORIES.indexOf(right.category);
      return categoryOrder || (left.order ?? 0) - (right.order ?? 0);
    });
  }

  private _tools: ToolDefinition[] = [];
}

export const gToolsRegistry = new ToolsRegistry();
