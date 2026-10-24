// Which Claude model the whiteboard agent runs on. The values are Claude
// Code's own aliases, which it resolves to the current generation itself,
// so the list never goes stale; "default" leaves the choice to Claude
// Code's settings.
export const MODEL_OPTIONS = [
  { value: "default", label: "Default", description: "Whatever Claude Code is set to" },
  { value: "opus", label: "Opus", description: "Most capable" },
  { value: "sonnet", label: "Sonnet", description: "Fast and capable" },
  { value: "haiku", label: "Haiku", description: "Fastest" },
] as const;

export type ModelChoice = (typeof MODEL_OPTIONS)[number]["value"];

const MODEL_STORAGE_KEY = "canvas-chat:model";
const DEFAULT_MODEL_CHOICE: ModelChoice = "default";

export function readStoredModelChoice(): ModelChoice {
  try {
    const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
    return MODEL_OPTIONS.some((option) => option.value === stored) ? (stored as ModelChoice) : DEFAULT_MODEL_CHOICE;
  } catch {
    return DEFAULT_MODEL_CHOICE;
  }
}

export function writeStoredModelChoice(choice: ModelChoice): void {
  try {
    window.localStorage.setItem(MODEL_STORAGE_KEY, choice);
  } catch {
    // A convenience; nothing to do if storage is unavailable.
  }
}

// The value for Claude Code's --model flag, or null to leave it unset.
export function modelArgumentFor(choice: ModelChoice): string | null {
  return choice === "default" ? null : choice;
}
