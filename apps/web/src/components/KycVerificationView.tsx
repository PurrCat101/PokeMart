"use client";

import React, { useState } from "react";
import { api, ApiError } from "../lib/api";
import type { KycStatus, KycSubmission } from "../types/api";
import { ChevronLeftIcon } from "./icons";
import { Alert, Button, Field, cx, inputClass } from "./ui";

type FormValues = KycSubmission & { consent: boolean };
type Errors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { fullName: "", nationalId: "", dateOfBirth: "", phone: "", address: "", consent: false };
const MIN_AGE = 18;

/** Thai national ID check digit. */
function validNationalId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((acc, digit, index) => acc + Number(digit) * (13 - index), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

function validate(values: FormValues): Errors {
  const errors: Errors = {};
  const name = values.fullName.trim();
  if (name.length < 2 || name.length > 100) errors.fullName = "Enter your full name as it appears on your ID card.";
  if (!validNationalId(values.nationalId)) errors.nationalId = "Enter a valid 13-digit national ID number.";
  const dob = values.dateOfBirth ? new Date(`${values.dateOfBirth}T00:00:00Z`) : null;
  if (!dob || Number.isNaN(dob.getTime())) errors.dateOfBirth = "Choose your date of birth.";
  else {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_AGE);
    if (dob > cutoff) errors.dateOfBirth = `You must be at least ${MIN_AGE} years old.`;
  }
  if (!/^0\d{9}$/.test(values.phone)) errors.phone = "Enter a 10-digit phone number starting with 0.";
  const address = values.address.trim();
  if (address.length < 10 || address.length > 300) errors.address = "Enter your full address (at least 10 characters).";
  if (!values.consent) errors.consent = "You need to confirm this before sending.";
  return errors;
}

interface Props {
  onBack: () => void;
  onSubmitted: (kyc: KycStatus) => void;
}

export function KycVerificationView({ onBack, onSubmitted }: Props) {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setIsSubmitting(true);
    try {
      const kyc = await api.submitKyc({
        fullName: values.fullName.trim(),
        nationalId: values.nationalId,
        dateOfBirth: values.dateOfBirth,
        phone: values.phone,
        address: values.address.trim(),
      });
      onSubmitted(kyc);
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const fromServer: Errors = {};
        for (const detail of err.details) if (detail.field && detail.field in EMPTY) fromServer[detail.field as keyof FormValues] = detail.message;
        setErrors(fromServer);
      }
      setFormError(err instanceof Error && err.message ? err.message : "We could not send your details. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const invalid = (field: keyof FormValues) => (errors[field] ? true : undefined);
  const fieldError = (field: keyof FormValues) =>
    errors[field] ? (
      <p id={`kyc-${field}-error`} data-testid={`kyc-${field}-error`} className="text-xs text-danger">
        {errors[field]}
      </p>
    ) : null;

  return (
    <section aria-labelledby="kyc-heading" data-testid="kyc-view" className="mx-auto max-w-xl space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          data-testid="kyc-back"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg sm:min-h-9"
        >
          <ChevronLeftIcon /> Back to shop
        </button>
        <h1 id="kyc-heading" className="mt-2 text-2xl font-bold tracking-tight">
          Verify your identity
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Enter the details on your Thai national ID card. We use them only to confirm who you are.
        </p>
      </div>

      {formError && (
        <Alert tone="danger" title="Couldn't send your details" data-testid="kyc-form-error">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4 rounded-xl border border-line bg-surface p-5" data-testid="kyc-form">
        <Field id="kyc-fullName" label="Full name" hint="As shown on your ID card">
          <input
            id="kyc-fullName"
            data-testid="kyc-fullName"
            className={inputClass}
            autoComplete="name"
            value={values.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            aria-invalid={invalid("fullName")}
            aria-describedby={errors.fullName ? "kyc-fullName-error" : undefined}
            maxLength={100}
          />
          {fieldError("fullName")}
        </Field>

        <Field id="kyc-nationalId" label="National ID number" hint="13 digits">
          <input
            id="kyc-nationalId"
            data-testid="kyc-nationalId"
            className={cx(inputClass, "font-mono tabular-nums")}
            inputMode="numeric"
            autoComplete="off"
            value={values.nationalId}
            onChange={(e) => set("nationalId", e.target.value.replace(/\D/g, "").slice(0, 13))}
            aria-invalid={invalid("nationalId")}
            aria-describedby={errors.nationalId ? "kyc-nationalId-error" : undefined}
          />
          {fieldError("nationalId")}
        </Field>

        <Field id="kyc-dateOfBirth" label="Date of birth">
          <input
            id="kyc-dateOfBirth"
            data-testid="kyc-dateOfBirth"
            type="date"
            className={inputClass}
            autoComplete="bday"
            value={values.dateOfBirth}
            onChange={(e) => set("dateOfBirth", e.target.value)}
            aria-invalid={invalid("dateOfBirth")}
            aria-describedby={errors.dateOfBirth ? "kyc-dateOfBirth-error" : undefined}
          />
          {fieldError("dateOfBirth")}
        </Field>

        <Field id="kyc-phone" label="Phone number" hint="10 digits, e.g. 0812345678">
          <input
            id="kyc-phone"
            data-testid="kyc-phone"
            type="tel"
            className={cx(inputClass, "font-mono tabular-nums")}
            autoComplete="tel"
            inputMode="numeric"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            aria-invalid={invalid("phone")}
            aria-describedby={errors.phone ? "kyc-phone-error" : undefined}
          />
          {fieldError("phone")}
        </Field>

        <Field id="kyc-address" label="Address" hint="As shown on your ID card">
          <textarea
            id="kyc-address"
            data-testid="kyc-address"
            rows={3}
            className={cx(inputClass, "py-2")}
            autoComplete="street-address"
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            aria-invalid={invalid("address")}
            aria-describedby={errors.address ? "kyc-address-error" : undefined}
            maxLength={300}
          />
          {fieldError("address")}
        </Field>

        <div className="space-y-1.5">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="kyc-consent"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={values.consent}
              onChange={(e) => set("consent", e.target.checked)}
              aria-invalid={invalid("consent")}
            />
            <span>I confirm these details are mine and are correct.</span>
          </label>
          {fieldError("consent")}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting} data-testid="kyc-cancel">
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} data-testid="kyc-submit">
            {isSubmitting ? "Sending…" : "Send for review"}
          </Button>
        </div>
      </form>
    </section>
  );
}
