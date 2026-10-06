"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faXmark } from "@fortawesome/free-solid-svg-icons";
import Modal from "./Modal";
import { canPickDirectory, pickDirectory } from "../lib/fileAccess";
import { cn } from "../lib/cn";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, workingFolder: string | null) => void;
}

export default function NewProjectModal({ isOpen, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [workingFolder, setWorkingFolder] = useState<string | null>(null);
  const [isFolderPickerAvailable, setIsFolderPickerAvailable] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setWorkingFolder(null);
      setIsFolderPickerAvailable(canPickDirectory());
    }
  }, [isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate(trimmedTitle, workingFolder);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New project">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Title
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Untitled project"
            className="px-3 py-2 rounded-md text-sm bg-surface border border-border
                       text-foreground placeholder:text-foreground-subtle outline-none
                       focus:border-accent transition-colors duration-150"
          />
        </label>

        {isFolderPickerAvailable && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
              Working folder (optional)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  const folder = await pickDirectory();
                  if (folder) setWorkingFolder(folder);
                }}
                className={cn(
                  "flex-1 min-w-0 flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
                  "bg-surface border border-border hover:border-accent",
                  "transition-colors duration-150 cursor-pointer",
                  workingFolder ? "text-foreground" : "text-foreground-muted"
                )}
              >
                <FontAwesomeIcon icon={faFolder} className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                <span className="truncate" title={workingFolder ?? undefined}>
                  {workingFolder ?? "Choose a folder…"}
                </span>
              </button>
              {workingFolder && (
                <button
                  type="button"
                  onClick={() => setWorkingFolder(null)}
                  title="Clear folder"
                  aria-label="Clear folder"
                  className="w-8 h-8 flex items-center justify-center rounded-md bg-transparent border border-border text-foreground-muted hover:text-foreground cursor-pointer"
                >
                  <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
                </button>
              )}
            </div>
            <span className="text-[11px] text-foreground-muted">
              Claude answers this project&apos;s chats from this folder and can read, search and edit files in it (no shell commands). Leave empty for plain chat.
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={!title.trim()}
          className={cn(
            "mt-2 px-3 py-2 rounded-md text-sm font-semibold border-none transition-colors duration-150",
            title.trim()
              ? "bg-accent text-white hover:bg-accent-hover cursor-pointer"
              : "bg-surface-subtle text-foreground-subtle cursor-default"
          )}
        >
          Create project
        </button>
      </form>
    </Modal>
  );
}
