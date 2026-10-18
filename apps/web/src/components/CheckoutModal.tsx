import React, { useState } from "react";
import Image from "next/image";
import { CartItem, WalletData, PurchaseItem } from "../types/api";
import { XIcon, AlertCircleIcon, PokeballIcon, CheckIcon } from "./icons";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  wallet: WalletData | null;
  onExecuteCheckout: (
    items: CartItem[],
    onProgress: (current: number, total: number, itemName: string) => void
  ) => Promise<{ completed: PurchaseItem[]; errors: Array<{ pokemonId: number; name: string; error: string }> }>;
  onCheckoutSuccess: () => void;
}

export function CheckoutModal({
  isOpen,
  onClose,
  cart,
  wallet,
  onExecuteCheckout,
  onCheckoutSuccess,
}: CheckoutModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [completedPurchases, setCompletedPurchases] = useState<PurchaseItem[]>([]);
  const [checkoutErrors, setCheckoutErrors] = useState<Array<{ pokemonId: number; name: string; error: string }>>([]);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen) return null;

  const totalItemUnits = cart.reduce((acc, item) => acc + item.quantity, 0);
  const totalCost = cart.reduce((acc, item) => acc + item.quantity * item.item.listing.price, 0);
  const currentBalance = wallet ? wallet.balance : 0;
  const remainingBalance = currentBalance - totalCost;

  const handleStartCheckout = async () => {
    setIsProcessing(true);
    setCheckoutErrors([]);
    setCompletedPurchases([]);

    const result = await onExecuteCheckout(cart, (current, total, itemName) => {
      setProgressText(`Processing ${current} of ${total}: ${itemName}...`);
    });

    setIsProcessing(false);
    setCompletedPurchases(result.completed);
    setCheckoutErrors(result.errors);
    setIsFinished(true);

    if (result.completed.length > 0) {
      onCheckoutSuccess();
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setIsFinished(false);
    setCompletedPurchases([]);
    setCheckoutErrors([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-[2px]">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-2">
            <PokeballIcon className="w-5 h-5 text-red-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
              {isFinished ? "Order Authorization Receipt" : "Authorize Purchase Order"}
            </h2>
          </div>
          {!isProcessing && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Ongoing Processing State */}
          {isProcessing ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center animate-spin">
                <PokeballIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Executing Blockchain-Verified Purchase Orders
                </h3>
                <p className="text-xs font-mono text-zinc-500">{progressText}</p>
              </div>
            </div>
          ) : isFinished ? (
            /* Finished Receipt State */
            <div className="space-y-4">
              {completedPurchases.length > 0 && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded text-xs space-y-1 text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center space-x-1.5 font-bold">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    <span>Successfully Acquired {completedPurchases.length} Order Item(s)!</span>
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-300">
                    All items have been debited and deposited directly into your Trainer Backpack.
                  </p>
                </div>
              )}

              {checkoutErrors.length > 0 && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded text-xs space-y-1 text-red-900 dark:text-red-200">
                  <div className="flex items-center space-x-1.5 font-bold">
                    <AlertCircleIcon className="w-4 h-4 text-red-600" />
                    <span>Some items could not be processed:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-red-700 dark:text-red-300">
                    {checkoutErrors.map((err) => (
                      <li key={err.pokemonId}>
                        <span className="font-semibold capitalize">{err.name}</span>: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transactions Audit List */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Generated Transaction IDs (UUID):
                </span>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {completedPurchases.map((tx) => (
                    <div
                      key={tx.purchaseId}
                      className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs font-mono"
                    >
                      <div className="flex justify-between items-center text-zinc-900 dark:text-zinc-100 font-bold">
                        <span className="capitalize">{tx.pokemon.name} × {tx.quantity}</span>
                        <span>₽ {tx.pricing.totalPrice.toLocaleString()}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 break-all select-all mt-0.5">
                        Tx: {tx.purchaseId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Order Review State */
            <div className="space-y-4">
              <div className="text-xs text-zinc-500">
                Review your order details before authorizing payment from your Trainer Wallet.
              </div>

              {/* Order Items Table */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
                  {cart.map(({ item, quantity }) => (
                    <div
                      key={item.pokemon.id}
                      className="p-3 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          {item.pokemon.spriteUrl ? (
                            <Image
                              src={item.pokemon.spriteUrl}
                              alt={item.pokemon.name}
                              width={28}
                              height={28}
                              className="w-7 h-7 object-contain"
                              unoptimized
                            />
                          ) : (
                            <PokeballIcon className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-sans font-bold capitalize text-zinc-900 dark:text-zinc-100">
                            {item.pokemon.name}
                          </div>
                          <div className="text-zinc-500 text-[11px]">
                            ₽ {item.listing.price.toLocaleString()} × {quantity}
                          </div>
                        </div>
                      </div>
                      <div className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        ₽ {(item.listing.price * quantity).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Ledger Breakdown */}
              <div className="space-y-1.5 text-xs font-mono p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Current Trainer Balance</span>
                  <span className="tabular-nums font-semibold">
                    ₽ {wallet ? currentBalance.toLocaleString() : "---"}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Order Total ({totalItemUnits} units)</span>
                  <span className="text-red-600 dark:text-red-400 tabular-nums font-semibold">
                    - ₽ {totalCost.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between font-bold pt-1.5 border-t border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                  <span>Remaining Balance</span>
                  <span
                    className={`tabular-nums ${
                      remainingBalance < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    ₽ {wallet ? remainingBalance.toLocaleString() : "---"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end space-x-2.5 px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          {isFinished ? (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 rounded transition-colors"
            >
              Close & View Inventory
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isProcessing}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                Back to Bag
              </button>
              <button
                type="button"
                onClick={handleStartCheckout}
                disabled={isProcessing || remainingBalance < 0}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed rounded shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
              >
                Confirm Payment (₽ {totalCost.toLocaleString()})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
