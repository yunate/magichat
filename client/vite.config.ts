import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const appVersion = readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim();
if (!/^\d+\.\d+\.\d+\.\d+$/.test(appVersion)) {
  throw new Error("VERSION must contain four numeric components, for example 1.0.0.0.");
}

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  envPrefix: ["VITE_", "ENV_"],
  plugins: [vue()],
});
