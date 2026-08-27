// btoa/atob only handle Latin1, so non-ASCII text is routed through UTF-8 bytes first: the string
// is encoded to UTF-8, each byte mapped to a Latin1 char for btoa, and reversed with a fatal
// TextDecoder so both illegal Base64 and invalid UTF-8 byte sequences surface as thrown errors.
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
