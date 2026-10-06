"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faFolderOpen, faPenToSquare, faEye, faComments } from "@fortawesome/free-solid-svg-icons";
import Modal from "./Modal";
import type { FileAccess } from "../types";

export const FILE_ACCESS_OPTIONS: {
  value: Exclude<FileAccess, "ask">;
  label: string;
  description: string;
  icon: IconDefinition;
}[] = [
  {
    value: "readWrite",
    label: "Read & edit files",
    description: "Claude can read, search and change files in this folder. Shell commands stay blocked.",
    icon: faPenToSquare,
  },
  {
    value: "readOnly",
    label: "Read only",
    description: "Claude can read and search files here but never changes them.",
    icon: faEye,
  },
  {
    value: "none",
    label: "Chat only",
    description: "No file access — Claude answers from the conversation alone.",
    icon: faComments,
  },
];

interface Props {
  isOpen: boolean;
  folder: string;
  onChoose: (fileAccess: Exclude<FileAccess, "ask">) => void;
  onClose: () => void;
}

// Asked once per project, before the first message that would run in its
// working folder. Closing it leaves the message unsent (still in the input).
export default function FileAccessModal({ isOpen, folder, onChoose, onClose }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Allow Claude to use this folder?">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border text-[12.5px] text-foreground">
          <FontAwesomeIcon icon={faFolderOpen} className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          <span className="truncate" title={folder}>{folder}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {FILE_ACCESS_OPTIONS.map((option) => (
            <button
              key={option.value}
              autoFocus={option.value === "readWrite"}
              onClick={() => onChoose(option.value)}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg text-left bg-transparent border border-border cursor-pointer
                         hover:border-accent focus-visible:border-accent outline-none transition-colors"
            >
              <FontAwesomeIcon icon={option.icon} className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-foreground">{option.label}</span>
                <span className="text-[12px] text-foreground-muted leading-snug">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-foreground-muted">
          Remembered for this project. Change it any time from the project&apos;s folder settings in the sidebar.
        </p>
      </div>
    </Modal>
  );
}
