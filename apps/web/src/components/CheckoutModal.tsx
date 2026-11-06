import React, { useState } from "react";
import Image from "next/image";
import { CartItem, CheckoutFailure, CheckoutReceipt, WalletData } from "../types/api";
import { BackpackIcon, PokeballIcon } from "./icons";
import { Alert, Button, Modal, ModalHeader, money, titleCase } from "./ui";
import { type KycLevel, kycIssue, lineKey, lineName, lineRequiredKyc, lineSprite, lineTotal, lineUnitPrice, verificationName } from "../lib/cart";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The lines being paid for: the whole bag, or a single "Buy now" line. */
  lines: CartItem[];
  wallet: WalletData | null;
  kycLevel: KycLevel | null;
  onExecuteCheckout: (
    lines: CartItem[],
    onProgress: (current: number, total: number, itemName: string) => void,
  ) => Promise<{ completed: CheckoutReceipt[]; errors: CheckoutFailure[] }>;
  onCheckoutSuccess: (completed: CheckoutReceipt[]) => void;
}

export function CheckoutModal({ isOpen, onClose, lines, wallet, kycLevel, onExecuteCheckout, onCheckoutSuccess }: CheckoutModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [completed, setCompleted] = useState<CheckoutReceipt[]>([]);
  const [failures, setFailures] = useState<CheckoutFailure[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  if (!isOpen) return null;

  const totalUnits = lines.reduce((acc, line) => acc + line.quantity, 0);
  const totalCost = lines.reduce((acc, line) => acc + lineTotal(line), 0);
  const currentBalance = wallet ? wallet.balance : 0;
  const remainingBalance = currentBalance - totalCost;
  const blockedLines = lines.filter((line) => kycIssue(line, kycLevel) === "blocked");
  const cannotPay = remainingBalance < 0 || blockedLines.length > 0;

  const handleStartCheckout = async () => {
    setIsProcessing(true);
    setFailures([]);
    setCompleted([]);

    const result = await onExecuteCheckout(lines, (current, total, name) => setProgress({ current, total, name }));

    setIsProcessing(false);
    setProgress(null);
    setCompleted(result.completed);
    setFailures(result.errors);
    setIsFinished(true);
    if (result.completed.length > 0) onCheckoutSuccess(result.completed);
  };

  const handleClose = () => {
    if (isProcessing) return;
    setIsFinished(false);
    setCompleted([]);
    setFailures([]);
    onClose();
  };

  return (
    <Modal onClose={handleClose} labelledBy="checkout-title" testId="checkout-dialog" dismissible={!isProcessing}>
      <ModalHeader
        id="checkout-title"
        icon={<PokeballIcon className="h-5 w-5" />}
        title={isFinished ? "Order receipt" : "Review and pay"}
        subtitle={isFinished ? undefined : "Payment is taken from your trainer wallet."}
        onClose={handleClose}
        hideClose={isProcessing}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {isProcessing ? (
          <div data-testid="checkout-progress" role="status" className="py-10 text-center">
            <div className="mx-auto flex h-12 w-12 animate-spin items-center justify-center rounded-full bg-brand-soft text-brand-text motion-reduce:animate-none">
              <PokeballIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold">Processing your order…</h3>
            {progress && (
              <p className="mt-1 text-sm text-fg-muted">
                <span className="font-mono tabular-nums">
                  {progress.current} of {progress.total}
                </span>
                : <span className="capitalize">{progress.name}</span>
              </p>
            )}
            <p className="mt-3 text-xs text-fg-subtle">Please keep this window open.</p>
          </div>
        ) : isFinished ? (
          <>
            {completed.length > 0 && (
              <Alert
                tone="ok"
                title={`${completed.length} ${completed.length === 1 ? "order" : "orders"} placed`}
                data-testid="checkout-success"
              >
                {completed.some((r) => r.kind === "pokemon")
                  ? "Your Pokémon are now in your inventory. Shipping starts once the label is created."
                  : "Your items have been purchased."}
              </Alert>
            )}
            {failures.length > 0 && (
              <Alert tone="danger" title="Some items could not be purchased" data-testid="checkout-errors">
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {failures.map((err) => (
                    <li key={err.key}>
                      <span className="font-medium capitalize text-fg">{err.name}</span>: {err.error}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">Items that failed are still in your bag so you can try again.</p>
              </Alert>
            )}

            {completed.length > 0 && (
              <section aria-labelledby="receipt-heading">
                <h3 id="receipt-heading" className="mb-2 text-sm font-medium text-fg-muted">
                  Receipts
                </h3>
                <ul className="max-h-56 space-y-2 overflow-y-auto">
                  {completed.map((tx) => (
                    <li key={tx.purchaseId} data-testid={`checkout-purchase-${tx.purchaseId}`} className="rounded-lg border border-line bg-surface-2 p-3">
                      <div className="flex justify-between gap-3 text-sm font-semibold">
                        <span className="capitalize">
                          {tx.name} × <span className="font-mono tabular-nums">{tx.quantity}</span>
                        </span>
                        <span className="font-mono tabular-nums">{money(tx.totalPrice)}</span>
                      </div>
                      <p className="mt-1 select-all break-all font-mono text-xs text-fg-subtle">{tx.purchaseId}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {lines.map((line) => {
                const sprite = lineSprite(line);
                const KindIcon = line.kind === "pokemon" ? PokeballIcon : BackpackIcon;
                const required = lineRequiredKyc(line);
                return (
                  <li key={lineKey(line)} className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-2">
                      {sprite ? (
                        <Image src={sprite} alt="" width={36} height={36} unoptimized className="sprite h-9 w-9 object-contain" />
                      ) : (
                        <KindIcon className="h-5 w-5 text-fg-subtle" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold capitalize">{line.kind === "item" ? titleCase(line.item.name) : lineName(line)}</p>
                      <p className="font-mono text-xs tabular-nums text-fg-subtle">
                        {money(lineUnitPrice(line))} × {line.quantity}
                        {required > 0 && <span className="font-sans"> · needs {verificationName(required)}</span>}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums">{money(lineTotal(line))}</p>
                  </li>
                );
              })}
            </ul>

            <dl className="space-y-1.5 rounded-lg bg-surface-2 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Wallet balance</dt>
                <dd className="font-mono tabular-nums">{wallet ? money(currentBalance) : "₽ ---"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Order total ({totalUnits} units)</dt>
                <dd className="font-mono tabular-nums">− {money(totalCost)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt>Balance after payment</dt>
                <dd className={`font-mono tabular-nums ${remainingBalance < 0 ? "text-danger" : "text-ok"}`}>
                  {wallet ? money(remainingBalance) : "₽ ---"}
                </dd>
              </div>
            </dl>

            {remainingBalance < 0 && (
              <Alert tone="danger" title="Not enough balance">
                Go back and remove an item to continue.
              </Alert>
            )}
            {blockedLines.length > 0 && (
              <Alert tone="danger" title="More verification needed" data-testid="checkout-kyc-warning">
                {blockedLines.map(lineName).join(", ")} needs more verification than your account has.
              </Alert>
            )}
          </>
        )}
      </div>

      {!isProcessing && (
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          {isFinished ? (
            <Button variant="primary" onClick={handleClose} data-testid="checkout-close">
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleStartCheckout} disabled={cannotPay} data-testid="checkout-confirm">
                Pay <span className="font-mono tabular-nums">{money(totalCost)}</span>
              </Button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
