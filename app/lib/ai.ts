import { Command } from "@tauri-apps/plugin-shell";

// Compact system prompt — canvas cards show only a few lines before
// truncating, so verbose multi-paragraph answers just get cut off.
const CHAT_SYSTEM_PROMPT =
  "You are answering inside a small chat card on a visual canvas app. " +
  "Keep replies concise (2-5 sentences unless the user explicitly asks for " +
  "more detail or a list). Plain prose, no markdown headers.";

const AGENT_SYSTEM_PROMPT =
  "You are answering inside a small chat card on a visual canvas app, working in " +
  "the user's project folder. You can read, search and edit files there; shell " +
  "commands are not available. When you change files, finish with a short summary " +
  "of what you changed. Keep replies concise (2-5 sentences unless the user asks " +
  "for more). Plain prose, no markdown headers.";

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
function buildCommand(fullPrompt: string, workingFolder: string | null | undefined) {
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
        AGENT_SYSTEM_PROMPT,
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
    CHAT_SYSTEM_PROMPT,
  ]);
}

export async function simulateAI(
  prompt: string,
  parentPrompt?: string,
  parentResponse?: string,
  workingFolder?: string | null,
): Promise<string> {
  const fullPrompt =
    parentPrompt && parentResponse
      ? `Earlier in this thread:\nQ: ${parentPrompt}\nA: ${parentResponse}\n\nNow the follow-up question:\n${prompt}`
      : prompt;

  // TODO(harness-switcher): dispatch on the selected harness (see
  // HarnessSwitcher.tsx / CanvasChatInner's selectedHarness state) once a
  // second harness (e.g. Codex) is actually wired up — today this always
  // shells out to Claude Code regardless of the toolbox's harness selector.
  const output = await buildCommand(fullPrompt, workingFolder).execute();

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
