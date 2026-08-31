import type { PageDefinition } from "../types";
import CommandHelpPanel from "./CommandHelpPanel.vue";
import CommandPage from "./CommandPage.vue";
import {
  gCommandBeforeAppQuitCallback,
  gCommandBeforeSettingsSaveCallback,
  gCommandEnvCallback,
  gCommandEnvPanelOpen,
  gCommandRefreshCallback,
} from "./commandPageCallbacks";
import CommandSettingsPanel from "./CommandSettingsPanel.vue";

export const commandPage: PageDefinition = {
  path: "/command",
  title: "Command",
  component: CommandPage,
  helpComponent: CommandHelpPanel,
  settingsComponent: CommandSettingsPanel,
  refreshCallback: () => {
    const operation = gCommandRefreshCallback.invoke();
    if (operation === undefined) throw new Error("Command page is unavailable");
    return operation;
  },
  envCallback: () => {
    const operation = gCommandEnvCallback.invoke();
    if (operation === undefined) throw new Error("Command page is unavailable");
    return operation;
  },
  envPanelOpen: gCommandEnvPanelOpen,
  beforeSaveCallback: (current) => gCommandBeforeSettingsSaveCallback.invoke(current) ?? true,
  beforeAppQuitCallback: () => gCommandBeforeAppQuitCallback.invoke() ?? true,
  order: 1,
};