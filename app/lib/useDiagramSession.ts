"use client";

import { useCallback, useRef, useState } from "react";
import type { ElementStyle, Point } from "../types";
import type { ChatTurn } from "./chat";
import { DiagramBuilder, type DiagramChange, type DiagramCounts } from "./diagram/builder";
import { OperationLineBuffer, parseOperationLine } from "./diagram/operations";
import { buildConversationPrompt } from "./diagram/prompt";
import type { Box } from "./geometry";
import { runWhiteboardAgent, type ToolActivity, type WhiteboardAgentRun } from "./whiteboardAgent";
import { describeAgentFailure, type AgentFailure, type ClaudeCodeStatus } from "./claudeCode";

// `text` is what the agent said in words, growing while it works.
export type DiagramSessionStatus =
  | { phase: "idle" }
  | { phase: "working"; prompt: string; text: string; activity: string; counts: DiagramCounts }
  | { phase: "done"; prompt: string; text: string; summary: string; outline: string; counts: DiagramCounts; skippedCount: number }
  | { phase: "stopped"; prompt: string; text: string; outline: string; counts: DiagramCounts }
  | { phase: "failed"; prompt: string; text: string; failure: AgentFailure };

export interface StartDiagramOptions {
  prompt: string;
  // The conversation before this request, oldest first.
  transcript: ChatTurn[];
  origin: Point;
  style: ElementStyle;
  codebaseFolder: string | null;
  model: string | null;
}

interface Options {
  applyChange: (change: DiagramChange) => void;
  onBoundsChange: (bounds: Box) => void;
  // What the launch-time check found, so a failure can name the right fix.
  getClaudeCodeStatus: () => ClaudeCodeStatus;
}

const INITIAL_ACTIVITY = "Thinking";
const FILE_PATH_PATTERN = /"(?:file_path|path)"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const SEARCH_PATTERN = /"pattern"\s*:\s*"((?:[^"\\]|\\.)*)"/;

const TOOL_VERBS: Record<string, string> = {
  Read: "Reading",
  Glob: "Searching",
  Grep: "Searching",
  LS: "Listing",
  Task: "Exploring",
  TodoWrite: "Planning",
};

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// "Reading checkout.ts" beats "Using Read": the guidelines ask for feedback
// that says what is actually happening.
export function describeToolActivity({ toolName, partialInput }: ToolActivity): string {
  const verb = TOOL_VERBS[toolName] ?? `Using ${toolName}`;
  const filePath = FILE_PATH_PATTERN.exec(partialInput)?.[1];
  if (filePath) return `${verb} ${baseName(filePath)}`;
  const pattern = SEARCH_PATTERN.exec(partialInput)?.[1];
  if (pattern) return `${verb} for “${pattern}”`;
  if (toolName === "Read") return "Reading files";
  if (toolName === "Glob" || toolName === "Grep") return "Searching the code";
  return verb;
}

function summarizeCounts({ shapes, connectors }: DiagramCounts): string {
  const shapeText = `${shapes} shape${shapes === 1 ? "" : "s"}`;
  const connectorText = `${connectors} connection${connectors === 1 ? "" : "s"}`;
  return `${shapeText} and ${connectorText}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// One streamed drawing at a time: starts the agent, applies each operation
// line to the canvas as it lands, shows its words as they arrive, and
// reports where things stand.
export function useDiagramSession({ applyChange, onBoundsChange, getClaudeCodeStatus }: Options) {
  const [status, setStatus] = useState<DiagramSessionStatus>({ phase: "idle" });
  const runRef = useRef<WhiteboardAgentRun | null>(null);
  const optionsRef = useRef({ applyChange, onBoundsChange, getClaudeCodeStatus });
  optionsRef.current = { applyChange, onBoundsChange, getClaudeCodeStatus };

  const start = useCallback(({ prompt, transcript, origin, style, codebaseFolder, model }: StartDiagramOptions) => {
    if (runRef.current) return;
    const builder = new DiagramBuilder(origin, style);
    const buffer = new OperationLineBuffer();
    const spokenLines: string[] = [];
    let skippedCount = 0;
    let doneSummary: string | null = null;
    let sawDone = false;
    let activity = INITIAL_ACTIVITY;

    const text = () => spokenLines.join("\n");
    const setWorking = () => setStatus({ phase: "working", prompt, text: text(), activity, counts: builder.getCounts() });
    setWorking();

    const handleLine = (line: string) => {
      for (const parsed of parseOperationLine(line)) {
        if (parsed.kind === "ignored") {
          if (line.trim()) {
            spokenLines.push(line.trim());
            setWorking();
          }
          continue;
        }
        if (parsed.kind === "invalid") {
          skippedCount += 1;
          continue;
        }
        if (parsed.operation.op === "done") {
          sawDone = true;
          doneSummary = parsed.operation.summary;
          continue;
        }
        const result = builder.apply(parsed.operation);
        if (!result.ok) {
          skippedCount += 1;
          continue;
        }
        const change = builder.materialize();
        if (change.upserted.length > 0 || change.removedIds.length > 0) {
          optionsRef.current.applyChange(change);
          const bounds = builder.getBounds();
          if (bounds) optionsRef.current.onBoundsChange(bounds);
        }
        activity = result.description;
        setWorking();
      }
    };

    const run = runWhiteboardAgent({
      prompt: buildConversationPrompt(transcript, prompt),
      codebaseFolder,
      model,
      onTextDelta: (delta) => buffer.push(delta).forEach(handleLine),
      onToolActivity: (toolActivity) => {
        activity = describeToolActivity(toolActivity);
        setWorking();
      },
    });
    runRef.current = run;

    void run.finished
      .then(({ wasCancelled }) => {
        buffer.flush().forEach(handleLine);
        const counts = builder.getCounts();
        if (wasCancelled) {
          setStatus({ phase: "stopped", prompt, text: text(), outline: builder.describe(), counts });
          return;
        }
        if (counts.shapes === 0) {
          const explanation = doneSummary ?? text();
          const message = explanation || "Nothing came back to draw.";
          setStatus({
            phase: "failed",
            prompt,
            text: text(),
            failure: { title: "Unable to draw that.", explanation: message, actions: [{ kind: "retry" }], details: message },
          });
          return;
        }
        setStatus({
          phase: "done",
          prompt,
          text: text(),
          summary: doneSummary ?? (sawDone ? `Drew ${summarizeCounts(counts)}.` : `Drew ${summarizeCounts(counts)}.`),
          outline: builder.describe(),
          counts,
          skippedCount,
        });
      })
      .catch((error: unknown) => {
        setStatus({
          phase: "failed",
          prompt,
          text: text(),
          failure: describeAgentFailure(errorMessage(error), optionsRef.current.getClaudeCodeStatus()),
        });
      })
      .finally(() => {
        runRef.current = null;
      });
  }, []);

  const stop = useCallback(() => {
    void runRef.current?.cancel();
  }, []);

  const dismiss = useCallback(() => {
    setStatus((current) => (current.phase === "working" ? current : { phase: "idle" }));
  }, []);

  return { status, start, stop, dismiss, isWorking: status.phase === "working" };
}
