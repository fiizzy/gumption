"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faChevronLeft,
  faChevronRight,
  faFileAlt,
  faPen,
  faTrashCan,
  faFolderOpen,
} from "@fortawesome/free-solid-svg-icons";
import NewProjectModal from "./NewProjectModal";
import WorkingFolderModal from "./WorkingFolderModal";
import { canPickDirectory } from "../lib/fileAccess";
import HarnessSwitcher from "./HarnessSwitcher";
import type { FileAccess, Harness } from "../types";
import type { ProjectSummary } from "../lib/projectStore";
import { cn } from "../lib/cn";

export const SIDEBAR_EXPANDED_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 48;

const RELATIVE_TIME_REFRESH_MS = 60_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(timestamp: number, now: number): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE_MS) return "Just now";
  if (elapsed < HOUR_MS) return relativeTimeFormat.format(-Math.round(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return relativeTimeFormat.format(-Math.round(elapsed / HOUR_MS), "hour");
  return relativeTimeFormat.format(-Math.round(elapsed / DAY_MS), "day");
}

interface Props {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  harness: Harness;
  onHarnessChange: (harness: Harness) => void;
  projects: ProjectSummary[];
  currentProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (title: string, workingFolder: string | null) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onChangeWorkingFolder: (projectId: string, workingFolder: string | null) => void;
  onChangeFileAccess: (projectId: string, fileAccess: FileAccess) => void;
  onDeleteProject: (projectId: string) => void;
}

export default function ProjectsSidebar({
  isCollapsed,
  onToggleCollapsed,
  harness,
  onHarnessChange,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onChangeWorkingFolder,
  onChangeFileAccess,
  onDeleteProject,
}: Props) {
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [folderProjectId, setFolderProjectId] = useState<string | null>(null);
  // Folder picking needs the native dialog, so it's desktop-app only.
  const [isFolderPickerAvailable, setIsFolderPickerAvailable] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setIsFolderPickerAvailable(canPickDirectory());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), RELATIVE_TIME_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const sortedProjects = [...projects].sort((first, second) => second.updatedAt - first.updatedAt);

  return (
    <>
      <nav
        aria-label="Projects"
        style={{
          width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        }}
        className="fixed left-0 top-0 h-full z-[900] flex flex-col
                   border-r border-border bg-surface-raised font-sans
                   transition-[width] duration-200 ease-in-out"
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center shrink-0 h-12 border-b border-border",
            isCollapsed ? "justify-center px-2" : "justify-between px-3"
          )}
        >
          {!isCollapsed && (
            <span className="text-sm font-semibold text-foreground">
              Projects
            </span>
          )}
          <button
            onClick={onToggleCollapsed}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md
                       opacity-60 hover:opacity-100 hover:bg-surface-subtle
                       transition-all bg-transparent border-none cursor-pointer text-foreground-muted"
          >
            <FontAwesomeIcon
              icon={isCollapsed ? faChevronRight : faChevronLeft}
              className="w-3 h-3"
            />
          </button>
        </div>

        {/* New project button */}
        <div className={cn("shrink-0 py-2", isCollapsed ? "px-1.5" : "px-2")}>
          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            title="New project"
            className={cn(
              "flex items-center gap-2 rounded-md text-sm font-medium",
              "text-foreground-muted hover:text-foreground hover:bg-surface-subtle",
              "transition-colors duration-150 cursor-pointer bg-transparent border-none",
              isCollapsed
                ? "w-9 h-9 justify-center mx-auto"
                : "w-full px-2 py-1.5"
            )}
          >
            <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5 shrink-0" />
            {!isCollapsed && "New project"}
          </button>
        </div>

        <div className="h-px bg-border mx-2" />

        {/* Projects list */}
        <div className="cc-scroll overflow-y-auto flex-1 py-2">
          <div className={cn("flex flex-col gap-0.5", isCollapsed ? "px-1.5" : "px-2")}>
            {sortedProjects.map((project) => {
              const isSelected = currentProjectId === project.id;
              const isRenaming = renamingProjectId === project.id;
              return (
                <div
                  key={project.id}
                  className={cn(
                    "group/project relative flex items-center rounded-md transition-colors duration-150",
                    isSelected
                      ? "bg-surface-subtle text-foreground"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface-subtle",
                  )}
                >
                  {isRenaming ? (
                    <RenameInput
                      initialTitle={project.title}
                      onCommit={(title) => {
                        setRenamingProjectId(null);
                        if (title && title !== project.title) onRenameProject(project.id, title);
                      }}
                      onCancel={() => setRenamingProjectId(null)}
                    />
                  ) : (
                    <button
                      onClick={() => onSelectProject(project.id)}
                      onDoubleClick={() => !isCollapsed && setRenamingProjectId(project.id)}
                      title={project.title}
                      aria-current={isSelected ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 text-left bg-transparent border-none cursor-pointer text-inherit min-w-0",
                        isCollapsed ? "w-9 h-9 justify-center mx-auto" : cn("flex-1 px-2 py-1.5", isFolderPickerAvailable ? "pr-20" : "pr-14"),
                      )}
                    >
                      <FontAwesomeIcon
                        icon={faFileAlt}
                        className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-accent" : "opacity-60")}
                      />
                      {!isCollapsed && (
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm truncate">{project.title}</span>
                          <span className="text-[11px] text-foreground-muted truncate">
                            {formatRelativeTime(project.updatedAt, now)}
                          </span>
                        </div>
                      )}
                    </button>
                  )}

                  {!isCollapsed && !isRenaming && (
                    <div className="absolute right-1.5 flex items-center gap-0.5 opacity-0 group-hover/project:opacity-100 focus-within:opacity-100 transition-opacity">
                      {isFolderPickerAvailable && (
                        <ItemAction
                          label={project.workingFolder ? `Working folder: ${project.workingFolder}` : `Set working folder for ${project.title}`}
                          onClick={() => setFolderProjectId(project.id)}
                        >
                          <FontAwesomeIcon icon={faFolderOpen} className="w-2.5 h-2.5" />
                        </ItemAction>
                      )}
                      <ItemAction label={`Rename ${project.title}`} onClick={() => setRenamingProjectId(project.id)}>
                        <FontAwesomeIcon icon={faPen} className="w-2.5 h-2.5" />
                      </ItemAction>
                      <ItemAction label={`Delete ${project.title}`} onClick={() => onDeleteProject(project.id)}>
                        <FontAwesomeIcon icon={faTrashCan} className="w-2.5 h-2.5" />
                      </ItemAction>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Harness selector — only Claude is actually wired up */}
        <div
          className={cn(
            "shrink-0 border-t border-border py-2 flex",
            isCollapsed ? "justify-center px-1.5" : "justify-start px-2",
          )}
        >
          <HarnessSwitcher harness={harness} onChange={onHarnessChange} compact={isCollapsed} />
        </div>
      </nav>

      <WorkingFolderModal
        project={projects.find((project) => project.id === folderProjectId) ?? null}
        onClose={() => setFolderProjectId(null)}
        onChange={onChangeWorkingFolder}
        onFileAccessChange={onChangeFileAccess}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={onCreateProject}
      />
    </>
  );
}

function ItemAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-6 h-6 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer
                 text-foreground-muted hover:text-foreground hover:bg-surface"
    >
      {children}
    </button>
  );
}

function RenameInput({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  return (
    <input
      autoFocus
      aria-label="Project title"
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => onCommit(title.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(title.trim());
        if (event.key === "Escape") onCancel();
      }}
      className="flex-1 min-w-0 mx-1 my-1 px-2 py-1 rounded-md text-sm bg-surface border border-accent text-foreground outline-none"
    />
  );
}
