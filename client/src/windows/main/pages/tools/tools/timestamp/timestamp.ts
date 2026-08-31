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
  if (!/^-?\d+$/.test(trimmed)) return { ok: false, error: "Enter an integer timestamp" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: "Timestamp is outside the supported range" };
  const ms = unit === "seconds" ? value * 1000 : value;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid timestamp" };
  return {
    ok: true,
    rows: [
      { label: "Local Time", value: date.toLocaleString("en-US") },
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
    return { ok: false, error: "Cannot parse the date. Try 2024-01-01 12:00 or ISO 8601." };
  }
  return {
    ok: true,
    rows: [
      { label: "Seconds (Unix)", value: String(Math.floor(ms / 1000)) },
      { label: "Milliseconds", value: String(ms) },
    ],
  };
}
