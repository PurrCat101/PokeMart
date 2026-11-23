import React from "react";
import { CopyButton } from "./CopyButton";
import { cx } from "./ui";

/**
 * The one diagnostic a person needs after a system fault: a short reference to quote to support.
 * Status codes and error codes stay out of sight; support finds everything from this value in the logs.
 */
export function ErrorReference({ value, className, "data-testid": testId = "error-reference" }: { value: string; className?: string; "data-testid"?: string }) {
  return (
    <p className={cx("flex items-center gap-1 text-xs text-fg-muted", className)}>
      <span>Reference</span>
      <span data-testid={testId} className="select-all break-all font-mono tabular-nums text-fg">
        {value}
      </span>
      <CopyButton value={value} label="reference" />
    </p>
  );
}
