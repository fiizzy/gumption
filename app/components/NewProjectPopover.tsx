"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faXmark } from "@fortawesome/free-solid-svg-icons";
import { cn } from "../lib/cn";

// Stand-in for a real filesystem/File System Access API picker, which needs
// a backend to resolve against — this UI-only pass just fakes the selection.
const DUMMY_WORKING_FOLDER_NAME = "Documents/Projects/Untitled";

interface Props {
  onCancel: () => void;
  onCreate: (title: string, workingFolder: string) => void;
}

export default function NewProjectPopover({ onCancel, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [workingFolder, setWorkingFolder] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate(trimmedTitle, workingFolder ?? DUMMY_WORKING_FOLDER_NAME);
  };

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute left-0 top-full mt-2 z-[950] w-[280px] rounded-xl border border-border
                 bg-surface-overlay p-4 shadow-card-active font-sans"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">New project</span>
        <button
          onClick={onCancel}
          title="Cancel"
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity
                     bg-transparent border-none cursor-pointer text-foreground-muted p-0.5"
        >
          <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Title
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled project"
            className="px-2.5 py-1.5 rounded-md text-sm bg-surface border border-border
                       text-foreground placeholder:text-foreground-subtle outline-none
                       focus:border-accent transition-colors duration-150"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Working folder
          </span>
          <button
            type="button"
            onClick={() => setWorkingFolder(DUMMY_WORKING_FOLDER_NAME)}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left",
              "bg-surface border border-border hover:border-accent",
              "transition-colors duration-150 cursor-pointer",
              workingFolder ? "text-foreground" : "text-foreground-subtle",
            )}
          >
            <FontAwesomeIcon icon={faFolder} className="w-3 h-3 text-foreground-muted shrink-0" />
            <span className="truncate">{workingFolder ?? "Choose a folder…"}</span>
          </button>
        </label>

        <button
          type="submit"
          disabled={!title.trim()}
          className={cn(
            "mt-1 px-3 py-1.5 rounded-md text-sm font-semibold border-none transition-colors duration-150",
            title.trim()
              ? "bg-accent text-white hover:bg-accent-hover cursor-pointer"
              : "bg-surface-subtle text-foreground-subtle cursor-default",
          )}
        >
          Create project
        </button>
      </form>
    </div>
  );
}
