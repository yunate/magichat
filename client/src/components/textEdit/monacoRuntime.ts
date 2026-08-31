import type { ScriptType } from "../../../../common/tasks/scriptTaskDefinition";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import "monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu.js";
import "monaco-editor/editor/contrib/folding/browser/folding.js";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/editor/contrib/indentation/browser/indentation.js";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/features/find/register.js";
import "monaco-editor/language/json/monaco.contribution.js";
import "monaco-editor/languages/definitions/bat/register.js";
import "monaco-editor/languages/definitions/javascript/register.js";
import "monaco-editor/languages/definitions/markdown/register.js";
import "monaco-editor/languages/definitions/powershell/register.js";
import "monaco-editor/languages/definitions/python/register.js";

const MONACO_THEME_NAME = "magichat";
const DARK_EDITOR_TEXT_COLOR = "#b8b8b8";
const LINE_HIGHLIGHT_BACKGROUND = "#80808018";

globalThis.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};

export { monaco };

export function getMonacoLanguage(scriptType: ScriptType | undefined): string {
  switch (scriptType) {
    case "powershell":
      return "powershell";
    case "node":
      return "javascript";
    case "python":
      return "python";
    case "cmd":
      return "bat";
    case undefined:
      return "plaintext";
  }
}

export function applyMonacoTheme(): void {
  const rootStyle = getComputedStyle(document.documentElement);
  const isDark = rootStyle.colorScheme.includes("dark");
  monaco.editor.defineTheme(MONACO_THEME_NAME, {
    base: isDark ? "vs-dark" : "vs",
    inherit: true,
    rules: isDark
      ? [
          { token: "", foreground: DARK_EDITOR_TEXT_COLOR.slice(1) },
          { token: "delimiter", foreground: DARK_EDITOR_TEXT_COLOR.slice(1) },
          { token: "operator", foreground: DARK_EDITOR_TEXT_COLOR.slice(1) },
          { token: "comment", foreground: "6A9955" },
          { token: "string", foreground: "CE9178" },
          { token: "number", foreground: "B5CEA8" },
          { token: "regexp", foreground: "D16969" },
          { token: "keyword", foreground: "569CD6" },
          { token: "keyword.control", foreground: "C586C0" },
          { token: "type.identifier", foreground: "4EC9B0" },
        ]
      : [],
    colors: {
      "editor.background": readThemeColor(rootStyle, "--color-content-bg"),
      "editor.foreground": isDark
        ? DARK_EDITOR_TEXT_COLOR
        : readThemeColor(rootStyle, "--color-text"),
      "editorCursor.foreground": isDark
        ? "#aeafad"
        : readThemeColor(rootStyle, "--color-text"),
      "editorLineNumber.foreground": isDark
        ? "#858585"
        : readThemeColor(rootStyle, "--color-text-muted"),
      "editorLineNumber.activeForeground": isDark
        ? "#c6c6c6"
        : readThemeColor(rootStyle, "--color-text"),
      "editor.lineHighlightBackground": LINE_HIGHLIGHT_BACKGROUND,
      "editor.inactiveLineHighlightBackground": "#00000000",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": isDark ? "#264f78" : "#add6ff",
      "editor.inactiveSelectionBackground": isDark ? "#264f7880" : "#add6ff80",
      "editorWarning.foreground": readThemeColor(rootStyle, "--color-warning"),
      "editorWidget.background": readThemeColor(rootStyle, "--color-surface-raised"),
      "editorWidget.border": readThemeColor(rootStyle, "--color-border"),
      "scrollbarSlider.background": readThemeColor(rootStyle, "--color-border"),
      "scrollbarSlider.hoverBackground": readThemeColor(rootStyle, "--color-text-muted"),
      "scrollbarSlider.activeBackground": readThemeColor(rootStyle, "--color-text-muted"),
    },
  });
  monaco.editor.setTheme(MONACO_THEME_NAME);
}

function readThemeColor(style: CSSStyleDeclaration, property: string): string {
  const color = style.getPropertyValue(property).trim();
  if (!/^#[0-9a-f]{6}$/iu.test(color)) {
    throw new Error(`Theme property ${property} must be a six-digit hex color.`);
  }
  return color;
}