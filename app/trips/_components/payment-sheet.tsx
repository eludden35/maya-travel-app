"use client";

import {
  useActionState,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";

import type { PaymentFormState } from "@/app/_actions/trip-money-actions";
import type { SheetMember } from "@/app/trips/_components/expense-sheet";
import { MoneySheet, useFinishSheet } from "@/app/trips/_components/money-sheet";
import { readPaymentForm, type PaymentField } from "@/lib/expense-fields";
import { toMoneyInput, type CurrencyCode } from "@/lib/money";

type RecordPayment = (
  state: PaymentFormState,
  formData: FormData,
) => Promise<PaymentFormState>;

export type SuggestedDraft = {
  fromId: string;
  toId: string;
  amount: number;
  /** "Bob pays you", as the suggestion reads. */
  summary: string;
};

const FIELD =
  "rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember";

/**
 * Mark as paid (Bead tripplanner-2o5.5; test plan S5). From a suggested
 * payment the two people are set and the amount is filled in, and can be
 * changed: a partial payment or an overpayment records as entered. The manual
 * form picks the other person and which way the money went. Only the two
 * people in a payment can record it, so the viewer is always one of them.
 */
export function PaymentSheet({
  action,
  currency,
  viewerId,
  others,
  suggestion,
  trigger,
  triggerAriaLabel,
  triggerClassName,
}: {
  action: RecordPayment;
  currency: CurrencyCode;
  viewerId: string;
  others: SheetMember[];
  suggestion: SuggestedDraft | null;
  trigger: string;
  triggerAriaLabel?: string;
  triggerClassName: string;
}) {
  return (
    <MoneySheet
      trigger={trigger}
      triggerAriaLabel={triggerAriaLabel}
      triggerClassName={triggerClassName}
      title="Mark as paid"
    >
      <PaymentForm
        action={action}
        currency={currency}
        viewerId={viewerId}
        others={others}
        suggestion={suggestion}
      />
    </MoneySheet>
  );
}

function PaymentForm({
  action,
  currency,
  viewerId,
  others,
  suggestion,
}: {
  action: RecordPayment;
  currency: CurrencyCode;
  viewerId: string;
  others: SheetMember[];
  suggestion: SuggestedDraft | null;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    saved: 0,
  });
  const [problem, setProblem] = useState<{
    field: PaymentField;
    message: string;
  } | null>(null);
  const [direction, setDirection] = useState<"paid" | "received">("paid");
  const [personId, setPersonId] = useState(others[0]?.id ?? "");
  const [amountText, setAmountText] = useState(
    suggestion ? toMoneyInput(suggestion.amount, currency) : "",
  );
  const id = useId();
  const finish = useFinishSheet();

  useEffect(() => {
    if (state.saved > 0) {
      finish("Payment marked as paid.");
    }
  }, [state.saved, finish]);

  const shownError = problem ?? state.error;
  const amountError = shownError?.field === "amount" ? shownError.message : null;
  const otherError = shownError && shownError.field !== "amount" ? shownError.message : null;

  const fromId =
    suggestion?.fromId ?? (direction === "paid" ? viewerId : personId);
  const toId = suggestion?.toId ?? (direction === "paid" ? personId : viewerId);

  const check = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const read = readPaymentForm(new FormData(form), currency);
    if (read.ok) {
      setProblem(null);
      return;
    }
    event.preventDefault();
    setProblem({ field: read.field, message: read.message });
    const field = form.elements.namedItem(read.field);
    if (field instanceof HTMLElement) {
      field.focus();
    }
  };

  return (
    <form
      action={formAction}
      onSubmit={check}
      noValidate
      className="flex flex-col gap-6 px-6 pt-5"
    >
      <input type="hidden" name="from_id" value={fromId} />
      <input type="hidden" name="to_id" value={toId} />

      {suggestion ? (
        <p className="font-display text-xl leading-snug wrap-anywhere">
          {suggestion.summary}
        </p>
      ) : (
        <>
          <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className="mb-1 text-sm text-secondary">Which way did it go?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-card p-1">
              <DirectionChoice
                label="I paid"
                value="paid"
                current={direction}
                onChoose={setDirection}
              />
              <DirectionChoice
                label="I got paid"
                value="received"
                current={direction}
                onChoose={setDirection}
              />
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-person`} className="text-sm text-secondary">
              {direction === "paid" ? "Who did you pay?" : "Who paid you?"}
            </label>
            <select
              id={`${id}-person`}
              name="person"
              value={personId}
              onChange={(event) => setPersonId(event.target.value)}
              className={`h-12 px-3 ${FIELD}`}
            >
              {others.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-amount`} className="text-sm text-secondary">
          How much, in {currency}?
        </label>
        <input
          id={`${id}-amount`}
          name="amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={amountText}
          onChange={(event) => {
            setProblem(null);
            setAmountText(event.target.value);
          }}
          placeholder="0.00"
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? `${id}-amount-error` : `${id}-amount-hint`}
          className={`h-16 px-3 font-display text-4xl tabular-nums placeholder:text-secondary/60 ${FIELD}`}
        />
        {amountError ? (
          <span id={`${id}-amount-error`} role="alert" className="text-sm text-error">
            {amountError}
          </span>
        ) : (
          <span id={`${id}-amount-hint`} className="text-sm text-secondary">
            Enter what actually changed hands, even if it&apos;s part of what&apos;s owed.
          </span>
        )}
      </div>

      <p className="text-sm text-secondary">
        Jettison doesn&apos;t move the money. This counts toward balances right
        away, and either of you can void it if it&apos;s wrong.
      </p>

      <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 border-t border-hairline bg-paper px-6 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {otherError ? (
          <p role="alert" className="text-sm text-error">
            {otherError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-md bg-ink font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Marking…" : "Mark as paid"}
        </button>
      </div>
    </form>
  );
}

function DirectionChoice({
  label,
  value,
  current,
  onChoose,
}: {
  label: string;
  value: "paid" | "received";
  current: "paid" | "received";
  onChoose: (value: "paid" | "received") => void;
}) {
  const checked = current === value;
  return (
    <label
      className={`flex min-h-11 items-center justify-center rounded text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-ember ${
        checked ? "bg-ink text-paper" : "text-secondary"
      }`}
    >
      <input
        type="radio"
        name="direction"
        checked={checked}
        onChange={() => onChoose(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}
