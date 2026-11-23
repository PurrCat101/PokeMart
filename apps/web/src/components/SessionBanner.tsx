"use client";

import React from "react";
import { Alert, Button } from "./ui";
import { ErrorReference } from "./ErrorReference";

/**
 * Shown when the app could not check the saved sign-in because the service was unavailable.
 * The user is not told they are signed out, because they may well still be.
 */
export function SessionBanner({ reference, onRetry }: { reference?: string; onRetry: () => void }) {
  return (
    <Alert
      tone="warn"
      title="We couldn't check your sign-in"
      data-testid="session-unavailable"
      className="mb-6"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry} data-testid="session-retry">
          Try again
        </Button>
      }
    >
      Your account details may be out of date. Browsing still works.
      {reference && <ErrorReference value={reference} className="mt-1" />}
    </Alert>
  );
}
