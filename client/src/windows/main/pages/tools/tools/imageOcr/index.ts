import type { ToolDefinition } from "../types";
import ImageOcrTool from "./ImageOcrTool.vue";

export const imageOcrTool: ToolDefinition = {
  id: "image-ocr",
  title: "Image OCR",
  component: ImageOcrTool,
  category: "image",
  order: 16,
};