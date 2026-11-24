"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, clearToken, errorReference, hasStoredToken } from "../lib/api";
import { PurchaseAttempts } from "../lib/purchase-attempts";
import { lineKey, lineMaxQuantity, lineRequiredKyc, normalizeCart, verificationNameTh } from "../lib/cart";
import type { AuthUser, CartItem, CheckoutFailure, CheckoutLineRequest, CheckoutReceipt, KycStatus, PurchaseItem, WalletData } from "../types/api";
import { Header } from "../components/Header";
import { CartDrawer } from "../components/CartDrawer";
import { CheckoutModal } from "../components/CheckoutModal";
import { KycBanner } from "../components/KycBanner";
import { KycPromptModal } from "../components/KycPromptModal";
import { KycVerificationView } from "../components/KycVerificationView";
import { LoginModal } from "../components/LoginModal";
import { SessionBanner } from "../components/SessionBanner";
import { Toast, ToastMessage } from "../components/Toast";

interface AppState {
  user: AuthUser | null;
  /** False until the first session check answers, so pages do not flash a "sign in" prompt on reload. */
  sessionReady: boolean;
  /** True when the saved sign-in could not be checked (service unavailable). Pages must not show "sign in" then. */
  sessionUnavailable: boolean;
  cartQuantityMap: Map<string, number>;
  /** Bumps after every checkout so the catalog can reload its stock. */
  purchaseVersion: number;
  wallet: WalletData | null;
  /** null = unknown (signed out, or the KYC service is unavailable). */
  kyc: KycStatus | null;
  /** Opens the verification form in place of the current page. */
  startVerification: () => void;
  addLine: (line: CartItem) => void;
  buyNow: (line: CartItem) => void;
  openLogin: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

/** Session, bag, checkout, login and verification, plus the header and modals around every page. */
export function AppProvider({ children }: { children: React.ReactNode }) {

  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  // Set when the saved sign-in could not be checked because the service was unavailable (not a 401).
  const [sessionError, setSessionError] = useState<{ reference?: string } | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // null = checkout closed. Holds the whole bag, or one line for "Buy now".
  const [checkoutLines, setCheckoutLines] = useState<CartItem[] | null>(null);
  const [buyNowAfterLogin, setBuyNowAfterLogin] = useState<CartItem | null>(null);
  const [purchaseVersion, setPurchaseVersion] = useState(0);

  // null = unknown (signed out, or the KYC service is unavailable).
  const [kyc, setKyc] = useState<KycStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  // Which account dismissed the "verify your identity" popup this session.
  const [kycPromptDismissedFor, setKycPromptDismissedFor] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sessionStorage.getItem("pokemart_kyc_prompt_dismissed"),
  );

  const [toast, setToast] = useState<ToastMessage | null>(null);
  // One purchaseId per bag line until its outcome is known, so a retry after a lost answer cannot charge twice.
  const purchaseAttempts = useRef(new PurchaseAttempts());

  // Load the bag from localStorage after mount, so server and client markup match.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("pokemart_cart");
      if (stored) {
        // Bags saved before items existed have no `kind`; normalizeCart treats those as Pokemon.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists in the browser
        setCart(normalizeCart(JSON.parse(stored)));
      }
    } catch {
      // ignore JSON parse error
    }
  }, []);

  const saveCart = (newCart: CartItem[]) => {
    setCart(newCart);
    try {
      localStorage.setItem("pokemart_cart", JSON.stringify(newCart));
    } catch {
      // ignore storage quota error
    }
  };

  const syncSession = useCallback(async () => {
    try {
      const account = await api.getAccountInfo();
      setUser(account.user);
      setWallet(account.wallet);
      setKyc(account.kyc);
      setSessionError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401 && hasStoredToken()) {
        // The service is unavailable, so we do not know whether the saved sign-in is still good.
        // Keep whatever we already show; do not pretend the user signed out.
        setSessionError({ reference: err.reference });
      } else {
        // 401 (expired or missing token), or nothing saved to check: signed out.
        if (err instanceof ApiError && err.status === 401) clearToken();
        setUser(null);
        setWallet(null);
        setKyc(null);
        setSessionError(null);
      }
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session check on mount; sets its own ready flag
    void syncSession();
  }, [syncSession]);

  const lineName = (line: CartItem) => (line.kind === "pokemon" ? line.item.pokemon.name : line.item.name.replaceAll("-", " "));

  const addLine = (line: CartItem) => {
    const key = lineKey(line);
    const max = lineMaxQuantity(line);
    const existing = cart.find((c) => lineKey(c) === key);
    const updatedCart: CartItem[] = existing
      ? cart.map((c) => (lineKey(c) === key ? { ...c, quantity: Math.min(c.quantity + line.quantity, max) } : c))
      : [...cart, { ...line, quantity: Math.min(line.quantity, max) }];

    saveCart(updatedCart);
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: `Added ${lineName(line)} × ${line.quantity} to bag`,
      message: `Total items in bag: ${updatedCart.reduce((a, b) => a + b.quantity, 0)}`,
    });
  };

  const updateCartQuantity = (line: CartItem, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(line);
      return;
    }
    const key = lineKey(line);
    saveCart(cart.map((c) => (lineKey(c) === key ? { ...c, quantity: Math.min(quantity, lineMaxQuantity(c)) } : c)));
  };

  const removeFromCart = (line: CartItem) => {
    const key = lineKey(line);
    saveCart(cart.filter((c) => lineKey(c) !== key));
  };

  // "Buy now" pays for one line without touching the bag.
  const buyNow = (line: CartItem) => {
    if (!user) {
      setBuyNowAfterLogin(line);
      setIsLoginOpen(true);
      return;
    }
    setCheckoutLines([line]);
  };

  const handleLogin = async (credentials: { email: string; password: string }) => {
    const res = await api.login(credentials);
    purchaseAttempts.current.clear(); // ids belong to one account
    setUser(res.user);
    const account = await api.getAccountInfo();
    setWallet(account.wallet);
    setKyc(account.kyc);
    if (buyNowAfterLogin) {
      setCheckoutLines([buyNowAfterLogin]);
      setBuyNowAfterLogin(null);
    }
    setToast({
      id: crypto.randomUUID(),
      type: "success",
      title: "Trainer Authenticated",
      message: `Signed in as ${res.user.displayName}`,
    });
  };

  const handleLogout = () => {
    api.logout();
    purchaseAttempts.current.clear();
    setUser(null);
    setWallet(null);
    setKyc(null);
    setToast({
      id: crypto.randomUUID(),
      type: "info",
      title: "Session Terminated",
      message: "Trainer logged out safely.",
    });
  };

  // Buys the whole bag in one request, so it is all-or-nothing: either every line is bought, or none is and the
  // wallet, stock and inventory are untouched. Each line still has its own purchase id, kept across uncertain tries.
  const executeCheckout = async (lines: CartItem[], onProgress: (current: number, total: number, itemName: string) => void) => {
    const completed: CheckoutReceipt[] = [];
    const errors: CheckoutFailure[] = [];
    onProgress(1, 1, "your bag");

    const receipt = (line: CartItem, purchase: PurchaseItem): CheckoutReceipt => ({
      purchaseId: purchase.purchaseId,
      kind: line.kind,
      name: (line.kind === "pokemon" ? purchase.pokemon?.name : purchase.item?.name.replaceAll("-", " ")) ?? lineName(line),
      quantity: purchase.quantity,
      totalPrice: purchase.pricing.totalPrice,
    });

    let pending = lines;
    // Round 2 only runs when an earlier checkout committed part of this bag and its answer was lost (see below).
    for (let round = 0; round < 2 && pending.length > 0; round++) {
      const attempts = pending.map((line) => purchaseAttempts.current.begin(line));
      const isRetry = attempts.some((a) => a.isRetry);
      try {
        const result = await api.createCheckout(
          pending.map((line, i) => ({
            purchaseId: attempts[i].purchaseId,
            ...(line.kind === "pokemon" ? { pokemonId: line.item.pokemon.id } : { itemId: line.item.id }),
            quantity: line.quantity,
          })) as CheckoutLineRequest[],
        );
        const byId = new Map(result.purchases.map((p) => [p.purchaseId, p]));
        pending.forEach((line, i) => {
          const purchase = byId.get(attempts[i].purchaseId);
          if (purchase) completed.push(receipt(line, purchase));
          purchaseAttempts.current.settle(line);
        });
        pending = [];
      } catch (checkoutErr) {
        // An earlier try committed (all of it, since it is atomic) and its answer was lost: read the orders back.
        // Lines that are not there were added to the bag since, so buy those in a second round.
        if (isRetry && checkoutErr instanceof ApiError && checkoutErr.code === "PURCHASE_DUPLICATE") {
          const reads = await Promise.allSettled(pending.map((_, i) => api.getPurchase(attempts[i].purchaseId)));
          const notBought: CartItem[] = [];
          let unconfirmed: unknown = null;
          reads.forEach((read, i) => {
            if (read.status === "fulfilled") {
              completed.push(receipt(pending[i], read.value));
              purchaseAttempts.current.settle(pending[i]);
            } else if (read.reason instanceof ApiError && read.reason.status === 404) {
              notBought.push(pending[i]);
            } else {
              unconfirmed = read.reason;
            }
          });
          if (unconfirmed === null) {
            pending = notBought; // empty when everything was confirmed
            continue;
          }
          checkoutErr = unconfirmed; // could not confirm either: keep the ids and report it as uncertain
        }

        // A 5xx, a timeout or a lost connection can mean the order went through. Only a clear rejection frees the ids.
        const uncertain = checkoutErr instanceof ApiError && (checkoutErr.status >= 500 || checkoutErr.code === "NETWORK_ERROR");
        if (!uncertain) pending.forEach((line) => purchaseAttempts.current.settle(line));

        const message =
          checkoutErr instanceof ApiError && checkoutErr.code === "KYC_LEVEL_REQUIRED"
            ? `ต้อง${verificationNameTh(Math.max(...pending.map(lineRequiredKyc)))}ก่อนจึงจะซื้อได้`
            : checkoutErr instanceof Error && checkoutErr.message
              ? checkoutErr.message
              : "Order rejected by server.";
        // Nothing was bought, so every remaining line fails together with the same reason.
        pending.forEach((line) => errors.push({ key: lineKey(line), name: lineName(line), error: message, reference: errorReference(checkoutErr), uncertain }));
        break;
      }
    }

    try {
      const account = await api.getAccountInfo();
      setWallet(account.wallet);
      setKyc(account.kyc);
    } catch {
      // ignore
    }
    if (completed.length > 0) setPurchaseVersion((n) => n + 1);

    // Remove successfully purchased lines from the bag (a no-op for "Buy now" lines)
    if (completed.length > 0) {
      const failedKeys = new Set(errors.map((e) => e.key));
      const boughtKeys = new Set(lines.map(lineKey).filter((k) => !failedKeys.has(k)));
      saveCart(cart.filter((c) => !boughtKeys.has(lineKey(c))));
    }

    return { completed, errors };
  };

  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((c) => map.set(lineKey(c), c.quantity));
    return map;
  }, [cart]);

  const needsVerificationPrompt =
    !!user && kyc?.status === "ACTIVE" && kyc.level === 0 && kycPromptDismissedFor !== user.userId && !isVerifying && !isLoginOpen && checkoutLines === null;
  const dismissKycPrompt = () => {
    if (!user) return;
    setKycPromptDismissedFor(user.userId);
    try {
      sessionStorage.setItem("pokemart_kyc_prompt_dismissed", user.userId);
    } catch {
      // ignore storage errors
    }
  };

  const value = useMemo<AppState>(
    () => ({
      user,
      sessionReady,
      sessionUnavailable: sessionError !== null,
      cartQuantityMap,
      purchaseVersion,
      wallet,
      kyc,
      startVerification: () => setIsVerifying(true),
      addLine,
      buyNow,
      openLogin: () => setIsLoginOpen(true),
    }),
    // addLine and buyNow close over the bag and the signed-in user, so they change with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, sessionReady, sessionError, cartQuantityMap, purchaseVersion, wallet, kyc, cart],
  );

  const showVerification = isVerifying && !!user;

  return (
    <AppContext.Provider value={value}>
      <div data-testid="app-shell" className="flex min-h-dvh flex-col">
        <Header
          user={user}
          wallet={wallet}
          cartCount={cart.reduce((acc, c) => acc + c.quantity, 0)}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenLogin={() => setIsLoginOpen(true)}
          onLogout={handleLogout}
          onNavigate={() => setIsVerifying(false)}
        />

        {/* pb-24 clears the fixed mobile tab bar */}
        <main id="main" tabIndex={-1} data-testid="app-main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 outline-none sm:px-6 md:pb-10 lg:px-8">
          {sessionError && <SessionBanner reference={sessionError.reference} onRetry={() => void syncSession()} />}
          {user && !showVerification && <KycBanner kyc={kyc} onRetry={() => setIsVerifying(true)} />}

          {showVerification ? (
            <KycVerificationView
              onBack={() => setIsVerifying(false)}
              onSubmitted={(next) => {
                setKyc(next);
                setIsVerifying(false);
                setToast({
                  id: crypto.randomUUID(),
                  type: "info",
                  title: "Verification sent",
                  message: "We are reviewing your details.",
                });
              }}
            />
          ) : (
            children
          )}
        </main>

        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cart={cart}
          wallet={wallet}
          user={user}
          kyc={kyc}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onClearCart={() => saveCart([])}
          onProceedToCheckout={() => {
            setIsCartOpen(false);
            setCheckoutLines(cart);
          }}
          onOpenLogin={() => {
            setIsCartOpen(false);
            setIsLoginOpen(true);
          }}
        />

        <CheckoutModal
          isOpen={checkoutLines !== null}
          onClose={() => setCheckoutLines(null)}
          lines={checkoutLines ?? []}
          wallet={wallet}
          kyc={kyc}
          onExecuteCheckout={executeCheckout}
        />

        {isLoginOpen && (
          <LoginModal
            isOpen={isLoginOpen}
            onClose={() => {
              setIsLoginOpen(false);
              setBuyNowAfterLogin(null);
            }}
            onLoginSuccess={handleLogin}
          />
        )}

        {needsVerificationPrompt && (
          <KycPromptModal
            onLater={dismissKycPrompt}
            onVerifyNow={() => {
              dismissKycPrompt();
              setIsCartOpen(false);
              setIsVerifying(true);
            }}
          />
        )}

        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </AppContext.Provider>
  );
}
