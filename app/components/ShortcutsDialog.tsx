"use client";

import Modal from "./Modal";

const SHORTCUT_GROUPS: { title: string; shortcuts: [string, string][] }[] = [
  {
    title: "Tools",
    shortcuts: [
      ["Select", "V or 1"],
      ["Pan", "H, or hold Space"],
      ["Toggle select / pan", "Tab"],
      ["Rectangle", "R or 2"],
      ["Diamond", "D or 3"],
      ["Ellipse", "O or 4"],
      ["Arrow", "A or 5"],
      ["Line", "L or 6"],
      ["Text", "T or 8"],
      ["Insert image", "9"],
      ["Keep tool active", "Q"],
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      ["Undo", "Ctrl+Z"],
      ["Redo", "Ctrl+Shift+Z or Ctrl+Y"],
      ["Copy / Cut / Paste", "Ctrl+C / X / V"],
      ["Duplicate", "Ctrl+D"],
      ["Select all", "Ctrl+A"],
      ["Delete", "Delete or Backspace"],
      ["Edit text / shape label", "Enter or double-click"],
      ["Finish editing text", "Esc or Ctrl+Enter"],
      ["Move selection", "Arrow keys (Shift for 10px)"],
      ["Bring forward / to front", "Ctrl+] / Ctrl+Shift+]"],
      ["Send backward / to back", "Ctrl+[ / Ctrl+Shift+["],
      ["Square / 15° angles while drawing", "Hold Shift"],
    ],
  },
  {
    title: "View & file",
    shortcuts: [
      ["Zoom in / out", "Ctrl+= / Ctrl+−, or Ctrl+scroll"],
      ["Reset zoom", "Ctrl+0"],
      ["Fit all elements", "Shift+1"],
      ["Zoom to selection", "Shift+2"],
      ["Pan", "Scroll (Shift+scroll sideways)"],
      ["Open file", "Ctrl+O"],
      ["Save to file", "Ctrl+S"],
      ["Export image", "Ctrl+Shift+E"],
      ["Deselect / back to Select", "Esc"],
    ],
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsDialog({ isOpen, onClose }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" size="large">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground-muted mb-1">
              {group.title}
            </h3>
            {group.shortcuts.map(([action, keys]) => (
              <div key={action} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-foreground">{action}</span>
                <kbd className="text-[11px] font-sans text-foreground-muted bg-surface-subtle border border-border rounded px-1.5 py-0.5 whitespace-nowrap">
                  {keys}
                </kbd>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}
