export type UrlMode = "encode" | "decode";

export interface UrlSuccess {
  ok: true;
  text: string;
}

export interface UrlFailure {
  ok: false;
  error: string;
}

export type UrlResult = UrlSuccess | UrlFailure;

export function transformUrl(input: string, mode: UrlMode): UrlResult {
  if (input === "") return { ok: true, text: "" };
  try {
    const text = mode === "encode" ? encodeURIComponent(input) : decodeURIComponent(input);
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Cannot decode input with an invalid percent escape" };
  }
}
