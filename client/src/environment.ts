declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
export const IS_DEBUG = import.meta.env.ENV_DEBUG === "true";