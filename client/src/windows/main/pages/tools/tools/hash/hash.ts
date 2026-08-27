export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

export const HASH_ALGORITHMS: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-512"];

export async function calculateShaDigest(text: string, algorithm: HashAlgorithm): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return _toHex(new Uint8Array(digest));
}

function _toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
