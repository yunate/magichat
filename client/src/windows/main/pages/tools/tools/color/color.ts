export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface ColorSuccess {
  ok: true;
  hex: string;
  rgb: string;
  hsl: string;
  preview: string;
}

export interface ColorFailure {
  ok: false;
  error: string;
}

export type ColorResult = ColorSuccess | ColorFailure;

export function parseColor(input: string): ColorResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "" };
  const rgb = _toRgb(trimmed);
  if (rgb === null) return { ok: false, error: "Unrecognized color. Use #hex, rgb(), or hsl()." };
  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb);
  return {
    ok: true,
    hex,
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    preview: hex,
  };
}

export function hexToRgb(input: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (match === null) return null;
  let hex = match[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g] = [c, x];
  else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x];
  else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c];
  else [r, b] = [c, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function _toRgb(input: string): Rgb | null {
  const hex = hexToRgb(input);
  if (hex !== null) return hex;
  const rgb = _parseRgbFunc(input);
  if (rgb !== null) return rgb;
  const hsl = _parseHslFunc(input);
  if (hsl !== null) return hslToRgb(hsl);
  return null;
}

function _parseRgbFunc(input: string): Rgb | null {
  const match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(input);
  if (match === null) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if (r > 255 || g > 255 || b > 255) return null;
  return { r, g, b };
}

function _parseHslFunc(input: string): Hsl | null {
  const match = /^hsla?\(\s*(\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(input);
  if (match === null) return null;
  const h = Number(match[1]);
  const s = Number(match[2]);
  const l = Number(match[3]);
  if (h > 360 || s > 100 || l > 100) return null;
  return { h, s, l };
}
