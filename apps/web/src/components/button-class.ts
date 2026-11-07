// Intentionally NOT a client module: server components (e.g. not-found.tsx)
// call buttonClass() directly, which is impossible from a "use client" file.

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover active:bg-brand-hover shadow-card",
  secondary: "bg-surface text-fg border border-line-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-soft",
};

// 44px touch target on small screens, compact on pointer devices.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-11 px-3 text-sm sm:min-h-9",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    extra,
  );
}
