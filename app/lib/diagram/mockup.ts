import type { ShapeKind } from "../../types";
import { LINE_HEIGHT } from "../elementStyle";
import type { Box } from "../geometry";
import { getPictogramKeywords, isPictogramName, PICTOGRAM_NAMES, type PictogramName } from "../pictograms";
import { estimateTextHeight, TRANSPARENT_FILL, type NodeFactory, type PlannedNode } from "./nodes";
import type { Device, DiagramColor, DiagramShapeKind } from "./operations";

// Wireframe primitives. Each one is a few ordinary canvas elements (boxes,
// lines, text, pictograms) arranged by hand, so the canvas needs no new
// element type and the person can edit the result like anything else.
//
// The screen is a column on a point grid: bars run the full frame width,
// everything else sits in the content column.

export interface DeviceSpec {
  frameWidth: number;
  minFrameHeight: number;
  padding: number;
  // Content column width; narrower than the frame on wide devices.
  columnWidth: number;
  navbarHeight: number;
  tabbarHeight: number;
  elementGap: number;
}

export const DEVICE_SPECS: Record<Device, DeviceSpec> = {
  phone: { frameWidth: 300, minFrameHeight: 600, padding: 16, columnWidth: 268, navbarHeight: 52, tabbarHeight: 60, elementGap: 12 },
  tablet: { frameWidth: 460, minFrameHeight: 600, padding: 24, columnWidth: 412, navbarHeight: 56, tabbarHeight: 60, elementGap: 14 },
  desktop: { frameWidth: 680, minFrameHeight: 440, padding: 32, columnWidth: 460, navbarHeight: 56, tabbarHeight: 56, elementGap: 16 },
};

export interface MockupElement {
  id: string;
  kind: DiagramShapeKind;
  label: string;
  note: string | null;
  color: DiagramColor | null;
  icon: PictogramName | null;
  nodeId: string;
  seed: number;
}

export interface ComposeContext {
  factory: NodeFactory;
  device: DeviceSpec;
  // The first screen has nowhere to go back to, so its bar has no chevron.
  isFirstScreen: boolean;
  strokeWidth: number;
  fillFor: (color: DiagramColor | null) => string;
}

const HEADING_FONT_SIZE = 22;
const BODY_FONT_SIZE = 14;
const CONTROL_FONT_SIZE = 15;
const CAPTION_FONT_SIZE = 12;
const TAB_FONT_SIZE = 10;
const BAR_FONT_SIZE = 16;
const BODY_OPACITY = 80;
const PLACEHOLDER_OPACITY = 50;
const MUTED_OPACITY = 60;
const SEPARATOR_OPACITY = 45;
const BUTTON_HEIGHT = 44;
const INPUT_HEIGHT = 44;
const INPUT_CAPTION_HEIGHT = 20;
const INPUT_TEXT_INSET = 12;
const IMAGE_ASPECT = 0.56;
const IMAGE_MIN_HEIGHT = 120;
const CARD_HEIGHT = 96;
const CARD_PADDING = 16;
const CARD_THUMBNAIL = 64;
const CARD_TEXT_GAP = 12;
const CARD_SUBTITLE_OFFSET = 30;
const LIST_ROW_HEIGHT = 48;
const LIST_TEXT_INSET = 16;
const GENERIC_BOX_HEIGHT = 72;
const PICTOGRAM_WIDTH = 120;
const PICTOGRAM_HEIGHT = 116;
const CHEVRON_HALF = 6;
const CHEVRON_DEPTH = 7;
const BAR_CHEVRON_INSET = 14;
const ROW_CHEVRON_INSET = 22;
const TAB_ICON_SIZE = 26;
const TAB_ICON_TOP = 8;
const TAB_DOT_SIZE = 16;
const TAB_LABEL_TOP = 38;
const TAB_LABEL_WIDTH = 72;
const TAB_SEPARATOR_PATTERN = /[,|/]/;

export function isFullWidth(kind: DiagramShapeKind): boolean {
  return kind === "navbar" || kind === "tabbar";
}

export function isBottomBar(kind: DiagramShapeKind): boolean {
  return kind === "tabbar";
}

export function elementWidth(kind: DiagramShapeKind, device: DeviceSpec): number {
  if (isFullWidth(kind)) return device.frameWidth;
  if (kind === "pictogram") return PICTOGRAM_WIDTH;
  return device.columnWidth;
}

export function measureElement(element: Pick<MockupElement, "kind" | "label" | "note">, device: DeviceSpec): number {
  const width = elementWidth(element.kind, device);
  switch (element.kind) {
    case "navbar":
      return device.navbarHeight;
    case "tabbar":
      return device.tabbarHeight;
    case "heading":
      return estimateTextHeight(element.label, width, HEADING_FONT_SIZE);
    case "text":
      return estimateTextHeight(element.label, width, BODY_FONT_SIZE);
    case "button":
      return BUTTON_HEIGHT;
    case "input":
      return INPUT_HEIGHT + (element.note ? INPUT_CAPTION_HEIGHT : 0);
    case "image":
      return Math.max(IMAGE_MIN_HEIGHT, Math.round(width * IMAGE_ASPECT));
    case "card":
      return CARD_HEIGHT;
    case "list":
      return LIST_ROW_HEIGHT * splitItems(element.label).length;
    case "pictogram":
      return PICTOGRAM_HEIGHT;
    default:
      return GENERIC_BOX_HEIGHT;
  }
}

function splitItems(label: string): string[] {
  const items = label
    .split(TAB_SEPARATOR_PATTERN)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [label];
}

function partId(element: MockupElement, part: string): string {
  return `${element.nodeId}:${part}`;
}

function partSeed(element: MockupElement, index: number): number {
  return element.seed + index;
}

function pictogramForTab(name: string): PictogramName | null {
  const lowered = name.toLowerCase();
  if (isPictogramName(lowered)) return lowered;
  return PICTOGRAM_NAMES.find((candidate) => getPictogramKeywords(candidate).includes(lowered)) ?? null;
}

function chevron(tip: { x: number; y: number }, pointsLeft: boolean) {
  const back = pointsLeft ? tip.x + CHEVRON_DEPTH : tip.x - CHEVRON_DEPTH;
  return [
    { x: back, y: tip.y - CHEVRON_HALF },
    { x: tip.x, y: tip.y },
    { x: back, y: tip.y + CHEVRON_HALF },
  ];
}

// The element's main node carries the element's own node id, so connectors
// can bind to it; the rest take derived ids.
export function composeElement(element: MockupElement, box: Box, context: ComposeContext): PlannedNode[] {
  const { factory, strokeWidth } = context;
  const line = { kind: "line" as const, strokeStyle: "solid" as const, strokeWidth };
  const outline = (nodeId: string, seed: number, shapeBox: Box, label = "", fontSize = CONTROL_FONT_SIZE, backgroundColor = TRANSPARENT_FILL) =>
    factory.shape(nodeId, seed, "rectangle", shapeBox, { label, backgroundColor, strokeWidth, fontSize });
  const placeholderCross = (prefix: string, seedBase: number, area: Box) => [
    factory.polyline(partId(element, `${prefix}-cross-a`), seedBase, [{ x: area.x, y: area.y }, { x: area.x + area.width, y: area.y + area.height }], { ...line, opacity: MUTED_OPACITY }),
    factory.polyline(partId(element, `${prefix}-cross-b`), seedBase + 1, [{ x: area.x + area.width, y: area.y }, { x: area.x, y: area.y + area.height }], { ...line, opacity: MUTED_OPACITY }),
  ];

  switch (element.kind) {
    case "navbar": {
      const nodes = [outline(element.nodeId, element.seed, box, element.label, BAR_FONT_SIZE)];
      if (!context.isFirstScreen) {
        nodes.push(factory.polyline(partId(element, "back"), partSeed(element, 1), chevron({ x: box.x + BAR_CHEVRON_INSET, y: box.y + box.height / 2 }, true), line));
      }
      return nodes;
    }
    case "tabbar": {
      const tabs = splitItems(element.label);
      const nodes = [outline(element.nodeId, element.seed, box)];
      tabs.forEach((tab, index) => {
        const centerX = box.x + (box.width * (index + 0.5)) / tabs.length;
        const icon = pictogramForTab(tab);
        if (icon) {
          nodes.push(
            factory.pictogram(partId(element, `tab-${index}-icon`), partSeed(element, 1 + index), icon, "", { x: centerX - TAB_ICON_SIZE / 2, y: box.y + TAB_ICON_TOP, width: TAB_ICON_SIZE, height: TAB_ICON_SIZE }, strokeWidth, TAB_FONT_SIZE),
          );
        } else {
          const dotTop = box.y + TAB_ICON_TOP + (TAB_ICON_SIZE - TAB_DOT_SIZE) / 2;
          nodes.push(
            factory.shape(partId(element, `tab-${index}-dot`), partSeed(element, 1 + index), "ellipse", { x: centerX - TAB_DOT_SIZE / 2, y: dotTop, width: TAB_DOT_SIZE, height: TAB_DOT_SIZE }, {
              label: "",
              backgroundColor: index === 0 ? context.fillFor(element.color ?? "blue") : TRANSPARENT_FILL,
              strokeWidth,
              fontSize: TAB_FONT_SIZE,
            }),
          );
        }
        nodes.push(
          factory.text(partId(element, `tab-${index}-label`), tab, { x: centerX - TAB_LABEL_WIDTH / 2, y: box.y + TAB_LABEL_TOP }, TAB_LABEL_WIDTH, {
            fontSize: TAB_FONT_SIZE,
            fontWeight: "normal",
            opacity: index === 0 ? 100 : MUTED_OPACITY,
          }),
        );
      });
      return nodes;
    }
    case "heading":
      return [factory.text(element.nodeId, element.label, box, box.width, { fontSize: HEADING_FONT_SIZE, fontWeight: "bold", opacity: 100 })];
    case "text":
      return [factory.text(element.nodeId, element.label, box, box.width, { fontSize: BODY_FONT_SIZE, fontWeight: "normal", opacity: BODY_OPACITY })];
    case "button":
      return [outline(element.nodeId, element.seed, box, element.label, CONTROL_FONT_SIZE, context.fillFor(element.color))];
    case "input": {
      const nodes: PlannedNode[] = [];
      let top = box.y;
      if (element.note) {
        nodes.push(factory.text(partId(element, "caption"), element.note, { x: box.x, y: top }, box.width, { fontSize: CAPTION_FONT_SIZE, fontWeight: "normal", opacity: BODY_OPACITY }));
        top += INPUT_CAPTION_HEIGHT;
      }
      const field = { x: box.x, y: top, width: box.width, height: INPUT_HEIGHT };
      nodes.push(outline(element.nodeId, element.seed, field));
      const lineHeight = BODY_FONT_SIZE * LINE_HEIGHT;
      nodes.push(
        factory.text(partId(element, "placeholder"), element.label, { x: field.x + INPUT_TEXT_INSET, y: field.y + (field.height - lineHeight) / 2 }, field.width - INPUT_TEXT_INSET * 2, {
          fontSize: BODY_FONT_SIZE,
          fontWeight: "normal",
          opacity: PLACEHOLDER_OPACITY,
        }),
      );
      return nodes;
    }
    case "image": {
      const nodes = [outline(element.nodeId, element.seed, box), ...placeholderCross("image", partSeed(element, 1), box)];
      if (element.label) {
        const lineHeight = CAPTION_FONT_SIZE * LINE_HEIGHT;
        nodes.push(
          factory.text(partId(element, "caption"), element.label, { x: box.x, y: box.y + box.height / 2 - lineHeight / 2 }, box.width, {
            fontSize: CAPTION_FONT_SIZE,
            fontWeight: "normal",
            opacity: MUTED_OPACITY,
          }),
        );
      }
      return nodes;
    }
    case "card": {
      const thumbnail = { x: box.x + CARD_PADDING, y: box.y + (box.height - CARD_THUMBNAIL) / 2, width: CARD_THUMBNAIL, height: CARD_THUMBNAIL };
      const textLeft = thumbnail.x + thumbnail.width + CARD_TEXT_GAP;
      const textWidth = box.x + box.width - CARD_PADDING - textLeft;
      const nodes = [
        outline(element.nodeId, element.seed, box),
        outline(partId(element, "thumbnail"), partSeed(element, 1), thumbnail),
        ...placeholderCross("thumbnail", partSeed(element, 2), thumbnail),
        factory.text(partId(element, "title"), element.label, { x: textLeft, y: thumbnail.y + 4 }, textWidth, { fontSize: CONTROL_FONT_SIZE, fontWeight: "bold", opacity: 100 }),
      ];
      if (element.note) {
        nodes.push(factory.text(partId(element, "subtitle"), element.note, { x: textLeft, y: thumbnail.y + CARD_SUBTITLE_OFFSET }, textWidth, { fontSize: CAPTION_FONT_SIZE, fontWeight: "normal", opacity: MUTED_OPACITY }));
      }
      return nodes;
    }
    case "list": {
      const items = splitItems(element.label);
      const nodes = [outline(element.nodeId, element.seed, box)];
      const lineHeight = BODY_FONT_SIZE * LINE_HEIGHT;
      items.forEach((item, index) => {
        const rowTop = box.y + LIST_ROW_HEIGHT * index;
        const rowCenter = rowTop + LIST_ROW_HEIGHT / 2;
        nodes.push(
          factory.text(partId(element, `row-${index}`), item, { x: box.x + LIST_TEXT_INSET, y: rowCenter - lineHeight / 2 }, box.width - LIST_TEXT_INSET - ROW_CHEVRON_INSET - CHEVRON_DEPTH, {
            fontSize: BODY_FONT_SIZE,
            fontWeight: "normal",
            opacity: 100,
          }),
          factory.polyline(partId(element, `row-${index}-chevron`), partSeed(element, 1 + index * 2), chevron({ x: box.x + box.width - ROW_CHEVRON_INSET + CHEVRON_DEPTH, y: rowCenter }, false), { ...line, opacity: MUTED_OPACITY }),
        );
        if (index < items.length - 1) {
          const separatorY = rowTop + LIST_ROW_HEIGHT;
          nodes.push(factory.polyline(partId(element, `row-${index}-separator`), partSeed(element, 2 + index * 2), [{ x: box.x, y: separatorY }, { x: box.x + box.width, y: separatorY }], { ...line, opacity: SEPARATOR_OPACITY }));
        }
      });
      return nodes;
    }
    case "pictogram":
      return [factory.pictogram(element.nodeId, element.seed, element.icon!, element.label, box, strokeWidth, BODY_FONT_SIZE)];
    default:
      return [factory.shape(element.nodeId, element.seed, element.kind as ShapeKind, box, { label: element.label, backgroundColor: context.fillFor(element.color), strokeWidth, fontSize: CONTROL_FONT_SIZE })];
  }
}
