export interface Charset {
  id: string;
  label: string;
  chars: string;
}

export const CHARSETS: Charset[] = [
  { id: "alnum", label: "字母数字", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" },
  { id: "hex", label: "十六进制", chars: "0123456789abcdef" },
  { id: "alnumSymbol", label: "字母数字+符号", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+" },
];

export function generateUuidV4(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

// crypto.getRandomValues gives cryptographically strong randomness; Math.random would not.
export function randomString(length: number, charset: string): string {
  if (length <= 0 || charset === "") return "";
  const values = crypto.getRandomValues(new Uint32Array(length));
  let result = "";
  for (let i = 0; i < length; i += 1) result += charset[values[i] % charset.length];
  return result;
}
