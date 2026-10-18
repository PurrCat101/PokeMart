import React, { useState, useEffect } from "react";
import Image from "next/image";
import { CatalogItem } from "../types/api";
import { TypeBadge } from "./TypeBadge";
import { PlusIcon, MinusIcon, PokeballIcon, CheckIcon, CartIcon } from "./icons";

interface PokemonCardProps {
  item: CatalogItem;
  onAddToCart: (item: CatalogItem, quantity: number) => void;
  inCartQuantity?: number;
  disabled?: boolean;
}

export function PokemonCard({
  item,
  onAddToCart,
  inCartQuantity = 0,
  disabled = false,
}: PokemonCardProps) {
  const { pokemon, listing } = item;
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState("1");
  const [justAdded, setJustAdded] = useState(false);

  const isOutOfStock = listing.availableStock <= 0;
  const availableRemaining = Math.max(0, listing.availableStock - inCartQuantity);
  const maxPurchase = Math.min(availableRemaining > 0 ? availableRemaining : listing.availableStock, 99);

  // Sync input string when quantity changes internally
  useEffect(() => {
    if (quantity > maxPurchase && maxPurchase > 0) {
      setQuantity(maxPurchase);
      setQuantityInput(String(maxPurchase));
    }
  }, [maxPurchase, quantity]);

  const handleIncrement = () => {
    if (quantity < maxPurchase) {
      const next = quantity + 1;
      setQuantity(next);
      setQuantityInput(String(next));
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      const next = quantity - 1;
      setQuantity(next);
      setQuantityInput(String(next));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setQuantityInput(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      const clamped = Math.min(parsed, maxPurchase);
      setQuantity(clamped);
    }
  };

  const handleInputBlur = () => {
    const parsed = parseInt(quantityInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      setQuantity(1);
      setQuantityInput("1");
    } else if (parsed > maxPurchase) {
      setQuantity(maxPurchase);
      setQuantityInput(String(maxPurchase));
    } else {
      setQuantity(parsed);
      setQuantityInput(String(parsed));
    }
  };

  const handleAdd = () => {
    if (isOutOfStock || disabled || maxPurchase <= 0) return;
    onAddToCart(item, quantity);
    setJustAdded(true);
    setQuantity(1);
    setQuantityInput("1");
    setTimeout(() => {
      setJustAdded(false);
    }, 1200);
  };

  const formattedId = `#${String(pokemon.id).padStart(3, "0")}`;
  const capitalizedName = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);

  return (
    <div className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden transition-all hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs">
      {/* Top Banner: ID & Stock Badge */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-900/60">
        <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {formattedId}
        </span>
        <div className="flex items-center space-x-2">
          {inCartQuantity > 0 && (
            <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
              <CartIcon className="w-3 h-3 text-zinc-500" />
              <span>{inCartQuantity} in bag</span>
            </span>
          )}
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOutOfStock ? "bg-red-500" : listing.availableStock < 5 ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {isOutOfStock ? "Out of Stock" : `${listing.availableStock} in stock`}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Sprite Container */}
      <div className="relative h-36 bg-zinc-50/30 dark:bg-zinc-950/40 flex items-center justify-center p-2 border-b border-zinc-100 dark:border-zinc-800">
        {pokemon.spriteUrl ? (
          <Image
            src={pokemon.spriteUrl}
            alt={pokemon.name}
            width={96}
            height={96}
            className="w-24 h-24 object-contain pixelated rendering-pixelated"
            unoptimized
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
            <PokeballIcon className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Card Content & Details */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base leading-tight">
              {capitalizedName}
            </h3>
            <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
              ₽ {listing.price.toLocaleString()}
            </span>
          </div>

          {/* Types */}
          <div className="flex flex-wrap gap-1 mt-2">
            {pokemon.types.map((type) => (
              <TypeBadge key={type} type={type} />
            ))}
          </div>
        </div>

        {/* Purchase / Cart Controls */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
          {!isOutOfStock && availableRemaining > 0 && (
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={`qty-input-${pokemon.id}`} className="text-zinc-600 dark:text-zinc-400 font-medium">
                Quantity
              </label>
              <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-800/60">
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={quantity <= 1 || disabled}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease quantity"
                >
                  <MinusIcon className="w-3 h-3" />
                </button>
                <input
                  id={`qty-input-${pokemon.id}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quantityInput}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  disabled={disabled}
                  aria-label={`Quantity for ${pokemon.name}`}
                  className="w-11 text-center font-mono font-semibold text-xs py-0.5 bg-transparent border-0 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-white dark:focus:bg-zinc-900 focus:ring-1 focus:ring-zinc-400 rounded tabular-nums"
                />
                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={quantity >= maxPurchase || disabled}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase quantity"
                >
                  <PlusIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={isOutOfStock || disabled || (availableRemaining <= 0 && inCartQuantity > 0)}
            className={`w-full py-2 px-3 rounded text-xs font-semibold tracking-wide uppercase transition-colors flex items-center justify-center space-x-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 focus-visible:ring-offset-1 ${
              isOutOfStock
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                : availableRemaining <= 0 && inCartQuantity > 0
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : justAdded
                ? "bg-emerald-700 text-white"
                : "bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-xs"
            }`}
          >
            {isOutOfStock ? (
              <span>Out of Stock</span>
            ) : availableRemaining <= 0 && inCartQuantity > 0 ? (
              <span>Max in Bag</span>
            ) : justAdded ? (
              <>
                <CheckIcon className="w-4 h-4" />
                <span>Added to Bag</span>
              </>
            ) : (
              <>
                <CartIcon className="w-3.5 h-3.5" />
                <span>
                  Add to Bag {quantity > 1 ? `(${quantity})` : ""} • ₽ {(listing.price * quantity).toLocaleString()}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
