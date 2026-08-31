import type { Component, Ref } from "vue";

export interface PageDefinition {
  path: string;
  title: string;
  component: Component;
  helpComponent?: Component;
  settingsComponent?: Component;
  refreshCallback?: () => void | Promise<void>;
  envCallback?: () => void | Promise<void>;
  envPanelOpen?: Readonly<Ref<boolean>>;
  beforeSaveCallback?: (current: unknown) => boolean | Promise<boolean>;
  beforeAppQuitCallback?: () => boolean | Promise<boolean>;
  order?: number;
}
