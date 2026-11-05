import { useState } from "react";
import Image from "next/image";
import { ItemCatalogItem } from "../types/api";
import { BackpackIcon, CartIcon, CheckIcon, UserIcon } from "./icons";
import { QuantityStepper } from "./QuantityStepper";
import { Button, cx, money, titleCase } from "./ui";

interface ItemCardProps {
  item: ItemCatalogItem;
  onAddToCart: (item: ItemCatalogItem, quantity: number) => void;
  onBuyNow: (item: ItemCatalogItem, quantity: number) => void;
  inCartQuantity?: number;
}

export function ItemCard({ item, onAddToCart, onBuyNow, inCartQuantity = 0 }: ItemCardProps) {
  const [wanted, setWanted] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const outOfStock = item.stock <= 0;
  const needsKyc = item.requiredKycLevel > 0;
  const availableRemaining = Math.max(0, item.stock - inCartQuantity);
  const maxPurchase = Math.min(availableRemaining > 0 ? availableRemaining : item.stock, 99);
  const bagIsFull = availableRemaining <= 0 && inCartQuantity > 0;
  const quantity = Math.max(1, Math.min(wanted, maxPurchase));
  const stockTone = outOfStock ? "text-danger" : item.stock < 5 ? "text-warn" : "text-ok";
  const displayName = item.name.replaceAll("-", " ");

  const handleAdd = () => {
    if (outOfStock || maxPurchase <= 0) return;
    onAddToCart(item, quantity);
    setJustAdded(true);
    setWanted(1);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <article
      data-testid={`item-card-${item.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      <div className="relative flex h-40 items-center justify-center bg-surface-2">
        <span className="absolute left-3 top-3 font-mono text-xs font-semibold tabular-nums text-fg-muted">
          ITEM {String(item.id).padStart(4, "0")}
        </span>
        {inCartQuantity > 0 ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg shadow-card">
            <CartIcon className="h-3 w-3" />
            <span className="font-mono tabular-nums">{inCartQuantity}</span> in bag
          </span>
        ) : (
          needsKyc && (
            <span
              data-testid={`item-kyc-${item.id}`}
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn"
            >
              <UserIcon className="h-3 w-3" />
              KYC level {item.requiredKycLevel}
            </span>
          )
        )}
        {item.spriteUrl ? (
          <Image
            src={item.spriteUrl}
            alt=""
            width={96}
            height={96}
            unoptimized
            className="sprite h-24 w-24 object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <BackpackIcon className="h-10 w-10 text-fg-subtle" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 data-testid={`item-name-${item.id}`} className="text-base font-semibold capitalize leading-snug">
              {displayName}
            </h3>
            <span data-testid={`item-price-${item.id}`} className="shrink-0 font-mono text-base font-semibold tabular-nums">
              {money(item.price)}
            </span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">{item.category ? titleCase(item.category) : "Uncategorized"}</p>
        </div>

        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className={cx("h-2 w-2 rounded-full bg-current", stockTone)} />
            <span data-testid={`item-stock-${item.id}`} className={cx("font-mono tabular-nums", stockTone)}>
              {outOfStock ? "Out of stock" : `${item.stock} in stock`}
            </span>
          </p>
          {needsKyc && inCartQuantity > 0 && <span className="text-xs text-warn">KYC level {item.requiredKycLevel}</span>}
        </div>

        <div className="mt-auto space-y-3 border-t border-line pt-3">
          {!outOfStock && availableRemaining > 0 && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`item-qty-input-${item.id}`} className="text-sm text-fg-muted">
                Quantity
              </label>
              <QuantityStepper
                value={quantity}
                max={maxPurchase}
                onChange={setWanted}
                name={displayName}
                inputId={`item-qty-input-${item.id}`}
                inputTestId={`item-quantity-${item.id}`}
                decreaseTestId={`item-quantity-decrease-${item.id}`}
                increaseTestId={`item-quantity-increase-${item.id}`}
              />
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={outOfStock || bagIsFull}
              data-testid={`item-add-to-cart-${item.id}`}
              className="w-full"
            >
              {outOfStock ? (
                "Out of stock"
              ) : bagIsFull ? (
                "Max in bag"
              ) : justAdded ? (
                <>
                  <CheckIcon className="h-4 w-4" />
                  Added to bag
                </>
              ) : (
                <>
                  <CartIcon className="h-4 w-4" />
                  <span>
                    Add to bag{quantity > 1 ? ` (${quantity})` : ""} ·{" "}
                    <span className="font-mono tabular-nums">{money(item.price * quantity)}</span>
                  </span>
                </>
              )}
            </Button>
            {!outOfStock && (
              <Button
                variant="secondary"
                onClick={() => onBuyNow(item, quantity)}
                data-testid={`item-buy-now-${item.id}`}
                className="w-full"
              >
                Buy now
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
