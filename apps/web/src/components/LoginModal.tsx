import React, { useState } from "react";
import { XIcon, AlertCircleIcon, UserIcon } from "./icons";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (credentials: { email: string; password: string }) => Promise<void>;
}

export function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    } catch (err: any) {
      setError(err.message || "Authentication failed. Check credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div data-testid="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-[2px]">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-2">
            <UserIcon className="w-4 h-4 text-red-600" />
            <h2 id="login-title" className="text-sm font-bold uppercase tracking-wider text-zinc-950 dark:text-zinc-50">
              Trainer Terminal Sign In
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="login-close"
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div data-testid="login-error" role="alert" className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded text-xs flex items-start space-x-2 text-red-800 dark:text-red-200">
              <AlertCircleIcon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Trainer Email
            </label>
            <input
              type="email"
              data-testid="login-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-xs font-mono rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              type="password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-xs font-mono rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              data-testid="login-submit"
              className="w-full py-2 text-xs font-bold uppercase tracking-wider text-white bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white disabled:opacity-50 rounded shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1"
            >
              {isLoading ? "Authenticating..." : "Connect Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
