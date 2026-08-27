import type { PageDefinition } from "../types";
import CommandPage from "./CommandPage.vue";
import CommandSettingsPanel from "./CommandSettingsPanel.vue";

export const commandPage: PageDefinition = {
  path: "/command",
  title: "Command",
  component: CommandPage,
  settingsComponent: CommandSettingsPanel,
  order: 1,
};