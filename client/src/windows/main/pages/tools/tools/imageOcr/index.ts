import type { ToolDefinition } from "../types";
import ImageOcrTool from "./ImageOcrTool.vue";

export const imageOcrTool: ToolDefinition = {
  id: "image-ocr",
  title: "图片文字提取",
  component: ImageOcrTool,
  order: 16,
};