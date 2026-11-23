"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { WalletIcon } from "./icons";
import type { WalletData } from "../types/api";
import { cx, money } from "./ui";

/**
 * Header wallet control. The balance is private, so it is not on screen until the menu is opened,
 * and it is rendered only while open (nothing to read from the DOM or a screen share otherwise).
 */
export function WalletMenu({ wallet, onNavigate }: { wallet: WalletData | null; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="wallet-menu-button"
        className={cx(
          "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-medium transition-colors hover:bg-surface-2 sm:h-9",
          open ? "bg-surface-2" : "bg-surface",
        )}
      >
        <WalletIcon className="h-4 w-4 text-ok" />
        <span className="hidden sm:inline">Wallet</span>
      </button>

      {open && (
        <div
          id={menuId}
          data-testid="wallet-menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-line bg-surface p-4 shadow-lg"
        >
          <p className="text-xs text-fg-muted">Wallet balance</p>
          <p data-testid="wallet-balance" className="mt-1 font-mono text-2xl font-bold tabular-nums">
            {wallet ? money(wallet.balance) : "₽ ---"}
          </p>
          <Link
            href="/profile"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
            data-testid="wallet-menu-profile"
            className="mt-4 block rounded-md border border-line px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-surface-2"
          >
            View profile
          </Link>
        </div>
      )}
    </div>
  );
}
