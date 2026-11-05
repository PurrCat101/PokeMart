import Image from "next/image";
import { ItemCatalogItem } from "../types/api";
import { BackpackIcon, AlertCircleIcon, CartIcon } from "./icons";

export function ItemCard({ item, onPurchase, isPurchasing = false }: { item: ItemCatalogItem; onPurchase: (item: ItemCatalogItem) => void; isPurchasing?: boolean }) {
  const outOfStock = item.stock <= 0;
  return (
    <article data-testid={`item-card-${item.id}`} className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">ITEM #{String(item.id).padStart(4, "0")}</span>
        {item.requiredKycLevel > 0 && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Verification needed</span>}
      </div>
      <div className="flex h-36 items-center justify-center border-b border-zinc-100 bg-zinc-50/30 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
        {item.spriteUrl ? <Image src={item.spriteUrl} alt={item.name} width={88} height={88} unoptimized className="h-24 w-24 object-contain" /> : <BackpackIcon className="h-8 w-8 text-zinc-400" />}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 data-testid={`item-name-${item.id}`} className="capitalize font-semibold leading-tight text-zinc-900 dark:text-zinc-100">{item.name.replaceAll("-", " ")}</h3>
          <span data-testid={`item-price-${item.id}`} className="shrink-0 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">₽ {item.price.toLocaleString()}</span>
        </div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{item.category?.replaceAll("-", " ") ?? "Uncategorized"}</p>
        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
          <span data-testid={`item-stock-${item.id}`} className={`font-mono ${outOfStock ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>{outOfStock ? "Out of stock" : `${item.stock} in stock`}</span>
          {item.requiredKycLevel > 0 ? <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400"><AlertCircleIcon className="h-3.5 w-3.5" />Verification may be required</span> : <span className="text-emerald-700 dark:text-emerald-300">Available to all</span>}
        </div>
        <button
          type="button"
          onClick={() => onPurchase(item)}
          disabled={outOfStock || isPurchasing}
          data-testid={`item-purchase-${item.id}`}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          <CartIcon className="h-3.5 w-3.5" />
          <span>{outOfStock ? "Out of stock" : isPurchasing ? "Buying…" : `Buy now • ₽ ${item.price.toLocaleString()}`}</span>
        </button>
      </div>
    </article>
  );
}
