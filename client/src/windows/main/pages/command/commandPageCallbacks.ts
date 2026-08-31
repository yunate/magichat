import { ref } from "vue";
import { gLazyCallbackManager } from "../../../../lazyCallback";

export const gCommandEnvPanelOpen = ref(false);

export const gCommandBeforeAppQuitCallback = gLazyCallbackManager
    .getLazyCallback<[], boolean | Promise<boolean>>("command-before-app-quit");
export const gCommandBeforeSettingsSaveCallback = gLazyCallbackManager
    .getLazyCallback<[current: unknown], boolean | Promise<boolean>>(
        "command-before-settings-save",
    );
export const gCommandRefreshCallback = gLazyCallbackManager
    .getLazyCallback<[], Promise<void>>("command-refresh");
export const gCommandEnvCallback = gLazyCallbackManager
    .getLazyCallback<[], Promise<void>>("command-env");
