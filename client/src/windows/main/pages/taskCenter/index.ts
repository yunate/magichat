import type { PageDefinition } from "../types";
import TaskCenterPage from "./TaskCenterPage.vue";

export const taskCenterPage: PageDefinition = {
  path: "/task-center",
  title: "Task Center",
  component: TaskCenterPage,
  order: 2,
};
