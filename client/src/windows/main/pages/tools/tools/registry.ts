import type { ToolDefinition } from "./types";

class ToolsRegistry {
  registerTool(definition: ToolDefinition): void {
    if (this._tools.some((tool) => tool.id === definition.id)) {
      console.warn(`[tools] duplicate tool id ignored: ${definition.id}`);
      return;
    }
    this._tools.push(definition);
  }

  getTools(): readonly ToolDefinition[] {
    return [...this._tools].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _tools: ToolDefinition[] = [];
}

export const gToolsRegistry = new ToolsRegistry();
