const MAX_IMAGE_DIMENSION = 2048;
const MAX_INLINE_BYTES = 1_500_000;
const RESIZED_IMAGE_TYPE = "image/webp";
const RESIZED_IMAGE_QUALITY = 0.92;
const FALLBACK_IMAGE_WIDTH = 300;
const FALLBACK_IMAGE_HEIGHT = 150;
const SVG_MIME_TYPE = "image/svg+xml";

export interface LoadedImage {
  src: string;
  width: number;
  height: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file isn't an image this app can display."));
    image.src = src;
  });
}

// Images are embedded in the project as data URLs, so oversized ones are
// downscaled/re-encoded on the way in to keep project files manageable.
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!isImageFile(file)) throw new Error(`${file.name} isn't an image.`);
  const originalSrc = await readAsDataUrl(file);
  const image = await decodeImage(originalSrc);
  const width = image.naturalWidth || FALLBACK_IMAGE_WIDTH;
  const height = image.naturalHeight || FALLBACK_IMAGE_HEIGHT;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const isSmallEnough = scale === 1 && file.size <= MAX_INLINE_BYTES;
  if (isSmallEnough || file.type === SVG_MIME_TYPE) return { src: originalSrc, width, height };

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return { src: originalSrc, width, height };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    src: canvas.toDataURL(RESIZED_IMAGE_TYPE, RESIZED_IMAGE_QUALITY),
    width: canvas.width,
    height: canvas.height,
  };
}
