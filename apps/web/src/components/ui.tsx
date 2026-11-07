"use client";

import React, { useEffect, useRef } from "react";
import { AlertCircleIcon, CheckIcon, XIcon, ClockIcon } from "./icons";

import { buttonClass, cx, type ButtonSize, type ButtonVariant } from "./button-class";

// Re-exported for existing client-side imports; server components must import
// from "./button-class" directly.
export { buttonClass, cx };

/** Prices, balances and totals share one format so the UI never drifts. */
export function money(value: number): string {
  return `₽ ${value.toLocaleString()}`;
}

export function formatPokemonId(id: number): string {
  return `#${String(id).padStart(3, "0")}`;
}

export function titleCase(value: string): string {
  return value
    .replaceAll("-", " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

/** Square icon-only control. `label` becomes the accessible name. */
export function IconButton({
  label,
  className,
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback: Alert, Skeleton, EmptyState                               */
/* ------------------------------------------------------------------ */

type Tone = "ok" | "warn" | "danger" | "info";

const TONE_STYLES: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok-soft text-fg",
  warn: "border-warn/40 bg-warn-soft text-fg",
  danger: "border-danger/40 bg-danger-soft text-fg",
  info: "border-info/40 bg-info-soft text-fg",
};

const TONE_ICON_COLOR: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
};

/** Status is always icon + text, never colour alone. */
export function Alert({
  tone,
  title,
  children,
  action,
  className,
  ...rest
}: {
  tone: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const Icon = tone === "ok" ? CheckIcon : tone === "info" ? ClockIcon : AlertCircleIcon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex items-start gap-3 rounded-lg border p-3.5 text-sm", TONE_STYLES[tone], className)}
      {...rest}
    >
      <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", TONE_ICON_COLOR[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx("text-fg-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton rounded-md", className)} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center",
        className,
      )}
      {...rest}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted">{icon}</div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal / Drawer: focus trap, Esc, scroll lock, focus restore         */
/* ------------------------------------------------------------------ */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  onClose: () => void;
  labelledBy: string;
  testId?: string;
  /** "center" dialog (default) or a right-aligned "drawer". */
  variant?: "center" | "drawer";
  size?: "sm" | "md" | "lg";
  /** When false, Esc and backdrop clicks are ignored (e.g. while a payment is processing). */
  dismissible?: boolean;
  children: React.ReactNode;
}

const MODAL_SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-xl" } as const;

/** Mount it only while open; it manages focus for its own lifetime. */
export function Modal({
  onClose,
  labelledBy,
  testId,
  variant = "center",
  size = "md",
  dismissible = true,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissibleRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const isDrawer = variant === "drawer";

  return (
    <div className={cx("fixed inset-0 z-50 flex", isDrawer ? "justify-end" : "items-end justify-center p-0 sm:items-center sm:p-4")}>
      <div
        aria-hidden="true"
        className="anim-fade absolute inset-0 bg-scrim"
        onClick={() => dismissible && onClose()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        data-testid={testId}
        className={cx(
          "relative flex max-h-dvh flex-col bg-surface text-fg shadow-modal outline-none",
          isDrawer
            ? "anim-drawer h-dvh w-full max-w-md border-l border-line"
            : cx(
                "anim-pop max-h-[92dvh] w-full rounded-t-2xl border border-line sm:rounded-xl",
                MODAL_SIZES[size],
              ),
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  id,
  icon,
  title,
  subtitle,
  onClose,
  closeTestId,
  hideClose,
}: {
  id: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  closeTestId?: string;
  hideClose?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
      {icon && <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-text">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h2 id={id} className="text-base font-semibold leading-tight">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {!hideClose && onClose && (
        <IconButton label="Close" onClick={onClose} data-testid={closeTestId} className="-mr-2 -mt-1">
          <XIcon className="h-5 w-5" />
        </IconButton>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form field                                                          */
/* ------------------------------------------------------------------ */

export const inputClass =
  "min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-subtle transition-colors hover:border-fg-subtle focus-visible:border-brand-text sm:min-h-10 sm:text-sm";

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
