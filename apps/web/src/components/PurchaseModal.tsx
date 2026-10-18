import React, { useState, useEffect } from "react";
import Image from "next/image";
import { CatalogItem, WalletData } from "../types/api";
import { XIcon, AlertCircleIcon, PokeballIcon } from "./icons";

interface PurchaseModalProps {
  item: CatalogItem | null;
  initialQuantity: number;
  wallet: WalletData | null;
  onClose: () => void;
  onConfirm: (purchaseId: string, pokemonId: number, quantity: number) => Promise<void>;
}

export function PurchaseModal({
  item,
  initialQuantity,
  wallet,
  onClose,
  onConfirm,
}: PurchaseModalProps) {
  const [purchaseId, setPurchaseId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; requestId?: string } | null>(null);

  useEffect(() => {
    if (item) {
      setPurchaseId(crypto.randomUUID());
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const { pokemon, listing } = item;
  const totalPrice = listing.price * initialQuantity;
  const currentBalance = wallet ? wallet.balance : 0;
  const remainingBalance = currentBalance - totalPrice;
  const hasInsufficientFunds = wallet !== null && remainingBalance < 0;

  const handleConfirm = async () => {
    if (isSubmitting || hasInsufficientFunds) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(purchaseId, pokemon.id, initialQuantity);
    } catch (err: any) {
      setError({
        code: err.code || "PURCHASE_FAILED",
        message: err.message || "Failed to complete purchase transaction.",
        requestId: err.requestId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-[2px]">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-2">
            <PokeballIcon className="w-4 h-4 text-red-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
              Confirm Purchase Order
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Item Row */}
          <div className="flex items-center space-x-4 p-3 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
            <div className="w-14 h-14 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded flex items-center justify-center shrink-0">
              {pokemon.spriteUrl ? (
                <Image
                  src={pokemon.spriteUrl}
                  alt={pokemon.name}
                  width={48}
                  height={48}
                  className="w-12 h-12 object-contain"
                  unoptimized
                />
              ) : (
                <PokeballIcon className="w-6 h-6 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-zinc-500">#{String(pokemon.id).padStart(3, "0")}</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize truncate">
                {pokemon.name}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                ₽ {listing.price.toLocaleString()} × {initialQuantity} unit{initialQuantity > 1 ? "s" : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                ₽ {totalPrice.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Wallet Financial Breakdown */}
          <div className="space-y-1.5 text-xs font-mono border-t border-b border-zinc-100 dark:border-zinc-800 py-3">
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Current Trainer Balance</span>
              <span className="tabular-nums">₽ {wallet ? currentBalance.toLocaleString() : "---"}</span>
            </div>
            <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
              <span>Total Transaction Cost</span>
              <span className="text-red-600 dark:text-red-400 tabular-nums font-semibold">
                - ₽ {totalPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between font-bold pt-1.5 border-t border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
              <span>Remaining Balance</span>
              <span
                className={`tabular-nums ${
                  hasInsufficientFunds ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                ₽ {wallet ? remainingBalance.toLocaleString() : "---"}
              </span>
            </div>
          </div>

          {/* Idempotency Key Info */}
          <div className="text-[11px] text-zinc-500 font-mono break-all bg-zinc-100 dark:bg-zinc-800/60 p-2 rounded">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Transaction ID (UUID):</span>
            <br />
            {purchaseId}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded text-xs space-y-1 text-red-900 dark:text-red-200">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertCircleIcon className="w-4 h-4 text-red-600" />
                <span>Error: {error.code}</span>
              </div>
              <p className="text-red-700 dark:text-red-300">{error.message}</p>
              {error.requestId && (
                <div className="text-[10px] font-mono text-red-500 dark:text-red-400">
                  Request ID: {error.requestId}
                </div>
              )}
            </div>
          )}

          {hasInsufficientFunds && !error && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded text-xs flex items-center space-x-2 text-amber-800 dark:text-amber-200">
              <AlertCircleIcon className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Insufficient funds in wallet for this transaction.</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2.5 px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || hasInsufficientFunds}
            className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed rounded shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
          >
            {isSubmitting ? "Executing Order..." : "Authorize Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
