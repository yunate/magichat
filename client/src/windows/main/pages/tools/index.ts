import type { PageDefinition } from "../types";
import ToolsPage from "./ToolsPage.vue";

export const toolsPage: PageDefinition = {
  path: "/tools",
  title: "Tools",
  component: ToolsPage,
  order: 3,
};
