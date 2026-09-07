"use client";

import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder } from "@fortawesome/free-solid-svg-icons";
import Modal from "./Modal";
import { cn } from "../lib/cn";

const DUMMY_WORKING_FOLDER_NAME = "Documents/Projects/Untitled";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, workingFolder: string) => void;
}

export default function NewProjectModal({ isOpen, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [workingFolder, setWorkingFolder] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setWorkingFolder(null);
    }
  }, [isOpen]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onCreate(trimmedTitle, workingFolder ?? DUMMY_WORKING_FOLDER_NAME);
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

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            Working folder
          </span>
          <button
            type="button"
            onClick={() => setWorkingFolder(DUMMY_WORKING_FOLDER_NAME)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left",
              "bg-surface border border-border hover:border-accent",
              "transition-colors duration-150 cursor-pointer",
              workingFolder ? "text-foreground" : "text-foreground-subtle"
            )}
          >
            <FontAwesomeIcon
              icon={faFolder}
              className="w-3.5 h-3.5 text-foreground-muted shrink-0"
            />
            <span className="truncate">
              {workingFolder ?? "Choose a folder..."}
            </span>
          </button>
        </label>

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
