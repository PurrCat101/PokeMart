import type { CartItem } from "../types/api";
import { lineKey } from "./cart";

/**
 * Remembers one `purchaseId` per bag line until its outcome is known.
 *
 * A purchase that ends in a 503, a timeout or a lost connection may have been committed before the
 * answer was lost. Paying again with a fresh UUID would then charge twice. Re-sending the same
 * `purchaseId` is safe: if the first try committed, the API answers `409 PURCHASE_DUPLICATE`
 * (see `specs/03-api-contract.md` section 7); if it did not, the retry goes through normally.
 *
 * The key includes the quantity because the API treats a committed id as a duplicate even when the
 * body differs; a changed quantity is a new purchase intent and gets a new id.
 */
export class PurchaseAttempts {
  private readonly ids = new Map<string, string>();

  private key(line: CartItem): string {
    return `${lineKey(line)}:${line.quantity}`;
  }

  /** The id to send for this line, and whether an earlier attempt with the same id may have committed. */
  begin(line: CartItem): { purchaseId: string; isRetry: boolean } {
    const key = this.key(line);
    const existing = this.ids.get(key);
    if (existing) return { purchaseId: existing, isRetry: true };
    const purchaseId = crypto.randomUUID();
    this.ids.set(key, purchaseId);
    return { purchaseId, isRetry: false };
  }

  /** The outcome is known (bought, or clearly rejected): the next attempt is a new purchase intent. */
  settle(line: CartItem): void {
    this.ids.delete(this.key(line));
  }

  /** Ids belong to one account; forget them on sign-in and sign-out. */
  clear(): void {
    this.ids.clear();
  }
}
