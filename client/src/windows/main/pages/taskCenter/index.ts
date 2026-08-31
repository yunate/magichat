import type { PageDefinition } from "../types";
import TaskCenterHelpPanel from "./TaskCenterHelpPanel.vue";
import TaskCenterPage from "./TaskCenterPage.vue";

export const taskCenterPage: PageDefinition = {
  path: "/task-center",
  title: "Task Center",
  component: TaskCenterPage,
  helpComponent: TaskCenterHelpPanel,
  order: 2,
};
