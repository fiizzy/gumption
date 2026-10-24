import { Command, open as openWithShell } from "@tauri-apps/plugin-shell";

// Everything the app knows about the Claude Code command-line tool it
// draws with: whether it is installed and current, and how to turn a raw
// failure into a title, a plain sentence and a fix someone can act on.

// The oldest Claude Code the current models accept, taken from Claude
// Code's own "version X or newer is required" error. Raise it when that
// error names a newer version.
export const MINIMUM_CLAUDE_CODE_VERSION = "2.1.251";
export const INSTALL_COMMAND = "curl -fsSL https://claude.ai/install.sh | bash";
export const SETUP_GUIDE_URL = "https://docs.anthropic.com/en/docs/claude-code/setup";
const NPM_UPDATE_COMMAND = "npm install -g @anthropic-ai/claude-code@latest";
const NATIVE_UPDATE_COMMAND = "claude update";
const SIGN_IN_COMMAND = "claude";

// The version check must match its entry in src-tauri/capabilities exactly.
const VERSION_COMMAND_NAME = "claude-version";
const UNIX_VERSION_ARGUMENTS = ["-c", "command -v claude && claude --version"];
const WINDOWS_VERSION_ARGUMENTS = ["--version"];
const WINDOWS_USER_AGENT_PATTERN = /windows/i;
const VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)/;
const NPM_INSTALL_PATH_PATTERN = /node_modules/;
const API_ERROR_PATTERN = /API Error: (\d+) (\{[\s\S]*\})/;
const INSTALLED_VERSION_PATTERN = /Claude Code (\d+\.\d+\.\d+)/;
const REQUIRED_VERSION_PATTERN = /version (\d+\.\d+\.\d+) or newer/;
const MISSING_BINARY_PATTERN = /no such file or directory|program not found|not found|os error 2|ENOENT/i;
const AUTHENTICATION_PATTERN = /not logged in|\/login|invalid api key|authentication|unauthorized/i;
const PROMPT_TOO_LONG_PATTERN = /prompt is too long|too many tokens|context window/i;
const NETWORK_PATTERN = /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|getaddrinfo|network|connection error/i;
const RATE_LIMIT_STATUSES = new Set(["429", "529", "503"]);
const RATE_LIMIT_TYPES = new Set(["rate_limit_error", "overloaded_error"]);

export type InstallKind = "npm" | "native" | "unknown";

export type ClaudeCodeStatus =
  // Outside the desktop shell there is nothing to check.
  | { kind: "unknown" }
  | { kind: "checking" }
  | { kind: "ready"; version: string; installKind: InstallKind }
  | { kind: "missing" }
  | { kind: "outdated"; version: string; minimumVersion: string; installKind: InstallKind };

export type FailureAction =
  | { kind: "command"; command: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "retry" };

export interface AgentFailure {
  title: string;
  explanation: string;
  actions: FailureAction[];
  // The complete raw text, for Details and Copy.
  details: string;
}

interface ApiError {
  status: string;
  type: string | null;
  message: string | null;
  code: string | null;
}

export function canCheckClaudeCode(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function compareVersions(first: string, second: string): number {
  const parse = (version: string) => (VERSION_PATTERN.exec(version)?.slice(1) ?? ["0", "0", "0"]).map(Number);
  const [firstParts, secondParts] = [parse(first), parse(second)];
  for (let index = 0; index < 3; index++) {
    if (firstParts[index] !== secondParts[index]) return firstParts[index] - secondParts[index];
  }
  return 0;
}

export function updateCommandFor(installKind: InstallKind): string {
  return installKind === "npm" ? NPM_UPDATE_COMMAND : NATIVE_UPDATE_COMMAND;
}

// Spawned rather than executed so it goes through the same scoped-spawn
// permission the drawing itself uses.
function runToCompletion(command: Command<string>): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: string[] = [];
    command.stdout.on("data", (chunk: string) => stdoutChunks.push(chunk));
    command.on("error", (error: string) => reject(new Error(error)));
    command.on("close", ({ code }: { code: number | null }) => resolve({ code, stdout: stdoutChunks.join("\n") }));
    command.spawn().catch(reject);
  });
}

// Runs `claude --version` (and, on macOS and Linux, finds where it lives,
// which tells an npm install from the native one).
export async function checkClaudeCode(): Promise<ClaudeCodeStatus> {
  if (!canCheckClaudeCode()) return { kind: "unknown" };
  const isWindows = WINDOWS_USER_AGENT_PATTERN.test(navigator.userAgent);
  try {
    const result = await runToCompletion(Command.create(VERSION_COMMAND_NAME, isWindows ? WINDOWS_VERSION_ARGUMENTS : UNIX_VERSION_ARGUMENTS));
    const lines = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const versionLine = lines.find((line) => VERSION_PATTERN.test(line));
    if (result.code !== 0 || !versionLine) return { kind: "missing" };
    const version = VERSION_PATTERN.exec(versionLine)![0];
    const binaryPath = lines.find((line) => line !== versionLine) ?? "";
    const installKind: InstallKind = isWindows ? "unknown" : NPM_INSTALL_PATH_PATTERN.test(binaryPath) ? "npm" : "native";
    if (compareVersions(version, MINIMUM_CLAUDE_CODE_VERSION) < 0) {
      return { kind: "outdated", version, minimumVersion: MINIMUM_CLAUDE_CODE_VERSION, installKind };
    }
    return { kind: "ready", version, installKind };
  } catch {
    return { kind: "missing" };
  }
}

// Opens a link in the person's browser from inside the desktop shell, or
// in a new tab when running as a plain web page.
export async function openExternalLink(url: string): Promise<void> {
  try {
    await openWithShell(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function parseApiError(raw: string): ApiError | null {
  const match = API_ERROR_PATTERN.exec(raw);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[2]) as { error?: { type?: unknown; message?: unknown; details?: { error_code?: unknown } } };
    return {
      status: match[1],
      type: typeof parsed.error?.type === "string" ? parsed.error.type : null,
      message: typeof parsed.error?.message === "string" ? parsed.error.message : null,
      code: typeof parsed.error?.details?.error_code === "string" ? parsed.error.details.error_code : null,
    };
  } catch {
    return null;
  }
}

function installKindFrom(status: ClaudeCodeStatus): InstallKind {
  return status.kind === "ready" || status.kind === "outdated" ? status.installKind : "unknown";
}

export function describeOutdated(version: string, minimumVersion: string, installKind: InstallKind): AgentFailure {
  return {
    title: `Claude Code ${version} needs an update`,
    explanation: `Drawing needs version ${minimumVersion} or newer. Run this in a terminal, then try again.`,
    actions: [{ kind: "command", command: updateCommandFor(installKind) }, { kind: "retry" }],
    details: `Claude Code ${version} is installed; ${minimumVersion} or newer is required.`,
  };
}

export function describeMissing(): AgentFailure {
  return {
    title: "Claude Code isn't installed",
    explanation: "The whiteboard draws with the Claude Code command-line tool. Install it, sign in once by running claude in a terminal, then try again.",
    actions: [{ kind: "command", command: INSTALL_COMMAND }, { kind: "link", label: "Setup guide", url: SETUP_GUIDE_URL }, { kind: "retry" }],
    details: "The claude command was not found on this computer.",
  };
}

// Turns whatever came back from a failed run into something to act on.
// Known failures are matched on error codes and statuses, not wording, so
// they survive Claude Code's copy changes; anything else shows the sentence
// inside the error.
export function describeAgentFailure(raw: string, status: ClaudeCodeStatus): AgentFailure {
  const apiError = parseApiError(raw);
  const message = apiError?.message ?? raw;
  const retry: FailureAction = { kind: "retry" };

  if (apiError?.code === "claude_code_version_too_old" || REQUIRED_VERSION_PATTERN.test(message)) {
    const installed = INSTALLED_VERSION_PATTERN.exec(message)?.[1] ?? (status.kind === "outdated" || status.kind === "ready" ? status.version : "installed");
    const required = REQUIRED_VERSION_PATTERN.exec(message)?.[1] ?? MINIMUM_CLAUDE_CODE_VERSION;
    return { ...describeOutdated(installed, required, installKindFrom(status)), details: raw };
  }
  if (!apiError && MISSING_BINARY_PATTERN.test(raw)) {
    return { ...describeMissing(), details: raw };
  }
  if (apiError?.type === "authentication_error" || apiError?.status === "401" || AUTHENTICATION_PATTERN.test(message)) {
    return {
      title: "Sign in to Claude Code",
      explanation: "Run claude in a terminal once and sign in. The whiteboard uses that sign-in.",
      actions: [{ kind: "command", command: SIGN_IN_COMMAND }, retry],
      details: raw,
    };
  }
  if ((apiError && (RATE_LIMIT_STATUSES.has(apiError.status) || (apiError.type && RATE_LIMIT_TYPES.has(apiError.type)))) || /rate limit|overloaded/i.test(message)) {
    return { title: "Claude is busy right now", explanation: "Wait a moment, then try again.", actions: [retry], details: raw };
  }
  if (PROMPT_TOO_LONG_PATTERN.test(message)) {
    return {
      title: "Too much to read in one go",
      explanation: "Ask about one flow or one folder, or connect a smaller codebase, then try again.",
      actions: [retry],
      details: raw,
    };
  }
  if (!apiError && NETWORK_PATTERN.test(raw)) {
    return { title: "No connection to Claude", explanation: "Check the internet connection, then try again.", actions: [retry], details: raw };
  }
  return { title: "Unable to draw that.", explanation: message, actions: [retry], details: raw };
}
