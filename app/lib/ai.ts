import { Command } from "@tauri-apps/plugin-shell";
import type { ResponseStyle } from "./useSettings";

const CHAT_CONTEXT = "You are answering inside a chat card on a visual canvas app.";
const AGENT_CONTEXT =
  "You are answering inside a chat card on a visual canvas app, working in the user's " +
  "project folder. You can read, search and edit files there; shell commands are not " +
  "available. When you change files, end with a short summary of what you changed.";

// Concise suits the small card (long answers get cut off behind a scroll);
// Detailed is for when the user wants depth and will expand the card.
const RESPONSE_STYLE_INSTRUCTIONS: Record<ResponseStyle, string> = {
  concise:
    "Keep replies concise: 2-5 sentences unless the user explicitly asks for more " +
    "detail or a list. Plain prose, no markdown headers.",
  detailed:
    "Give thorough, well-structured answers: explain the reasoning, cover edge cases " +
    "and trade-offs, and include examples or code where they help. Use markdown " +
    "(short headings, lists, fenced code blocks) to keep it scannable.",
};

function buildSystemPrompt(context: string, responseStyle: ResponseStyle): string {
  return `${context} ${RESPONSE_STYLE_INSTRUCTIONS[responseStyle]}`;
}

// These argument lists must match the scoped commands in
// src-tauri/capabilities/default.json exactly (same order, same literals).
const CHAT_COMMAND = "claude-code";
const AGENT_COMMAND = "claude-code-agent";
const AGENT_PERMISSION_MODE = "acceptEdits";
const AGENT_DISALLOWED_TOOLS = "Bash";

interface ClaudeResult {
  is_error: boolean;
  result?: string;
  error?: string;
}

// With a project working folder, Claude runs as an agent there: built-in
// tools on, file edits auto-accepted (nobody is around to approve prompts in
// print mode), shell disallowed. Without one there is no folder it could
// safely act in — the app's own launch directory is not the user's project —
// so it stays a plain chat with every tool switched off.
function buildCommand(fullPrompt: string, workingFolder: string | null | undefined, responseStyle: ResponseStyle) {
  if (workingFolder) {
    return Command.create(
      AGENT_COMMAND,
      [
        "-p",
        fullPrompt,
        "--output-format",
        "json",
        "--no-session-persistence",
        "--permission-mode",
        AGENT_PERMISSION_MODE,
        "--disallowedTools",
        AGENT_DISALLOWED_TOOLS,
        "--append-system-prompt",
        buildSystemPrompt(AGENT_CONTEXT, responseStyle),
      ],
      { cwd: workingFolder },
    );
  }
  return Command.create(CHAT_COMMAND, [
    "-p",
    fullPrompt,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--tools=",
    "--append-system-prompt",
    buildSystemPrompt(CHAT_CONTEXT, responseStyle),
  ]);
}

export async function simulateAI(
  prompt: string,
  parentPrompt?: string,
  parentResponse?: string,
  workingFolder?: string | null,
  responseStyle: ResponseStyle = "concise",
): Promise<string> {
  const fullPrompt =
    parentPrompt && parentResponse
      ? `Earlier in this thread:\nQ: ${parentPrompt}\nA: ${parentResponse}\n\nNow the follow-up question:\n${prompt}`
      : prompt;

  // TODO(harness-switcher): dispatch on the selected harness (see
  // HarnessSwitcher.tsx / CanvasChatInner's selectedHarness state) once a
  // second harness (e.g. Codex) is actually wired up — today this always
  // shells out to Claude Code regardless of the toolbox's harness selector.
  const output = await buildCommand(fullPrompt, workingFolder, responseStyle).execute();

  if (output.code !== 0) {
    throw new Error(`claude exited with code ${output.code}: ${output.stderr || output.stdout.slice(0, 200)}`);
  }

  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    throw new Error(`Could not parse claude output: ${output.stdout.slice(0, 200)}`);
  }

  if (parsed.is_error || !parsed.result) {
    throw new Error(parsed.error || parsed.result || "claude returned an error with no message");
  }

  return parsed.result;
}
