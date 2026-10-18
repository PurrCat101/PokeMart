import React, { useEffect } from "react";
import { CheckIcon, AlertCircleIcon, XIcon } from "./icons";

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

export function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isSuccess = toast.type === "success";
  const isError = toast.type === "error";

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
      <div
        data-testid={`toast-${toast.type}`}
        role={isError ? "alert" : "status"}
        className={`p-3.5 rounded-lg border shadow-lg flex items-start space-x-3 bg-white dark:bg-zinc-900 ${
          isSuccess
            ? "border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100"
            : isError
            ? "border-red-300 dark:border-red-800 text-red-950 dark:text-red-100"
            : "border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
        }`}
      >
        <div className="mt-0.5 shrink-0">
          {isSuccess && <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
          {isError && <AlertCircleIcon className="w-4 h-4 text-red-600 dark:text-red-400" />}
        </div>
        <div className="flex-1 text-xs">
          <div className="font-bold">{toast.title}</div>
          {toast.message && (
            <div className="text-zinc-600 dark:text-zinc-400 mt-0.5 font-mono text-[11px]">
              {toast.message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
