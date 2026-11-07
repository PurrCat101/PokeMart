import React, { useEffect, useState } from "react";
import { PurchaseItem } from "../types/api";
import { AlertCircleIcon, CheckIcon, LedgerIcon, RefreshIcon } from "./icons";
import { DeliveryBadge, usePurchaseShipment } from "./ShipmentStatus";
import { Alert, Button, Modal, ModalHeader, Skeleton, cx, formatPokemonId, money } from "./ui";
import { DELIVERY_LABELS, ORDER_PLACED_LABEL, TIMELINE_STEPS, timelineIndex } from "../lib/shipping";

interface OrderDetailModalProps {
  order: PurchaseItem;
  onClose: () => void;
}

/** Bounded polling while the detail view is open; cleaned up on unmount. */
const POLL_INTERVAL_MS = 15_000;

export function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const [refreshToken, setRefreshToken] = useState(0);
  const { shipment, loading, error } = usePurchaseShipment(order.purchaseId, refreshToken);

  useEffect(() => {
    const timer = setInterval(() => setRefreshToken((n) => n + 1), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const status = shipment?.deliveryStatus;
  const failed = status === "DELIVERY_FAILED";
  const currentStep = timelineIndex(status);
  const waitingForLabel = status === "WAITING_FOR_SHIPMENT" || shipment?.processingStatus === "RETRY_WAIT";

  return (
    <Modal onClose={onClose} labelledBy="order-detail-title" testId={`order-detail-${order.purchaseId}`} size="lg">
      <ModalHeader
        id="order-detail-title"
        icon={<LedgerIcon className="h-5 w-5" />}
        title="Order details"
        subtitle={new Date(order.createdAt).toLocaleString()}
        onClose={onClose}
        closeTestId="order-detail-close"
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {/* Order summary */}
        <section aria-label="Order summary">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 p-4">
            <div className="min-w-0">
              <p className="font-mono text-xs tabular-nums text-fg-subtle">{formatPokemonId(order.pokemon.id)}</p>
              <p className="truncate text-lg font-semibold capitalize">{order.pokemon.name}</p>
              <p className="text-sm text-fg-muted">
                Quantity <span className="font-mono tabular-nums">{order.quantity}</span> ·{" "}
                <span className="font-mono tabular-nums">{money(order.pricing.unitPrice)}</span> each
              </p>
            </div>
            <p className="shrink-0 font-mono text-xl font-bold tabular-nums">{money(order.pricing.totalPrice)}</p>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-fg-subtle">Order ID {order.purchaseId}</p>
        </section>

        {/* Shipment */}
        <section aria-labelledby="shipment-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="shipment-heading" className="font-semibold">
              Shipment
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRefreshToken((n) => n + 1)}
              disabled={loading}
              data-testid="order-detail-refresh"
            >
              <RefreshIcon className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Non-blocking: the last known status stays visible if a refresh fails. */}
          {error && (
            <Alert tone="warn" title="Could not update status" data-testid="order-detail-shipping-notice">
              {shipment ? "Showing the last known status. Try refreshing again later." : "Shipment details could not be loaded. Try refreshing again."}
            </Alert>
          )}
          {!error && waitingForLabel && (
            <Alert tone="info" title="Preparing shipment" data-testid="order-detail-shipping-notice">
              We are preparing your shipment. The tracking number will appear here as soon as it is ready.
            </Alert>
          )}

          {loading && !shipment ? (
            <div data-testid="shipment-timeline-loading" role="status" aria-label="Loading shipment" className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : shipment ? (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-xs text-fg-subtle">Delivery status</dt>
                  <dd className="mt-1.5">
                    <DeliveryBadge status={status} data-testid="order-detail-delivery-status" />
                  </dd>
                </div>
                <div className="rounded-lg border border-line p-3">
                  <dt className="text-xs text-fg-subtle">Tracking number</dt>
                  <dd className="mt-1.5 font-mono text-sm tabular-nums">
                    {shipment.trackingNumber ? (
                      <span data-testid="order-detail-tracking-number" className="select-all">
                        {shipment.trackingNumber}
                      </span>
                    ) : (
                      <span className="font-sans text-fg-muted">Not issued yet</span>
                    )}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-fg-subtle">
                Last updated <span className="font-mono tabular-nums">{new Date(shipment.updatedAt).toLocaleString()}</span>
              </p>

              {shipment.lastError && (
                <Alert tone="danger" title="Could not create shipment">
                  <span className="font-mono text-xs">{shipment.lastError}</span>
                </Alert>
              )}

              <ol data-testid="order-detail-shipment-timeline" aria-label="Shipment timeline" className="space-y-0">
                <TimelineRow done current={currentStep === 0} label={ORDER_PLACED_LABEL} />
                {TIMELINE_STEPS.map((step, index) => {
                  const done = currentStep >= step.rank;
                  const current = currentStep === step.currentAt;
                  return (
                    <TimelineRow
                      key={step.key}
                      testId={`shipment-timeline-step-${step.key}`}
                      label={step.label}
                      done={done}
                      current={current}
                      last={index === TIMELINE_STEPS.length - 1 && !failed}
                    />
                  );
                })}
                {failed && <TimelineRow testId="shipment-timeline-step-DELIVERY_FAILED" label={DELIVERY_LABELS.DELIVERY_FAILED} done current failed last />}
              </ol>
            </>
          ) : (
            <div data-testid="shipment-timeline-error" className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong p-4 text-sm text-fg-muted">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              {error ? "Could not load shipment details" : "No shipment information for this order yet"}
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-line bg-surface-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="secondary" onClick={onClose} className="w-full sm:ml-auto sm:flex sm:w-auto">
          Close
        </Button>
      </div>
    </Modal>
  );
}

function TimelineRow({
  label,
  done,
  current,
  failed,
  last,
  testId,
}: {
  label: string;
  done?: boolean;
  current?: boolean;
  failed?: boolean;
  last?: boolean;
  testId?: string;
}) {
  return (
    <li
      data-testid={testId}
      aria-current={current ? "step" : undefined}
      className="relative flex gap-3 pb-5 last:pb-0"
    >
      {!last && <span aria-hidden="true" className={cx("absolute left-3 top-6 -ml-px h-[calc(100%-1.5rem)] w-0.5", done && !current ? "bg-brand" : "bg-line-strong")} />}
      <span
        aria-hidden="true"
        className={cx(
          "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
          failed
            ? "border-danger bg-danger-soft text-danger"
            : done
              ? "border-brand bg-brand text-brand-fg"
              : "border-line-strong bg-surface text-transparent",
        )}
      >
        {failed ? <AlertCircleIcon className="h-3 w-3" /> : done ? <CheckIcon className="h-3 w-3" /> : null}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={cx("text-sm", current ? "font-semibold" : done ? "font-medium" : "text-fg-subtle")}>
          {label}
          {current && (
            <span data-testid="shipment-timeline-current" className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-text">
              Latest
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
