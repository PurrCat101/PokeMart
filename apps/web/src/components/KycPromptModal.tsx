"use client";

import React from "react";
import { UserIcon } from "./icons";
import { Button, Modal, ModalHeader } from "./ui";

interface KycPromptModalProps {
  onVerifyNow: () => void;
  onLater: () => void;
}

/** Shown once per session to signed-in accounts that are not verified. Always dismissible. */
export function KycPromptModal({ onVerifyNow, onLater }: KycPromptModalProps) {
  return (
    <Modal onClose={onLater} labelledBy="kyc-prompt-title" testId="kyc-prompt-dialog" size="sm">
      <ModalHeader
        id="kyc-prompt-title"
        icon={<UserIcon className="h-5 w-5" />}
        title="Verify your identity"
        subtitle="Please verify your account before you start trading."
        onClose={onLater}
        closeTestId="kyc-prompt-close"
      />
      <div className="space-y-4 p-5 text-sm text-fg-muted">
        <p>
          Verification takes about two minutes. Until your account is verified you can browse the shop, but you can&apos;t buy anything.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onLater} data-testid="kyc-prompt-later">
            Maybe later
          </Button>
          <Button variant="primary" onClick={onVerifyNow} data-autofocus data-testid="kyc-prompt-verify">
            Verify now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
