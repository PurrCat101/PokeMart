"use client";

import React from "react";
import { AlertCircleIcon, RefreshIcon } from "./icons";
import { Button, cx } from "./ui";
import { ErrorReference } from "./ErrorReference";

export interface ErrorPageProps {
  /** Short headline, e.g. "Catalog unavailable". */
  title: string;
  /** What happened and, if known, what the user can do. */
  message?: string;
  /**
   * The only diagnostic shown: a reference to quote to support (request ID, or the error digest for a crash).
   * HTTP status and error codes are deliberately not shown; support finds them in the logs from this value.
   */
  reference?: string;
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
  reference,
  onRetry,
  retryLabel = "Try again",
  retryTestId = "error-retry",
  actions,
  fullScreen = false,
  testId = "error-page",
  className,
}: ErrorPageProps) {
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

      {reference && (
        <div data-testid={`${testId}-details`} className="mt-8 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="mb-1 text-xs text-fg-subtle">If this keeps happening, tell support this reference.</p>
          <ErrorReference value={reference} className="justify-center" data-testid={`${testId}-reference`} />
        </div>
      )}
    </section>
  );
}
