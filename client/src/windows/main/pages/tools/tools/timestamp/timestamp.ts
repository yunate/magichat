export type TimestampUnit = "seconds" | "milliseconds";

export interface TimeRow {
  label: string;
  value: string;
}

export interface TimeSuccess {
  ok: true;
  rows: TimeRow[];
}

export interface TimeFailure {
  ok: false;
  error: string;
}

export type TimeResult = TimeSuccess | TimeFailure;

export function toReadable(raw: string, unit: TimestampUnit): TimeResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, rows: [] };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, error: "请输入整数时间戳" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "时间戳超出可表示范围" };
  const ms = unit === "seconds" ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "无效的时间戳" };
  return {
    ok: true,
    rows: [
      { label: "本地时间", value: date.toLocaleString() },
      { label: "UTC", value: date.toUTCString() },
      { label: "ISO 8601", value: date.toISOString() },
    ],
  };
}

export function toTimestamp(dateStr: string): TimeResult {
  const trimmed = dateStr.trim();
  if (trimmed === "") return { ok: true, rows: [] };
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return { ok: false, error: "无法解析的日期, 试试 2024-01-01 12:00 或 ISO 8601 格式" };
  }
  return {
    ok: true,
    rows: [
      { label: "秒 (Unix)", value: String(Math.floor(ms / 1000)) },
      { label: "毫秒", value: String(ms) },
    ],
  };
}
