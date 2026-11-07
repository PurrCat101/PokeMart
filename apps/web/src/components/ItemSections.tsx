"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ItemInventoryEntry, ItemPurchasesPage } from "../types/api";
import { BackpackIcon, ChevronLeftIcon, ChevronRightIcon, LedgerIcon } from "./icons";
import { Alert, EmptyState, IconButton, Skeleton, money, titleCase } from "./ui";

// Items have their own inventory and order history. They have no shipment: delivery belongs to Pokémon orders.

interface Loaded<T> {
  key: string;
  data: T | null;
  error: boolean;
}

/** Loads the owned items. Re-fetches when `refreshToken` changes; the last known list is kept if a refresh fails. */
function useItemInventory(refreshToken: number) {
  const key = String(refreshToken);
  const [loaded, setLoaded] = useState<Loaded<ItemInventoryEntry[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getItemInventory()
      .then((data) => { if (!cancelled) setLoaded({ key, data, error: false }); })
      .catch(() => { if (!cancelled) setLoaded((prev) => ({ key, data: prev?.data ?? null, error: true })); });
    return () => { cancelled = true; };
  }, [key]);
  return { items: loaded?.data ?? null, loading: loaded?.key !== key, error: loaded?.error ?? false };
}

/** Loads one page of item orders. Re-fetches when the page or `refreshToken` changes. */
function useItemOrders(limit: number, offset: number, refreshToken: number) {
  const key = `${limit}:${offset}:${refreshToken}`;
  const [loaded, setLoaded] = useState<Loaded<ItemPurchasesPage> | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getItemPurchases(limit, offset)
      .then((data) => { if (!cancelled) setLoaded({ key, data, error: false }); })
      .catch(() => { if (!cancelled) setLoaded((prev) => ({ key, data: prev?.data ?? null, error: true })); });
    return () => { cancelled = true; };
  }, [key, limit, offset]);
  return { page: loaded?.data ?? null, loading: loaded?.key !== key, error: loaded?.error ?? false };
}

export function ItemInventorySection({ refreshToken }: { refreshToken: number }) {
  const { items, loading, error } = useItemInventory(refreshToken);
  const totalUnits = (items ?? []).reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <section data-testid="item-inventory" aria-labelledby="item-inventory-heading" className="space-y-4">
      <div>
        <h2 id="item-inventory-heading" className="text-xl font-bold tracking-tight">
          Items
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <span className="font-mono tabular-nums">{items?.length ?? 0}</span> kinds ·{" "}
          <span className="font-mono tabular-nums">{totalUnits}</span> items owned
        </p>
      </div>

      {error && (
        <Alert tone="warn" title="Could not refresh your items" data-testid="item-inventory-error">
          {items ? "Showing the last known list." : "Try refreshing again in a moment."}
        </Alert>
      )}

      {loading && !items ? (
        <div data-testid="item-inventory-loading" role="status" aria-label="Loading items" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : items && items.length === 0 ? (
        <EmptyState
          data-testid="item-inventory-empty"
          icon={<BackpackIcon className="h-6 w-6" />}
          title="No items yet"
          description="Items you buy will appear here."
        />
      ) : items ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((entry) => (
            <li
              key={entry.itemId}
              data-testid={`item-inventory-item-${entry.itemId}`}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tabular-nums text-fg-subtle">#{String(entry.itemId).padStart(4, "0")}</span>
                <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-brand-text">
                  ×{entry.quantity}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <BackpackIcon className="h-4 w-4 shrink-0 text-brand-text" />
                <span className="truncate font-semibold">{titleCase(entry.name)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const PAGE_SIZE = 10;

export function ItemOrdersSection({ refreshToken }: { refreshToken: number }) {
  const [offset, setOffset] = useState(0);
  const { page, loading, error } = useItemOrders(PAGE_SIZE, offset, refreshToken);
  const orders = page?.items ?? [];
  const totalCount = page?.totalCount ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <section data-testid="item-orders" aria-labelledby="item-orders-heading" className="space-y-4">
      <div>
        <h2 id="item-orders-heading" className="text-xl font-bold tracking-tight">
          Item orders
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <span className="font-mono tabular-nums">{totalCount}</span> {totalCount === 1 ? "order" : "orders"} · items are added to your inventory right away
        </p>
      </div>

      {error && (
        <Alert tone="warn" title="Could not refresh your item orders" data-testid="item-orders-error">
          {page ? "Showing the last known list." : "Try refreshing again in a moment."}
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <table data-testid="item-orders-table" className="w-full text-left text-sm">
          <caption className="sr-only">Your item orders, newest first</caption>
          <thead className="border-b border-line bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Date</th>
              <th scope="col" className="px-4 py-3 font-medium">Item</th>
              <th scope="col" className="px-4 py-3 text-center font-medium">Qty</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {loading && !page ? (
              <tr data-testid="item-orders-loading">
                <td colSpan={4} className="px-4 py-3">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr data-testid="item-orders-empty">
                <td colSpan={4} className="px-4 py-10 text-center">
                  <LedgerIcon className="mx-auto mb-2 h-5 w-5 text-fg-subtle" />
                  <p className="font-semibold">No item orders yet</p>
                  <p className="mt-1 text-fg-muted">Item purchases will show up here.</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.purchaseId} data-testid={`item-order-row-${order.purchaseId}`} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{new Date(order.createdAt).toLocaleString()}</td>
                  <td data-testid={`item-order-item-${order.purchaseId}`} className="px-4 py-3 font-medium">
                    {titleCase(order.itemName)}
                  </td>
                  <td data-testid={`item-order-quantity-${order.purchaseId}`} className="px-4 py-3 text-center font-mono tabular-nums">
                    {order.quantity}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">{money(order.totalPrice)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2.5 text-sm">
            <span className="text-fg-muted">
              Page <span className="font-mono tabular-nums">{currentPage}</span> of <span className="font-mono tabular-nums">{totalPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <IconButton label="Previous item orders page" onClick={() => setOffset(offset - PAGE_SIZE)} disabled={offset === 0 || loading} data-testid="item-orders-page-previous">
                <ChevronLeftIcon className="h-5 w-5" />
              </IconButton>
              <IconButton label="Next item orders page" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= totalCount || loading} data-testid="item-orders-page-next">
                <ChevronRightIcon className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
