"use client";

import { useMemo } from "react";
import type { Point, ShapeKind } from "../types";
import { getLinePaths, getPictogramPaths, getShapePaths, type RoughPath } from "../lib/roughShapes";
import { getFontFamilyClass } from "../lib/fonts";
import { cn } from "../lib/cn";

// The welcome tour's picture: a small diagram in the app's own hand, drawn
// stroke by stroke the way an answer arrives on the canvas.

export type SketchScene = "answer" | "codebase" | "connect";

const VIEW_BOX = { width: 520, height: 180 };
const STROKE_WIDTH = 2;
const LABEL_FONT_SIZE = 17;
const SMALL_LABEL_FONT_SIZE = 13;
const SECONDS_BETWEEN_ELEMENTS = 0.32;
const SECONDS_BETWEEN_STROKES = 0.08;
const SEED_BASE = 1_000;
const SEED_STEP = 7;
// rough.js only needs to know a fill exists; the hatching is colored by
// its class.
const HATCHED_FILL_PLACEHOLDER = "currentColor";

type SketchElement =
  | { kind: "shape"; shape: ShapeKind; x: number; y: number; width: number; height: number; label: string; hatched?: boolean }
  | { kind: "arrow"; points: Point[]; label?: string; labelAt?: Point; dashed?: boolean }
  | { kind: "pictogram"; icon: string; x: number; y: number; size: number; label: string }
  | { kind: "caption"; text: string; at: Point };

const SCENES: Record<SketchScene, { description: string; elements: SketchElement[] }> = {
  answer: {
    description: "A flowchart: Ask, then a decision Clear?, which leads to Sketched, or loops back with ask again.",
    elements: [
      { kind: "shape", shape: "rectangle", x: 20, y: 58, width: 120, height: 64, label: "Ask" },
      { kind: "arrow", points: [{ x: 140, y: 90 }, { x: 196, y: 90 }] },
      { kind: "shape", shape: "diamond", x: 196, y: 44, width: 120, height: 92, label: "Clear?" },
      { kind: "arrow", points: [{ x: 316, y: 90 }, { x: 372, y: 90 }], label: "yes", labelAt: { x: 344, y: 76 } },
      { kind: "shape", shape: "ellipse", x: 372, y: 52, width: 128, height: 76, label: "Sketched", hatched: true },
      {
        kind: "arrow",
        points: [{ x: 256, y: 136 }, { x: 256, y: 164 }, { x: 80, y: 164 }, { x: 80, y: 122 }],
        label: "ask again",
        labelAt: { x: 168, y: 152 },
      },
    ],
  },
  codebase: {
    description: "An architecture sketch: a web app and a mobile app call an API, which talks to a Postgres database.",
    elements: [
      { kind: "pictogram", icon: "laptop", x: 22, y: 14, size: 60, label: "Web app" },
      { kind: "pictogram", icon: "phone", x: 34, y: 106, size: 44, label: "Mobile" },
      { kind: "arrow", points: [{ x: 92, y: 50 }, { x: 184, y: 82 }] },
      { kind: "arrow", points: [{ x: 88, y: 126 }, { x: 184, y: 98 }] },
      { kind: "shape", shape: "rectangle", x: 184, y: 62, width: 112, height: 56, label: "API" },
      { kind: "arrow", points: [{ x: 296, y: 90 }, { x: 372, y: 90 }], label: "SQL", labelAt: { x: 334, y: 76 }, dashed: true },
      { kind: "pictogram", icon: "database", x: 372, y: 44, size: 72, label: "Postgres" },
    ],
  },
  connect: {
    description: "Gumption asks Claude Code, and Claude Code draws back, line by line, on this computer.",
    elements: [
      { kind: "shape", shape: "rectangle", x: 40, y: 50, width: 150, height: 64, label: "Gumption" },
      { kind: "arrow", points: [{ x: 190, y: 70 }, { x: 330, y: 70 }], label: "asks", labelAt: { x: 260, y: 58 } },
      { kind: "shape", shape: "rectangle", x: 330, y: 50, width: 150, height: 64, label: "Claude Code" },
      { kind: "arrow", points: [{ x: 330, y: 96 }, { x: 190, y: 96 }], label: "draws, line by line", labelAt: { x: 260, y: 112 }, dashed: true },
      { kind: "caption", text: "all on this computer, with your own sign-in", at: { x: 260, y: 158 } },
    ],
  },
};

interface DrawnElement {
  paths: RoughPath[];
  label: { text: string; at: Point; size: number; muted?: boolean } | null;
}

function drawElement(element: SketchElement, seed: number): DrawnElement {
  const stroke = { seed, strokeWidth: STROKE_WIDTH, sloppiness: "sketchy" as const };
  if (element.kind === "shape") {
    const paths = getShapePaths({
      ...stroke,
      strokeStyle: "solid",
      shapeKind: element.shape,
      width: element.width,
      height: element.height,
      backgroundColor: element.hatched ? HATCHED_FILL_PLACEHOLDER : "transparent",
      fillStyle: "hachure",
    });
    return { paths, label: { text: element.label, at: { x: element.x + element.width / 2, y: element.y + element.height / 2 }, size: LABEL_FONT_SIZE } };
  }
  if (element.kind === "arrow") {
    const paths = getLinePaths({ ...stroke, strokeStyle: element.dashed ? "dashed" : "solid", kind: "arrow", points: element.points });
    return { paths, label: element.label && element.labelAt ? { text: element.label, at: element.labelAt, size: SMALL_LABEL_FONT_SIZE } : null };
  }
  if (element.kind === "pictogram") {
    const paths = getPictogramPaths({ ...stroke, icon: element.icon, size: element.size });
    return { paths, label: { text: element.label, at: { x: element.x + element.size / 2, y: element.y + element.size + SMALL_LABEL_FONT_SIZE }, size: SMALL_LABEL_FONT_SIZE } };
  }
  return { paths: [], label: { text: element.text, at: element.at, size: SMALL_LABEL_FONT_SIZE, muted: true } };
}

interface Props {
  scene: SketchScene;
}

export default function OnboardingSketch({ scene }: Props) {
  const { description, elements } = SCENES[scene];
  const drawn = useMemo(() => elements.map((element, index) => ({ element, ...drawElement(element, SEED_BASE + index * SEED_STEP) })), [elements]);
  const handwriting = getFontFamilyClass("casual");

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
      className="w-full h-full text-foreground"
      role="img"
      aria-label={description}
      data-scene={scene}
    >
      {drawn.map(({ element, paths, label }, elementIndex) => {
        const elementDelay = elementIndex * SECONDS_BETWEEN_ELEMENTS;
        // rough.js draws shapes and pictograms in their own box; lines are
        // already in scene coordinates.
        const offset = element.kind === "shape" || element.kind === "pictogram" ? { x: element.x, y: element.y } : { x: 0, y: 0 };
        return (
          <g key={elementIndex}>
            <g transform={`translate(${offset.x} ${offset.y})`}>
              {paths.map((path, pathIndex) =>
                path.kind === "fill" ? null : (
                  <path
                    key={pathIndex}
                    d={path.d}
                    pathLength={1}
                    strokeWidth={path.kind === "fillSketch" ? STROKE_WIDTH / 2 : STROKE_WIDTH}
                    className={cn("cc-sketch-stroke", path.kind === "fillSketch" ? "stroke-accent" : "stroke-current")}
                    style={{ animationDelay: `${elementDelay + pathIndex * SECONDS_BETWEEN_STROKES}s` }}
                  />
                ),
              )}
            </g>
            {label && (
              <text
                x={label.at.x}
                y={label.at.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={label.size}
                className={cn("cc-sketch-label", handwriting, label.muted ? "fill-foreground-muted" : "fill-current")}
                style={{ animationDelay: `${elementDelay + paths.length * SECONDS_BETWEEN_STROKES + SECONDS_BETWEEN_STROKES}s` }}
              >
                {label.text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
