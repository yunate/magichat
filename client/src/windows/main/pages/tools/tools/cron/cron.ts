export interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  raw: string[];
}

export interface CronParseSuccess {
  ok: true;
  fields: CronFields;
}

export interface CronParseFailure {
  ok: false;
  error: string;
}

export type CronParseResult = CronParseSuccess | CronParseFailure;

export interface NextRunsSuccess {
  ok: true;
  runs: Date[];
}

export interface NextRunsFailure {
  ok: false;
  error: string;
}

export type NextRunsResult = NextRunsSuccess | NextRunsFailure;

interface FieldSpec {
  min: number;
  max: number;
  name: string;
  // Day-of-week accepts 7 as an alias for Sunday (0); normalized to 0 after validation.
  alias7?: boolean;
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, name: "分钟" },
  { min: 0, max: 23, name: "小时" },
  { min: 1, max: 31, name: "日" },
  { min: 1, max: 12, name: "月" },
  { min: 0, max: 6, name: "星期", alias7: true },
];

const DOW_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

// Cap the forward search so a valid-but-never-matching expression (e.g. Feb 30) fails instead of looping.
const MAX_SCAN_MINUTES = 366 * 24 * 60 * 4;

export function parseCron(expr: string): CronParseResult {
  const tokens = expr.trim().split(/\s+/).filter((token) => token !== "");
  if (tokens.length !== 5) {
    return { ok: false, error: "请输入 5 个字段: 分 时 日 月 周" };
  }
  const sets: Set<number>[] = [];
  for (let i = 0; i < FIELD_SPECS.length; i += 1) {
    const spec = FIELD_SPECS[i];
    const values = _parseField(tokens[i], spec);
    if (values === null) return { ok: false, error: `字段 "${tokens[i]}" (${spec.name}) 无法解析` };
    if (values.size === 0) return { ok: false, error: `字段 "${tokens[i]}" (${spec.name}) 没有有效值` };
    sets.push(values);
  }
  return {
    ok: true,
    fields: {
      minutes: sets[0],
      hours: sets[1],
      daysOfMonth: sets[2],
      months: sets[3],
      daysOfWeek: sets[4],
      raw: tokens,
    },
  };
}

export function describeCron(expr: string): string {
  const parsed = parseCron(expr);
  if (!parsed.ok) return parsed.error;
  const { raw, minutes, hours, daysOfMonth, months, daysOfWeek } = parsed.fields;
  const parts = [
    `分钟: ${_fieldText(raw[0], minutes)}`,
    `小时: ${_fieldText(raw[1], hours)}`,
    `日: ${raw[2] === "*" ? "每天" : _formatSet(daysOfMonth)}`,
    `月: ${_fieldText(raw[3], months)}`,
    `星期: ${raw[4] === "*" ? "不限" : _formatDow(daysOfWeek)}`,
  ];
  return parts.join("; ");
}

export function calculateNextRuns(expr: string, count: number, from: number = Date.now()): NextRunsResult {
  const parsed = parseCron(expr);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const fields = parsed.fields;
  const runs: Date[] = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let scanned = 0; scanned < MAX_SCAN_MINUTES && runs.length < count; scanned += 1) {
    if (_matches(cursor, fields)) runs.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  if (runs.length < count) {
    return { ok: false, error: "未来 4 年内找不到足够的执行时间, 请检查表达式" };
  }
  return { ok: true, runs };
}

function _parseField(raw: string, spec: FieldSpec): Set<number> | null {
  const result = new Set<number>();
  for (const part of raw.split(",")) {
    const values = parseCronPart(part, spec);
    if (values === null) return null;
    const upper = spec.alias7 === true ? 7 : spec.max;
    for (let value of values) {
      if (value < spec.min || value > upper) return null;
      if (spec.alias7 === true && value === 7) value = 0;
      result.add(value);
    }
  }
  return result;
}

function parseCronPart(part: string, spec: FieldSpec): number[] | null {
  let step = 1;
  let base = part;
  const slashIndex = part.indexOf("/");
  if (slashIndex !== -1) {
    const stepText = part.slice(slashIndex + 1);
    if (!/^\d+$/.test(stepText)) return null;
    step = Number(stepText);
    if (step <= 0) return null;
    base = part.slice(0, slashIndex);
  }
  let start: number;
  let end: number;
  if (base === "*") {
    start = spec.min;
    end = spec.max;
  } else if (/^\d+$/.test(base)) {
    start = Number(base);
    end = slashIndex !== -1 ? spec.max : start;
  } else {
    const range = /^(\d+)-(\d+)$/.exec(base);
    if (range === null) return null;
    start = Number(range[1]);
    end = Number(range[2]);
    if (end < start) return null;
  }
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

function _matches(date: Date, fields: CronFields): boolean {
  if (!fields.minutes.has(date.getMinutes())) return false;
  if (!fields.hours.has(date.getHours())) return false;
  if (!fields.months.has(date.getMonth() + 1)) return false;
  return _matchesDay(date, fields);
}

// Standard cron day rule: when both day-of-month and day-of-week are restricted the day matches if
// either does; if one is "*" both must match.
function _matchesDay(date: Date, fields: CronFields): boolean {
  const domMatch = fields.daysOfMonth.has(date.getDate());
  const dowMatch = fields.daysOfWeek.has(date.getDay());
  const domRestricted = fields.raw[2] !== "*";
  const dowRestricted = fields.raw[4] !== "*";
  if (domRestricted && dowRestricted) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

function _fieldText(raw: string, set: Set<number>): string {
  return raw === "*" ? "每一个" : _formatSet(set);
}

function _formatSet(set: Set<number>): string {
  return Array.from(set)
    .sort((a, b) => a - b)
    .join(", ");
}

function _formatDow(set: Set<number>): string {
  return Array.from(set)
    .sort((a, b) => a - b)
    .map((value) => DOW_NAMES[value])
    .join(", ");
}
