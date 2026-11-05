import React, { useState } from "react";
import { MinusIcon, PlusIcon } from "./icons";

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** Used in the accessible names, e.g. "Decrease quantity of bulbasaur". */
  name: string;
  inputId?: string;
  inputTestId?: string;
  decreaseTestId?: string;
  increaseTestId?: string;
  disabled?: boolean;
}

/**
 * Minus / number / plus. While the field is being typed in, the raw text is kept
 * in `draft`; the value is clamped to 1..max as you type and again on blur.
 */
export function QuantityStepper({
  value,
  max,
  onChange,
  name,
  inputId,
  inputTestId,
  decreaseTestId,
  increaseTestId,
  disabled = false,
}: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/[^0-9]/g, "");
    setDraft(text);
    const parsed = parseInt(text, 10);
    if (!isNaN(parsed) && parsed >= 1) onChange(Math.min(parsed, max));
  };

  const commit = () => {
    const parsed = parseInt(draft ?? "", 10);
    if (draft !== null) onChange(isNaN(parsed) || parsed < 1 ? 1 : Math.min(parsed, max));
    setDraft(null);
  };

  return (
    <div className="flex items-center rounded-md border border-line-strong bg-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1 || disabled}
        data-testid={decreaseTestId}
        aria-label={`Decrease quantity of ${name}`}
        className="flex h-11 w-11 items-center justify-center rounded-l-md text-fg-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        data-testid={inputTestId}
        aria-label={`Quantity of ${name}`}
        value={draft ?? String(value)}
        onChange={handleInput}
        onBlur={commit}
        disabled={disabled}
        className="h-11 w-12 border-x border-line bg-transparent text-center font-mono text-base font-semibold tabular-nums sm:h-9 sm:text-sm"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max || disabled}
        data-testid={increaseTestId}
        aria-label={`Increase quantity of ${name}`}
        className="flex h-11 w-11 items-center justify-center rounded-r-md text-fg-muted transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
