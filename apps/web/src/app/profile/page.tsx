"use client";

import React, { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { KycBadge } from "../../components/KycBadge";
import { CheckIcon, UserIcon, WalletIcon } from "../../components/icons";
import { Button, EmptyState, Skeleton, cx, money } from "../../components/ui";
import { verificationTitle } from "../../lib/cart";
import type { KycStatus } from "../../types/api";

/** What each verification tier unlocks, as the shop enforces it. */
const TIERS: Array<{ level: 0 | 1 | 2; unlocks: string }> = [
  { level: 0, unlocks: "Browse the shop. Purchases are not available yet." },
  { level: 1, unlocks: "Buy ordinary Pokémon and standard items." },
  { level: 2, unlocks: "Buy premium items." },
];

function Card({ title, children, ...rest }: { title: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className="rounded-lg border border-line bg-surface" {...rest}>
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-28 shrink-0 text-xs text-fg-subtle">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-sm">{children}</dd>
    </div>
  );
}

/** A rejected account reads as not verified; a pending one keeps its level but cannot buy. */
function effectiveLevel(kyc: KycStatus | null): 0 | 1 | 2 {
  if (!kyc || kyc.status === "REJECTED") return 0;
  return kyc.level;
}

export default function ProfileRoute() {
  const { user, wallet, kyc, sessionReady, openLogin, startVerification } = useApp();
  const [showBalance, setShowBalance] = useState(false);

  if (!sessionReady) {
    return (
      <div data-testid="profile-session-loading" role="status" aria-label="Loading profile" className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        data-testid="profile-auth-required"
        icon={<UserIcon className="h-6 w-6" />}
        title="Sign in to see your profile"
        description="Your verification status and wallet live in your trainer account."
        action={
          <Button variant="primary" onClick={openLogin} data-testid="profile-sign-in">
            Sign in
          </Button>
        }
        className="mx-auto my-8 max-w-lg"
      />
    );
  }

  const level = effectiveLevel(kyc);
  const canVerify = !!kyc && (kyc.status === "REJECTED" || (kyc.status === "ACTIVE" && kyc.level === 0));

  return (
    <div data-testid="profile-view" className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>

      <Card title="Account" data-testid="profile-account">
        <dl className="divide-y divide-line">
          <Row label="Name">
            <span data-testid="profile-display-name" className="truncate">
              {user.displayName}
            </span>
          </Row>
          <Row label="Email">
            <span data-testid="profile-email" className="truncate select-all">
              {user.email}
            </span>
          </Row>
        </dl>
      </Card>

      <Card title="Verification" data-testid="profile-verification">
        <div className="flex flex-wrap items-center gap-3">
          <KycBadge kyc={kyc} data-testid="profile-kyc-badge" />
          {kyc?.status === "PENDING_REVIEW" && <span className="text-sm text-fg-muted">We are checking your details. Purchases are unavailable until you are approved.</span>}
          {kyc?.status === "REJECTED" && <span className="text-sm text-fg-muted">Check that your details match your ID card, then submit them again.</span>}
          {!kyc && <span className="text-sm text-fg-muted">Verification status could not be loaded right now.</span>}
        </div>

        <ol aria-label="Verification tiers" className="mt-4 space-y-3">
          {TIERS.map(({ level: tier, unlocks }) => {
            const reached = level >= tier;
            const current = level === tier;
            return (
              <li key={tier} data-testid={`profile-tier-${tier}`} aria-current={current ? "step" : undefined} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    reached ? "border-brand bg-brand text-brand-fg" : "border-line-strong",
                  )}
                >
                  {reached && <CheckIcon className="h-3 w-3" />}
                </span>
                <div className="min-w-0">
                  <p className={cx("text-sm", current ? "font-semibold" : "font-medium text-fg-muted")}>
                    {verificationTitle(tier)}
                    {current && kyc && (
                      <span className="ml-2 rounded-md bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-brand-text">Current</span>
                    )}
                  </p>
                  <p className="text-xs text-fg-subtle">{unlocks}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {canVerify && (
          <div className="mt-5">
            <Button variant="primary" onClick={startVerification} data-testid="profile-verify">
              {kyc?.status === "REJECTED" ? "Send again" : "Verify now"}
            </Button>
          </div>
        )}
      </Card>

      <Card title="Wallet" data-testid="profile-wallet">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs text-fg-muted">
              <WalletIcon className="h-4 w-4 text-ok" />
              Balance
            </p>
            <p data-testid="profile-wallet-balance" className="mt-1 font-mono text-2xl font-bold tabular-nums">
              {showBalance ? (wallet ? money(wallet.balance) : "₽ ---") : "₽ ••••"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBalance((v) => !v)}
            data-testid="profile-balance-toggle"
          >
            {showBalance ? "Hide balance" : "Show balance"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
