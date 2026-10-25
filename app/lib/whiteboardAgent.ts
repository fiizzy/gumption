import { Command, type Child } from "@tauri-apps/plugin-shell";
import type { DiagramKind } from "./diagram/kinds";
import { buildWhiteboardSystemPrompt } from "./diagram/prompt";

// Each mode's argument list must match its scoped command in
// src-tauri/capabilities/claude-{unix,windows}.json exactly (same order,
// same literals).
//
// `claude -p` waits for stdin to close before answering, and the shell
// plugin keeps stdin open with no way to close it, so on macOS and Linux
// Claude runs through sh with stdin redirected from /dev/null.
const STDIN_CLOSING_WRAPPER_ARGUMENTS = ["-c", 'exec claude "$@" </dev/null', "claude"];
const WINDOWS_USER_AGENT_PATTERN = /windows/i;
const STREAM_ARGUMENTS = ["--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence"];

// Without a codebase every tool is off: the app's own launch directory is
// never a safe place to look around. With one, Claude may read and search
// that folder and nothing more.
const NO_CODEBASE_MODE = { name: "whiteboard", arguments: ["--tools="] };
const CODEBASE_MODE = {
  name: "whiteboard-codebase",
  arguments: ["--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch"],
};
const MODEL_COMMAND_SUFFIX = "-model";

function stdinClosingWrapper(): string[] {
  return WINDOWS_USER_AGENT_PATTERN.test(navigator.userAgent) ? [] : STDIN_CLOSING_WRAPPER_ARGUMENTS;
}

interface StreamEvent {
  type?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; partial_json?: string };
    content_block?: { type?: string; name?: string };
  };
  result?: string;
  is_error?: boolean;
  error?: string;
}

export interface ToolActivity {
  toolName: string;
  // The tool's streamed JSON input so far: enough to pull a file path or
  // search pattern out of for the activity line.
  partialInput: string;
}

export interface WhiteboardAgentOptions {
  prompt: string;
  codebaseFolder: string | null;
  // A Claude Code model alias or id, or null for Claude Code's own default.
  model: string | null;
  // A diagram kind the person pinned, or null to let Claude choose.
  kind: DiagramKind | null;
  onTextDelta: (delta: string) => void;
  onToolActivity: (activity: ToolActivity) => void;
}

export interface WhiteboardAgentResult {
  text: string;
  wasCancelled: boolean;
}

export interface WhiteboardAgentRun {
  finished: Promise<WhiteboardAgentResult>;
  cancel: () => Promise<void>;
}

// Runs Claude Code as the whiteboard agent and streams its reply text as it
// arrives. The caller turns the text into drawing operations line by line.
export function runWhiteboardAgent({ prompt, codebaseFolder, model, kind, onTextDelta, onToolActivity }: WhiteboardAgentOptions): WhiteboardAgentRun {
  const mode = codebaseFolder ? CODEBASE_MODE : NO_CODEBASE_MODE;
  // Each scoped command has a twin that also takes --model, since the
  // capability allow-list is positional and cannot express an optional flag.
  const command = Command.create(
    model ? `${mode.name}${MODEL_COMMAND_SUFFIX}` : mode.name,
    [
      ...stdinClosingWrapper(),
      "-p",
      prompt,
      ...STREAM_ARGUMENTS,
      ...mode.arguments,
      ...(model ? ["--model", model] : []),
      "--append-system-prompt",
      buildWhiteboardSystemPrompt(codebaseFolder !== null, kind),
    ],
    codebaseFolder ? { cwd: codebaseFolder } : undefined,
  );

  let child: Child | null = null;
  let wasCancelled = false;

  const finished = new Promise<WhiteboardAgentResult>((resolve, reject) => {
    let pendingOutput = "";
    let streamedText = "";
    let finalEvent: StreamEvent | null = null;
    let stderr = "";
    let currentTool: ToolActivity | null = null;

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      let parsed: StreamEvent;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if (parsed.type === "result") {
        finalEvent = parsed;
        return;
      }
      if (parsed.type !== "stream_event" || !parsed.event) return;
      const { event } = parsed;
      // A new assistant message after a tool call: make sure the previous
      // message's last line is terminated before more text arrives.
      if (event.type === "message_start" && streamedText && !streamedText.endsWith("\n")) {
        streamedText += "\n";
        onTextDelta("\n");
      }
      if (event.type === "content_block_start") {
        currentTool =
          event.content_block?.type === "tool_use" && event.content_block.name
            ? { toolName: event.content_block.name, partialInput: "" }
            : null;
        if (currentTool) onToolActivity(currentTool);
      }
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && currentTool && event.delta.partial_json) {
        currentTool = { ...currentTool, partialInput: currentTool.partialInput + event.delta.partial_json };
        onToolActivity(currentTool);
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        streamedText += event.delta.text;
        onTextDelta(event.delta.text);
      }
    };

    // Tauri delivers stdout in chunks that are usually, not always, whole
    // lines, so buffer and split on newlines here.
    command.stdout.on("data", (chunk: string) => {
      pendingOutput += chunk.endsWith("\n") ? chunk : `${chunk}\n`;
      const lines = pendingOutput.split("\n");
      pendingOutput = lines.pop() ?? "";
      lines.forEach(handleLine);
    });
    command.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    command.on("error", (error: string) => reject(new Error(error)));
    command.on("close", ({ code }: { code: number | null }) => {
      handleLine(pendingOutput);
      if (wasCancelled) {
        resolve({ text: streamedText, wasCancelled: true });
        return;
      }
      const result = finalEvent as StreamEvent | null;
      if (result?.is_error) {
        const message = result.error || result.result || "Claude returned an error with no message";
        console.error("Whiteboard agent failed:", message, stderr.trim());
        reject(new Error(message));
        return;
      }
      if (result?.result || (code === 0 && streamedText)) {
        resolve({ text: streamedText || result?.result || "", wasCancelled: false });
        return;
      }
      reject(new Error(`Claude exited with code ${code}: ${stderr.trim() || "no output"}`));
    });

    command
      .spawn()
      .then((spawned) => {
        child = spawned;
        if (wasCancelled) void spawned.kill();
      })
      .catch(reject);
  });

  return {
    finished,
    cancel: async () => {
      wasCancelled = true;
      await child?.kill();
    },
  };
}
