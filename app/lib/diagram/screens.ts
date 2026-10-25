import type { Point } from "../../types";
import type { Box } from "../geometry";
import type { DeviceSpec } from "./mockup";

// Layout for mockups and screen flows: each screen is a device frame, its
// elements stack top to bottom inside it (a bottom bar pins to the bottom,
// the frame grows when the content runs long), and the screens sit in a
// row with arrows between them for the flow. Arrows leave an element's
// side, run through the gap between frames, and enter the target screen
// near its top (or an element in it at that element's height); one that
// skips over screens goes above them.

export interface ScreenElementInput {
  id: string;
  screenIndex: number;
  width: number;
  height: number;
  isFullWidth: boolean;
  isBottomBar: boolean;
}

export interface ScreenEndpoint {
  screenIndex: number;
  // An element in the screen, or null for the screen itself.
  elementId: string | null;
}

export interface ScreenConnectorInput {
  id: string;
  from: ScreenEndpoint;
  to: ScreenEndpoint;
}

export interface ScreenLayoutInput {
  contentOrigin: Point;
  device: DeviceSpec;
  screenCount: number;
  elements: ScreenElementInput[];
  connectors: ScreenConnectorInput[];
}

export interface ScreenLayoutResult {
  frames: Box[];
  elementBoxes: Map<string, Box>;
  connectorPaths: Map<string, Point[]>;
  contentBounds: Box | null;
}

const SCREEN_GAP = 180;

function dedupe(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}
const FRAME_ENTRY_OFFSET = 40;
const ENTRY_SPACING = 24;
const ABOVE_GAP = 48;
const TRACK_SPACING = 12;

export function layoutScreens(input: ScreenLayoutInput): ScreenLayoutResult {
  const { device } = input;
  const frames: Box[] = [];
  const elementBoxes = new Map<string, Box>();
  const elementScreen = new Map<string, number>();

  for (let screenIndex = 0; screenIndex < input.screenCount; screenIndex += 1) {
    const frameX = input.contentOrigin.x + screenIndex * (device.frameWidth + SCREEN_GAP);
    const frameY = input.contentOrigin.y;
    const elements = input.elements.filter((element) => element.screenIndex === screenIndex);
    const flowing = elements.filter((element) => !element.isBottomBar);
    const bottomBars = elements.filter((element) => element.isBottomBar);
    let cursor = frameY;
    flowing.forEach((element, index) => {
      const previous = flowing[index - 1];
      if (index > 0) cursor += previous.isFullWidth || element.isFullWidth ? device.padding : device.elementGap;
      else if (!element.isFullWidth) cursor += device.padding;
      const x = element.isFullWidth ? frameX : frameX + (device.frameWidth - element.width) / 2;
      elementBoxes.set(element.id, { x, y: cursor, width: element.width, height: element.height });
      elementScreen.set(element.id, screenIndex);
      cursor += element.height;
    });
    const contentBottom = cursor + (flowing.length > 0 && !flowing[flowing.length - 1].isFullWidth ? device.padding : 0);
    const barsHeight = bottomBars.reduce((total, element) => total + element.height, 0);
    const frameHeight = Math.max(device.minFrameHeight, contentBottom - frameY + barsHeight);
    let barTop = frameY + frameHeight - barsHeight;
    for (const element of bottomBars) {
      elementBoxes.set(element.id, { x: frameX, y: barTop, width: device.frameWidth, height: element.height });
      elementScreen.set(element.id, screenIndex);
      barTop += element.height;
    }
    frames.push({ x: frameX, y: frameY, width: device.frameWidth, height: frameHeight });
  }

  // ── Arrows between screens ────────────────────────────────────
  const connectorPaths = new Map<string, Point[]>();
  const gapCenter = (gapIndex: number) => frames[gapIndex].x + frames[gapIndex].width + SCREEN_GAP / 2;
  const framesTop = input.contentOrigin.y;
  const gapUses = new Map<number, string[]>();
  const aboveUses: string[] = [];
  const entries = new Map<string, string[]>();
  const connectors = input.connectors.filter(
    (connector) =>
      connector.from.screenIndex >= 0 &&
      connector.from.screenIndex < frames.length &&
      connector.to.screenIndex >= 0 &&
      connector.to.screenIndex < frames.length &&
      (connector.from.elementId === null || elementBoxes.has(connector.from.elementId)) &&
      (connector.to.elementId === null || elementBoxes.has(connector.to.elementId)),
  );
  const travelOf = (connector: ScreenConnectorInput) => (connector.to.screenIndex >= connector.from.screenIndex ? 1 : -1);
  const gapsOf = (connector: ScreenConnectorInput) => {
    const travel = travelOf(connector);
    const exitGap = travel === 1 ? connector.from.screenIndex : connector.from.screenIndex - 1;
    const entryGap = travel === 1 ? connector.to.screenIndex - 1 : connector.to.screenIndex;
    return { exitGap, entryGap: connector.to.screenIndex === connector.from.screenIndex ? exitGap : entryGap };
  };
  for (const connector of connectors) {
    const { exitGap, entryGap } = gapsOf(connector);
    gapUses.set(exitGap, [...(gapUses.get(exitGap) ?? []), connector.id]);
    if (entryGap !== exitGap) {
      gapUses.set(entryGap, [...(gapUses.get(entryGap) ?? []), connector.id]);
      aboveUses.push(connector.id);
    }
    const entryKey = `${connector.to.screenIndex}:${travelOf(connector)}`;
    entries.set(entryKey, [...(entries.get(entryKey) ?? []), connector.id]);
  }
  const trackOffset = (ids: string[] | undefined, id: string) => {
    if (!ids) return 0;
    return (ids.indexOf(id) - (ids.length - 1) / 2) * TRACK_SPACING;
  };
  const gapX = (gapIndex: number, connectorId: string) => {
    const center = gapIndex < 0 ? frames[0].x - SCREEN_GAP / 2 : gapCenter(Math.min(gapIndex, frames.length - 1));
    return center + trackOffset(gapUses.get(gapIndex), connectorId);
  };

  for (const connector of connectors) {
    const travel = travelOf(connector);
    const { exitGap, entryGap } = gapsOf(connector);
    const fromBox = connector.from.elementId ? elementBoxes.get(connector.from.elementId)! : frames[connector.from.screenIndex];
    const toBox = connector.to.elementId ? elementBoxes.get(connector.to.elementId)! : frames[connector.to.screenIndex];
    const fromFrame = frames[connector.from.screenIndex];
    const toFrame = frames[connector.to.screenIndex];
    const start = { x: travel === 1 ? fromBox.x + fromBox.width : fromBox.x, y: fromBox.y + fromBox.height / 2 };
    const entryKey = `${connector.to.screenIndex}:${travel}`;
    const entryIndex = entries.get(entryKey)!.indexOf(connector.id);
    const entryY = connector.to.elementId ? toBox.y + toBox.height / 2 : toBox.y + FRAME_ENTRY_OFFSET + entryIndex * ENTRY_SPACING;
    const end = { x: travel === 1 ? toBox.x : toBox.x + toBox.width, y: entryY };
    const exitX = gapX(exitGap, connector.id);
    // The run is broken where it crosses a frame edge, so a label lands on
    // the part in the gap rather than straddling the frame.
    const fromEdgeX = travel === 1 ? fromFrame.x + fromFrame.width : fromFrame.x;
    const toEdgeX = travel === 1 ? toFrame.x : toFrame.x + toFrame.width;
    const path: Point[] = [start, { x: fromEdgeX, y: start.y }, { x: exitX, y: start.y }];
    if (entryGap !== exitGap) {
      const aboveY = framesTop - ABOVE_GAP - aboveUses.indexOf(connector.id) * TRACK_SPACING;
      const entryX = gapX(entryGap, connector.id);
      path.push({ x: exitX, y: aboveY }, { x: entryX, y: aboveY }, { x: entryX, y: entryY });
    } else {
      path.push({ x: exitX, y: entryY });
    }
    if (toEdgeX !== end.x) path.push({ x: toEdgeX, y: entryY });
    path.push(end);
    connectorPaths.set(connector.id, dedupe(path));
  }

  const contentBounds = frames.reduce<Box | null>((bounds, frame) => {
    if (!bounds) return { ...frame };
    const right = Math.max(bounds.x + bounds.width, frame.x + frame.width);
    const bottom = Math.max(bounds.y + bounds.height, frame.y + frame.height);
    return { x: bounds.x, y: bounds.y, width: right - bounds.x, height: bottom - bounds.y };
  }, null);
  return { frames, elementBoxes, connectorPaths, contentBounds };
}
