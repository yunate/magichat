import { toDataURL } from "qrcode";

const QR_OPTIONS = { margin: 2, width: 320 } as const;

export function generateQrDataUrl(text: string): Promise<string> {
  return toDataURL(text, QR_OPTIONS);
}
