import { Command } from "@tauri-apps/plugin-shell";
import type { FileAccess, ResponseStyle } from "../types";

const CHAT_CONTEXT = "You are answering inside a chat card on a visual canvas app.";
const READ_WRITE_CONTEXT =
  "You are answering inside a chat card on a visual canvas app, working in the user's " +
  "project folder. You can read, search and edit files there; shell commands are not " +
  "available. When you change files, end with a short summary of what you changed.";
const READ_ONLY_CONTEXT =
  "You are answering inside a chat card on a visual canvas app, working in the user's " +
  "project folder. You can read and search files there but not change them; shell " +
  "commands are not available. If a change is needed, describe it instead of making it.";

// Concise suits the small card; Detailed is for when the user wants depth.
const RESPONSE_STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  concise:
    "Keep replies concise: 2-5 sentences unless the user explicitly asks for more " +
    "detail or a list. Plain prose, no markdown headers.",
  detailed:
    "Give thorough, well-structured answers: explain the reasoning, cover edge cases " +
    "and trade-offs, and include examples or code where they help. Use markdown " +
    "(short headings, lists, fenced code blocks) to keep it scannable.",
};

// Each mode's argument list must match its scoped command in
// src-tauri/capabilities/claude-{unix,windows}.json exactly (same order,
// same literals).
//
// `claude -p` waits for stdin to close before answering, and the shell
// plugin keeps stdin open with no way to close it, so on macOS and Linux
// Claude runs through sh with stdin redirected from /dev/null.
const STDIN_CLOSING_WRAPPER_ARGUMENTS = ["-c", 'exec claude "$@" </dev/null', "claude"];
const WINDOWS_USER_AGENT_PATTERN = /windows/i;

function stdinClosingWrapper(): string[] {
  return WINDOWS_USER_AGENT_PATTERN.test(navigator.userAgent) ? [] : STDIN_CLOSING_WRAPPER_ARGUMENTS;
}

const STREAM_ARGUMENTS = ["--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence"];
const READ_ONLY_DISALLOWED_TOOLS = "Bash,Edit,Write,NotebookEdit";

interface CommandMode {
  name: string;
  context: string;
  arguments: string[];
}

// Without a folder (or without permission to use it) Claude is a plain chat
// with every tool off — the app's own launch directory is never a safe
// place to act. Edits are auto-accepted in read & edit mode because print
// mode has nobody to approve prompts; the user granted that up front.
function getCommandMode(fileAccess: FileAccess): CommandMode {
  if (fileAccess === "readWrite") {
    return {
      name: "claude-code-agent",
      context: READ_WRITE_CONTEXT,
      arguments: ["--permission-mode", "acceptEdits", "--disallowedTools", "Bash"],
    };
  }
  if (fileAccess === "readOnly") {
    return {
      name: "claude-code-readonly",
      context: READ_ONLY_CONTEXT,
      arguments: ["--disallowedTools", READ_ONLY_DISALLOWED_TOOLS],
    };
  }
  return { name: "claude-code", context: CHAT_CONTEXT, arguments: ["--tools="] };
}

interface StreamEvent {
  type?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    content_block?: { type?: string; name?: string };
  };
  result?: string;
  is_error?: boolean;
  error?: string;
}

export interface AskClaudeOptions {
  prompt: string;
  parentPrompt?: string;
  parentResponse?: string;
  workingFolder: string | null;
  fileAccess: FileAccess;
  responseStyle: ResponseStyle;
  // Called with the whole reply so far each time more text streams in.
  onPartialText: (text: string) => void;
  // Called when Claude starts using a tool (e.g. "Read"), for the activity line.
  onToolUse: (toolName: string) => void;
}

// Runs Claude Code and streams its reply. Resolves with the final reply text.
export function askClaude({
  prompt,
  parentPrompt,
  parentResponse,
  workingFolder,
  fileAccess,
  responseStyle,
  onPartialText,
  onToolUse,
}: AskClaudeOptions): Promise<string> {
  const fullPrompt =
    parentPrompt && parentResponse
      ? `Earlier in this thread:\nQ: ${parentPrompt}\nA: ${parentResponse}\n\nNow the follow-up question:\n${prompt}`
      : prompt;
  const mode = getCommandMode(workingFolder ? fileAccess : "none");

  // TODO(harness-switcher): dispatch on the selected harness (see
  // HarnessSwitcher.tsx / CanvasChatInner's selectedHarness state) once a
  // second harness (e.g. Codex) is actually wired up.
  const command = Command.create(
    mode.name,
    [...stdinClosingWrapper(), "-p", fullPrompt, ...STREAM_ARGUMENTS, ...mode.arguments, "--append-system-prompt", `${mode.context} ${RESPONSE_STYLE_INSTRUCTIONS[responseStyle]}`],
    workingFolder && mode.name !== "claude-code" ? { cwd: workingFolder } : undefined,
  );

  return new Promise((resolve, reject) => {
    let pendingOutput = "";
    let streamedText = "";
    let finalEvent: StreamEvent | null = null;
    let stderr = "";

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
      // A new assistant message after a tool call: keep earlier text, separated.
      if (event.type === "message_start" && streamedText) streamedText += "\n\n";
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && event.content_block.name) {
        onToolUse(event.content_block.name);
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        streamedText += event.delta.text;
        onPartialText(streamedText);
      }
    };

    // Tauri delivers stdout in chunks that are usually — not always — whole
    // lines, so buffer and split on newlines ourselves.
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
      const result = finalEvent as StreamEvent | null;
      if (result && !result.is_error && result.result) {
        resolve(result.result);
        return;
      }
      if (result?.is_error) {
        reject(new Error(result.error || result.result || "claude returned an error with no message"));
        return;
      }
      if (code === 0 && streamedText) {
        resolve(streamedText);
        return;
      }
      reject(new Error(`claude exited with code ${code}: ${stderr.trim() || "no output"}`));
    });

    command.spawn().catch(reject);
  });
}
