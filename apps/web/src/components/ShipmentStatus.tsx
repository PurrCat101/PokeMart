"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { deliveryLabel, deliveryTone, type DeliveryTone } from "../lib/shipping";
import type { ShipmentItem } from "../types/api";
import { AlertCircleIcon, CheckIcon, ClockIcon, TruckIcon } from "./icons";
import { cx } from "./ui";

const TONE_STYLES: Record<DeliveryTone, string> = {
  neutral: "border-line-strong bg-surface-2 text-fg-muted",
  info: "border-info/40 bg-info-soft text-info",
  ok: "border-ok/40 bg-ok-soft text-ok",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

/** Status chip: always an icon plus a Thai label, never colour alone. */
export function DeliveryBadge({
  status,
  loading,
  className,
  ...rest
}: {
  status: string | null | undefined;
  loading?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const tone = deliveryTone(status);
  const Icon = loading ? ClockIcon : tone === "ok" ? CheckIcon : tone === "danger" ? AlertCircleIcon : tone === "info" ? TruckIcon : ClockIcon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_STYLES[loading ? "neutral" : tone],
        className,
      )}
      {...rest}
    >
      <Icon className="h-3.5 w-3.5" />
      {loading ? "Loading…" : deliveryLabel(status)}
    </span>
  );
}

export interface ShipmentState {
  shipment: ShipmentItem | null;
  loading: boolean;
  /** True when the latest refresh failed. The last known shipment is kept, never erased. */
  error: boolean;
}

interface Fetched {
  key: string;
  shipment: ShipmentItem | null;
  error: boolean;
}

/** Loads the public shipment for a Pokémon or item purchase. Re-fetches when `refreshToken` changes. */
export function usePurchaseShipment(purchaseId: string | null, refreshToken = 0): ShipmentState {
  const key = `${purchaseId}:${refreshToken}`;
  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (!purchaseId) return;
    let cancelled = false;
    api
      .getShipment(purchaseId)
      .then((shipment) => {
        if (!cancelled) setFetched({ key, shipment, error: false });
      })
      .catch(() => {
        // Keep the last known shipment; surface a non-blocking notice instead.
        if (!cancelled) setFetched((prev) => ({ key, shipment: prev?.shipment ?? null, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [purchaseId, refreshToken, key]);

  return {
    shipment: fetched?.shipment ?? null,
    // Loading is derived: the latest request for this key has not answered yet.
    loading: Boolean(purchaseId) && fetched?.key !== key,
    error: fetched?.error ?? false,
  };
}
