"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faFolderOpen, faPen, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import type { ProjectSummary } from "../lib/projectStore";
import { canPickDirectory } from "../lib/fileAccess";
import { cn } from "../lib/cn";
import NewProjectModal from "./NewProjectModal";
import WorkingFolderModal from "./WorkingFolderModal";

interface Props {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (title: string, workingFolder: string | null) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onChangeWorkingFolder: (projectId: string, workingFolder: string | null) => void;
  onDeleteProject: (projectId: string) => void;
}

const MENU_ITEM_CLASS =
  "w-full flex items-center gap-2.5 px-3 h-8 text-left text-[12.5px] bg-transparent border-none cursor-pointer text-foreground hover:bg-surface-subtle";

// The open project's name, and behind it the list of projects to switch
// to plus the few things one can do to a project. Replaces a sidebar: the
// list is only needed for a moment, so it lives in a menu.
export default function ProjectMenu({
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onChangeWorkingFolder,
  onDeleteProject,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  // Folder picking needs the native dialog, so it's desktop-app only.
  const [isFolderPickerAvailable, setIsFolderPickerAvailable] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsFolderPickerAvailable(canPickDirectory());
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const sortedProjects = [...projects].sort((first, second) => second.updatedAt - first.updatedAt);
  const title = currentProject?.title ?? "";

  if (isRenaming && currentProject) {
    return (
      <input
        autoFocus
        aria-label="Project title"
        defaultValue={currentProject.title}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim();
          setIsRenaming(false);
          if (next && next !== currentProject.title) onRenameProject(currentProject.id, next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setIsRenaming(false);
        }}
        className="flex-1 min-w-0 h-8 px-2 rounded-md text-[13px] font-semibold bg-surface border border-accent text-foreground outline-none"
      />
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        aria-label="Switch project"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "max-w-full h-8 pl-2 pr-1.5 flex items-center gap-1.5 rounded-md bg-transparent border-none cursor-pointer",
          "text-[13px] font-semibold text-foreground hover:bg-surface-subtle",
          isOpen && "bg-surface-subtle",
        )}
      >
        <span className="truncate">{title}</span>
        <FontAwesomeIcon icon={faChevronDown} className={cn("w-2 h-2 shrink-0 opacity-60 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div role="menu" aria-label="Projects" className="absolute left-0 top-full mt-1.5 z-50 w-[260px] py-1.5 rounded-xl bg-surface-overlay border border-border animate-node-in">
          <div className="max-h-[240px] overflow-y-auto cc-scroll">
            {sortedProjects.map((project) => {
              const isCurrent = project.id === currentProject?.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => {
                    setIsOpen(false);
                    if (!isCurrent) onSelectProject(project.id);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <FontAwesomeIcon icon={faCheck} className={cn("w-2.5 h-2.5 shrink-0 text-accent", !isCurrent && "invisible")} />
                  <span className="truncate">{project.title}</span>
                </button>
              );
            })}
          </div>
          <div className="my-1.5 h-px bg-border" />
          <MenuItem
            label="New project…"
            icon={faPlus}
            onSelect={() => {
              setIsOpen(false);
              setIsNewProjectModalOpen(true);
            }}
          />
          {currentProject && (
            <>
              <MenuItem
                label="Rename project…"
                icon={faPen}
                onSelect={() => {
                  setIsOpen(false);
                  setIsRenaming(true);
                }}
              />
              {isFolderPickerAvailable && (
                <MenuItem
                  label={currentProject.workingFolder ? "Change codebase…" : "Connect a codebase…"}
                  icon={faFolderOpen}
                  onSelect={() => {
                    setIsOpen(false);
                    setIsFolderModalOpen(true);
                  }}
                />
              )}
              <MenuItem
                label="Delete project…"
                icon={faTrashCan}
                isDestructive
                onSelect={() => {
                  setIsOpen(false);
                  onDeleteProject(currentProject.id);
                }}
              />
            </>
          )}
        </div>
      )}

      <NewProjectModal isOpen={isNewProjectModalOpen} onClose={() => setIsNewProjectModalOpen(false)} onCreate={onCreateProject} />
      <WorkingFolderModal project={isFolderModalOpen ? currentProject : null} onClose={() => setIsFolderModalOpen(false)} onChange={onChangeWorkingFolder} />
    </div>
  );
}

function MenuItem({
  label,
  icon,
  onSelect,
  isDestructive = false,
}: {
  label: string;
  icon: typeof faPlus;
  onSelect: () => void;
  isDestructive?: boolean;
}) {
  return (
    <button type="button" role="menuitem" onClick={onSelect} className={cn(MENU_ITEM_CLASS, isDestructive && "text-foreground-muted hover:text-foreground")}>
      <FontAwesomeIcon icon={icon} className="w-2.5 h-2.5 shrink-0 opacity-70" />
      <span className="truncate">{label}</span>
    </button>
  );
}
