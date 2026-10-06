"use client";

import Modal from "./Modal";

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface Props {
  request: ConfirmRequest | null;
  onClose: () => void;
}

export default function ConfirmDialog({ request, onClose }: Props) {
  return (
    <Modal isOpen={request !== null} onClose={onClose} title={request?.title ?? ""}>
      <p className="text-sm text-foreground-muted leading-relaxed">{request?.message}</p>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md text-sm font-medium bg-surface-subtle border border-border text-foreground cursor-pointer hover:border-accent transition-colors"
        >
          Cancel
        </button>
        <button
          autoFocus
          onClick={() => {
            request?.onConfirm();
            onClose();
          }}
          className="px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white border-none cursor-pointer hover:bg-accent-hover transition-colors"
        >
          {request?.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
