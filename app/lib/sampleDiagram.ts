import type { ElementStyle, Point } from "../types";
import { DiagramBuilder, type DiagramChange, type DiagramCounts } from "./diagram/builder";
import { parseOperationLine } from "./diagram/operations";
import type { Box } from "./geometry";

// A finished drawing for looking around before Claude Code is connected:
// the same operations the agent would stream, laid out by the same engine,
// so what lands on the canvas is exactly what a real answer looks like.
export const SAMPLE_DIAGRAM_PROMPT = "Password reset flow";
export const SAMPLE_DIAGRAM_SUMMARY = "Drew the password reset flow with two decisions and two loops.";
export const SAMPLE_DIAGRAM_INTRODUCTION =
  `Here's a sample for “${SAMPLE_DIAGRAM_PROMPT}”, drawn the way an answer would be. Move it, restyle it, or select it and describe a change once Claude Code is connected.`;

const SAMPLE_OPERATIONS: Record<string, unknown>[] = [
  { op: "plan", kind: "flow", title: "Password reset" },
  { op: "shape", id: "start", kind: "ellipse", label: "Start" },
  { op: "shape", id: "request", kind: "rectangle", label: "Request reset" },
  { op: "shape", id: "send", kind: "rectangle", label: "Send email" },
  { op: "shape", id: "open", kind: "rectangle", label: "Open link" },
  { op: "shape", id: "valid", kind: "diamond", label: "Token valid?" },
  { op: "shape", id: "form", kind: "rectangle", label: "New password" },
  { op: "shape", id: "strong", kind: "diamond", label: "Strong enough?" },
  { op: "shape", id: "save", kind: "rectangle", label: "Save password", color: "green" },
  { op: "shape", id: "expired", kind: "rectangle", label: "Show expired", color: "red" },
  { op: "shape", id: "end", kind: "ellipse", label: "Signed in" },
  { op: "connect", from: "start", to: "request" },
  { op: "connect", from: "request", to: "send" },
  { op: "connect", from: "send", to: "open" },
  { op: "connect", from: "open", to: "valid" },
  { op: "connect", from: "valid", to: "form", label: "yes" },
  { op: "connect", from: "valid", to: "expired", label: "no" },
  { op: "connect", from: "expired", to: "request", label: "try again" },
  { op: "connect", from: "form", to: "strong" },
  { op: "connect", from: "strong", to: "save", label: "yes" },
  { op: "connect", from: "strong", to: "form", label: "no" },
  { op: "connect", from: "save", to: "end" },
  { op: "note", text: "Tokens expire after 15 minutes", near: "valid" },
];

export interface SampleDiagram {
  change: DiagramChange;
  bounds: Box;
  artboardId: string;
  counts: DiagramCounts;
  outline: string;
}

export function buildSampleDiagram(origin: Point, style: ElementStyle): SampleDiagram | null {
  const builder = new DiagramBuilder(origin, style);
  for (const operation of SAMPLE_OPERATIONS) {
    for (const parsed of parseOperationLine(JSON.stringify(operation))) {
      if (parsed.kind === "operation" && parsed.operation.op !== "done") builder.apply(parsed.operation);
    }
  }
  // Laying out is what measures the drawing, so the change comes first.
  const change = builder.materialize();
  const bounds = builder.getBounds();
  if (!bounds) return null;
  return { change, bounds, artboardId: builder.getArtboardId(), counts: builder.getCounts(), outline: builder.describe() };
}
