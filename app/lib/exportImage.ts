import { toPng, toSvg } from "html-to-image";
import type { Box } from "./geometry";

export type ExportFormat = "png" | "svg";

const EXPORT_PADDING = 32;
// Browsers refuse to allocate canvases much beyond this per side.
const MAX_CANVAS_SIDE = 16_384;

interface RenderOptions {
  viewportElement: HTMLElement;
  bounds: Box;
  format: ExportFormat;
  backgroundColor: string | null;
  pixelRatio: number;
  includeElement: (element: Element) => boolean;
}

function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// Renders xyflow's viewport layer (nodes + edges) re-translated so `bounds`
// lands at the image's top-left — independent of the current pan/zoom.
export async function renderCanvasImage({
  viewportElement,
  bounds,
  format,
  backgroundColor,
  pixelRatio,
  includeElement,
}: RenderOptions): Promise<string | Uint8Array<ArrayBuffer>> {
  const width = Math.ceil(bounds.width + EXPORT_PADDING * 2);
  const height = Math.ceil(bounds.height + EXPORT_PADDING * 2);
  const options = {
    width,
    height,
    backgroundColor: backgroundColor ?? undefined,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${EXPORT_PADDING - bounds.x}px, ${EXPORT_PADDING - bounds.y}px) scale(1)`,
    },
    filter: (domNode: HTMLElement) => !(domNode instanceof Element) || includeElement(domNode),
  };

  if (format === "svg") {
    const dataUrl = await toSvg(viewportElement, options);
    return decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));
  }
  const safePixelRatio = Math.min(pixelRatio, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  return dataUrlToBytes(await toPng(viewportElement, { ...options, pixelRatio: safePixelRatio }));
}
