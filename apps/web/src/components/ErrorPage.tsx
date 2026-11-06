"use client";

import React from "react";
import { AlertCircleIcon, RefreshIcon } from "./icons";
import { Button, cx } from "./ui";

export interface ErrorPageProps {
  /** Short headline, e.g. "Catalog unavailable". */
  title: string;
  /** What happened and, if known, what the user can do. */
  message?: string;
  /** HTTP status and/or API error code, shown as diagnostics. */
  status?: number;
  code?: string;
  requestId?: string;
  /** Primary recovery action. Omit when retrying cannot help. */
  onRetry?: () => void;
  retryLabel?: string;
  retryTestId?: string;
  /** Extra actions, e.g. a link back home. */
  actions?: React.ReactNode;
  /** Fill the viewport (route-level errors) instead of sitting inside the page shell. */
  fullScreen?: boolean;
  testId?: string;
  className?: string;
}

/**
 * The one error page for failures the user cannot work around: the catalog
 * will not load, a route crashed, a page does not exist. Use it instead of
 * an inline banner whenever there is nothing left on screen worth showing.
 */
export function ErrorPage({
  title,
  message,
  status,
  code,
  requestId,
  onRetry,
  retryLabel = "Try again",
  retryTestId = "error-retry",
  actions,
  fullScreen = false,
  testId = "error-page",
  className,
}: ErrorPageProps) {
  const diagnostics: Array<[string, string]> = [];
  if (status) diagnostics.push(["Status", String(status)]);
  if (code) diagnostics.push(["Code", code]);
  if (requestId) diagnostics.push(["Request ID", requestId]);

  return (
    <section
      role="alert"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      className={cx(
        "flex flex-col items-center justify-center px-4 text-center",
        fullScreen ? "min-h-dvh" : "min-h-[60dvh] py-16",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertCircleIcon className="h-8 w-8" />
      </div>
      <h1 id={`${testId}-title`} className="mt-5 text-2xl font-bold tracking-tight">
        {title}
      </h1>
      {message && <p className="mt-2 max-w-md text-sm text-fg-muted">{message}</p>}

      {(onRetry || actions) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <Button variant="primary" onClick={onRetry} data-testid={retryTestId}>
              <RefreshIcon />
              {retryLabel}
            </Button>
          )}
          {actions}
        </div>
      )}

      {diagnostics.length > 0 && (
        <dl
          data-testid={`${testId}-details`}
          className="mt-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 text-left text-xs"
        >
          {diagnostics.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-fg-subtle">{label}</dt>
              <dd className="font-mono tabular-nums text-fg-muted">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}
