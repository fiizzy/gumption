"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faChevronLeft,
  faChevronRight,
  faFileAlt,
} from "@fortawesome/free-solid-svg-icons";
import NewProjectModal from "./NewProjectModal";
import HarnessSwitcher from "./HarnessSwitcher";
import type { Harness } from "../types";
import { cn } from "../lib/cn";

export const SIDEBAR_EXPANDED_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 48;

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
  harness: Harness;
  onHarnessChange: (harness: Harness) => void;
}

export default function ProjectsSidebar({
  isCollapsed,
  onToggleCollapsed,
  harness,
  onHarnessChange,
}: Props) {
  const [projects, setProjects] = useState<Project[]>(INITIAL_DUMMY_PROJECTS);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );

  const handleCreateProject = (title: string) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      title,
      updatedAt: "Just now",
    };
    setProjects((previous) => [newProject, ...previous]);
    setSelectedProjectId(newProject.id);
  };

  return (
    <>
      <div
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
            title={
              isCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
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

        {/* Divider */}
        <div className="h-px bg-border mx-2" />

        {/* Projects list */}
        <div className="cc-scroll overflow-y-auto flex-1 py-2">
          <div className={cn("flex flex-col gap-0.5", isCollapsed ? "px-1.5" : "px-2")}>
            {projects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  title={isCollapsed ? project.title : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md text-left",
                    "transition-colors duration-150 cursor-pointer bg-transparent border-none",
                    isCollapsed
                      ? "w-9 h-9 justify-center mx-auto"
                      : "w-full px-2 py-1.5",
                    isSelected
                      ? "bg-surface-subtle text-foreground"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface-subtle"
                  )}
                >
                  <FontAwesomeIcon
                    icon={faFileAlt}
                    className={cn(
                      "w-3.5 h-3.5 shrink-0",
                      isSelected ? "text-accent" : "opacity-60"
                    )}
                  />
                  {!isCollapsed && (
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate">{project.title}</span>
                      <span className="text-[11px] text-foreground-subtle truncate">
                        {project.updatedAt}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Harness selector — dummy UI; only Claude is actually wired up */}
        <div
          className={cn(
            "shrink-0 border-t border-border py-2 flex",
            isCollapsed ? "justify-center px-1.5" : "justify-start px-2",
          )}
        >
          <HarnessSwitcher harness={harness} onChange={onHarnessChange} compact={isCollapsed} />
        </div>
      </div>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={handleCreateProject}
      />
    </>
  );
}
