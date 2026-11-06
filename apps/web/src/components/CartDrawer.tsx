import React from "react";
import Image from "next/image";
import { CartItem, WalletData, AuthUser } from "../types/api";
import { TrashIcon, CartIcon, PokeballIcon, BackpackIcon, UserIcon } from "./icons";
import { QuantityStepper } from "./QuantityStepper";
import { Alert, Button, IconButton, Modal, ModalHeader, formatPokemonId, money, titleCase } from "./ui";
import {
  verificationName,
  yourAccountSentence,
  type KycLevel,
  cartTestId,
  kycIssue,
  lineId,
  lineKey,
  lineMaxQuantity,
  lineName,
  lineRequiredKyc,
  lineSprite,
  lineTotal,
  lineUnitPrice,
} from "../lib/cart";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  wallet: WalletData | null;
  user: AuthUser | null;
  /** null = unknown (signed out, or the KYC service is unavailable). */
  kycLevel: KycLevel | null;
  onUpdateQuantity: (line: CartItem, quantity: number) => void;
  onRemoveItem: (line: CartItem) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
  onOpenLogin: () => void;
}

function KycNote({ line, user, kycLevel }: { line: CartItem; user: AuthUser | null; kycLevel: KycLevel | null }) {
  const required = lineRequiredKyc(line);
  if (required === 0) return null;
  const issue = user ? kycIssue(line, kycLevel) : null;
  const tone = issue === "blocked" ? "text-danger" : "text-warn";
  let text = `Needs ${verificationName(required)}`;
  if (issue === "blocked") text = `Needs ${verificationName(required)}. ${yourAccountSentence(kycLevel ?? 0)}, so this can't be bought yet.`;
  else if (issue === "unknown") text = `Needs ${verificationName(required)}. We couldn't check your account's verification right now.`;
  return (
    <p data-testid={cartTestId(line, "kyc")} className={`mt-1 flex items-start gap-1.5 text-xs ${tone}`}>
      <UserIcon className="mt-0.5 h-3 w-3 shrink-0" />
      {text}
    </p>
  );
}

function CartItemRow({
  line,
  user,
  kycLevel,
  onUpdateQuantity,
  onRemoveItem,
}: {
  line: CartItem;
  user: AuthUser | null;
  kycLevel: KycLevel | null;
  onUpdateQuantity: (line: CartItem, quantity: number) => void;
  onRemoveItem: (line: CartItem) => void;
}) {
  const sprite = lineSprite(line);
  const name = lineName(line);
  const issue = user ? kycIssue(line, kycLevel) : null;
  const KindIcon = line.kind === "pokemon" ? PokeballIcon : BackpackIcon;

  return (
    <li
      data-testid={cartTestId(line)}
      className={`flex gap-3 rounded-lg border bg-surface p-3 ${issue === "blocked" ? "border-danger/50" : "border-line"}`}
    >
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-surface-2">
        {sprite ? (
          <Image src={sprite} alt="" width={56} height={56} unoptimized className="sprite h-14 w-14 object-contain" />
        ) : (
          <KindIcon className="h-6 w-6 text-fg-subtle" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-xs tabular-nums text-fg-subtle">
              {line.kind === "pokemon" ? formatPokemonId(lineId(line)) : "Item"}
            </p>
            <p className="truncate font-semibold capitalize">{line.kind === "item" ? titleCase(line.item.name) : name}</p>
          </div>
          <IconButton
            label={`Remove ${name} from bag`}
            onClick={() => onRemoveItem(line)}
            data-testid={cartTestId(line, "remove")}
            className="-mr-2 -mt-1 hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>

        <KycNote line={line} user={user} kycLevel={kycLevel} />

        <div className="mt-2 flex items-center justify-between gap-2">
          <QuantityStepper
            value={line.quantity}
            max={lineMaxQuantity(line)}
            onChange={(next) => onUpdateQuantity(line, next)}
            name={name}
            inputTestId={cartTestId(line, "quantity")}
          />
          <div className="text-right">
            <p className="font-mono text-sm font-semibold tabular-nums">{money(lineTotal(line))}</p>
            <p className="font-mono text-xs tabular-nums text-fg-subtle">{money(lineUnitPrice(line))} each</p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  wallet,
  user,
  kycLevel,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToCheckout,
  onOpenLogin,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const totalItemCount = cart.reduce((acc, line) => acc + line.quantity, 0);
  const subtotal = cart.reduce((acc, line) => acc + lineTotal(line), 0);
  const currentBalance = wallet ? wallet.balance : 0;
  const remainingBalance = currentBalance - subtotal;
  const hasInsufficientFunds = user !== null && wallet !== null && remainingBalance < 0;
  const blockedLines = user ? cart.filter((line) => kycIssue(line, kycLevel) === "blocked") : [];
  const unknownLines = user ? cart.filter((line) => kycIssue(line, kycLevel) === "unknown") : [];

  return (
    <Modal variant="drawer" onClose={onClose} labelledBy="cart-title" testId="cart-drawer">
      <ModalHeader
        id="cart-title"
        icon={<CartIcon className="h-5 w-5" />}
        title="Your bag"
        subtitle={`${totalItemCount} ${totalItemCount === 1 ? "item" : "items"}`}
        onClose={onClose}
        closeTestId="cart-close"
      />

      <div className="flex-1 overflow-y-auto p-5">
        {cart.length === 0 ? (
          <div data-testid="cart-empty" className="flex h-full flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
              <CartIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-semibold">Your bag is empty</h3>
            <p className="mt-1 max-w-xs text-sm text-fg-muted">Add a Pokémon or an item from the catalog and it will show up here.</p>
            <Button variant="secondary" onClick={onClose} className="mt-5">
              Keep browsing
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-fg-muted">Items</h3>
              <Button variant="ghost" size="sm" onClick={onClearCart} data-testid="cart-clear" className="-mr-3">
                Clear bag
              </Button>
            </div>
            <ul className="space-y-3">
              {cart.map((line) => (
                <CartItemRow
                  key={lineKey(line)}
                  line={line}
                  user={user}
                  kycLevel={kycLevel}
                  onUpdateQuantity={onUpdateQuantity}
                  onRemoveItem={onRemoveItem}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="space-y-4 border-t border-line bg-surface-2 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Subtotal ({totalItemCount} units)</dt>
              <dd className="font-mono font-semibold tabular-nums">{money(subtotal)}</dd>
            </div>
            {user && (
              <>
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Wallet balance</dt>
                  <dd className="font-mono tabular-nums">{wallet ? money(currentBalance) : "₽ ---"}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 font-semibold">
                  <dt>Balance after checkout</dt>
                  <dd className={`font-mono tabular-nums ${hasInsufficientFunds ? "text-danger" : "text-ok"}`}>
                    {wallet ? money(remainingBalance) : "₽ ---"}
                  </dd>
                </div>
              </>
            )}
          </dl>

          {hasInsufficientFunds && (
            <Alert tone="danger" title="Not enough balance">
              Your wallet can&apos;t cover this order. Remove an item or reduce a quantity.
            </Alert>
          )}
          {blockedLines.length > 0 && (
            <Alert tone="danger" title="More verification needed" data-testid="cart-kyc-warning">
              Remove {blockedLines.map(lineName).join(", ")} from your bag, or complete more verification to buy {blockedLines.length === 1 ? "it" : "them"}.
            </Alert>
          )}
          {blockedLines.length === 0 && unknownLines.length > 0 && (
            <Alert tone="warn" title="Couldn't check your verification" data-testid="cart-kyc-warning">
              Some items need extra verification. You can still try; the order is rejected if your account isn&apos;t verified enough.
            </Alert>
          )}

          {!user ? (
            <Button variant="primary" onClick={onOpenLogin} data-testid="cart-sign-in" className="w-full">
              Sign in to check out
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={onProceedToCheckout}
              disabled={hasInsufficientFunds || blockedLines.length > 0}
              data-testid="cart-proceed-to-checkout"
              className="w-full"
            >
              Proceed to checkout · <span className="font-mono tabular-nums">{money(subtotal)}</span>
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
