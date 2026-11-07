import type { ShipmentItem } from "../types/api";

/** Customer-facing delivery labels (specs/09-frontend.md §8). */
export type DeliveryStatus = ShipmentItem["deliveryStatus"];

export const DELIVERY_LABELS: Record<string, string> = {
  WAITING_FOR_SHIPMENT: "Preparing shipment",
  LABEL_CREATED: "Awaiting shipment",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery failed",
};

export const ORDER_PLACED_LABEL = "Order placed";
export const TRACKING_ISSUED_LABEL = "Tracking number issued";

/** Neutral fallback: a missing or unknown status is never shown as delivered. */
export const UNKNOWN_DELIVERY_LABEL = "No shipment information yet";

export function deliveryLabel(status: string | null | undefined): string {
  if (!status) return UNKNOWN_DELIVERY_LABEL;
  return DELIVERY_LABELS[status] ?? UNKNOWN_DELIVERY_LABEL;
}

export type DeliveryTone = "neutral" | "info" | "ok" | "danger";

export function deliveryTone(status: string | null | undefined): DeliveryTone {
  switch (status) {
    case "DELIVERED":
      return "ok";
    case "DELIVERY_FAILED":
      return "danger";
    case "LABEL_CREATED":
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return "info";
    default:
      return "neutral";
  }
}

/** Backend status order on the happy path (WAITING_FOR_SHIPMENT = no tracking number yet). */
const STATUS_RANK = ["WAITING_FOR_SHIPMENT", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function timelineIndex(status: string | null | undefined): number {
  return STATUS_RANK.indexOf(status as (typeof STATUS_RANK)[number]);
}

/**
 * Customer-facing timeline after "Order placed":
 * tracking number issued -> awaiting shipment -> in transit -> out for delivery -> delivered.
 * `rank` is the minimum timelineIndex() at which the step counts as reached.
 */
export const TIMELINE_STEPS = [
  { key: "TRACKING_ISSUED", label: TRACKING_ISSUED_LABEL, rank: 1, currentAt: -1 },
  { key: "LABEL_CREATED", label: DELIVERY_LABELS.LABEL_CREATED, rank: 1, currentAt: 1 },
  { key: "IN_TRANSIT", label: DELIVERY_LABELS.IN_TRANSIT, rank: 2, currentAt: 2 },
  { key: "OUT_FOR_DELIVERY", label: DELIVERY_LABELS.OUT_FOR_DELIVERY, rank: 3, currentAt: 3 },
  { key: "DELIVERED", label: DELIVERY_LABELS.DELIVERED, rank: 4, currentAt: 4 },
] as const;
