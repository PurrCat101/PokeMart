import React from "react";
import type { KycStatus } from "../types/api";
import { verificationTitle } from "../lib/cart";
import { cx } from "./ui";

/** One short label for an account's verification: the tier name, or what is going on with it. */
export function kycLabel(kyc: KycStatus | null): string {
  if (!kyc) return "Status unavailable";
  if (kyc.status === "PENDING_REVIEW") return "Under review";
  if (kyc.status === "REJECTED") return "Declined";
  return verificationTitle(kyc.level);
}

type BadgeTone = "neutral" | "ok" | "info" | "danger";

function tone(kyc: KycStatus | null): BadgeTone {
  if (!kyc) return "neutral";
  if (kyc.status === "PENDING_REVIEW") return "info";
  if (kyc.status === "REJECTED") return "danger";
  return kyc.level === 0 ? "neutral" : "ok";
}

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-fg-muted",
  ok: "border-transparent bg-ok-soft text-ok",
  info: "border-transparent bg-info-soft text-info",
  danger: "border-transparent bg-danger-soft text-danger",
};

/** Text always carries the meaning; colour only backs it up. */
export function KycBadge({ kyc, className, ...rest }: { kyc: KycStatus | null; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx("inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", TONE_CLASS[tone(kyc)], className)}
      {...rest}
    >
      {kycLabel(kyc)}
    </span>
  );
}
