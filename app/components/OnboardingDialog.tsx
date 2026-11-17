"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCheck, faComment, faDesktop, faFolder, faPen } from "@fortawesome/free-solid-svg-icons";
import { describeBroken, describeMissing, describeOutdated, type AgentFailure, type ClaudeCodeStatus } from "../lib/claudeCode";
import { cn } from "../lib/cn";
import ActivitySpinner from "./ActivitySpinner";
import FailureNotice from "./FailureNotice";
import OnboardingSketch, { type SketchScene } from "./OnboardingSketch";

// The welcome tour: three short steps on first launch, and again from the
// menu. It ends by connecting Claude Code, or by going in without it.

const DIALOG_WIDTH = 600;
const PICTURE_HEIGHT = 200;
// Steps keep one height so the footer never jumps between them.
const BODY_MIN_HEIGHT = 212;
const TITLE_ID = "onboarding-title";

interface Capability {
  icon: IconDefinition;
  title: string;
  text: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: faComment,
    title: "Describe a diagram",
    text: "Flows, swimlanes, architecture layers, sequences, site maps, mind maps, mockups. Say what it should show; the layout is handled.",
  },
  {
    icon: faFolder,
    title: "Ask about a codebase",
    text: "Connect a folder to a project. Claude reads and searches it, never changes it, and draws what it finds.",
  },
  {
    icon: faPen,
    title: "Change it, or draw by hand",
    text: "Select a drawing and your next message changes it in place. Or pick up the tools: R for a rectangle, A for an arrow, T for text.",
  },
];

interface Step {
  scene: SketchScene;
  title: string;
}

const STEPS: Step[] = [
  { scene: "answer", title: "Describe it. Watch it get sketched." },
  { scene: "codebase", title: "Three ways to use it" },
  { scene: "connect", title: "Connect Claude Code" },
];
const LAST_STEP = STEPS.length - 1;

const PRIMARY_BUTTON_CLASS = "h-8 px-3.5 rounded-md text-[13px] font-semibold bg-accent text-white border-none cursor-pointer hover:bg-accent-hover transition-colors";
const SECONDARY_BUTTON_CLASS =
  "h-8 px-3.5 rounded-md text-[13px] font-medium bg-surface-subtle border border-border text-foreground cursor-pointer hover:border-accent transition-colors";
const TEXT_BUTTON_CLASS = "h-8 px-2.5 rounded-md text-[13px] font-medium bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-colors";

interface Props {
  isOpen: boolean;
  claudeCode: ClaudeCodeStatus;
  onRecheckClaudeCode: () => void;
  // Leaves the tour, whether or not Claude Code is connected.
  onClose: () => void;
  // Leaves the tour with a finished drawing on the canvas to look around.
  onExploreSample: () => void;
}

function readinessFailure(claudeCode: ClaudeCodeStatus): AgentFailure | null {
  if (claudeCode.kind === "missing") return describeMissing();
  if (claudeCode.kind === "broken") return describeBroken(claudeCode.path);
  if (claudeCode.kind === "outdated") return describeOutdated(claudeCode.version, claudeCode.minimumVersion, claudeCode.installKind);
  return null;
}

export default function OnboardingDialog({ isOpen, claudeCode, onRecheckClaudeCode, onClose, onExploreSample }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setStepIndex((index) => Math.min(LAST_STEP, index + 1));
      if (event.key === "ArrowLeft") setStepIndex((index) => Math.max(0, index - 1));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === LAST_STEP;
  const isConnected = claudeCode.kind === "ready";
  const finishLabel = isConnected ? "Start drawing" : claudeCode.kind === "unknown" ? "Open the whiteboard" : "Connect later";

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-8"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="w-full flex flex-col overflow-hidden rounded-2xl bg-surface-overlay border border-border font-sans animate-node-in"
        style={{ maxWidth: DIALOG_WIDTH }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 px-10 py-3 bg-surface border-b border-border" style={{ height: PICTURE_HEIGHT }}>
          <OnboardingSketch key={step.scene} scene={step.scene} />
        </div>

        <div className="px-7 pt-6 pb-2 flex flex-col gap-3" style={{ minHeight: BODY_MIN_HEIGHT }}>
          <h2 id={TITLE_ID} className="text-xl font-semibold text-foreground tracking-tight">
            {step.title}
          </h2>
          {stepIndex === 0 && <WelcomeBody />}
          {stepIndex === 1 && <CapabilitiesBody />}
          {stepIndex === 2 && <ConnectBody claudeCode={claudeCode} onRecheckClaudeCode={onRecheckClaudeCode} />}
        </div>

        <div className="flex items-center gap-1.5 px-7 pt-3 pb-6">
          <StepDots count={STEPS.length} current={stepIndex} onPick={setStepIndex} />
          <span className="flex-1" />
          {stepIndex > 0 && (
            <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className={TEXT_BUTTON_CLASS}>
              Back
            </button>
          )}
          {!isLastStep && (
            <button type="button" onClick={onClose} className={TEXT_BUTTON_CLASS}>
              Skip
            </button>
          )}
          {isLastStep && !isConnected && (
            <button type="button" onClick={onExploreSample} className={SECONDARY_BUTTON_CLASS}>
              Explore with a sample
            </button>
          )}
          {isLastStep ? (
            <button type="button" autoFocus onClick={onClose} className={PRIMARY_BUTTON_CLASS}>
              {finishLabel}
            </button>
          ) : (
            <button type="button" autoFocus onClick={() => setStepIndex(stepIndex + 1)} className={PRIMARY_BUTTON_CLASS}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeBody() {
  return (
    <p className="text-[13px] leading-6 text-foreground-muted">
      Gumption is a whiteboard with an agent on it. Ask for a flow, a system, or how a codebase works, and it is sketched here in a hand-drawn style
      while you watch, shape by shape. Everything it draws is still yours to move, restyle and annotate.
    </p>
  );
}

function CapabilitiesBody() {
  return (
    <ul className="flex flex-col gap-3.5 list-none">
      {CAPABILITIES.map((capability) => (
        <li key={capability.title} className="flex items-start gap-3">
          <span className="shrink-0 w-8 h-8 mt-0.5 flex items-center justify-center rounded-lg bg-surface-subtle text-foreground-muted">
            <FontAwesomeIcon icon={capability.icon} className="w-3.5 h-3.5" aria-hidden />
          </span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[13px] font-semibold text-foreground">{capability.title}</span>
            <span className="text-[12.5px] leading-5 text-foreground-muted">{capability.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ConnectBody({ claudeCode, onRecheckClaudeCode }: { claudeCode: ClaudeCodeStatus; onRecheckClaudeCode: () => void }) {
  return (
    <>
      <p className="text-[13px] leading-6 text-foreground-muted">
        The whiteboard draws with the Claude Code command-line tool on this computer, through your own sign-in. A copy from the VS Code extension or the
        native installer is picked up on its own. Nothing leaves this machine except the requests Claude Code itself makes.
      </p>
      <div role="status" className="rounded-xl border border-border bg-surface px-4 py-3.5">
        <ConnectionStatus claudeCode={claudeCode} onRecheckClaudeCode={onRecheckClaudeCode} />
      </div>
    </>
  );
}

function ConnectionStatus({ claudeCode, onRecheckClaudeCode }: { claudeCode: ClaudeCodeStatus; onRecheckClaudeCode: () => void }) {
  if (claudeCode.kind === "checking") {
    return (
      <div className="flex items-center gap-2.5 text-[13px] text-foreground-muted">
        <ActivitySpinner />
        Looking for Claude Code…
      </div>
    );
  }
  if (claudeCode.kind === "ready") {
    return (
      <StatusRow icon={faCheck} iconClassName="bg-accent text-white" title={`Claude Code ${claudeCode.version} is connected.`}>
        Not signed in yet? Run <code className="font-mono text-foreground">claude</code> in a terminal once. The whiteboard uses that sign-in.
      </StatusRow>
    );
  }
  if (claudeCode.kind === "unknown") {
    return (
      <StatusRow icon={faDesktop} iconClassName="bg-surface-subtle text-foreground-muted" title="Claude Code connects in the desktop app.">
        In a browser the canvas works on its own: draw by hand, open and save files.
      </StatusRow>
    );
  }
  const failure = readinessFailure(claudeCode);
  return failure ? <FailureNotice failure={failure} retryLabel="Check again" onRetry={onRecheckClaudeCode} /> : null;
}

function StatusRow({ icon, iconClassName, title, children }: { icon: IconDefinition; iconClassName: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cn("shrink-0 w-6 h-6 mt-px flex items-center justify-center rounded-full", iconClassName)}>
        <FontAwesomeIcon icon={icon} className="w-3 h-3" aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5 min-w-0 text-[12px] leading-5 text-foreground-muted">
        <span className="text-[13px] font-semibold text-foreground">{title}</span>
        <span>{children}</span>
      </div>
    </div>
  );
}

function StepDots({ count, current, onPick }: { count: number; current: number; onPick: (index: number) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour steps">
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === current}
          aria-label={`Step ${index + 1} of ${count}`}
          onClick={() => onPick(index)}
          className="w-5 h-5 flex items-center justify-center bg-transparent border-none cursor-pointer"
        >
          <span className={cn("block w-1.5 h-1.5 rounded-full transition-colors", index === current ? "bg-accent" : "bg-border")} />
        </button>
      ))}
    </div>
  );
}
