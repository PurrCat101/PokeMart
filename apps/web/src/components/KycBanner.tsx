"use client";

import React from "react";
import type { KycStatus } from "../types/api";
import { Alert, Button } from "./ui";

/** Account-level notice for a verification that is under review or was declined. Renders nothing otherwise. */
export function KycBanner({ kyc, onRetry }: { kyc: KycStatus | null; onRetry: () => void }) {
  if (kyc?.status === "PENDING_REVIEW") {
    return (
      <Alert tone="info" title="Your verification is under review" data-testid="kyc-banner-pending" className="mb-6">
        We are checking the details you sent. You can keep browsing, but purchases are unavailable until your account is approved.
      </Alert>
    );
  }
  if (kyc?.status === "REJECTED") {
    return (
      <Alert
        tone="danger"
        title="We couldn't verify your identity"
        data-testid="kyc-banner-rejected"
        className="mb-6"
        action={
          <Button variant="secondary" size="sm" onClick={onRetry} data-testid="kyc-banner-retry">
            Send again
          </Button>
        }
      >
        Check that your details match your ID card, then submit them again.
      </Alert>
    );
  }
  return null;
}
