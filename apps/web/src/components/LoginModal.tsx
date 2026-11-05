import React, { useState } from "react";
import { UserIcon } from "./icons";
import { Alert, Button, Field, Modal, ModalHeader, inputClass } from "./ui";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (credentials: { email: string; password: string }) => Promise<void>;
}

export function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await onLoginSuccess({ email, password });
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Sign in failed. Check your email and password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="login-title" testId="login-dialog" size="sm">
      <ModalHeader
        id="login-title"
        icon={<UserIcon className="h-5 w-5" />}
        title="Sign in"
        subtitle="Use your trainer account to see your wallet, inventory, and orders."
        onClose={onClose}
        closeTestId="login-close"
      />

      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5" noValidate={false}>
        {error && (
          <Alert tone="danger" title="Couldn't sign you in" data-testid="login-error">
            {error}
          </Alert>
        )}

        <Field id="login-email" label="Email">
          <input
            id="login-email"
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            data-testid="login-email"
            data-autofocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={error ? true : undefined}
            className={inputClass}
          />
        </Field>

        <Field id="login-password" label="Password">
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={error ? true : undefined}
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-3 text-sm font-medium text-fg-muted hover:text-fg"
            >
              {showPassword ? "Hide" : "Show"}
              <span className="sr-only"> password</span>
            </button>
          </div>
        </Field>

        <Button type="submit" variant="primary" disabled={isLoading} data-testid="login-submit" className="w-full">
          {isLoading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Modal>
  );
}
