import type { ReactNode } from "react";

import {
  deleteExpenseAction,
  recordPaymentAction,
  saveExpenseAction,
  voidPaymentAction,
} from "@/app/_actions/trip-money-actions";
import { PostTime } from "@/app/_components/post-time";
import { ConfirmAction } from "@/app/trips/_components/confirm-action";
import {
  ExpenseSheet,
  type SheetMember,
} from "@/app/trips/_components/expense-sheet";
import { PaymentSheet } from "@/app/trips/_components/payment-sheet";
import { DataAccessError } from "@/lib/errors";
import { listTripExpenses, type Expense } from "@/lib/expenses";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import {
  getTripBalances,
  listTripSettlements,
  type TripBalance,
} from "@/lib/settlements";
import {
  balanceWord,
  expenseAccess,
  ledgerName,
  listOf,
  paymentHistory,
  paymentLine,
  peopleFrom,
  sentenceName,
  suggestedPayments,
  viewerStanding,
  type PaymentEntry,
  type People,
  type Standing,
  type SuggestedPayment,
} from "@/lib/trip-money";
import { getTripFormerMembers, type TripMemberWithProfile } from "@/lib/trips";

const EYEBROW = "font-mono text-xs uppercase tracking-[0.2em] text-secondary";
const SUBHEAD = "font-display text-2xl leading-tight";
const LEADER =
  "min-w-4 flex-1 translate-y-[-0.25em] border-b border-dotted border-secondary/60";
const QUIET_BUTTON =
  "h-11 shrink-0 rounded-md px-3 text-sm text-secondary hover:bg-paper hover:text-ink";
const QUIET_DANGER =
  "h-11 shrink-0 rounded-md px-3 text-sm text-secondary hover:bg-paper hover:text-error";
/** How many rows show before the rest fold away. */
const SHOWN_ROWS = 5;

/**
 * The money on a trip (Bead tripplanner-2o5.5; test plan S4, S5): where you
 * stand, who owes whom, suggested payments, costs and the payment history.
 *
 * The trip page renders this for members only, on every visibility, and
 * nothing here runs for anyone else (ADR 0002). It's money mode: receipts,
 * oversized numerals and calm verbs, kept apart from the postcard-like notes
 * below it. The RPCs enforce every rule; this only decides what to offer.
 */
export async function TripMoney({
  tripId,
  currency,
  viewerId,
  organizerId,
  members,
}: {
  tripId: string;
  currency: CurrencyCode;
  viewerId: string;
  organizerId: string;
  members: TripMemberWithProfile[];
}) {
  const data = await loadMoney(tripId);
  if (!data) {
    return (
      <section aria-labelledby="money" className="flex flex-col gap-3">
        <h2 id="money" className={EYEBROW}>
          Money
        </h2>
        <p className="rounded-2xl border border-hairline bg-card p-5 text-sm text-secondary">
          The money didn&apos;t load just now, and nothing has changed. Refresh
          the page to try again.
        </p>
      </section>
    );
  }

  const { expenses, balances, settlements, formerMembers } = data;
  const people = peopleFrom(members, formerMembers, viewerId);
  const memberIds = new Set(members.map((member) => member.profile_id));
  const payments = suggestedPayments(balances, viewerId);
  const history = paymentHistory(settlements, { viewerId, memberIds });
  const standing = viewerStanding(balances, payments, viewerId, expenses.length);
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const sheetMembers: SheetMember[] = members.map((member) => ({
    id: member.profile_id,
    name: member.profile_id === viewerId ? "You" : member.display_name,
  }));
  const others = sheetMembers.filter((member) => member.id !== viewerId);
  const record = recordPaymentAction.bind(null, tripId);
  const context: RowContext = { tripId, currency, viewerId, people, others };

  return (
    <section
      aria-labelledby="money"
      className="flex flex-col gap-8 scroll-mt-6"
    >
      <div className="flex flex-col gap-3">
        <h2 id="money" className={EYEBROW}>
          Money <span className="text-ink">· {currency}</span>
        </h2>
        <Hero
          standing={standing}
          people={people}
          currency={currency}
          costCount={expenses.length}
          total={total}
        />
      </div>

      {expenses.length > 0 || balances.some((balance) => balance.amount !== 0) ? (
        <Block id="balances" title="Balances">
          <BalanceList balances={balances} people={people} currency={currency} />
        </Block>
      ) : null}

      <Block id="settle-up" title="Settle up">
        <SettleUp
          payments={payments}
          context={context}
          record={record}
          hasCosts={expenses.length > 0}
        />
      </Block>

      <Block id="costs" title="Costs">
        <CostList
          expenses={expenses}
          context={context}
          organizerId={organizerId}
          memberIds={memberIds}
          sheetMembers={sheetMembers}
        />
      </Block>

      {history.length > 0 ? (
        <Block id="payments" title="Payments">
          <PaymentHistory history={history} context={context} />
        </Block>
      ) : null}

      {/* The anchored bottom action bar stays with the money: it sticks only
          while this section is on screen, and scrolls away before the notes. */}
      <div className="sticky bottom-0 z-10 -mx-6 flex gap-3 border-t border-hairline bg-paper/95 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-sm">
        <ExpenseSheet
          action={saveExpenseAction.bind(null, tripId, null)}
          currency={currency}
          viewerId={viewerId}
          members={sheetMembers}
          draft={null}
          trigger="Add a cost"
          triggerClassName="h-12 flex-1 rounded-md bg-ink font-medium text-paper hover:opacity-90"
        />
        {others.length > 0 ? (
          <PaymentSheet
            action={record}
            currency={currency}
            viewerId={viewerId}
            others={others}
            suggestion={null}
            trigger="Mark a payment"
            triggerClassName="h-12 flex-1 rounded-md border border-hairline bg-card font-medium text-ink hover:bg-paper"
          />
        ) : null}
      </div>
    </section>
  );
}

/** What the trip page shows while the money loads. */
export function TripMoneySkeleton() {
  return (
    <section aria-labelledby="money-loading" className="flex flex-col gap-3">
      <h2 id="money-loading" className={EYEBROW}>
        Money
      </h2>
      <p className="sr-only" role="status">
        Loading the money…
      </p>
      <div
        aria-hidden="true"
        className="h-44 animate-pulse rounded-2xl bg-card motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-32 animate-pulse rounded-2xl bg-card motion-reduce:animate-none"
      />
    </section>
  );
}

async function loadMoney(tripId: string) {
  try {
    const [expenses, balances, settlements, formerMembers] = await Promise.all([
      listTripExpenses(tripId),
      getTripBalances(tripId),
      listTripSettlements(tripId),
      getTripFormerMembers(tripId),
    ]);
    return { expenses, balances, settlements, formerMembers };
  } catch (error) {
    // The money fails on its own; the rest of the trip page still works.
    if (!(error instanceof DataAccessError)) {
      throw error;
    }
    console.error(error);
    return null;
  }
}

type RowContext = {
  tripId: string;
  currency: CurrencyCode;
  viewerId: string;
  people: People;
  others: SheetMember[];
};

function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h3 className={SUBHEAD}>{title}</h3>
      {children}
    </div>
  );
}

/** The signature motif: the viewer's position, oversized, on a dark ticket. */
function Hero({
  standing,
  people,
  currency,
  costCount,
  total,
}: {
  standing: Standing;
  people: People;
  currency: CurrencyCode;
  costCount: number;
  total: number;
}) {
  const names = (ids: readonly string[]) =>
    ids.length > 2
      ? `${ids.length} people`
      : listOf(ids.map((id) => ledgerName(people(id))));
  const money =
    standing.kind === "owes" || standing.kind === "owed"
      ? formatMoney(standing.amount, currency)
      : null;

  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-2xl bg-ink p-6 text-paper">
      {standing.kind === "settled" ? (
        <p
          aria-hidden="true"
          className="animate-stamp absolute top-5 right-4 -rotate-6 rounded border-2 border-ember px-2 py-0.5 font-mono text-sm font-bold uppercase tracking-[0.2em] text-paper"
        >
          Settled
        </p>
      ) : null}

      {standing.kind === "empty" ? (
        <>
          <p className="font-display text-4xl leading-tight">No costs yet.</p>
          <p className="text-sm text-paper/80">
            Add the deposit, the groceries, the taxi from the airport. Everyone&apos;s
            share works itself out.
          </p>
        </>
      ) : standing.kind === "settled" ? (
        <>
          <p className="pr-28 text-sm text-paper/80">This trip</p>
          <p className="font-display text-5xl leading-none">Everyone&apos;s square.</p>
          <p className="text-sm text-paper/80">This trip is settled. Nobody owes anybody.</p>
        </>
      ) : standing.kind === "square" ? (
        <>
          <p className="text-sm text-paper/80">You</p>
          <p className="font-display text-5xl leading-none">You&apos;re square.</p>
          <p className="text-sm text-paper/80">
            Others on this trip are still settling up.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-paper/80">
            {standing.kind === "owes" ? "You owe" : "You're owed"}
          </p>
          <p
            className={`font-display leading-none tabular-nums wrap-anywhere ${
              (money ?? "").length > 11 ? "text-5xl" : "text-7xl"
            }`}
          >
            {money}
          </p>
          {standing.counterparts.length > 0 ? (
            <p className="text-sm text-paper/80">
              {standing.kind === "owes" ? "to " : "from "}
              {names(standing.counterparts)}
            </p>
          ) : null}
        </>
      )}

      {costCount > 0 ? (
        <p className="mt-3 border-t border-paper/20 pt-3 font-mono text-sm tabular-nums text-paper/80">
          {costCount === 1 ? "1 cost" : `${costCount} costs`} ·{" "}
          {formatMoney(total, currency)} in all
        </p>
      ) : null}
    </div>
  );
}

function BalanceList({
  balances,
  people,
  currency,
}: {
  balances: TripBalance[];
  people: People;
  currency: CurrencyCode;
}) {
  return (
    <dl className="receipt-edge flex flex-col gap-2 bg-card px-5 pt-5 pb-8">
      {balances.map((balance) => {
        const person = people(balance.memberId);
        return (
          <div key={balance.memberId} className="flex items-baseline gap-2">
            <dt className="min-w-0 flex flex-col">
              <span className="wrap-anywhere">{ledgerName(person)}</span>
              <span className="text-sm text-secondary">
                {balanceWord(balance.amount, person.isViewer)}
              </span>
            </dt>
            <span aria-hidden="true" className={LEADER} />
            <dd className="shrink-0 font-mono tabular-nums text-ink">
              {formatMoney(balance.amount, currency, { signDisplay: "exceptZero" })}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function SettleUp({
  payments,
  context,
  record,
  hasCosts,
}: {
  payments: SuggestedPayment[];
  context: RowContext;
  record: Parameters<typeof PaymentSheet>[0]["action"];
  hasCosts: boolean;
}) {
  const { currency, viewerId, people, others } = context;

  if (payments.length === 0) {
    return (
      <p className="rounded-2xl border border-hairline p-5 text-sm text-secondary">
        {hasCosts
          ? "Nothing to settle. Everyone's square."
          : "Nothing to settle yet. Suggested payments show up once there are costs."}
      </p>
    );
  }

  const viewerIsInOne = payments.some(
    (payment) => payment.from === viewerId || payment.to === viewerId,
  );

  return (
    <>
      <p className="text-sm text-secondary">
        {payments.length === 1
          ? "One payment squares everyone."
          : `${payments.length} payments square everyone.`}
      </p>
      <ul className="flex flex-col gap-3">
        {payments.map((payment) => {
          const from = people(payment.from);
          const to = people(payment.to);
          const line = paymentLine(from, to, "pays");
          const amount = formatMoney(payment.amount, currency);
          return (
            <li
              key={`${payment.from}-${payment.to}`}
              className="flex flex-col gap-3 rounded-2xl bg-card p-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 wrap-anywhere">{line}</span>
                <span aria-hidden="true" className={LEADER} />
                <span className="shrink-0 font-mono tabular-nums text-ink">{amount}</span>
              </div>
              {payment.canMark ? (
                <PaymentSheet
                  action={record}
                  currency={currency}
                  viewerId={viewerId}
                  others={others}
                  suggestion={{
                    fromId: payment.from,
                    toId: payment.to,
                    amount: payment.amount,
                    summary: line,
                  }}
                  trigger="Mark as paid"
                  triggerAriaLabel={`Mark as paid: ${line}, ${amount}`}
                  triggerClassName="h-11 rounded-md bg-ink text-sm font-medium text-paper hover:opacity-90"
                />
              ) : payment.hasFormerMember ? (
                <p className="text-sm text-secondary">
                  One of them has left the trip, so this can&apos;t be marked here.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {viewerIsInOne ? null : (
        <p className="text-sm text-secondary">
          Only the two people in a payment can mark it as paid.
        </p>
      )}
    </>
  );
}

function CostList({
  expenses,
  context,
  organizerId,
  memberIds,
  sheetMembers,
}: {
  expenses: Expense[];
  context: RowContext;
  organizerId: string;
  memberIds: ReadonlySet<string>;
  sheetMembers: SheetMember[];
}) {
  if (expenses.length === 0) {
    return (
      <p className="rounded-2xl border border-hairline p-5 text-sm text-secondary">
        Whoever paid for something adds it here, and it&apos;s split however you like.
      </p>
    );
  }
  const card = (expense: Expense) => (
    <li key={expense.id}>
      <CostCard
        expense={expense}
        context={context}
        access={expenseAccess(expense, {
          viewerId: context.viewerId,
          organizerId,
          memberIds,
        })}
        sheetMembers={sheetMembers}
      />
    </li>
  );
  const older = expenses.slice(SHOWN_ROWS);
  return (
    <>
      <ol className="flex flex-col gap-4">{expenses.slice(0, SHOWN_ROWS).map(card)}</ol>
      {older.length > 0 ? (
        <Fold
          label={older.length === 1 ? "Show 1 older cost" : `Show ${older.length} older costs`}
        >
          <ol className="flex flex-col gap-4">{older.map(card)}</ol>
        </Fold>
      ) : null}
    </>
  );
}

function CostCard({
  expense,
  context,
  access,
  sheetMembers,
}: {
  expense: Expense;
  context: RowContext;
  access: "editable" | "frozen" | "none";
  sheetMembers: SheetMember[];
}) {
  const { tripId, currency, viewerId, people } = context;
  return (
    <article
      aria-label={`Cost: ${expense.description}`}
      className="receipt-edge flex flex-col gap-3 bg-card px-5 pt-5 pb-8"
    >
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="min-w-0 font-display text-xl leading-snug wrap-anywhere">
            {expense.description}
          </h4>
          <p className="shrink-0 font-mono text-lg tabular-nums text-ink">
            {formatMoney(expense.amount, currency)}
          </p>
        </div>
        <p className="text-sm text-secondary wrap-anywhere">
          Paid by {sentenceName(people(expense.payerId))} ·{" "}
          {expense.split === "equal" ? "split equally" : "exact amounts"} ·{" "}
          <PostTime createdAt={expense.createdAt} />
        </p>
      </header>

      <dl className="flex flex-col gap-1 border-t border-dashed border-secondary/40 pt-3">
        {expense.shares.map((share) => (
          <div key={share.memberId} className="flex items-baseline gap-2">
            <dt className="min-w-0 wrap-anywhere text-body">
              {ledgerName(people(share.memberId))}
            </dt>
            <span aria-hidden="true" className={LEADER} />
            <dd className="shrink-0 font-mono text-sm tabular-nums text-ink">
              {formatMoney(share.amount, currency)}
            </dd>
          </div>
        ))}
      </dl>

      {access === "editable" ? (
        <div className="-mb-2 flex justify-end gap-1">
          <ExpenseSheet
            action={saveExpenseAction.bind(null, tripId, expense.id)}
            currency={currency}
            viewerId={viewerId}
            members={sheetMembers}
            draft={{
              payerId: expense.payerId,
              description: expense.description,
              amount: expense.amount,
              split: expense.split,
              shares: expense.shares,
            }}
            trigger="Edit"
            triggerAriaLabel={`Edit ${expense.description}`}
            triggerClassName={QUIET_BUTTON}
          />
          <ConfirmAction
            action={deleteExpenseAction.bind(null, tripId, expense.id)}
            trigger="Delete"
            triggerAriaLabel={`Delete ${expense.description}`}
            triggerClassName={QUIET_DANGER}
            title={`Delete ${expense.description}?`}
            body="It comes off everyone's balance. This can't be undone."
            confirmLabel="Delete cost"
            pendingLabel="Deleting…"
            cancelLabel="Keep it"
          />
        </div>
      ) : access === "frozen" ? (
        <p className="text-sm text-secondary">
          Someone on this cost has left the trip, so it stays as it is.
        </p>
      ) : null}
    </article>
  );
}

function PaymentHistory({
  history,
  context,
}: {
  history: PaymentEntry[];
  context: RowContext;
}) {
  const row = (entry: PaymentEntry) => (
    <li key={entry.id}>
      <PaymentRow entry={entry} context={context} />
    </li>
  );
  const older = history.slice(SHOWN_ROWS);
  return (
    <>
      <ol className="flex flex-col divide-y divide-hairline rounded-2xl bg-card">
        {history.slice(0, SHOWN_ROWS).map(row)}
      </ol>
      {older.length > 0 ? (
        <Fold
          label={
            older.length === 1 ? "Show 1 older payment" : `Show ${older.length} older payments`
          }
        >
          <ol className="flex flex-col divide-y divide-hairline rounded-2xl bg-card">
            {older.map(row)}
          </ol>
        </Fold>
      ) : null}
    </>
  );
}

function PaymentRow({
  entry,
  context,
}: {
  entry: PaymentEntry;
  context: RowContext;
}) {
  const { tripId, currency, people } = context;
  const line = paymentLine(people(entry.fromId), people(entry.toId), "paid");
  const amount = formatMoney(entry.amount, currency);
  const voided = entry.voided;

  return (
    <article aria-label={`Payment: ${line}, ${amount}`} className="flex flex-col gap-1 p-4">
      <div className="flex items-baseline gap-2">
        <span className={`min-w-0 wrap-anywhere ${voided ? "text-secondary" : ""}`}>{line}</span>
        <span aria-hidden="true" className={LEADER} />
        <span
          className={`shrink-0 font-mono tabular-nums ${
            voided ? "text-secondary line-through" : "text-ink"
          }`}
        >
          {amount}
        </span>
      </div>
      <p className="text-sm text-secondary wrap-anywhere">
        Marked by {sentenceName(people(entry.markedBy))} ·{" "}
        <PostTime createdAt={entry.markedAt} />
      </p>
      {voided ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary wrap-anywhere">
          <span className="-rotate-2 rounded border border-error/60 px-1.5 font-mono text-xs uppercase tracking-[0.15em] text-error">
            Voided
          </span>{" "}
          <span>
            by {sentenceName(people(voided.by))} · <PostTime createdAt={voided.at} />
          </span>
        </p>
      ) : null}
      {entry.canVoid ? (
        <div className="-mb-2 flex justify-end">
          <ConfirmAction
            action={voidPaymentAction.bind(null, tripId, entry.id)}
            trigger="Void"
            triggerAriaLabel={`Void: ${line}, ${amount}`}
            triggerClassName={QUIET_DANGER}
            title="Void this payment?"
            body={`${line} ${amount}. It stays in the history, marked as voided, and the balances go back to how they were. It can't be undone, but you can mark it as paid again.`}
            confirmLabel="Void payment"
            pendingLabel="Voiding…"
            cancelLabel="Keep it"
          />
        </div>
      ) : null}
    </article>
  );
}

function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group flex flex-col gap-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-md border border-hairline bg-card px-4 text-sm font-medium hover:bg-paper group-open:mb-4">
        {label}
      </summary>
      {children}
    </details>
  );
}
