import { Command } from "@tauri-apps/plugin-shell";

// Compact system prompt — canvas cards show only a few lines before
// truncating, so verbose multi-paragraph answers just get cut off.
const SYSTEM_PROMPT =
  "You are answering inside a small chat card on a visual canvas app. " +
  "Keep replies concise (2-5 sentences unless the user explicitly asks for " +
  "more detail or a list). Plain prose, no markdown headers.";

interface ClaudeResult {
  is_error: boolean;
  result?: string;
  error?: string;
}

export async function simulateAI(
  prompt: string,
  parentPrompt?: string,
  parentResponse?: string,
): Promise<string> {
  const fullPrompt =
    parentPrompt && parentResponse
      ? `Earlier in this thread:\nQ: ${parentPrompt}\nA: ${parentResponse}\n\nNow the follow-up question:\n${prompt}`
      : prompt;

  const output = await Command.create("claude-code", [
    "-p",
    fullPrompt,
    "--output-format",
    "json",
    "--no-session-persistence",
    "--tools=",
    "--append-system-prompt",
    SYSTEM_PROMPT,
  ]).execute();

  if (output.code !== 0) {
    throw new Error(`claude exited with code ${output.code}: ${output.stderr}`);
  }

  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    throw new Error(`Could not parse claude output: ${output.stdout.slice(0, 200)}`);
  }

  if (parsed.is_error || !parsed.result) {
    throw new Error(parsed.error || "claude returned an error with no message");
  }

  return parsed.result;
}
