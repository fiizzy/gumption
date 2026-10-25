"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faCheck, faChevronLeft, faChevronRight, faComment, faFolder, faPen, faStop, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { ChatMessage } from "../lib/chat";
import type { DiagramSessionStatus } from "../lib/useDiagramSession";
import type { DiagramCounts } from "../lib/diagram/builder";
import type { ProjectSummary } from "../lib/projectStore";
import { describeMissing, describeOutdated, type AgentFailure, type ClaudeCodeStatus } from "../lib/claudeCode";
import { MODEL_OPTIONS, type ModelChoice } from "../lib/modelPreference";
import { KIND_OPTIONS, type DiagramKindChoice } from "../lib/kindPreference";
import { cn } from "../lib/cn";
import ActivitySpinner from "./ActivitySpinner";
import Dropdown from "./Dropdown";
import FailureNotice, { DismissButton, TextButton } from "./FailureNotice";
import ProjectMenu from "./ProjectMenu";

export const CHAT_PANEL_WIDTH = 320;
export const CHAT_PANEL_COLLAPSED_WIDTH = 48;

const COMPOSER_MAX_HEIGHT = 132;
const CODEBASE_SUGGESTIONS = ["Architecture overview", "How does a request flow through the app?", "What talks to the database?"];
const FREEFORM_SUGGESTIONS = ["A square connected to a circle", "Sign-in flow with a password reset branch", "Client, API and database"];

interface Props {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (title: string, workingFolder: string | null) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onChangeWorkingFolder: (projectId: string, workingFolder: string | null) => void;
  onDeleteProject: (projectId: string) => void;
  messages: ChatMessage[];
  status: DiagramSessionStatus;
  draft: string;
  onDraftChange: (draft: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onUndoResult: () => void;
  onRetry: () => void;
  onDismissStatus: () => void;
  claudeCode: ClaudeCodeStatus;
  onRecheckClaudeCode: () => void;
  model: ModelChoice;
  onModelChange: (model: ModelChoice) => void;
  kind: DiagramKindChoice;
  onKindChange: (kind: DiagramKindChoice) => void;
  // The drawing the next message changes (its artboard is selected), or
  // null when the next message draws something new.
  editTargetName: string | null;
  onClearEditTarget: () => void;
  onShowArtboard: (artboardId: string) => void;
  onEditArtboard: (artboardId: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function formatCounts({ shapes, connectors }: DiagramCounts): string {
  return `${shapes} shape${shapes === 1 ? "" : "s"}, ${connectors} connection${connectors === 1 ? "" : "s"}`;
}

// Something to fix before the first drawing: told up front, where the
// typing happens, instead of after a request has already failed.
function readinessNotice(claudeCode: ClaudeCodeStatus): AgentFailure | null {
  if (claudeCode.kind === "missing") return describeMissing();
  if (claudeCode.kind === "outdated") return describeOutdated(claudeCode.version, claudeCode.minimumVersion, claudeCode.installKind);
  return null;
}

// The conversation beside the canvas. The person types here, the agent's
// few words land here, and each drawing it makes is noted here; the
// drawing itself goes on the canvas.
export default function ChatPanel({
  isCollapsed,
  onToggleCollapsed,
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onChangeWorkingFolder,
  onDeleteProject,
  messages,
  status,
  draft,
  onDraftChange,
  onSubmit,
  onStop,
  onUndoResult,
  onRetry,
  onDismissStatus,
  claudeCode,
  onRecheckClaudeCode,
  model,
  onModelChange,
  kind,
  onKindChange,
  editTargetName,
  onClearEditTarget,
  onShowArtboard,
  onEditArtboard,
  inputRef,
}: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  const isWorking = status.phase === "working";
  const canSubmit = draft.trim() !== "" && !isWorking;
  const readiness = readinessNotice(claudeCode);
  const codebaseFolder = currentProject?.workingFolder ?? null;
  const suggestions = codebaseFolder ? CODEBASE_SUGGESTIONS : FREEFORM_SUGGESTIONS;

  // New words and drawings keep the latest exchange in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status]);

  // The box grows with the draft up to a few lines, then scrolls.
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(COMPOSER_MAX_HEIGHT, textarea.scrollHeight)}px`;
  }, [draft, inputRef]);

  const applySuggestion = (suggestion: string) => {
    onDraftChange(suggestion);
    inputRef.current?.focus();
  };

  return (
    <aside
      aria-label="Chat"
      style={{ width: isCollapsed ? CHAT_PANEL_COLLAPSED_WIDTH : CHAT_PANEL_WIDTH }}
      className="fixed left-0 top-0 h-full z-[900] flex flex-col border-r border-border bg-surface-raised font-sans transition-[width] duration-200 ease-in-out"
    >
      <div className={cn("flex items-center shrink-0 h-12 border-b border-border gap-1", isCollapsed ? "justify-center px-2" : "pl-2 pr-3")}>
        {!isCollapsed && (
          <ProjectMenu
            projects={projects}
            currentProject={currentProject}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
            onRenameProject={onRenameProject}
            onChangeWorkingFolder={onChangeWorkingFolder}
            onDeleteProject={onDeleteProject}
          />
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={isCollapsed ? "Show chat" : "Hide chat"}
          aria-label={isCollapsed ? "Show chat" : "Hide chat"}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-colors"
        >
          <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronLeft} className="w-3 h-3" />
        </button>
      </div>

      {isCollapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Show chat"
          className="mt-2 mx-auto w-9 h-9 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
        >
          <FontAwesomeIcon icon={faComment} className="w-3.5 h-3.5" />
        </button>
      ) : (
        <>
          <div ref={logRef} role="log" aria-label="Conversation" aria-live="polite" className="cc-scroll flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {messages.length === 0 && status.phase === "idle" ? (
              <div className="flex flex-col gap-3 pt-2">
                <p className="text-[13px] leading-5 text-foreground-muted">
                  {codebaseFolder
                    ? "Ask how something in this codebase works. The answer is drawn on the canvas, with a few words here."
                    : "Describe a system or a flow. The answer is drawn on the canvas, with a few words here."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className="h-7 px-3 rounded-full text-[12px] bg-surface border border-border text-foreground-muted cursor-pointer hover:text-foreground hover:border-foreground-muted transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((message, index) => (
                  <MessageView
                    key={message.id}
                    message={message}
                    onShowArtboard={onShowArtboard}
                    onEditArtboard={onEditArtboard}
                    resultActions={
                      index === messages.length - 1 && message.role === "assistant" && (status.phase === "done" || status.phase === "stopped") ? (
                        <div className="flex items-center gap-1 -ml-2">
                          <TextButton onClick={onUndoResult}>Undo</TextButton>
                          <DismissButton onClick={onDismissStatus} />
                        </div>
                      ) : null
                    }
                  />
                ))}
                {status.phase === "working" && <PendingReply text={status.text} activity={status.activity} counts={status.counts} />}
                {status.phase === "failed" && (
                  <div role="alert" className="flex flex-col gap-2">
                    {status.text && <AssistantText text={status.text} />}
                    <FailureNotice failure={status.failure} retryLabel="Try again" onRetry={onRetry} onDismiss={onDismissStatus} showDetails />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border p-3 flex flex-col gap-3">
            {readiness && (
              <div role="status">
                <FailureNotice failure={readiness} retryLabel="Check again" onRetry={onRecheckClaudeCode} />
              </div>
            )}
            <div className="flex flex-col rounded-xl border border-border bg-surface-overlay transition-colors duration-150 focus-within:border-accent">
              {editTargetName && (
                <div role="status" className="flex items-center gap-2 pl-3 pr-1.5 pt-1.5 text-[12px] leading-5 text-foreground-muted">
                  <FontAwesomeIcon icon={faPen} className="w-2.5 h-2.5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 truncate">
                    Changing <span className="text-foreground">{editTargetName}</span>
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={onClearEditTarget}
                    aria-label="Draw something new instead"
                    title="Draw something new instead"
                    className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-foreground-muted hover:text-foreground hover:bg-surface-subtle transition-colors"
                  >
                    <FontAwesomeIcon icon={faXmark} className="w-3 h-3" aria-hidden />
                  </button>
                </div>
              )}
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (canSubmit) onSubmit();
                  }
                  if (event.key === "Escape") event.currentTarget.blur();
                }}
                aria-label="Message"
                placeholder={
                  editTargetName
                    ? `Describe a change to ${editTargetName}…`
                    : codebaseFolder
                      ? "Ask about this codebase, or describe a diagram…"
                      : "Describe a diagram to draw…"
                }
                className="cc-scroll w-full resize-none bg-transparent border-none outline-none px-3 pt-2.5 pb-1 text-[13px] leading-5 text-foreground placeholder:text-foreground-muted"
              />
              <div className="flex items-center gap-1.5 pl-2 pr-1.5 pb-1.5">
                {codebaseFolder && (
                  <span
                    title={codebaseFolder}
                    className="flex items-center gap-1.5 max-w-[120px] px-2 h-7 rounded-md bg-surface-subtle text-[11.5px] text-foreground-muted select-none"
                  >
                    <FontAwesomeIcon icon={faFolder} className="w-3 h-3 shrink-0" aria-hidden />
                    <span className="truncate">{folderName(codebaseFolder)}</span>
                  </span>
                )}
                <span className="flex-1" />
                <Dropdown
                  label="Diagram"
                  value={kind}
                  options={[...KIND_OPTIONS]}
                  onChange={onKindChange}
                  opensUpward
                  align="start"
                  buttonClassName="h-7 px-2 rounded-md bg-transparent border-transparent text-[11.5px] font-semibold text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
                />
                <Dropdown
                  label="Model"
                  value={model}
                  options={[...MODEL_OPTIONS]}
                  onChange={onModelChange}
                  opensUpward
                  buttonClassName="h-7 px-2 rounded-md bg-transparent border-transparent text-[11.5px] font-semibold text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
                />
                {isWorking ? (
                  <button
                    type="button"
                    onClick={onStop}
                    aria-label="Stop"
                    title="Stop"
                    className="w-7 h-7 flex items-center justify-center rounded-full border-none cursor-pointer bg-surface-subtle text-foreground hover:bg-border transition-colors"
                  >
                    <FontAwesomeIcon icon={faStop} className="w-3 h-3" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!canSubmit}
                    aria-label="Send"
                    title="Send"
                    className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-full border-none transition-colors",
                      canSubmit ? "bg-accent text-white hover:bg-accent-hover cursor-pointer" : "bg-surface-subtle text-foreground-muted cursor-default",
                    )}
                  >
                    <FontAwesomeIcon icon={faArrowUp} className="w-3 h-3" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function MessageView({
  message,
  resultActions,
  onShowArtboard,
  onEditArtboard,
}: {
  message: ChatMessage;
  resultActions: React.ReactNode;
  onShowArtboard: (artboardId: string) => void;
  onEditArtboard: (artboardId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-surface-subtle px-3 py-2 text-[13px] leading-5 text-foreground whitespace-pre-wrap break-words">
          {message.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {message.text && <AssistantText text={message.text} />}
      {message.diagram && <DiagramCard diagram={message.diagram} onShowArtboard={onShowArtboard} onEditArtboard={onEditArtboard} />}
      {resultActions}
    </div>
  );
}

function AssistantText({ text }: { text: string }) {
  return <p className="text-[13px] leading-5 text-foreground whitespace-pre-wrap break-words">{text}</p>;
}

function DiagramCard({
  diagram,
  onShowArtboard,
  onEditArtboard,
}: {
  diagram: NonNullable<ChatMessage["diagram"]>;
  onShowArtboard: (artboardId: string) => void;
  onEditArtboard: (artboardId: string) => void;
}) {
  const extras = [formatCounts(diagram.counts), diagram.skippedCount > 0 && `${diagram.skippedCount} step${diagram.skippedCount === 1 ? "" : "s"} skipped`]
    .filter(Boolean)
    .join(" · ");
  const artboardId = diagram.isUndone ? null : diagram.artboardId;
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn("flex items-start gap-2 text-[12px] leading-5 text-foreground-muted", diagram.isUndone && "line-through opacity-70")}>
      <FontAwesomeIcon icon={faCheck} className="w-3 h-3 mt-1 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="text-foreground">{diagram.wasStopped ? "Stopped." : diagram.summary}</span>
        {diagram.wasStopped && " Kept what was drawn so far"} · {extras}
        {diagram.isUndone && " · undone"}
      </span>
      </div>
      {artboardId && (
        <div className="flex items-center gap-1 pl-3">
          <TextButton onClick={() => onShowArtboard(artboardId)}>Show</TextButton>
          <TextButton onClick={() => onEditArtboard(artboardId)}>Change</TextButton>
        </div>
      )}
    </div>
  );
}

function PendingReply({ text, activity, counts }: { text: string; activity: string; counts: DiagramCounts }) {
  return (
    <div className="flex flex-col gap-1.5">
      {text && <AssistantText text={text} />}
      <div className="flex items-start gap-2 text-[12px] leading-5 text-foreground-muted">
        <ActivitySpinner className="leading-5" />
        <span className="min-w-0 truncate">
          <span className="text-foreground">{activity}…</span>
          {counts.shapes > 0 && ` · ${formatCounts(counts)}`}
        </span>
      </div>
    </div>
  );
}
