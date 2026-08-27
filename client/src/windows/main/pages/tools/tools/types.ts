import type { Component } from "vue";

export interface ToolDefinition {
  id: string;
  title: string;
  component: Component;
  order?: number;
  // Pinned to the bottom of the sidebar, separated by flexible space; pinned tabs still sort by order among themselves.
  isPinnedToBottom?: boolean;
}
