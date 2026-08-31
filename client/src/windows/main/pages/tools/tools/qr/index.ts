import type { ToolDefinition } from "../types";
import QrTool from "./QrTool.vue";

export const qrTool: ToolDefinition = {
  id: "qr",
  title: "QR Code",
  component: QrTool,
  category: "image",
  order: 15,
};
