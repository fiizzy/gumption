import type { DiagramCounts } from "./diagram/builder";

// The conversation beside the canvas: what the person asked, what the
// agent said back, and a record of each drawing it made. Saved with the
// project, and the recent part is handed back to the agent so follow-ups
// ("add a cache between those two") make sense to it.
export interface ChatDiagram {
  summary: string;
  counts: DiagramCounts;
  // A plain-text outline of what was drawn, for the agent's context only.
  outline: string;
  skippedCount: number;
  wasStopped: boolean;
  isUndone: boolean;
  // The artboard the drawing is on, so the chat can show it or pick it to
  // change; null for records from before artboards.
  artboardId: string | null;
  // Whether this reply changed an existing drawing rather than adding one.
  wasEdit: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  diagram: ChatDiagram | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  diagramOutline: string | null;
}

const MAX_TEXT_LENGTH = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

export function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string" || (entry.role !== "user" && entry.role !== "assistant")) continue;
    const diagram = isRecord(entry.diagram)
      ? {
          summary: typeof entry.diagram.summary === "string" ? entry.diagram.summary : "",
          counts: {
            shapes: readCount(isRecord(entry.diagram.counts) ? entry.diagram.counts.shapes : 0),
            connectors: readCount(isRecord(entry.diagram.counts) ? entry.diagram.counts.connectors : 0),
          },
          outline: typeof entry.diagram.outline === "string" ? entry.diagram.outline : "",
          skippedCount: readCount(entry.diagram.skippedCount),
          wasStopped: entry.diagram.wasStopped === true,
          isUndone: entry.diagram.isUndone === true,
          artboardId: typeof entry.diagram.artboardId === "string" ? entry.diagram.artboardId : null,
          wasEdit: entry.diagram.wasEdit === true,
        }
      : null;
    messages.push({
      id: entry.id,
      role: entry.role,
      text: typeof entry.text === "string" ? entry.text.slice(0, MAX_TEXT_LENGTH) : "",
      createdAt: typeof entry.createdAt === "number" && Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
      diagram,
    });
  }
  return messages;
}

export function toChatTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((message) => ({
    role: message.role,
    text: message.text,
    diagramOutline: message.diagram && !message.diagram.isUndone ? message.diagram.outline : null,
  }));
}
