import React, { useState } from "react";
import { PurchaseItem, AuthUser } from "../types/api";
import { LedgerIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { OrderDetailModal } from "./OrderDetailModal";

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOrderClick = (order: PurchaseItem) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  if (!user) {
    return (
      <div data-testid="purchases-auth-required" className="p-8 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg max-w-lg mx-auto my-8">
        <LedgerIcon className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
          Authentication Required
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-4">
          Sign in to view your order history and purchase records.
        </p>
        <button
          type="button"
          onClick={onOpenLogin}
          data-testid="purchases-sign-in"
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded transition-colors"
        >
          Sign In Now
        </button>
      </div>
    );
  }

  const hasNextPage = offset + limit < totalCount;
  const hasPrevPage = offset > 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div data-testid="order-history-view" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center space-x-2">
            <span>Order History</span>
            <span className="text-xs font-mono font-normal text-zinc-500">
              ({totalCount} orders)
            </span>
          </h2>
          <p className="text-xs text-zinc-500">
            Your complete purchase history and order records.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          data-testid="purchases-refresh"
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded transition-colors"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Table Container */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
        <div className="overflow-x-auto">
          <table data-testid="purchases-table" className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold">Item Procured</th>
                <th className="py-2.5 px-4 font-semibold text-center">Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Unit Price</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="py-3 px-4">
                      <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr data-testid="purchases-empty">
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    No orders found.
                  </td>
                </tr>
              ) : (
                items.map((tx) => (
                  <tr
                    key={tx.purchaseId}
                    data-testid={`purchase-row-${tx.purchaseId}`}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
                    onClick={() => handleOrderClick(tx)}
                  >
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td data-testid={`purchase-item-${tx.purchaseId}`} className="py-3 px-4 text-zinc-900 dark:text-zinc-100 font-sans font-medium capitalize">
                      #{String(tx.pokemon.id).padStart(3, "0")} {tx.pokemon.name}
                    </td>
                    <td data-testid={`purchase-quantity-${tx.purchaseId}`} className="py-3 px-4 text-center font-bold text-zinc-800 dark:text-zinc-200">
                      {tx.quantity}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
                      ₽ {tx.pricing.unitPrice.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      ₽ {tx.pricing.totalPrice.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-xs">
            <span className="text-zinc-500 font-mono">
              Page {currentPage} of {totalPages} ({totalCount} items)
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => onPageChange(offset - limit)}
                disabled={!hasPrevPage || isLoading}
                data-testid="purchases-page-previous"
                className="p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous Page"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onPageChange(offset + limit)}
                disabled={!hasNextPage || isLoading}
                data-testid="purchases-page-next"
                className="p-1 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next Page"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}
