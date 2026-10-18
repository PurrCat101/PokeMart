import React, { useState, useEffect } from "react";
import Image from "next/image";
import { CartItem, WalletData, AuthUser } from "../types/api";
import { XIcon, TrashIcon, PlusIcon, MinusIcon, CartIcon, AlertCircleIcon, PokeballIcon } from "./icons";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  wallet: WalletData | null;
  user: AuthUser | null;
  onUpdateQuantity: (pokemonId: number, quantity: number) => void;
  onRemoveItem: (pokemonId: number) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
  onOpenLogin: () => void;
}

function CartItemRow({
  cartItem,
  onUpdateQuantity,
  onRemoveItem,
}: {
  cartItem: CartItem;
  onUpdateQuantity: (pokemonId: number, quantity: number) => void;
  onRemoveItem: (pokemonId: number) => void;
}) {
  const { item, quantity } = cartItem;
  const [inputValue, setInputValue] = useState(String(quantity));
  const maxStock = Math.min(item.listing.availableStock, 99);
  const lineTotal = item.listing.price * quantity;

  useEffect(() => {
    setInputValue(String(quantity));
  }, [quantity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setInputValue(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      const clamped = Math.min(parsed, maxStock);
      onUpdateQuantity(item.pokemon.id, clamped);
    }
  };

  const handleInputBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < 1) {
      onUpdateQuantity(item.pokemon.id, 1);
      setInputValue("1");
    } else if (parsed > maxStock) {
      onUpdateQuantity(item.pokemon.id, maxStock);
      setInputValue(String(maxStock));
    } else {
      onUpdateQuantity(item.pokemon.id, parsed);
      setInputValue(String(parsed));
    }
  };

  return (
    <div data-testid={`cart-item-${item.pokemon.id}`} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-center space-x-3">
      {/* Sprite */}
      <div className="w-12 h-12 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
        {item.pokemon.spriteUrl ? (
          <Image
            src={item.pokemon.spriteUrl}
            alt={item.pokemon.name}
            width={40}
            height={40}
            className="w-10 h-10 object-contain"
            unoptimized
          />
        ) : (
          <PokeballIcon className="w-5 h-5 text-zinc-400" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-mono text-zinc-500">
          #{String(item.pokemon.id).padStart(3, "0")}
        </div>
        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 capitalize truncate">
          {item.pokemon.name}
        </div>
        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
          ₽ {item.listing.price.toLocaleString()} each
        </div>
      </div>

      {/* Editable Quantity Stepper */}
      <div className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800">
        <button
          type="button"
          onClick={() => onUpdateQuantity(item.pokemon.id, Math.max(1, quantity - 1))}
          disabled={quantity <= 1}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Decrease quantity"
        >
          <MinusIcon className="w-3 h-3" />
        </button>
        <input
          type="text"
          data-testid={`cart-item-quantity-${item.pokemon.id}`}
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          aria-label={`Quantity of ${item.pokemon.name}`}
          className="w-10 text-center font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-zinc-400 py-0.5 rounded"
        />
        <button
          type="button"
          onClick={() => onUpdateQuantity(item.pokemon.id, Math.min(maxStock, quantity + 1))}
          disabled={quantity >= maxStock}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Increase quantity"
        >
          <PlusIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Line Total */}
      <div className="text-right min-w-[70px]">
        <div className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          ₽ {lineTotal.toLocaleString()}
        </div>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemoveItem(item.pokemon.id)}
        data-testid={`cart-item-remove-${item.pokemon.id}`}
        className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
        aria-label={`Remove ${item.pokemon.name} from cart`}
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  wallet,
  user,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToCheckout,
  onOpenLogin,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const totalItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.quantity * item.item.listing.price, 0);
  const currentBalance = wallet ? wallet.balance : 0;
  const remainingBalance = currentBalance - subtotal;
  const hasInsufficientFunds = user !== null && wallet !== null && remainingBalance < 0;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/60 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div data-testid="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" className="w-screen max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60">
            <div className="flex items-center space-x-2">
              <CartIcon className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
              <h2 id="cart-title" className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Trainer Shopping Bag
              </h2>
              <span className="font-mono text-xs text-zinc-500 font-semibold">
                ({totalItemCount} {totalItemCount === 1 ? "item" : "items"})
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="cart-close"
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length === 0 ? (
              <div data-testid="cart-empty" className="py-20 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <CartIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Your shopping bag is empty
                </h3>
                <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                  Browse the catalog to add Pokémon to your bag before checking out.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 px-3.5 py-1.5 text-xs font-semibold rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 transition-colors"
                >
                  Browse Catalog
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 text-xs">
                  <span className="text-zinc-500 font-medium">Selected Items</span>
                  <button
                    type="button"
                    onClick={onClearCart}
                    data-testid="cart-clear"
                    className="text-zinc-500 hover:text-red-600 text-[11px] transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-3">
                  {cart.map((cartItem) => (
                    <CartItemRow
                      key={cartItem.item.pokemon.id}
                      cartItem={cartItem}
                      onUpdateQuantity={onUpdateQuantity}
                      onRemoveItem={onRemoveItem}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Drawer Footer with Checkout */}
          {cart.length > 0 && (
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 space-y-3.5">
              {/* Financial Breakdown */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <span>Bag Subtotal ({totalItemCount} units)</span>
                  <span className="tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    ₽ {subtotal.toLocaleString()}
                  </span>
                </div>

                {user && (
                  <>
                    <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>Trainer Wallet Balance</span>
                      <span className="tabular-nums">₽ {wallet ? currentBalance.toLocaleString() : "---"}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-1.5 border-t border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                      <span>Balance After Checkout</span>
                      <span
                        className={`tabular-nums ${
                          hasInsufficientFunds ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        ₽ {wallet ? remainingBalance.toLocaleString() : "---"}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Insufficient funds warning */}
              {hasInsufficientFunds && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded text-xs flex items-center space-x-2 text-red-800 dark:text-red-200">
                  <AlertCircleIcon className="w-4 h-4 shrink-0 text-red-600" />
                  <span>Insufficient balance in wallet for this order.</span>
                </div>
              )}

              {/* Action Buttons */}
              {!user ? (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  data-testid="cart-sign-in"
                  className="w-full py-2.5 px-4 rounded text-xs font-bold uppercase tracking-wider text-white bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
                >
                  Sign In as Trainer to Checkout
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onProceedToCheckout}
                  disabled={hasInsufficientFunds}
                  data-testid="cart-proceed-to-checkout"
                  className="w-full py-2.5 px-4 rounded text-xs font-bold uppercase tracking-wider text-white bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
                >
                  Proceed to Checkout • ₽ {subtotal.toLocaleString()}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
