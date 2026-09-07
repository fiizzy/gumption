"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { TOOLBAR_H } from "./Toolbar";
import NewProjectPopover from "./NewProjectPopover";
import { cn } from "../lib/cn";

const SIDEBAR_EXPANDED_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_TOP_OFFSET = 16;
const SIDEBAR_LEFT_OFFSET = 16;

interface Project {
  id: string;
  title: string;
  updatedAt: string;
}

const INITIAL_DUMMY_PROJECTS: Project[] = [
  { id: "1", title: "Marketing site rewrite", updatedAt: "2 hours ago" },
  { id: "2", title: "Research notes", updatedAt: "Yesterday" },
  { id: "3", title: "Untitled project", updatedAt: "3 days ago" },
];

interface Props {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function ProjectsSidebar({ isCollapsed, onToggleCollapsed }: Props) {
  const [projects, setProjects] = useState<Project[]>(INITIAL_DUMMY_PROJECTS);
  const [isNewProjectPopoverOpen, setIsNewProjectPopoverOpen] = useState(false);

  const handleCreateProject = (title: string) => {
    const newProject: Project = { id: crypto.randomUUID(), title, updatedAt: "Just now" };
    setProjects((prev) => [newProject, ...prev]);
    setIsNewProjectPopoverOpen(false);
  };

  // Opening "New project" from the collapsed rail expands the sidebar first —
  // there's no sane width to anchor the popover against otherwise.
  const handleNewProjectClick = () => {
    if (isCollapsed) onToggleCollapsed();
    setIsNewProjectPopoverOpen((open) => !open);
  };

  return (
    <div
      style={{
        top: TOOLBAR_H + SIDEBAR_TOP_OFFSET,
        left: SIDEBAR_LEFT_OFFSET,
        width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        maxHeight: `calc(100vh - ${TOOLBAR_H + SIDEBAR_TOP_OFFSET * 2}px)`,
      }}
      className="fixed z-[900] flex flex-col rounded-2xl border border-border
                 bg-surface-raised shadow-card font-sans transition-[width] duration-200 ease-in-out overflow-hidden"
    >
      <div
        className={cn(
          "flex items-center border-b border-border shrink-0 py-3",
          isCollapsed ? "justify-center px-1" : "justify-between px-4",
        )}
      >
        {!isCollapsed && <span className="text-sm font-semibold text-foreground">Projects</span>}
        <button
          onClick={onToggleCollapsed}
          title={isCollapsed ? "Expand projects sidebar" : "Collapse projects sidebar"}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     bg-transparent border-none cursor-pointer text-foreground-muted p-0.5"
        >
          <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronLeft} className="w-3 h-3" />
        </button>
      </div>

      <div className={cn("relative pt-2 shrink-0", isCollapsed ? "px-1" : "px-2")}>
        <button
          onClick={handleNewProjectClick}
          title="New project"
          className={cn(
            "flex items-center gap-2 rounded-lg text-sm font-medium",
            "border border-border bg-surface-subtle text-foreground hover:bg-surface",
            "transition-colors duration-150 cursor-pointer",
            isCollapsed ? "w-9 h-9 justify-center mx-auto" : "w-full px-2.5 py-1.5",
          )}
        >
          <FontAwesomeIcon icon={faPlus} className="w-3 h-3 text-accent shrink-0" />
          {!isCollapsed && "New project"}
        </button>

        {isNewProjectPopoverOpen && !isCollapsed && (
          <NewProjectPopover
            onCancel={() => setIsNewProjectPopoverOpen(false)}
            onCreate={handleCreateProject}
          />
        )}
      </div>

      {!isCollapsed && (
        <div className="cc-scroll overflow-y-auto flex-1 px-2 py-2 flex flex-col gap-0.5">
          {projects.map((project) => (
            <button
              key={project.id}
              className="flex flex-col items-start gap-0.5 px-2.5 py-1.5 rounded-lg text-left
                         hover:bg-surface-subtle transition-colors duration-150 cursor-pointer"
            >
              <span className="text-sm text-foreground truncate w-full">{project.title}</span>
              <span className="text-xs text-foreground-subtle">{project.updatedAt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
