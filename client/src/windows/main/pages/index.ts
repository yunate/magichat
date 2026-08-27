import { commandPage } from "./command";
import { gPageRegistry } from "./registry";
import { taskCenterPage } from "./taskCenter";
import { toolsPage } from "./tools";

gPageRegistry.registerPage(commandPage);
gPageRegistry.registerPage(taskCenterPage);
gPageRegistry.registerPage(toolsPage);
