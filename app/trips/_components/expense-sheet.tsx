"use client";

import {
  useActionState,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";

import type { ExpenseFormState } from "@/app/_actions/trip-money-actions";
import { MoneySheet, useFinishSheet } from "@/app/trips/_components/money-sheet";
import {
  EXPENSE_DESCRIPTION_MAX,
  readExpenseForm,
  type ExpenseFormProblem,
} from "@/lib/expense-fields";
import {
  formatMoney,
  parseMoney,
  toMoneyInput,
  type CurrencyCode,
  type Share,
} from "@/lib/money";
import {
  exactSplitLine,
  leftoverLine,
  previewEqualSplit,
} from "@/lib/trip-money";

export type SheetMember = { id: string; name: string };

export type ExpenseDraft = {
  payerId: string;
  description: string;
  amount: number;
  split: "equal" | "exact";
  shares: Share[];
};

type SaveExpense = (
  state: ExpenseFormState,
  formData: FormData,
) => Promise<ExpenseFormState>;

const FIELD =
  "rounded-md border border-hairline bg-card text-ink focus-visible:outline-2 focus-visible:outline-ember";
const LEADER = "min-w-4 flex-1 translate-y-[-0.25em] border-b border-dotted border-secondary/60";

/**
 * Add or edit a cost (Bead tripplanner-2o5.5; test plan S4). An equal split
 * previews the cents the server will compute and says where any leftover goes.
 * An exact split shows what's still unassigned as it's typed, and the form
 * won't submit until it adds up.
 *
 * Fields are controlled, so React's reset after a form action can't wipe what
 * someone typed when the server refuses it.
 */
export function ExpenseSheet({
  action,
  currency,
  viewerId,
  members,
  draft,
  trigger,
  triggerAriaLabel,
  triggerClassName,
}: {
  action: SaveExpense;
  currency: CurrencyCode;
  viewerId: string;
  members: SheetMember[];
  draft: ExpenseDraft | null;
  trigger: string;
  triggerAriaLabel?: string;
  triggerClassName: string;
}) {
  return (
    <MoneySheet
      trigger={trigger}
      triggerAriaLabel={triggerAriaLabel}
      triggerClassName={triggerClassName}
      title={draft ? "Edit this cost" : "Add a cost"}
    >
      <ExpenseForm
        action={action}
        currency={currency}
        viewerId={viewerId}
        members={members}
        draft={draft}
      />
    </MoneySheet>
  );
}

function ExpenseForm({
  action,
  currency,
  viewerId,
  members,
  draft,
}: {
  action: SaveExpense;
  currency: CurrencyCode;
  viewerId: string;
  members: SheetMember[];
  draft: ExpenseDraft | null;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
    saved: 0,
  });
  const [problem, setProblem] = useState<ExpenseFormProblem | null>(null);
  const [description, setDescription] = useState(draft?.description ?? "");
  const [amountText, setAmountText] = useState(
    draft ? toMoneyInput(draft.amount, currency) : "",
  );
  const [payerId, setPayerId] = useState(draft?.payerId ?? viewerId);
  const [split, setSplit] = useState<"equal" | "exact">(draft?.split ?? "equal");
  const [selected, setSelected] = useState<string[]>(
    draft ? draft.shares.map((share) => share.memberId) : members.map((m) => m.id),
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    draft?.split === "exact"
      ? Object.fromEntries(
          draft.shares.map((share) => [
            share.memberId,
            toMoneyInput(share.amount, currency),
          ]),
        )
      : {},
  );
  const id = useId();
  const finish = useFinishSheet();
  const savedMessage = draft ? "Cost updated." : "Cost added.";

  useEffect(() => {
    if (state.saved > 0) {
      finish(savedMessage);
    }
  }, [state.saved, finish, savedMessage]);

  const parsedAmount = parseMoney(amountText, currency);
  const amount =
    parsedAmount.ok && parsedAmount.amount > 0 ? parsedAmount.amount : null;
  const preview =
    amount !== null && selected.length > 0
      ? previewEqualSplit(amount, selected, payerId)
      : null;
  const nameOf = (memberId: string) =>
    members.find((member) => member.id === memberId)?.name ?? "";
  const exactLine =
    amount === null ? null : exactSplitLine(amount, readExact(exact, currency), currency);

  const shownError = problem ?? state.error;
  const errorFor = (field: ExpenseFormProblem["field"]) =>
    shownError?.field === field ? shownError.message : null;
  const descriptionError = errorFor("description");
  const amountError = errorFor("amount");
  const payerError = errorFor("payer_id");
  const splitError = errorFor("split");
  const formError = shownError && !shownError.field ? shownError.message : null;

  const check = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const read = readExpenseForm(new FormData(form), currency);
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

  const toggle = (memberId: string, on: boolean) => {
    setProblem(null);
    setSelected((current) =>
      on ? [...current, memberId] : current.filter((value) => value !== memberId),
    );
  };

  // Moving to exact amounts starts from the even split, so a small
  // adjustment doesn't mean typing every share.
  const chooseSplit = (next: "equal" | "exact") => {
    setProblem(null);
    setSplit(next);
    if (next === "exact" && preview && Object.keys(exact).length === 0) {
      setExact(
        Object.fromEntries(
          preview.shares.map((share) => [
            share.memberId,
            toMoneyInput(share.amount, currency),
          ]),
        ),
      );
    }
  };

  return (
    <form
      action={formAction}
      onSubmit={check}
      noValidate
      className="flex flex-col gap-6 px-6 pt-5"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-sm text-secondary">
          What was it?
        </label>
        <input
          id={`${id}-description`}
          name="description"
          type="text"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={EXPENSE_DESCRIPTION_MAX}
          value={description}
          onChange={(event) => {
            setProblem(null);
            setDescription(event.target.value);
          }}
          placeholder="Hotel deposit"
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? `${id}-description-error` : undefined}
          className={`h-12 px-3 font-display text-lg placeholder:text-secondary/80 ${FIELD}`}
        />
        {descriptionError ? (
          <span id={`${id}-description-error`} role="alert" className="text-sm text-error">
            {descriptionError}
          </span>
        ) : null}
      </div>

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
          enterKeyHint="next"
          value={amountText}
          onChange={(event) => {
            setProblem(null);
            setAmountText(event.target.value);
          }}
          placeholder="0.00"
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? `${id}-amount-error` : undefined}
          className={`h-16 px-3 font-display text-4xl tabular-nums placeholder:text-secondary/60 ${FIELD}`}
        />
        {amountError ? (
          <span id={`${id}-amount-error`} role="alert" className="text-sm text-error">
            {amountError}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-payer`} className="text-sm text-secondary">
          Who paid?
        </label>
        <select
          id={`${id}-payer`}
          name="payer_id"
          value={payerId}
          onChange={(event) => setPayerId(event.target.value)}
          aria-invalid={payerError ? true : undefined}
          aria-describedby={payerError ? `${id}-payer-error` : undefined}
          className={`h-12 px-3 ${FIELD}`}
        >
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
        {payerError ? (
          <span id={`${id}-payer-error`} role="alert" className="text-sm text-error">
            {payerError}
          </span>
        ) : null}
      </div>

      <fieldset
        className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0"
        aria-describedby={splitError ? `${id}-split-error` : undefined}
      >
        <legend className="mb-1 text-sm text-secondary">How is it split?</legend>
        <div className="grid grid-cols-2 gap-1 rounded-md bg-card p-1">
          <SplitChoice
            label="Equally"
            value="equal"
            current={split}
            onChoose={chooseSplit}
          />
          <SplitChoice
            label="Exact amounts"
            value="exact"
            current={split}
            onChoose={chooseSplit}
          />
        </div>

        {split === "equal" ? (
          <>
            <ul className="flex flex-col">
              {members.map((member) => {
                const share = preview?.shares.find((s) => s.memberId === member.id);
                return (
                  <li key={member.id}>
                    <label className="flex min-h-12 items-baseline gap-3 py-2">
                      <input
                        type="checkbox"
                        name="member"
                        value={member.id}
                        checked={selected.includes(member.id)}
                        onChange={(event) => toggle(member.id, event.target.checked)}
                        className="size-5 shrink-0 translate-y-1 accent-ink"
                      />
                      <span className="min-w-0 wrap-anywhere">{member.name}</span>
                      <span aria-hidden="true" className={LEADER} />
                      <span className="shrink-0 font-mono text-sm tabular-nums">
                        {share ? formatMoney(share.amount, currency) : "—"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {preview && preview.leftover > 0 ? (
              <p className="border-l-2 border-ember pl-3 text-sm text-secondary">
                {leftoverLine(
                  preview.leftover,
                  preview.extraIds.map((memberId) =>
                    memberId === viewerId ? "you" : nameOf(memberId),
                  ),
                  currency,
                )}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3">
                  <label
                    htmlFor={`${id}-share-${member.id}`}
                    className="min-w-0 flex-1 wrap-anywhere"
                  >
                    {member.name}
                  </label>
                  <input
                    id={`${id}-share-${member.id}`}
                    name={`share_${member.id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={exact[member.id] ?? ""}
                    onChange={(event) => {
                      setProblem(null);
                      const value = event.target.value;
                      setExact((current) => ({ ...current, [member.id]: value }));
                    }}
                    placeholder="0.00"
                    aria-label={member.id === viewerId ? "Your share" : `${member.name}'s share`}
                    className={`h-12 w-32 shrink-0 px-3 text-right font-mono tabular-nums placeholder:text-secondary/70 ${FIELD}`}
                  />
                </li>
              ))}
            </ul>
            {/* Once a submit is refused, the error below says the same thing. */}
            {splitError ? null : (
              <p
                aria-live="polite"
                className={`font-mono text-sm tabular-nums ${
                  exactLine?.ok ? "text-ink" : "text-secondary"
                }`}
              >
                {exactLine?.text ?? "Enter the amount above first."}
              </p>
            )}
          </>
        )}
        {splitError ? (
          <span id={`${id}-split-error`} role="alert" className="text-sm text-error">
            {splitError}
          </span>
        ) : null}
      </fieldset>

      <input type="hidden" name="split" value={split} />

      <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 border-t border-hairline bg-paper px-6 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {formError ? (
          <p role="alert" className="text-sm text-error">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-md bg-ink font-medium text-paper hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : draft ? "Save changes" : "Add cost"}
        </button>
      </div>
    </form>
  );
}

function SplitChoice({
  label,
  value,
  current,
  onChoose,
}: {
  label: string;
  value: "equal" | "exact";
  current: "equal" | "exact";
  onChoose: (value: "equal" | "exact") => void;
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
        name="split_choice"
        checked={checked}
        onChange={() => onChoose(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}

/** The shares that read as amounts, for the running total. */
function readExact(
  exact: Record<string, string>,
  currency: CurrencyCode,
): Share[] {
  return Object.entries(exact).flatMap(([memberId, text]) => {
    const parsed = parseMoney(text, currency);
    return parsed.ok ? [{ memberId, amount: parsed.amount }] : [];
  });
}
