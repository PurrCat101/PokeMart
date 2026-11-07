"use client";

import React, { useState } from "react";
import type { OrderKind, OrderRow } from "../lib/orders";
import { LedgerIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { OrderDetailModal } from "./OrderDetailModal";
import { DeliveryBadge, usePurchaseShipment } from "./ShipmentStatus";
import { Alert, Button, IconButton, Skeleton, cx, money } from "./ui";

interface OrdersViewProps {
  kind: OrderKind;
  onKindChange: (kind: OrderKind) => void;
  rows: OrderRow[];
  totalCount: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  /** The last refresh failed. Rows already on screen are kept. */
  hasError: boolean;
  onRefresh: () => void;
  onPageChange: (newOffset: number) => void;
}

// Pokémon orders keep their original test ids; item orders use the item-order-* family.
const IDS: Record<OrderKind, { view: string; table: string; row: string; name: string; qty: string; delivery: string; tracking: string; detail: string; empty: string; refresh: string; prev: string; next: string }> = {
  pokemon: {
    view: "purchases-view",
    table: "purchases-table",
    row: "purchase-row",
    name: "purchase-item",
    qty: "purchase-quantity",
    delivery: "purchase-delivery-status",
    tracking: "purchase-tracking-number",
    detail: "purchase-open-detail",
    empty: "purchases-empty",
    refresh: "purchases-refresh",
    prev: "purchases-page-previous",
    next: "purchases-page-next",
  },
  item: {
    view: "item-orders-view",
    table: "item-orders-table",
    row: "item-order-row",
    name: "item-order-item",
    qty: "item-order-quantity",
    delivery: "item-order-delivery-status",
    tracking: "item-order-tracking-number",
    detail: "item-order-open-detail",
    empty: "item-orders-empty",
    refresh: "item-orders-refresh",
    prev: "item-orders-page-previous",
    next: "item-orders-page-next",
  },
};

// On small screens each row becomes a labelled card; from md up it is a regular table row.
const CELL = "block px-4 py-1.5 before:mr-3 before:text-xs before:font-medium before:text-fg-subtle before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3.5 md:before:content-none";

function OrderTableRow({ order, refreshToken, onOpen }: { order: OrderRow; refreshToken: number; onOpen: (order: OrderRow) => void }) {
  const ids = IDS[order.kind];
  // Quick status comes from the public shipment API, so it shows without opening the order.
  const { shipment, loading, error } = usePurchaseShipment(order.purchaseId, refreshToken);

  return (
    <tr
      data-testid={`${ids.row}-${order.purchaseId}`}
      onClick={() => onOpen(order)}
      className="block cursor-pointer border-b border-line py-2 transition-colors last:border-b-0 hover:bg-surface-2 md:table-row md:py-0"
    >
      <td data-label="Date" className={`${CELL} whitespace-nowrap text-fg-muted`}>
        {new Date(order.createdAt).toLocaleString()}
      </td>
      <td data-label={order.kind === "pokemon" ? "Pokémon" : "Item"} data-testid={`${ids.name}-${order.purchaseId}`} className={`${CELL} font-medium capitalize`}>
        {order.kind === "pokemon" ? `${order.idLabel} ${order.name}` : order.name}
      </td>
      <td data-label="Qty" data-testid={`${ids.qty}-${order.purchaseId}`} className={`${CELL} font-mono tabular-nums md:text-center`}>
        {order.quantity}
      </td>
      <td data-label="Total" className={`${CELL} font-mono font-semibold tabular-nums md:text-right`}>
        {money(order.totalPrice)}
      </td>
      <td data-label="Delivery" className={CELL}>
        <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
          <DeliveryBadge status={shipment?.deliveryStatus} loading={loading && !shipment} data-testid={`${ids.delivery}-${order.purchaseId}`} />
          {shipment?.trackingNumber && (
            <span data-testid={`${ids.tracking}-${order.purchaseId}`} className="font-mono text-xs tabular-nums text-fg-muted">
              {shipment.trackingNumber}
            </span>
          )}
          {error && shipment && <span className="text-xs text-warn">Update failed</span>}
        </div>
      </td>
      <td className={`${CELL} md:text-right`}>
        <Button
          variant="secondary"
          size="sm"
          data-testid={`${ids.detail}-${order.purchaseId}`}
          aria-label={`View order details for ${order.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(order);
          }}
        >
          Details
        </Button>
      </td>
    </tr>
  );
}

export function OrdersView({ kind, onKindChange, rows, totalCount, limit, offset, isLoading, hasError, onRefresh, onPageChange }: OrdersViewProps) {
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const ids = IDS[kind];
  const noun = kind === "pokemon" ? "Pokémon" : "item";

  const hasNextPage = offset + limit < totalCount;
  const hasPrevPage = offset > 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const refresh = () => {
    setRefreshToken((n) => n + 1);
    onRefresh();
  };

  return (
    <section data-testid={ids.view} aria-labelledby="orders-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="orders-heading" className="text-2xl font-bold tracking-tight">
            Orders
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-mono tabular-nums">{totalCount}</span> {noun} {totalCount === 1 ? "order" : "orders"} · delivery status updates automatically
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div role="group" aria-label="Order type" className="inline-flex rounded-lg border border-line-strong bg-surface p-1">
            {(["pokemon", "item"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => onKindChange(k)}
                data-testid={`orders-kind-${k === "pokemon" ? "pokemon" : "items"}`}
                className={cx(
                  "min-h-11 rounded-md px-4 text-sm font-semibold transition-colors sm:min-h-9",
                  kind === k ? "bg-brand text-brand-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {k === "pokemon" ? "Pokémon" : "Items"}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading} data-testid={ids.refresh}>
            <RefreshIcon className={`h-4 w-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {hasError && (
        <Alert tone="warn" title="Could not refresh your orders" data-testid="orders-error">
          {rows.length > 0 ? "Showing the last known list." : "Try refreshing again in a moment."}
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <table data-testid={ids.table} className="block w-full text-left text-sm md:table">
          <caption className="sr-only">Your {noun} orders, newest first</caption>
          <thead className="hidden border-b border-line bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg-muted md:table-header-group">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">{kind === "pokemon" ? "Pokémon" : "Item"}</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Qty</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
              <th scope="col" className="px-4 py-3 font-medium">Delivery</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {isLoading && rows.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="block md:table-row">
                  <td colSpan={6} className="block px-4 py-3 md:table-cell">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr data-testid={ids.empty} className="block md:table-row">
                <td colSpan={6} className="block px-4 py-14 text-center md:table-cell">
                  <LedgerIcon className="mx-auto mb-2 h-5 w-5 text-fg-subtle" />
                  <p className="font-semibold">No {noun} orders yet</p>
                  <p className="mt-1 text-fg-muted">Orders you place will show up here with their delivery status.</p>
                </td>
              </tr>
            ) : (
              rows.map((order) => <OrderTableRow key={order.purchaseId} order={order} refreshToken={refreshToken} onOpen={setSelectedOrder} />)
            )}
          </tbody>
        </table>

        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2.5 text-sm">
            <span className="text-fg-muted">
              Page <span className="font-mono tabular-nums">{currentPage}</span> of <span className="font-mono tabular-nums">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <IconButton label="Previous page" onClick={() => onPageChange(offset - limit)} disabled={!hasPrevPage || isLoading} data-testid={ids.prev}>
                <ChevronLeftIcon className="h-5 w-5" />
              </IconButton>
              <IconButton label="Next page" onClick={() => onPageChange(offset + limit)} disabled={!hasNextPage || isLoading} data-testid={ids.next}>
                <ChevronRightIcon className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
        )}
      </div>

      {selectedOrder && <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </section>
  );
}
