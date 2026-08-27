export interface JwtParts {
  ok: true;
  header: string;
  payload: string;
  signature: string;
}

export interface JwtError {
  ok: false;
  error: string;
}

export type JwtResult = JwtParts | JwtError;

// JWT base64url differs from standard base64: '-'/'_' replace '+'/'/', and '=' padding is dropped;
// restore both before atob, then reverse the byte string through a fatal UTF-8 TextDecoder so illegal
// base64url or invalid UTF-8 both throw instead of yielding garbage.
function decodeBase64UrlToJson(segment: string): string {
  let base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  if (remainder === 1) throw new Error("非法的 base64url 长度");
  if (remainder > 0) base64 += "=".repeat(4 - remainder);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.stringify(JSON.parse(json) as unknown, null, 2);
}

export function parseJwt(token: string): JwtResult {
  const trimmed = token.trim();
  if (trimmed === "") return { ok: false, error: "请输入 JWT" };
  const segments = trimmed.split(".");
  if (segments.length !== 3) {
    return { ok: false, error: "不是有效的 JWT（应为 header.payload.signature 三段）" };
  }
  const [headerSegment, payloadSegment, signature] = segments;
  try {
    const header = decodeBase64UrlToJson(headerSegment);
    const payload = decodeBase64UrlToJson(payloadSegment);
    return { ok: true, header, payload, signature };
  } catch {
    return { ok: false, error: "解析失败：header/payload 不是合法的 base64url 编码 JSON" };
  }
}

export interface TimeClaim {
  label: string;
  value: string;
}

const TIME_CLAIM_LABELS: Record<string, string> = {
  iat: "签发时间 (iat)",
  nbf: "生效时间 (nbf)",
  exp: "过期时间 (exp)",
};

// exp/iat/nbf are Unix seconds; surface them as readable local time. payloadJson is already validated
// JSON here, so the parse cannot throw, but only numeric claims are formatted (never cast).
export function extractTimeClaims(payloadJson: string): TimeClaim[] {
  const parsed: unknown = JSON.parse(payloadJson);
  if (!isRecord(parsed)) return [];
  const claims: TimeClaim[] = [];
  for (const key of ["iat", "nbf", "exp"]) {
    const raw = parsed[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      claims.push({ label: TIME_CLAIM_LABELS[key], value: new Date(raw * 1000).toLocaleString() });
    }
  }
  return claims;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
