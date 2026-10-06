"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "./Modal";
import { pickDirectory } from "../lib/fileAccess";
import type { ProjectSummary } from "../lib/projectStore";
import { cn } from "../lib/cn";
import type { FileAccess } from "../types";
import { FILE_ACCESS_OPTIONS } from "./FileAccessModal";

interface Props {
  project: ProjectSummary | null;
  onClose: () => void;
  onChange: (projectId: string, workingFolder: string | null) => void;
  onFileAccessChange: (projectId: string, fileAccess: FileAccess) => void;
}

// Changes apply immediately (and only affect chats sent afterwards), so
// there's no separate save step.
export default function WorkingFolderModal({ project, onClose, onChange, onFileAccessChange }: Props) {
  const workingFolder = project?.workingFolder ?? null;

  return (
    <Modal isOpen={project !== null} onClose={onClose} title={`Working folder · ${project?.title ?? ""}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              if (!project) return;
              const folder = await pickDirectory();
              if (folder) onChange(project.id, folder);
            }}
            className={cn(
              "flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
              "bg-surface border border-border hover:border-accent transition-colors duration-150 cursor-pointer",
              workingFolder ? "text-foreground" : "text-foreground-muted",
            )}
          >
            <FontAwesomeIcon icon={faFolder} className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
            <span className="truncate" title={workingFolder ?? undefined}>
              {workingFolder ?? "Choose a folder…"}
            </span>
          </button>
          {workingFolder && project && (
            <button
              type="button"
              onClick={() => onChange(project.id, null)}
              title="Clear folder"
              aria-label="Clear folder"
              className="w-8 h-8 flex items-center justify-center rounded-md bg-transparent border border-border text-foreground-muted hover:text-foreground cursor-pointer"
            >
              <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
            </button>
          )}
        </div>
        {workingFolder && project ? (
          <div role="radiogroup" aria-label="What Claude may do in this folder" className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">Claude may</span>
            {FILE_ACCESS_OPTIONS.map((option) => {
              const isSelected = project.fileAccess === option.value;
              return (
                <button
                  key={option.value}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onFileAccessChange(project.id, option.value)}
                  className={cn(
                    "flex flex-col gap-0.5 px-3 py-2 rounded-lg text-left border cursor-pointer transition-colors bg-transparent",
                    isSelected ? "border-accent" : "border-border hover:border-foreground-muted",
                  )}
                >
                  <span className="text-[12.5px] font-semibold text-foreground">{option.label}</span>
                  <span className="text-[11.5px] text-foreground-muted leading-snug">{option.description}</span>
                </button>
              );
            })}
            {project.fileAccess === "ask" && (
              <span className="text-[11.5px] text-foreground-muted">Not chosen yet — you'll be asked on the first message.</span>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-foreground-muted leading-relaxed">
            Without a folder, Claude answers as a plain chat with no access to your files.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-1 self-end px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white border-none cursor-pointer hover:bg-accent-hover transition-colors"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
