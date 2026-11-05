import React, { useState } from "react";
import Image from "next/image";
import { CatalogItem } from "../types/api";
import { TypeBadge, typeColor } from "./TypeBadge";
import { PokeballIcon, CheckIcon, CartIcon } from "./icons";
import { QuantityStepper } from "./QuantityStepper";
import { Button, cx, formatPokemonId, money } from "./ui";

interface PokemonCardProps {
  item: CatalogItem;
  onAddToCart: (item: CatalogItem, quantity: number) => void;
  onBuyNow: (item: CatalogItem, quantity: number) => void;
  inCartQuantity?: number;
  disabled?: boolean;
}

export function PokemonCard({ item, onAddToCart, onBuyNow, inCartQuantity = 0, disabled = false }: PokemonCardProps) {
  const { pokemon, listing } = item;
  const [wanted, setWanted] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const isOutOfStock = listing.availableStock <= 0;
  const availableRemaining = Math.max(0, listing.availableStock - inCartQuantity);
  const maxPurchase = Math.min(availableRemaining > 0 ? availableRemaining : listing.availableStock, 99);
  const bagIsFull = availableRemaining <= 0 && inCartQuantity > 0;
  // The bag can shrink what is still available; never offer more than that.
  const quantity = Math.max(1, Math.min(wanted, maxPurchase));

  const handleAdd = () => {
    if (isOutOfStock || disabled || maxPurchase <= 0) return;
    onAddToCart(item, quantity);
    setJustAdded(true);
    setWanted(1);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const stockTone = isOutOfStock ? "text-danger" : listing.availableStock < 5 ? "text-warn" : "text-ok";
  const primaryType = pokemon.types[0] ?? "normal";

  return (
    <article
      data-testid={`pokemon-card-${pokemon.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
    >
      {/* Sprite on a panel tinted by the primary type */}
      <div
        className="relative flex h-40 items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${typeColor(primaryType)} 14%, var(--surface-2))` }}
      >
        <span className="absolute left-3 top-3 font-mono text-xs font-semibold tabular-nums text-fg-muted">
          {formatPokemonId(pokemon.id)}
        </span>
        {inCartQuantity > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg shadow-card">
            <CartIcon className="h-3 w-3" />
            <span className="font-mono tabular-nums">{inCartQuantity}</span> in bag
          </span>
        )}
        {pokemon.spriteUrl ? (
          <Image
            src={pokemon.spriteUrl}
            alt=""
            width={112}
            height={112}
            unoptimized
            className="sprite h-28 w-28 object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <PokeballIcon className="h-12 w-12 text-fg-subtle" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h3 data-testid={`pokemon-name-${pokemon.id}`} className="text-base font-semibold capitalize leading-snug">
              {pokemon.name}
            </h3>
            <span data-testid={`pokemon-price-${pokemon.id}`} className="shrink-0 font-mono text-base font-semibold tabular-nums">
              {money(listing.price)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pokemon.types.map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
          </div>
        </div>

        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className={cx("h-2 w-2 rounded-full bg-current", stockTone)} />
          <span data-testid={`pokemon-stock-${pokemon.id}`} className={cx("font-mono tabular-nums", stockTone)}>
            {isOutOfStock ? "Out of Stock" : `${listing.availableStock} in stock`}
          </span>
        </p>

        <div className="mt-auto space-y-3 border-t border-line pt-3">
          {!isOutOfStock && availableRemaining > 0 && (
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`qty-input-${pokemon.id}`} className="text-sm text-fg-muted">
                Quantity
              </label>
              <QuantityStepper
                value={quantity}
                max={maxPurchase}
                onChange={setWanted}
                name={pokemon.name}
                inputId={`qty-input-${pokemon.id}`}
                inputTestId={`pokemon-quantity-${pokemon.id}`}
                decreaseTestId={`pokemon-quantity-decrease-${pokemon.id}`}
                increaseTestId={`pokemon-quantity-increase-${pokemon.id}`}
                disabled={disabled}
              />
            </div>
          )}

          <div className="space-y-2">
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={isOutOfStock || disabled || bagIsFull}
              data-testid={`pokemon-add-to-cart-${pokemon.id}`}
              className="w-full"
            >
              {isOutOfStock ? (
                "Out of Stock"
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
                    <span className="font-mono tabular-nums">{money(listing.price * quantity)}</span>
                  </span>
                </>
              )}
            </Button>
            {!isOutOfStock && (
              <Button
                variant="secondary"
                onClick={() => onBuyNow(item, quantity)}
                disabled={disabled}
                data-testid={`pokemon-buy-now-${pokemon.id}`}
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
