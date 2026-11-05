import type { ShipmentItem } from "../types/api";

/** Customer-facing delivery labels (specs/09-frontend.md §8). */
export type DeliveryStatus = ShipmentItem["deliveryStatus"];

export const DELIVERY_LABELS: Record<string, string> = {
  WAITING_FOR_SHIPMENT: "รอจัดส่ง",
  LABEL_CREATED: "ออกเลขพัสดุแล้ว",
  IN_TRANSIT: "อยู่ระหว่างจัดส่ง",
  OUT_FOR_DELIVERY: "กำลังนำจ่าย",
  DELIVERED: "จัดส่งสำเร็จ",
  DELIVERY_FAILED: "จัดส่งไม่สำเร็จ",
};

export const ORDER_PLACED_LABEL = "สั่งซื้อแล้ว";

/** Neutral fallback: a missing or unknown status is never shown as delivered. */
export const UNKNOWN_DELIVERY_LABEL = "ยังไม่มีข้อมูลการจัดส่ง";

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

/** Happy-path order of the shipment timeline. */
export const TIMELINE_STEPS = ["WAITING_FOR_SHIPMENT", "LABEL_CREATED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export function timelineIndex(status: string | null | undefined): number {
  return TIMELINE_STEPS.indexOf(status as (typeof TIMELINE_STEPS)[number]);
}
