import { useState } from "react";
import { ItemCatalogItem } from "../types/api";
import { AlertCircleIcon, BackpackIcon, XIcon } from "./icons";

export function ItemCheckoutModal({ item, onClose, onConfirm }: { item: ItemCatalogItem | null; onClose: () => void; onConfirm: (item: ItemCatalogItem) => Promise<void> }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!item) return null;
  const confirm = async () => {
    setIsSubmitting(true); setError(null);
    try { await onConfirm(item); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่ภายหลัง"); }
    finally { setIsSubmitting(false); }
  };
  return <div data-testid="item-checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="item-checkout-title" className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-[2px]">
    <div className="w-full max-w-sm overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900/50"><div className="flex items-center gap-2"><BackpackIcon className="h-4 w-4 text-red-600" /><h2 id="item-checkout-title" className="text-sm font-bold uppercase tracking-wider">Confirm item purchase</h2></div><button type="button" onClick={onClose} data-testid="item-checkout-close" className="text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"><XIcon className="h-4 w-4" /></button></div>
      <div className="space-y-4 p-5"><div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/40"><p className="capitalize font-semibold">{item.name.replaceAll("-", " ")}</p><p className="mt-1 font-mono text-xs text-zinc-500">1 item · ₽ {item.price.toLocaleString()}</p>{item.requiredKycLevel > 0 && <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">สินค้านี้ต้องการการยืนยันตัวตนเพิ่มเติม กรุณาอัปเกรดบัญชีของคุณ</p>}</div>{error && <div role="alert" className="flex gap-2 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"><AlertCircleIcon className="h-4 w-4 shrink-0" />{error}</div>}<button type="button" onClick={confirm} disabled={isSubmitting} data-testid={`item-checkout-confirm-${item.id}`} className="w-full rounded bg-zinc-900 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{isSubmitting ? "Completing purchase…" : `Confirm • ₽ ${item.price.toLocaleString()}`}</button></div>
    </div>
  </div>;
}
