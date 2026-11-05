import React, { useEffect } from "react";
import { CheckIcon, AlertCircleIcon, XIcon, ClockIcon } from "./icons";
import { IconButton, cx } from "./ui";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

const STYLES = {
  success: { bar: "bg-ok", icon: "text-ok", Icon: CheckIcon },
  error: { bar: "bg-danger", icon: "text-danger", Icon: AlertCircleIcon },
  info: { bar: "bg-info", icon: "text-info", Icon: ClockIcon },
} as const;

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    // Errors stay a little longer so they can actually be read.
    const timer = setTimeout(onClose, toast.type === "error" ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const { bar, icon, Icon } = STYLES[toast.type];

  return (
    // Sits above the mobile tab bar. Toasts never take focus; they are announced via the live region role.
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6 md:justify-end md:px-6">
      <div
        key={toast.id}
        data-testid={`toast-${toast.type}`}
        role={toast.type === "error" ? "alert" : "status"}
        className="anim-toast pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-line bg-surface py-3 pl-5 pr-2 shadow-pop"
      >
        <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-1", bar)} />
        <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", icon)} />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{toast.title}</p>
          {toast.message && <p className="mt-0.5 break-words text-fg-muted">{toast.message}</p>}
        </div>
        <IconButton label="Dismiss notification" onClick={onClose} className="-my-1">
          <XIcon className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}
