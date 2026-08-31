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
  { min: 0, max: 59, name: "minute" },
  { min: 0, max: 23, name: "hour" },
  { min: 1, max: 31, name: "day" },
  { min: 1, max: 12, name: "month" },
  { min: 0, max: 6, name: "weekday", alias7: true },
];

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Cap the forward search so a valid-but-never-matching expression (e.g. Feb 30) fails instead of looping.
const MAX_SCAN_MINUTES = 366 * 24 * 60 * 4;

export function parseCron(expr: string): CronParseResult {
  const tokens = expr.trim().split(/\s+/).filter((token) => token !== "");
  if (tokens.length !== 5) {
    return { ok: false, error: "Enter 5 fields: minute hour day month weekday" };
  }
  const sets: Set<number>[] = [];
  for (let i = 0; i < FIELD_SPECS.length; i += 1) {
    const spec = FIELD_SPECS[i];
    const values = _parseField(tokens[i], spec);
    if (values === null) return { ok: false, error: `Cannot parse field "${tokens[i]}" (${spec.name})` };
    if (values.size === 0) return { ok: false, error: `Field "${tokens[i]}" (${spec.name}) has no valid values` };
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
    `Minute: ${_fieldText(raw[0], minutes)}`,
    `Hour: ${_fieldText(raw[1], hours)}`,
    `Day: ${raw[2] === "*" ? "every day" : _formatSet(daysOfMonth)}`,
    `Month: ${_fieldText(raw[3], months)}`,
    `Weekday: ${raw[4] === "*" ? "any" : _formatDow(daysOfWeek)}`,
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
    return { ok: false, error: "Not enough runs were found in the next 4 years. Check the expression." };
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
  return raw === "*" ? "every value" : _formatSet(set);
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
