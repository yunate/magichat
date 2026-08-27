import type { Component } from "vue";

export interface PageDefinition {
  path: string;
  title: string;
  component: Component;
  settingsComponent?: Component;
  order?: number;
}
