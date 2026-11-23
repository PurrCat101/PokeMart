"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, clearToken, errorReference, hasStoredToken } from "../lib/api";
import { PurchaseAttempts } from "../lib/purchase-attempts";
import { lineKey, lineMaxQuantity, lineRequiredKyc, normalizeCart, verificationNameTh } from "../lib/cart";
import type { AuthUser, CartItem, CheckoutFailure, CheckoutReceipt, KycStatus, WalletData } from "../types/api";
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

  // Pays for each line against its own endpoint. A failed line never blocks the others.
  const executeCheckout = async (lines: CartItem[], onProgress: (current: number, total: number, itemName: string) => void) => {
    const completed: CheckoutReceipt[] = [];
    const errors: CheckoutFailure[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const name = lineName(line);
      onProgress(i + 1, lines.length, name);

      // Same id as an earlier try that ended without an answer, so a retry can never charge twice.
      const { purchaseId, isRetry } = purchaseAttempts.current.begin(line);

      try {
        if (line.kind === "pokemon") {
          const purchase = await api.createPurchase({
            purchaseId,
            pokemonId: line.item.pokemon.id,
            quantity: line.quantity,
          });
          completed.push({
            purchaseId: purchase.purchaseId,
            kind: "pokemon",
            name: purchase.pokemon?.name ?? name,
            quantity: purchase.quantity,
            totalPrice: purchase.pricing.totalPrice,
          });
        } else {
          const purchase = await api.createItemPurchase({
            purchaseId,
            itemId: line.item.id,
            quantity: line.quantity,
          });
          completed.push({
            purchaseId: purchase.purchaseId,
            kind: "item",
            name: purchase.itemName.replaceAll("-", " "),
            quantity: purchase.quantity,
            totalPrice: purchase.totalPrice,
          });
        }
        purchaseAttempts.current.settle(line);
        continue;
      } catch (purchaseErr) {
        let failure: unknown = purchaseErr;

        // The earlier try did commit; its answer was just lost. Read the order back instead of reporting a failure.
        if (isRetry && purchaseErr instanceof ApiError && purchaseErr.code === "PURCHASE_DUPLICATE") {
          try {
            const purchase = await api.getPurchase(purchaseId);
            completed.push({
              purchaseId: purchase.purchaseId,
              kind: line.kind,
              name: (line.kind === "pokemon" ? purchase.pokemon?.name : purchase.item?.name.replaceAll("-", " ")) ?? name,
              quantity: purchase.quantity,
              totalPrice: purchase.pricing.totalPrice,
            });
            purchaseAttempts.current.settle(line);
            continue;
          } catch (readErr) {
            failure = readErr; // could not confirm either: keep the id and report it as uncertain
          }
        }

        // A 5xx, a timeout or a lost connection on a purchase can mean the order went through.
        // Only a clear rejection frees the id; an uncertain result keeps it for the next try.
        const uncertain = failure instanceof ApiError && (failure.status >= 500 || failure.code === "NETWORK_ERROR");
        if (!uncertain) purchaseAttempts.current.settle(line);

        const message =
          failure instanceof ApiError && failure.code === "KYC_LEVEL_REQUIRED"
            ? `ต้อง${verificationNameTh(lineRequiredKyc(line))}ก่อนจึงจะซื้อได้`
            : failure instanceof Error && failure.message
              ? failure.message
              : "Purchase rejected by server.";
        errors.push({ key: lineKey(line), name, error: message, reference: errorReference(failure), uncertain });
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
