import type { CartItem } from "../types/api";
import { lineKey } from "./cart";

/**
 * Remembers one `checkoutId` per bag until its outcome is known.
 *
 * A checkout that ends in a 503, a timeout or a lost connection may have been committed before the
 * answer was lost. Paying again with a fresh UUID would then buy the bag twice. Re-sending the same
 * `checkoutId` with the same bag is safe: if the first try committed, the API answers with the stored
 * result (`Idempotent-Replayed: true`) and nothing is charged again; if it did not, the retry goes
 * through normally (see `specs/03-api-contract.md` section 7).
 *
 * The key is the whole bag (every line and its quantity, in any order). The API refuses a checkoutId
 * reused for a different bag (`409 CHECKOUT_ID_CONFLICT`), so a changed bag is a new purchase intent
 * and gets a new id.
 */
export class PurchaseAttempts {
  private readonly ids = new Map<string, string>();

  private key(lines: CartItem[]): string {
    return lines.map((line) => `${lineKey(line)}:${line.quantity}`).sort().join("|");
  }

  /** The checkoutId to send for this bag, and whether an earlier attempt with the same id may have committed. */
  begin(lines: CartItem[]): { checkoutId: string; isRetry: boolean } {
    const key = this.key(lines);
    const existing = this.ids.get(key);
    if (existing) return { checkoutId: existing, isRetry: true };
    const checkoutId = crypto.randomUUID();
    this.ids.set(key, checkoutId);
    return { checkoutId, isRetry: false };
  }

  /** The outcome is known (bought, or clearly rejected): the next attempt is a new purchase intent. */
  settle(lines: CartItem[]): void {
    this.ids.delete(this.key(lines));
  }

  /** Ids belong to one account; forget them on sign-in and sign-out. */
  clear(): void {
    this.ids.clear();
  }
}
