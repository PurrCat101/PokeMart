import React, { useState } from "react";
import { PurchaseItem, AuthUser } from "../types/api";
import { LedgerIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { OrderDetailModal } from "./OrderDetailModal";
import { DeliveryBadge, usePurchaseShipment } from "./ShipmentStatus";
import { Button, EmptyState, IconButton, Skeleton, formatPokemonId, money } from "./ui";

interface PurchasesViewProps {
  items: PurchaseItem[];
  totalCount: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  user: AuthUser | null;
  onRefresh: () => void;
  onPageChange: (newOffset: number) => void;
  onOpenLogin: () => void;
}

// On small screens each row becomes a labelled card; from md up it is a regular table row.
const CELL = "block px-4 py-1.5 before:mr-3 before:text-xs before:font-medium before:text-fg-subtle before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3.5 md:before:content-none";

function PurchaseRow({
  tx,
  refreshToken,
  onOpen,
}: {
  tx: PurchaseItem;
  refreshToken: number;
  onOpen: (order: PurchaseItem) => void;
}) {
  // Quick status comes from the public shipment API, so it shows without opening the order.
  const { shipment, loading, error } = usePurchaseShipment(tx.purchaseId, refreshToken);
  const status = shipment?.deliveryStatus;

  return (
    <tr
      data-testid={`purchase-row-${tx.purchaseId}`}
      onClick={() => onOpen(tx)}
      className="block cursor-pointer border-b border-line py-2 transition-colors last:border-b-0 hover:bg-surface-2 md:table-row md:py-0"
    >
      <td data-label="Date" className={`${CELL} whitespace-nowrap text-fg-muted`}>
        {new Date(tx.createdAt).toLocaleString()}
      </td>
      <td data-label="Pokémon" data-testid={`purchase-item-${tx.purchaseId}`} className={`${CELL} font-medium capitalize`}>
        {formatPokemonId(tx.pokemon.id)} {tx.pokemon.name}
      </td>
      <td data-label="Qty" data-testid={`purchase-quantity-${tx.purchaseId}`} className={`${CELL} font-mono tabular-nums md:text-center`}>
        {tx.quantity}
      </td>
      <td data-label="Total" className={`${CELL} font-mono font-semibold tabular-nums md:text-right`}>
        {money(tx.pricing.totalPrice)}
      </td>
      <td data-label="Delivery" className={CELL}>
        <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
          <DeliveryBadge status={status} loading={loading && !shipment} data-testid={`purchase-delivery-status-${tx.purchaseId}`} />
          {shipment?.trackingNumber && (
            <span data-testid={`purchase-tracking-number-${tx.purchaseId}`} className="font-mono text-xs tabular-nums text-fg-muted">
              {shipment.trackingNumber}
            </span>
          )}
          {error && shipment && <span className="text-xs text-warn">อัปเดตล่าสุดไม่ได้</span>}
        </div>
      </td>
      <td className={`${CELL} md:text-right`}>
        <Button
          variant="secondary"
          size="sm"
          data-testid={`purchase-open-detail-${tx.purchaseId}`}
          aria-label={`View order details for ${tx.pokemon.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(tx);
          }}
        >
          Details
        </Button>
      </td>
    </tr>
  );
}

export function PurchasesView({
  items,
  totalCount,
  limit,
  offset,
  isLoading,
  user,
  onRefresh,
  onPageChange,
  onOpenLogin,
}: PurchasesViewProps) {
  const [selectedOrder, setSelectedOrder] = useState<PurchaseItem | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  if (!user) {
    return (
      <EmptyState
        data-testid="purchases-auth-required"
        icon={<LedgerIcon className="h-6 w-6" />}
        title="Sign in to see your orders"
        description="Your purchase history and delivery status live in your trainer account."
        action={
          <Button variant="primary" onClick={onOpenLogin} data-testid="purchases-sign-in">
            Sign in
          </Button>
        }
        className="mx-auto my-8 max-w-lg"
      />
    );
  }

  const hasNextPage = offset + limit < totalCount;
  const hasPrevPage = offset > 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const refresh = () => {
    setRefreshToken((n) => n + 1);
    onRefresh();
  };

  return (
    <section data-testid="purchases-view" aria-labelledby="orders-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="orders-heading" className="text-2xl font-bold tracking-tight">
            Orders
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            <span className="font-mono tabular-nums">{totalCount}</span> {totalCount === 1 ? "order" : "orders"} · delivery status updates automatically
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading} data-testid="purchases-refresh">
          <RefreshIcon className={`h-4 w-4 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <table data-testid="purchases-table" className="block w-full text-left text-sm md:table">
          <caption className="sr-only">Your Pokémon orders, newest first</caption>
          <thead className="hidden border-b border-line bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg-muted md:table-header-group">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Pokémon</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Qty</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
              <th scope="col" className="px-4 py-3 font-medium">Delivery</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="block md:table-row">
                  <td colSpan={6} className="block px-4 py-3 md:table-cell">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr data-testid="purchases-empty" className="block md:table-row">
                <td colSpan={6} className="block px-4 py-14 text-center md:table-cell">
                  <p className="font-semibold">No orders yet</p>
                  <p className="mt-1 text-fg-muted">Orders you place will show up here with their delivery status.</p>
                </td>
              </tr>
            ) : (
              items.map((tx) => <PurchaseRow key={tx.purchaseId} tx={tx} refreshToken={refreshToken} onOpen={setSelectedOrder} />)
            )}
          </tbody>
        </table>

        {totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2.5 text-sm">
            <span className="text-fg-muted">
              Page <span className="font-mono tabular-nums">{currentPage}</span> of <span className="font-mono tabular-nums">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <IconButton
                label="Previous page"
                onClick={() => onPageChange(offset - limit)}
                disabled={!hasPrevPage || isLoading}
                data-testid="purchases-page-previous"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </IconButton>
              <IconButton
                label="Next page"
                onClick={() => onPageChange(offset + limit)}
                disabled={!hasNextPage || isLoading}
                data-testid="purchases-page-next"
              >
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
