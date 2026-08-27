import type { ToolDefinition } from "../types";
import QrTool from "./QrTool.vue";

export const qrTool: ToolDefinition = {
  id: "qr",
  title: "二维码",
  component: QrTool,
  order: 15,
};
