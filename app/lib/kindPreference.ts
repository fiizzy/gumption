import { DIAGRAM_KINDS, type DiagramKind } from "./diagram/kinds";

// Which kind of diagram the agent draws. "auto" leaves it to the agent,
// which reads it from the request; a pinned kind is written into the
// system prompt and overrides what the request would suggest.
export type DiagramKindChoice = "auto" | DiagramKind;

export const KIND_OPTIONS: readonly { value: DiagramKindChoice; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Whatever fits the request" },
  ...DIAGRAM_KINDS.map((kind) => ({ value: kind.id, label: kind.label, description: kind.pickerHint })),
];

const KIND_STORAGE_KEY = "canvas-chat:diagram-kind";
const DEFAULT_KIND_CHOICE: DiagramKindChoice = "auto";

export function readStoredKindChoice(): DiagramKindChoice {
  try {
    const stored = window.localStorage.getItem(KIND_STORAGE_KEY);
    return KIND_OPTIONS.some((option) => option.value === stored) ? (stored as DiagramKindChoice) : DEFAULT_KIND_CHOICE;
  } catch {
    return DEFAULT_KIND_CHOICE;
  }
}

export function writeStoredKindChoice(choice: DiagramKindChoice): void {
  try {
    window.localStorage.setItem(KIND_STORAGE_KEY, choice);
  } catch {
    // A convenience; nothing to do if storage is unavailable.
  }
}

// The kind to pin in the prompt, or null to let the agent choose.
export function chosenKindFor(choice: DiagramKindChoice): DiagramKind | null {
  return choice === "auto" ? null : choice;
}
