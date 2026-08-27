export type TextAreaLineCommand = "copy" | "cut" | "paste" | "duplicate";

export type TextAreaLineCommandResult = Readonly<{
  value: string;
  selectionStart: number;
  selectionEnd: number;
  clipboardText: string | null;
}>;

type LineRange = Readonly<{
  start: number;
  end: number;
  endWithBreak: number;
}>;

export function runTextAreaLineCommand(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  command: TextAreaLineCommand,
  clipboardText = "",
): TextAreaLineCommandResult | null {
  if (selectionStart !== selectionEnd || command === "paste" && clipboardText.length === 0) return null;
  const caret = Math.min(Math.max(selectionStart, 0), value.length);
  const line = getLineRange(value, caret);
  const lineWithBreak = line.start === value.length && value.endsWith("\n")
    ? "\n"
    : value.slice(line.start, line.endWithBreak);

  if (command === "copy") return createResult(value, caret, lineWithBreak);
  if (command === "cut") {
    const start = line.endWithBreak === value.length && line.start > 0
      ? line.start - 1
      : line.start;
    return createResult(value.slice(0, start) + value.slice(line.endWithBreak), start, lineWithBreak);
  }
  if (command === "paste") {
    const insertion = clipboardText.endsWith("\n") ? clipboardText : `${clipboardText}\n`;
    const start = clipboardText === "\n" && caret === value.length ? caret : line.start;
    return createResult(value.slice(0, start) + insertion + value.slice(start), start + insertion.length, null);
  }

  const lineText = value.slice(line.start, line.end);
  const column = caret - line.start;
  const hasBreak = line.endWithBreak > line.end;
  const insertion = hasBreak ? `${lineText}\n` : `\n${lineText}`;
  const insertionStart = hasBreak ? line.endWithBreak : line.end;
  const duplicatedStart = hasBreak ? line.endWithBreak : line.end + 1;
  return createResult(
    value.slice(0, insertionStart) + insertion + value.slice(insertionStart),
    duplicatedStart + column,
    null,
  );
}

function getLineRange(value: string, caret: number): LineRange {
  const start = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const followingBreak = value.indexOf("\n", caret);
  const end = followingBreak < 0 ? value.length : followingBreak;
  return { start, end, endWithBreak: followingBreak < 0 ? value.length : followingBreak + 1 };
}

function createResult(
  value: string,
  caret: number,
  clipboardText: string | null,
): TextAreaLineCommandResult {
  return { value, selectionStart: caret, selectionEnd: caret, clipboardText };
}
