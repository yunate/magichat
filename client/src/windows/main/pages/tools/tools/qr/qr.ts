import { toCanvas } from "qrcode";

const QR_WIDTH = 320;
const CENTER_IMAGE_SIZE_RATIO = 0.2;
const CENTER_IMAGE_PADDING = 8;
const QR_OPTIONS = {
  margin: 2,
  width: QR_WIDTH,
  errorCorrectionLevel: "H",
  color: {
    dark: "#000000ff",
    light: "#00000000",
  },
} as const;

export async function generateQrDataUrl(text: string, centerImageUrl: string): Promise<string> {
  const canvas = document.createElement("canvas");
  await toCanvas(canvas, text, QR_OPTIONS);
  if (centerImageUrl !== "") {
    const image = await loadImage(centerImageUrl);
    drawCenterImage(canvas, image);
  }
  return canvas.toDataURL("image/png");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Failed to load the center image")), { once: true });
    image.src = url;
  });
}

function drawCenterImage(canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error("The center image has invalid dimensions");
  }
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas rendering is unavailable");

  const size = canvas.width * CENTER_IMAGE_SIZE_RATIO;
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  const x = (canvas.width - size) / 2;
  const y = (canvas.height - size) / 2;
  context.clearRect(
    x - CENTER_IMAGE_PADDING,
    y - CENTER_IMAGE_PADDING,
    size + CENTER_IMAGE_PADDING * 2,
    size + CENTER_IMAGE_PADDING * 2,
  );
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    x,
    y,
    size,
    size,
  );
}
