"use client";

import Link from "next/link";
import { useActionState, useId, useState, type ChangeEvent } from "react";

import type { TripFormField, TripFormState } from "@/app/_actions/trips-actions";
import {
  TRIP_CURRENCIES,
  TRIP_DATE_MAX,
  TRIP_DATE_MIN,
  TRIP_DESCRIPTION_MAX,
  TRIP_NAME_MAX,
} from "@/lib/trip-fields";

export type TripFormValues = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  currency: string;
};

/**
 * The form behind /trips/new and /trips/[id]/edit (Bead tripplanner-718).
 *
 * Fields are controlled, so React's reset after a form action can't wipe
 * what someone typed when the server refuses it. The action answers with
 * copy and the field it belongs to; the message is tied to that field with
 * aria-describedby and announced. The database decides what's valid; the
 * HTML limits only mirror it.
 *
 * The currency is picked once. In edit mode it's shown, not offered.
 * The submit bar sticks to the bottom of the screen while the form scrolls
 * (the anchored-bottom-action-bar motif).
 */
export function TripForm({
  action,
  initialValues,
  currencyEditable,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: TripFormState, formData: FormData) => Promise<TripFormState>;
  initialValues: TripFormValues;
  currencyEditable: boolean;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [values, setValues] = useState(initialValues);
  const id = useId();

  const errorFor = (field: TripFormField) =>
    state.error?.field === field ? state.error.message : null;
  const nameError = errorFor("name");
  const datesError = errorFor("dates");
  const currencyError = errorFor("currency");
  const descriptionError = errorFor("description");
  const formError = state.error && !state.error.field ? state.error.message : null;

  const update =
    (field: keyof TripFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));

  const currency = TRIP_CURRENCIES.find((c) => c.code === values.currency);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm text-secondary">
          Trip name
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          autoComplete="off"
          enterKeyHint="next"
          required
          maxLength={TRIP_NAME_MAX}
          value={values.name}
          onChange={update("name")}
          disabled={pending}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${id}-name-error` : undefined}
          className="h-12 px-3 rounded-md border border-hairline bg-card text-ink font-display text-lg focus-visible:outline-2 focus-visible:outline-ember"
        />
        {nameError ? (
          <span id={`${id}-name-error`} role="alert" className="text-sm text-error">
            {nameError}
          </span>
        ) : null}
      </div>

      <fieldset
        className="flex flex-col gap-2 m-0 p-0 border-0 min-w-0"
        aria-describedby={datesError ? `${id}-dates-error` : `${id}-dates-hint`}
      >
        <legend className="text-sm text-secondary mb-1">Dates</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 min-w-0" htmlFor={`${id}-start`}>
            <span className="text-xs text-secondary">Starts</span>
            <input
              id={`${id}-start`}
              name="start_date"
              type="date"
              min={TRIP_DATE_MIN}
              max={values.endDate || TRIP_DATE_MAX}
              value={values.startDate}
              onChange={update("startDate")}
              disabled={pending}
              aria-invalid={datesError ? true : undefined}
              className="h-12 w-full min-w-0 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-0" htmlFor={`${id}-end`}>
            <span className="text-xs text-secondary">Ends</span>
            <input
              id={`${id}-end`}
              name="end_date"
              type="date"
              min={values.startDate || TRIP_DATE_MIN}
              max={TRIP_DATE_MAX}
              value={values.endDate}
              onChange={update("endDate")}
              disabled={pending}
              aria-invalid={datesError ? true : undefined}
              className="h-12 w-full min-w-0 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember"
            />
          </label>
        </div>
        {datesError ? (
          <span id={`${id}-dates-error`} role="alert" className="text-sm text-error">
            {datesError}
          </span>
        ) : (
          <span id={`${id}-dates-hint`} className="text-xs text-secondary">
            Optional. Leave them blank until you&apos;ve decided.
          </span>
        )}
      </fieldset>

      {currencyEditable ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-currency`} className="text-sm text-secondary">
            Currency
          </label>
          <select
            id={`${id}-currency`}
            name="currency"
            value={values.currency}
            onChange={update("currency")}
            disabled={pending}
            aria-invalid={currencyError ? true : undefined}
            aria-describedby={currencyError ? `${id}-currency-error` : `${id}-currency-hint`}
            className="h-12 px-3 rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember"
          >
            {TRIP_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          {currencyError ? (
            <span id={`${id}-currency-error`} role="alert" className="text-sm text-error">
              {currencyError}
            </span>
          ) : (
            <span id={`${id}-currency-hint`} className="text-xs text-secondary">
              Every cost in the trip is kept in this currency. It can&apos;t change later.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-secondary">Currency</p>
          <p className="text-ink">
            <span className="font-mono">{values.currency}</span>
            {currency ? <> · {currency.name}</> : null}
          </p>
          <p className="text-xs text-secondary">Set when the trip was created.</p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-sm text-secondary">
          Description <span className="text-xs">(optional)</span>
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={4}
          maxLength={TRIP_DESCRIPTION_MAX}
          value={values.description}
          onChange={update("description")}
          disabled={pending}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${id}-description-error` : undefined}
          className="px-3 py-2 rounded-md border border-hairline bg-card text-ink leading-relaxed focus-visible:outline-2 focus-visible:outline-ember"
        />
        {descriptionError ? (
          <span id={`${id}-description-error`} role="alert" className="text-sm text-error">
            {descriptionError}
          </span>
        ) : null}
      </div>

      <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 border-t border-hairline bg-paper/95 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-sm">
        {formError ? (
          <p role="alert" className="text-sm text-error">
            {formError}
          </p>
        ) : null}
        <div className="flex gap-3">
          <Link
            href={cancelHref}
            className="h-12 px-5 rounded-md border border-hairline bg-card text-ink font-medium flex items-center justify-center hover:bg-paper"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 h-12 rounded-md bg-ember text-ink font-medium hover:opacity-90 disabled:opacity-60"
          >
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
